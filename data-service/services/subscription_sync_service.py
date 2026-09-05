"""按标的订阅采集数据并落盘到共享 SQLite。"""

import asyncio
import hashlib
import json
import logging
import math
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

from db import db
from providers.etf_provider import ETFProvider
from providers.stock_provider import StockProvider
from providers.tushare_provider import TushareProvider
from services.data_service import data_service
from services.subscription_config import DEFAULTS, INDEXES, get_config, parse_timestamp, next_run, market_open
from providers.stock_symbols import canonical_stock_code, stock_market

logger = logging.getLogger(__name__)


class CompanyBatch(list):
    """Keep usable rows while carrying per-company failures to the UI."""
    def __init__(self, rows, failures, succeeded):
        super().__init__(rows)
        self.failures = failures
        self.succeeded = succeeded

    def error_json(self):
        return json.dumps({
            "message": "部分企业同步失败：" + "；".join(f"{code}: {error}" for code, error in self.failures.items()),
            "failedCodes": list(self.failures), "succeededCodes": self.succeeded,
        }, ensure_ascii=False)


DATASET_DEFAULTS = {key: (policy['tradingIntervalSeconds'], policy['closedIntervalSeconds']) for key, policy in DEFAULTS['policies'].items()}

GLOBAL_DATASETS = {"market_capital_flow", "sector_capital_flow", "news"}


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, default=str, sort_keys=True).encode()).hexdigest()


def _clean_json(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: _clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clean_json(item) for item in value]
    return value


def _value(row: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return default


def _number(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _date(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    raw = str(value).replace("/", "-")[:10]
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return raw


def _code(value: Any, default: str = "") -> str:
    """Normalize CN instrument codes before writing shared SQLite."""
    normalized = str(value or default).strip().lower()
    for prefix in ("sh", "sz"):
        if normalized.startswith(prefix):
            normalized = normalized[2:]
            break
    if normalized.endswith((".sh", ".sz")):
        normalized = normalized[:-3]
    return canonical_stock_code(normalized)


class SubscriptionSyncService:
    def __init__(self):
        self.etf_provider = ETFProvider()
        self.stock_provider = StockProvider()
        self._locks: Dict[str, asyncio.Lock] = {}
        self._run_due_lock = asyncio.Lock()
        self._fetch_semaphore = asyncio.Semaphore(4)
        self.max_retries = 3
        self._company_semaphore = asyncio.Semaphore(8)
        self._company_requests: Dict[tuple, asyncio.Task] = {}
        self.config = json.loads(json.dumps(DEFAULTS))
        self._tasks: Dict[str, asyncio.Task] = {}
        self._request_times: Dict[tuple, float] = {}
        self._realtime_fetch_semaphore = asyncio.Semaphore(4)
        self._quote_semaphore = asyncio.Semaphore(2)

    def recover_interrupted_runs(self) -> None:
        """Called once at process startup, before any worker can claim a run."""
        now = datetime.now(timezone.utc).isoformat()
        error = "数据服务重启，原同步任务已中断，已安排重新采集"
        db.update("UPDATE data_fetch_runs SET status='failed', error=?, qualityStatus='unavailable', completedAt=? WHERE status IN ('running', 'queued')", (error, now))
        db.update("UPDATE subscription_datasets SET status='pending', lastError=?, nextRunAt=?, updatedAt=? WHERE status IN ('running', 'queued')", (error, now, now))

    async def list_due_datasets(self) -> List[Dict[str, Any]]:
        rows = db.execute(
            """SELECT d.id, d.datasetKey, d.enabled, d.status, d.tradingIntervalSeconds,
                      d.closedIntervalSeconds, d.nextRunAt, d.lastSuccessAt, d.lastStartedAt, s.enabled AS subscriptionEnabled,
                      i.code, i.type, i.market
                 FROM subscription_datasets d
                 JOIN data_subscriptions s ON s.id = d.subscriptionId
                 JOIN instruments i ON i.id = s.instrumentId
                WHERE d.enabled = 1 AND s.enabled = 1
                ORDER BY d.nextRunAt ASC"""
        )
        now = datetime.now(timezone.utc)
        due = []
        for row in rows:
            policy = self.config['policies'].get(row['datasetKey'])
            if not policy:
                continue
            # An explicit manual refresh may run while automatic collection is paused.
            if row['status'] != 'queued' and (not policy['enabled'] or not self.config['scopeEnabled'].get(policy['scope'], True)):
                continue
            next_run = row.get("nextRunAt")
            if row['status'] == 'partial' and row['datasetKey'].endswith('_realtime'):
                started = parse_timestamp(row.get('lastStartedAt'))
                if started and (now - started).total_seconds() >= 300:
                    due.append(row)
                    continue
            # Repair persisted pre-opening six-hour waits without resetting failures/backoff.
            if policy['mode'] == 'interval' and row['status'] == 'success' and market_open(row.get('market', 'cn'), now):
                last_success = parse_timestamp(row.get('lastSuccessAt'))
                if last_success is None or (now - last_success).total_seconds() >= policy['tradingIntervalSeconds']:
                    due.append(row)
                    continue
            if not next_run:
                due.append(row)
                continue
            try:
                parsed = parse_timestamp(next_run)
                if parsed <= now:
                    due.append(row)
            except ValueError:
                due.append(row)
        return due

    async def run_due(self) -> int:
        if self._run_due_lock.locked():
            return 0
        async with self._run_due_lock:
            # Keep the latest 1000 terminal executions; never remove active jobs.
            db.update("DELETE FROM data_fetch_runs WHERE id IN (SELECT id FROM data_fetch_runs WHERE status NOT IN ('queued','running') ORDER BY startedAt DESC, id DESC LIMIT -1 OFFSET 1000)")
            self.config = get_config()
            for dataset_id, task in list(self._tasks.items()):
                if task.done():
                    if not task.cancelled() and task.exception():
                        logger.error('订阅任务异常结束: %s', task.exception())
                    self._tasks.pop(dataset_id, None)
            if not self._tasks:
                concurrency = self.config['requestConcurrency']
                reserved = 1 if concurrency <= 3 else 2
                self._company_semaphore = asyncio.Semaphore(max(1, concurrency - reserved))
                self._quote_semaphore = self._company_semaphore if concurrency == 1 else asyncio.Semaphore(reserved)
                self._company_requests.clear()
                self._request_times.clear()
            await self._ensure_subscription_datasets()
            datasets = await self.list_due_datasets()
            def priority(dataset):
                key = dataset['datasetKey']
                category = 0 if key.endswith('_realtime') else 1 if key.endswith('_daily') else 2 if key == 'stock_financial' else 3
                return (0 if dataset['status'] == 'queued' else 1, category)
            datasets.sort(key=priority)
            if not datasets:
                return 0
            started = 0
            for dataset in datasets:
                dataset_id = str(dataset['id'])
                if dataset_id not in self._tasks:
                    self._tasks[dataset_id] = asyncio.create_task(self.run_dataset(dataset))
                    started += 1
            return started

    async def _ensure_subscription_datasets(self) -> None:
        """Backfill datasets added after an ETF subscription was created."""
        for code, name in INDEXES:
            db.execute_many("INSERT OR IGNORE INTO instruments (id,type,code,name,market,status,createdAt,updatedAt) VALUES (?, 'INDEX', ?, ?, 'CN', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [(f'index-{code}', code, name)])
            instrument = db.execute("SELECT id FROM instruments WHERE type='INDEX' AND code=?", (code,))[0]
            db.execute_many("INSERT OR IGNORE INTO data_subscriptions (id,instrumentId,enabled,timezone,profile,createdAt,updatedAt) VALUES (?, ?, 1, 'Asia/Shanghai', 'market_index', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [(f'index-sub-{code}', instrument['id'])])
            subscription = db.execute('SELECT id FROM data_subscriptions WHERE instrumentId=?', (instrument['id'],))[0]
            for key in (key for key, policy in self.config['policies'].items() if policy['scope'] == 'market_index' and (key.startswith('index_') or code == INDEXES[0][0])):
                policy = self.config['policies'][key]
                db.execute_many("INSERT OR IGNORE INTO subscription_datasets (id,subscriptionId,datasetKey,enabled,tradingIntervalSeconds,closedIntervalSeconds,status,createdAt,updatedAt) VALUES (?, ?, ?, 1, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [(f'index-dataset-{code}-{key}', subscription['id'], key, policy['tradingIntervalSeconds'], policy['closedIntervalSeconds'])])
        subscriptions = db.execute(
            """SELECT s.id
                 FROM data_subscriptions s
                 JOIN instruments i ON i.id = s.instrumentId
                WHERE s.enabled = 1 AND i.type = 'ETF'
                  AND EXISTS (
                    SELECT 1 FROM subscription_datasets existing
                     WHERE existing.subscriptionId = s.id
                       AND existing.datasetKey = 'constituent_stock_realtime'
                  )"""
        )
        values = []
        for subscription in subscriptions:
            subscription_id = str(subscription["id"])
            for dataset_key in ('constituent_stock_daily', 'stock_financial', 'stock_announcement', 'etf_research'):
                trading_interval, closed_interval = DATASET_DEFAULTS[dataset_key]
                values.append((
                    uuid.uuid4().hex,
                    subscription_id,
                    dataset_key,
                    trading_interval,
                    closed_interval,
                ))
        if values:
            db.execute_many(
                """INSERT OR IGNORE INTO subscription_datasets
                   (id, subscriptionId, datasetKey, enabled, tradingIntervalSeconds,
                    closedIntervalSeconds, status, createdAt, updatedAt)
                   VALUES (?, ?, ?, 1, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                values,
            )

    async def sync_global_assets(self) -> Dict[str, int]:
        """Legacy scheduler entry: all collection now uses tracked datasets."""
        return {'dispatched': await self.run_due()}

    def _store_index_spot(self, frame: Any) -> int:
        rows = frame.to_dict("records") if hasattr(frame, "to_dict") else (frame or [])
        now = datetime.now(timezone.utc).isoformat()
        values = []
        for row in rows:
            code = str(_value(row, "代码", "code", default=""))
            date = _date(_value(row, "数据日期", "日期", "date", default=now)) or now[:10]
            if not code:
                continue
            values.append((uuid.uuid4().hex, code, str(_value(row, "名称", "name", default=code)), date,
                           _number(_value(row, "开盘", "open")), _number(_value(row, "最高", "high")),
                           _number(_value(row, "最低", "low")), _number(_value(row, "最新价", "收盘", "close")),
                           int(_number(_value(row, "成交量", "volume"))), _number(_value(row, "涨跌幅", "changePct"))))
        if values:
            db.execute_many("INSERT INTO IndexDaily (id, code, name, date, open, high, low, close, volume, changePct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code, date) DO UPDATE SET name=excluded.name, open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, changePct=excluded.changePct", values)
        return len(values)

    def _store_market_flow(self, data: Any) -> int:
        if not data:
            return 0
        now = _date(_value(data, "日期", "date", default=datetime.now(timezone.utc).isoformat()))
        main = _number(_value(data, "主力净流入-净额", "mainNet")) / 1e8
        retail = (_number(_value(data, "中单净流入-净额", "midNet")) + _number(_value(data, "小单净流入-净额", "smallNet"))) / 1e8
        db.execute_many("INSERT INTO MarketCapitalFlow (id, date, totalMainNet, retailNet, sentiment, turnoverRate, northboundNet, marginBalance, marginChange, blockTradeCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET totalMainNet=excluded.totalMainNet, retailNet=excluded.retailNet, sentiment=excluded.sentiment", [(uuid.uuid4().hex, now, main, retail, 50, None, 0, 0, 0, 0)])
        return 1

    def _store_sector_flow(self, rows: Any) -> int:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        values = []
        for row in rows or []:
            name = str(_value(row, "名称", "sector", default=""))
            if not name:
                continue
            values.append((uuid.uuid4().hex, _date(_value(row, "日期", "date", default=now)) or now, name, "industry",
                           _number(_value(row, "今日主力净流入-净额", "mainForceNet")) / 1e8, 0,
                           _number(_value(row, "成交额", "totalVolume")), _number(_value(row, "今日涨跌幅", "changePct")), None))
        if values:
            db.execute_many("INSERT INTO SectorCapitalFlow (id, date, sector, sectorLevel, mainForceNet, retailNet, totalVolume, changePct, consecutiveDays) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(date, sector) DO UPDATE SET mainForceNet=excluded.mainForceNet, changePct=excluded.changePct", values)
        return len(values)

    def _store_news(self, frame: Any) -> int:
        rows = frame.to_dict("records") if hasattr(frame, "to_dict") else (frame or [])
        stored = 0
        for index, row in enumerate(rows):
            title = str(_value(row, "新闻标题", "title", default=""))
            if not title:
                continue
            published = _value(row, "发布时间", "publishTime", default=datetime.now(timezone.utc).isoformat())
            published_at = datetime.fromisoformat(str(published).replace('Z', '+00:00'))
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone(timedelta(hours=8)))
            published = published_at.astimezone(timezone.utc).isoformat()
            article_id = hashlib.sha256(f"{title}|{published}".encode()).hexdigest()[:24]
            stored += db.update("INSERT INTO NewsArticle (id, title, content, source, url, publishTime, category, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,source=excluded.source,url=excluded.url", (article_id, title, str(_value(row, "新闻内容", "content", default=title)), str(_value(row, "文章来源", "来源", "source", default="财联社")), _value(row, "新闻链接", "链接", "url"), str(published), "market", datetime.now(timezone.utc).isoformat()))
        return stored

    async def run_dataset(self, dataset: Dict[str, Any]) -> bool:
        dataset_id = str(dataset["id"])
        lock = self._locks.setdefault(dataset_id, asyncio.Lock())
        if lock.locked():
            return False
        async with lock:
            started = datetime.now(timezone.utc)
            queued_runs = db.execute("SELECT id FROM data_fetch_runs WHERE datasetId = ? AND status = 'queued' ORDER BY startedAt ASC LIMIT 1", (dataset_id,))
            run_id = str(queued_runs[0]["id"]) if queued_runs else uuid.uuid4().hex
            code = str(dataset["code"])
            key = str(dataset["datasetKey"])
            if queued_runs:
                db.update("UPDATE data_fetch_runs SET targetCode=?, status='running', startedAt=?, error=NULL WHERE id=?", (code, started.isoformat(), run_id))
            else:
                db.insert("INSERT INTO data_fetch_runs (id, datasetId, targetCode, status, startedAt) VALUES (?, ?, ?, 'running', ?)", (run_id, dataset_id, code, started.isoformat()))
            db.update("UPDATE subscription_datasets SET status='running', lastStartedAt=?, lastError=NULL, updatedAt=? WHERE id=?", (started.isoformat(), started.isoformat(), dataset_id))
            try:
                result = await asyncio.wait_for(self._fetch_with_retry(key, code), timeout=1800)
                if not result and key != 'stock_announcement':
                    raise ValueError(f"{key}/{code}: 数据源返回空数据，未完成同步")
                stored = await asyncio.to_thread(self._store, key, code, result)
                if stored == 0 and key != 'stock_announcement':
                    raise ValueError(f"{key}/{code}: 没有可入库的有效数据")
                completed = datetime.now(timezone.utc)
                policy = self.config['policies'][key]
                market = str(dataset.get('market') or 'cn').lower()
                if key == 'constituent_stock_realtime':
                    markets = {stock_market(_code(_value(row, '代码', '股票代码', 'stockCode', 'ticker', default=''))) for row in result}
                    market = next((candidate for candidate in markets if market_open(candidate, completed)), market)
                scheduled_next = next_run(policy, completed, market)
                partial = (isinstance(result, CompanyBatch) and bool(result.failures)) or (isinstance(result, dict) and bool(result.get('failures')))
                status = 'partial' if partial else 'success'
                error = (result.error_json() if isinstance(result, CompanyBatch) else json.dumps(result.get('failures'), ensure_ascii=False)) if partial else None
                if partial and key != 'northbound_flow':
                    scheduled_next = completed + timedelta(minutes=5 if key.endswith('_realtime') else 30)
                db.update("UPDATE data_fetch_runs SET status=?, fetchedCount=?, storedCount=?, durationMs=?, qualityStatus=?, error=?, completedAt=? WHERE id=?", (status, len(result) if isinstance(result, list) else len(result['data']) if isinstance(result, dict) and isinstance(result.get('data'), list) else 1, stored, int((completed - started).total_seconds() * 1000), 'partial' if partial else 'verified', error, completed.isoformat(), run_id))
                # Partial means the bundle contains verified usable fields plus explicit
                # optional gaps. Record its freshness so every analysis does not refetch
                # the same successful price/factor data merely because valuation or book
                # depth was unavailable.
                freshness_recorded = status == 'success' or (status == 'partial' and key == 'etf_research')
                db.update("UPDATE subscription_datasets SET status=?, lastSuccessAt=CASE WHEN ? = 1 THEN ? ELSE lastSuccessAt END, lastError=?, nextRunAt=?, updatedAt=? WHERE id=?", (status, 1 if freshness_recorded else 0, completed.isoformat(), error, scheduled_next.isoformat(), completed.isoformat(), dataset_id))
                return not partial
            except Exception as error:
                completed = datetime.now(timezone.utc)
                logger.exception("订阅采集失败 dataset=%s code=%s", key, code)
                message = str(error) or '同步超时，请重试'
                db.update("UPDATE data_fetch_runs SET status='failed', qualityStatus='unavailable', error=?, durationMs=?, completedAt=? WHERE id=?", (message, int((completed - started).total_seconds() * 1000), completed.isoformat(), run_id))
                db.update("UPDATE subscription_datasets SET status='failed', lastError=?, nextRunAt=?, updatedAt=? WHERE id=?", (message, (completed + timedelta(minutes=5)).isoformat(), completed.isoformat(), dataset_id))
                return False

    async def _fetch(self, key: str, code: str) -> Any:
        if key in ('research_calendar', 'etf_research'):
            from services.research_collection import collect_research
            return await collect_research(TushareProvider(), key, code, self.config['historyPoints'])
        if key == 'sector_capital_flow':
            # The previous snapshot-only feed could never satisfy a five-session
            # review after a fresh install. Promax exposes the underlying DC
            # industry history in yuan, so persist several sessions in one raw
            # bundle and retain the public snapshot as a fallback.
            try:
                provider = TushareProvider()
                end = datetime.now().strftime('%Y%m%d')
                start = (datetime.now() - timedelta(days=21)).strftime('%Y%m%d')
                frame = await provider.request_dataframe(
                    'moneyflow_ind_dc', start_date=start, end_date=end, content_type='行业'
                )
                if 'content_type' in frame.columns:
                    frame = frame[frame['content_type'].astype(str) == '行业']
                required = {'trade_date', 'name', 'net_amount'}
                if frame.empty or not required.issubset(frame.columns):
                    raise ValueError('moneyflow_ind_dc: 行业资金历史为空或字段不完整')
                rows = [{
                    '日期': row.get('trade_date'),
                    '名称': row.get('name'),
                    '代码': row.get('ts_code'),
                    '今日主力净流入-净额': row.get('net_amount'),
                    '今日主力净流入-净占比': row.get('net_amount_rate'),
                    '今日涨跌幅': row.get('pct_change'),
                    '收盘指数': row.get('close'),
                    '资金类型': row.get('content_type'),
                } for row in frame.to_dict('records')]
                return {'data': _clean_json(rows), 'source': 'Tushare/moneyflow_ind_dc',
                        'raw': True, 'unit': '元', 'scope': '东方财富行业板块主力成交分类'}
            except Exception as error:
                logger.warning('Promax 行业资金历史不可用，回退公开快照: %s', error)
                result = await data_service.get_sector_capital_flow('今日', force_refresh=True)
                rows = result.to_dict('records') if hasattr(result, 'to_dict') else result
                if not rows:
                    raise ValueError('sector_capital_flow: 历史接口与公开快照均无有效数据') from error
                source = data_service.registry.get_last_source('sector_capital_flow') or 'unknown'
                if source in ('unavailable', 'mock', 'estimated'):
                    raise ValueError(f'sector_capital_flow: 数据源不可用于入库: {source}') from error
                return {'data': _clean_json(rows), 'source': source,
                        'failures': {'history': 'Promax行业资金历史暂不可用，本次仅保留当日公开快照'}}
        if key in ('market_volume', 'market_main_flow', 'margin_balance'):
            provider = TushareProvider()
            end = datetime.now().strftime('%Y%m%d')
            start = (datetime.now() - timedelta(days=60 if key == 'market_volume' else 10)).strftime('%Y%m%d')
            api = {'market_volume': 'index_daily', 'market_main_flow': 'moneyflow_mkt_dc', 'margin_balance': 'margin'}[key]
            params = {'start_date': start, 'end_date': end}
            if key == 'market_volume':
                params['ts_code'] = '000001.SH'
            if key in ('market_main_flow', 'margin_balance'):
                frame = None
                history_frames = []
                for offset in range(45):
                    day = datetime.now() - timedelta(days=offset)
                    if day.weekday() >= 5:
                        continue
                    frame = await provider.request_dataframe(api, trade_date=day.strftime('%Y%m%d'))
                    if not frame.empty:
                        history_frames.append(frame)
                        if len(history_frames) >= 20:
                            break
                if history_frames:
                    import pandas as pd
                    frame = pd.concat(history_frames, ignore_index=True)
            else:
                frame = await provider.request_dataframe(api, **params)
            if frame is None or frame.empty:
                raise ValueError(f'{api}: 原始数据为空')
            rows = frame.sort_values('trade_date', ascending=False).to_dict('records')
            return {'data': _clean_json(rows), 'source': f'Tushare/{api}', 'raw': True}
        market_methods = {
            'northbound_flow': ('northbound_flow', lambda: data_service.get_northbound_flow(force_refresh=True)),
            'market_volume': ('market_volume_amplification', lambda: data_service.get_market_volume_amplification(20, force_refresh=True)),
            'dragon_tiger': ('lhb_data', lambda: data_service.get_lhb_data(force_refresh=True)),
            'market_news': ('news', lambda: data_service.get_news(keyword='财联社', limit=100)),
        }
        if key in market_methods:
            source_key, fetch_data = market_methods[key]
            result = await fetch_data()
            rows = result.to_dict('records') if hasattr(result, 'to_dict') else result
            if not rows:
                raise ValueError(f'{key}: 数据源无有效数据，保留上次快照')
            source = data_service.registry.get_last_source(source_key) or 'unknown'
            if source in ('unavailable', 'mock', 'estimated'):
                raise ValueError(f'{key}: 数据源不可用于入库: {source}')
            result = {'data': _clean_json(rows), 'source': source}
            if key == 'northbound_flow' and (not isinstance(rows, dict) or rows.get('semanticStatus') != 'verified-net-flow'):
                result['failures'] = {'semantics': '净流口径/网关单位未核验，仅留原始记录，不进入投资决策'}
            return result
        if key == 'index_realtime':
            request_key = ('index_spot',)
            task = self._company_requests.get(request_key)
            if task is None or (task.done() and time.monotonic() - self._request_times.get(request_key, 0) >= 30):
                self._company_requests[request_key] = asyncio.create_task(data_service.get_index_spot(force_refresh=True))
                self._request_times[request_key] = time.monotonic()
            frame = await self._company_requests[request_key]
            return [row for row in frame.to_dict('records') if _code(_value(row, '代码', 'code')) == _code(code)]
        if key == 'index_daily':
            start, end = self._history_range('IndexDaily', 'code', code)
            frame = await data_service.get_index_daily(code, start.replace('-', ''), end.replace('-', ''))
            rows = frame.to_dict('records') if frame is not None else []
            expected = await self._expected_index_close_date()
            latest = max((_date(_value(row, '日期', 'date', 'trade_date')) or '' for row in rows), default='')
            if expected and latest < expected:
                # A nonempty cached/lagging source is not a successful close sync.
                # Try the configured daily feed directly before scheduling a retry.
                # Query the missing session separately: a long history response can
                # itself be cached upstream while the single-day feed is current.
                frame = await TushareProvider().get_index_daily(code, expected.replace('-', ''), end.replace('-', ''))
                fresh = frame.to_dict('records') if frame is not None else []
                by_date = {_date(_value(row, '日期', 'date', 'trade_date')): row for row in rows}
                by_date.update({_date(_value(row, '日期', 'date', 'trade_date')): row for row in fresh})
                rows = list(by_date.values())
                latest = max((_date(_value(row, '日期', 'date', 'trade_date')) or '' for row in rows), default='')
                if latest < expected:
                    raise ValueError(f'{key}/{code}: 收盘数据尚未更新，应为 {expected}，实际 {latest or "无数据"}，稍后重试')
            return self._limit_history(rows)
        if key == "etf_realtime":
            frame = await data_service.get_etf_realtime([code])
            return frame.to_dict("records") if frame is not None else []
        if key == "etf_daily":
            start, end = self._history_range('ETFDaily', 'ticker', code)
            frame = await data_service.get_etf_daily(code, start.replace('-', ''), end.replace('-', ''))
            return self._limit_history(frame.to_dict("records") if frame is not None else [])
        if key == "etf_holdings":
            holdings = await self.etf_provider.get_holdings(code)
            return await self._ensure_holding_names(code, holdings)
        if key == "constituent_stock_realtime":
            holdings = await self._company_holdings(code)
            symbols = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker"))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker")
            ))
            batches = await asyncio.gather(*(self._company_request(key, symbol) for symbol in symbols), return_exceptions=True)
            rows = [row for batch in batches if isinstance(batch, list) for row in batch]
            valid = [row for row in rows if _number(_value(row, '最新价', '收盘', 'close', 'last')) > 0]
            received = {_code(_value(row, '代码', '股票代码', 'ticker', 'stock_code', 'stockCode', default='')) for row in valid}
            failures = {symbol: '未返回有效行情' for symbol in symbols if symbol not in received}
            result = CompanyBatch(valid, failures, [symbol for symbol in symbols if symbol in received])
            if not result:
                raise ValueError(result.error_json())
            return result
        if key == "constituent_stock_daily":
            holdings = await self._company_holdings(code)
            symbols = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker"))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker")
            ))
            failures = {}
            succeeded = []

            async def fetch_one(symbol: str) -> List[Dict[str, Any]]:
                try:
                    start, end = self._history_range('StockDaily', 'ticker', symbol)
                    rows = await self._company_request(key, symbol, start, end)
                    if not any(self._valid_daily_row(row) for row in (rows or [])):
                        full_start = (datetime.now() - timedelta(days=self.config['historyPoints'] * 2 + 60)).strftime('%Y-%m-%d')
                        if start != full_start:
                            rows = await self._company_request(key, symbol, full_start, end)
                    valid = [{**row, "stockCode": symbol} for row in self._limit_history(rows or []) if isinstance(row, dict) and self._valid_daily_row(row)]
                    if not valid:
                        raise ValueError('数据源未返回有效日线')
                    succeeded.append(symbol)
                    if len(valid) < min(self.config['historyPoints'], len(rows)):
                        failures[symbol] = '部分日线字段无效，已跳过'
                        succeeded.remove(symbol)
                    return valid
                except Exception as error:
                    logger.warning("企业历史K线获取失败 stock=%s error=%s", symbol, error)
                    failures[symbol] = str(error) or '请求超时'
                    return []

            batches = await asyncio.gather(*(fetch_one(symbol) for symbol in symbols))
            result = CompanyBatch([row for batch in batches for row in batch], failures, succeeded)
            if not result:
                raise ValueError(result.error_json())
            return result
        if key == "stock_financial":
            holdings = await self._company_holdings(code)
            targets = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker", default=""))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker", default="")
            ))
            return await self._company_reports(key, targets)
        if key == "stock_announcement":
            start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            holdings = await self._company_holdings(code)
            targets = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker", default=""))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker", default="")
            ))
            return await self._company_reports(key, targets, start, datetime.now().strftime("%Y-%m-%d"))
        raise ValueError(f"unsupported dataset: {key}")

    async def _company_holdings(self, code: str):
        # Holdings already have their own refresh dataset. Reuse that snapshot
        # instead of fetching it four times for every company refresh.
        rows = db.execute("SELECT stockCode, stockName, weight FROM ETFHolding WHERE etfCode=? ORDER BY weight DESC", (code,))
        if not rows:
            rows = await self.etf_provider.get_holdings(code)
        unique = {}
        for row in sorted(rows, key=lambda row: _number(row.get('weight')), reverse=True):
            symbol = _code(_value(row, 'stockCode', 'stock_code', 'code', 'ticker'))
            if symbol and symbol not in unique:
                unique[symbol] = {**row, 'stockCode': symbol}
            if len(unique) >= 10:
                break
        # Leading-indicator companies are an independent pool, not a holdings intersection.
        profiles = db.execute("SELECT s.profile FROM data_subscriptions s JOIN instruments i ON i.id=s.instrumentId WHERE i.type='ETF' AND i.code=?", (code,))
        if profiles:
            try:
                industry_id = json.loads(profiles[0].get('profile') or '{}').get('industryId')
                configs = db.execute("SELECT payload FROM raw_payloads WHERE datasetKey='research_profile' AND targetCode=? ORDER BY fetchedAt DESC LIMIT 1", (industry_id,)) if industry_id else []
                for leader in (json.loads(configs[0]['payload']).get('leaders', []) if configs else []):
                    leader_code = _code(leader.get('code'))
                    if leader_code and leader_code not in unique:
                        unique[leader_code] = {'stockCode': leader_code, 'stockName': leader.get('name'), 'researchPool': 'leader'}
            except (ValueError, TypeError):
                logger.warning('领域领先企业配置无效，保留原持仓企业池')
        if not unique:
            raise ValueError(f'{code}: 缺少企业持仓和领先企业，请先配置并同步')
        return list(unique.values())

    async def _company_request(self, key, symbol, start='', end=''):
        """Deduplicate shared holdings within a worker pass, not across refreshes."""
        request_key = (key, symbol, start, end)
        task = self._company_requests.get(request_key)
        ttl = 30 if key.endswith('_realtime') else 300
        if task is not None and task.done() and time.monotonic() - self._request_times.get(request_key, 0) >= ttl:
            task = None
        if task is None:
            async def fetch():
                async with (self._quote_semaphore if key.endswith('_realtime') else self._company_semaphore):
                    market = stock_market(symbol)
                    if key == 'constituent_stock_daily':
                        request = self.stock_provider.get_kline(symbol, 'daily', start, end, market, '')
                    elif key == 'constituent_stock_realtime':
                        if market == 'cn':
                            frame = await data_service.get_stock_spot([symbol])
                            return frame.to_dict('records') if frame is not None else []
                        request = self.stock_provider.get_realtime_quote([symbol], market)
                    elif key == 'stock_financial':
                        request = self._financial_bundle(symbol, market)
                    else:
                        request = self.stock_provider.get_subscription_announcements(symbol, start, end, market)
                    result = await asyncio.wait_for(request, timeout=120)
                    self._request_times[request_key] = time.monotonic()
                    return result
            task = asyncio.create_task(fetch())
            self._company_requests[request_key] = task
            self._request_times[request_key] = time.monotonic()
        try:
            return await asyncio.shield(task)
        except Exception:
            # Failed requests must not be cached across retry attempts.
            if self._company_requests.get(request_key) is task:
                self._company_requests.pop(request_key, None)
            raise

    async def _financial_bundle(self, symbol, market):
        result = []
        for report_type in ('income', 'balance', 'cashflow'):
            rows = await self.stock_provider.get_financial_report(symbol, report_type, market)
            if not rows:
                raise ValueError(f'{symbol}: {report_type} 财报未返回，保留已有报表')
            rows = sorted(rows, key=lambda row: str(_value(row, '报告期', 'report_period', 'end_date', 'period', default='')), reverse=True)[:8]
            result.extend({**row, 'reportType': report_type, 'currency': row.get('currency') or ('CNY' if market == 'cn' else '来源未标注')} for row in rows)
        return result

    def _history_range(self, table, column, code):
        # SQL identifiers are internal constants, never request input.
        rows = db.execute(f'SELECT count(*) AS count, max(date) AS latest FROM {table} WHERE {column}=? AND open>0 AND high>0 AND low>0 AND close>0', (code,))
        count = rows[0]['count'] if rows else 0
        end = datetime.now().strftime('%Y-%m-%d')
        if count >= self.config['historyPoints'] and rows[0]['latest']:
            start = datetime.strptime(_date(rows[0]['latest']), '%Y-%m-%d') - timedelta(days=7)
        else:
            start = datetime.now() - timedelta(days=self.config['historyPoints'] * 2 + 60)
        return start.strftime('%Y-%m-%d'), end

    def _limit_history(self, rows):
        valid = [row for row in rows if isinstance(row, dict) and self._valid_daily_row(row)]
        return sorted(valid, key=lambda row: _date(_value(row, '日期', 'date', 'trade_date'))) [-self.config['historyPoints']:]

    async def _company_reports(self, key, targets, start='', end=''):
        failures, succeeded = {}, []
        async def fetch(target):
            try:
                rows = await self._company_request(key, target, start, end)
                if not rows and key == 'stock_financial':
                    raise ValueError('未返回有效财报')
                succeeded.append(target)
                return [{**row, 'stockCode': target} for row in (rows or [])]
            except Exception as error:
                failures[target] = str(error) or '请求超时'
                return []
        batches = await asyncio.gather(*(fetch(target) for target in targets if target))
        result = CompanyBatch([row for batch in batches for row in batch], failures, succeeded)
        if failures and not succeeded:
            raise ValueError(result.error_json())
        return result

    @staticmethod
    def _valid_daily_row(row):
        values = [_number(_value(row, *keys)) for keys in [('开盘', '今开', 'open'), ('最高', 'high'), ('最低', 'low'), ('收盘', '最新价', 'close')]]
        date = _date(_value(row, '日期', 'date', 'trade_date'))
        try:
            datetime.strptime(date or '', '%Y-%m-%d')
        except ValueError:
            return False
        return all(math.isfinite(value) and value > 0 for value in values)

    @staticmethod
    def _is_placeholder_stock_name(name: Any, stock_code: str) -> bool:
        """判断持仓名称是否只是代码或空值，不能直接用于展示。"""
        value = str(name or '').strip()
        code = str(stock_code or '').strip()
        return not value or value.lower() in {'nan', 'none', 'null'} or value == code or _code(value) == _code(code)

    @staticmethod
    def _stock_name_from_info(info: Any, stock_code: str) -> Optional[str]:
        """从股票基础信息接口兼容提取中文企业名称。"""
        if not isinstance(info, dict):
            return None
        name = _value(info, 'name', '名称', '股票名称', '证券名称', '股票简称', '简称')
        if SubscriptionSyncService._is_placeholder_stock_name(name, stock_code):
            return None
        return str(name).strip()

    async def _ensure_holding_names(self, etf_code: str, holdings: Any) -> List[Dict[str, Any]]:
        """持仓成分变化或名称缺失时，向股票基础信息接口补齐企业名称。

        正常的每日持仓刷新只更新权重，不重复请求名称；新增/移除成分、来源名称
        变化或名称仍为代码时才触发补全，避免对底层接口造成不必要压力。
        """
        rows = [row for row in (holdings or []) if isinstance(row, dict)]
        if not rows:
            return rows

        existing_rows = db.execute(
            "SELECT stockCode, stockName FROM ETFHolding WHERE etfCode = ?",
            (etf_code,),
        ) or []
        existing = {
            _code(row.get('stockCode')): row
            for row in existing_rows
            if row.get('stockCode')
        }
        incoming_codes = {
            _code(_value(row, 'stock_code', 'stockCode', 'code', 'ticker'))
            for row in rows
            if _value(row, 'stock_code', 'stockCode', 'code', 'ticker')
        }
        composition_changed = incoming_codes != set(existing)
        candidates: List[Dict[str, Any]] = []
        for row in rows[:100]:
            stock_code = _code(_value(row, 'stock_code', 'stockCode', 'code', 'ticker'))
            if not stock_code:
                continue
            incoming_name = _value(row, 'stock_name', 'stockName', 'name')
            previous_name = existing.get(stock_code, {}).get('stockName')
            previous_name_missing = self._is_placeholder_stock_name(previous_name, stock_code)
            if self._is_placeholder_stock_name(incoming_name, stock_code) and not previous_name_missing:
                row['stock_name'] = previous_name
                row['stockName'] = previous_name
            # 来源偶尔只返回代码；只要数据库已有真实名称，就沿用缓存，避免每日重复查基础信息。
            name_missing = previous_name_missing or (self._is_placeholder_stock_name(incoming_name, stock_code) and not previous_name)
            name_changed = bool(
                incoming_name
                and not self._is_placeholder_stock_name(incoming_name, stock_code)
                and previous_name
                and not previous_name_missing
                and str(incoming_name).strip() != str(previous_name).strip()
            )
            if composition_changed or name_missing or name_changed:
                candidates.append(row)

        if not candidates:
            return rows

        semaphore = asyncio.Semaphore(8)

        async def resolve(row: Dict[str, Any]) -> None:
            stock_code = _code(_value(row, 'stock_code', 'stockCode', 'code', 'ticker'))
            if not stock_code:
                return
            try:
                async with semaphore:
                    info = await self.stock_provider.get_stock_info(stock_code, stock_market(stock_code))
                name = self._stock_name_from_info(info, stock_code)
                if name:
                    row['stock_name'] = name
                    row['stockName'] = name
            except Exception as error:
                logger.warning('持仓企业名称补全失败: etf=%s stock=%s error=%s', etf_code, stock_code, error)

        await asyncio.gather(*(resolve(row) for row in candidates))
        unresolved = [
            _code(_value(row, 'stock_code', 'stockCode', 'code', 'ticker'))
            for row in rows
            if self._is_placeholder_stock_name(
                _value(row, 'stock_name', 'stockName', 'name'),
                _code(_value(row, 'stock_code', 'stockCode', 'code', 'ticker')),
            )
        ]
        if unresolved:
            names = await self.stock_provider.get_stock_names(unresolved)
            for row in rows:
                stock_code = _code(_value(row, 'stock_code', 'stockCode', 'code', 'ticker'))
                if stock_code in names:
                    row['stock_name'] = names[stock_code]
                    row['stockName'] = names[stock_code]
        logger.info('持仓企业名称补全: etf=%s composition_changed=%s candidates=%s', etf_code, composition_changed, len(candidates))
        return rows

    async def _expected_index_close_date(self) -> Optional[str]:
        local = datetime.now(timezone.utc).astimezone(ZoneInfo('Asia/Shanghai'))
        # Before close, today's daily candle is not final.
        end = local if local.hour >= 15 else local - timedelta(days=1)
        request_key = ('index_close_calendar', end.strftime('%Y%m%d'))
        task = self._company_requests.get(request_key)
        if task is None or task.cancelled() or (task.done() and task.exception() is not None):
            self._company_requests[request_key] = asyncio.create_task(
                TushareProvider().request_dataframe('trade_cal', exchange='SSE',
                    start_date=(end - timedelta(days=40)).strftime('%Y%m%d'), end_date=end.strftime('%Y%m%d')))
        frame = await self._company_requests[request_key]
        dates = [_date(row.get('cal_date')) for row in frame.to_dict('records') if str(row.get('is_open')) in ('1', '1.0')]
        if not dates:
            raise ValueError('交易日历不可用，无法确认最新收盘日期')
        return max(date for date in dates if date)

    async def _fetch_with_retry(self, key: str, code: str) -> Any:
        """Bound external API concurrency and retry transient provider failures."""
        async with (self._realtime_fetch_semaphore if key.endswith('_realtime') else self._fetch_semaphore):
            last_error: Optional[Exception] = None
            for attempt in range(self.max_retries):
                try:
                    return await self._fetch(key, code)
                except Exception as error:
                    last_error = error
                    if attempt + 1 >= self.max_retries:
                        break
                    await asyncio.sleep(2 ** attempt)
            raise last_error or RuntimeError(f"fetch failed: {key}/{code}")

    def _store(self, key: str, code: str, result: Any) -> int:
        rows = result if isinstance(result, list) else [result]
        now = datetime.now(timezone.utc).isoformat()
        provider = key
        # pandas emits NaN for absent numeric fields. Python's json.dumps accepts
        # it by default, but JSON.parse in the Next.js research workflow rejects
        # the entire bundle. Normalize once at the persistence boundary and
        # require standards-compliant JSON so stored evidence is cross-runtime.
        clean_result = _clean_json(result)
        payload = json.dumps(clean_result, ensure_ascii=False, default=str, allow_nan=False)
        db.insert("INSERT INTO raw_payloads (id, datasetKey, targetCode, provider, payload, contentHash, fetchedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", (uuid.uuid4().hex, key, code, provider, payload, _hash(clean_result), now))
        if key in ('sector_capital_flow', 'northbound_flow', 'market_volume', 'dragon_tiger', 'market_news', 'market_main_flow', 'margin_balance'):
            data = result['data']
            if key == 'market_news':
                return self._store_news(data)
            return len(data) if isinstance(data, list) else 1
        if key in ('index_realtime', 'etf_realtime', 'constituent_stock_realtime'):
            return self._store_quotes(key, code, rows)
        if key == 'index_daily':
            values = []
            for row in self._limit_history(rows):
                values.append((uuid.uuid4().hex, code, dict(INDEXES).get(code, code), _date(_value(row, '日期', 'date', 'trade_date')), _number(_value(row, '开盘', 'open')), _number(_value(row, '最高', 'high')), _number(_value(row, '最低', 'low')), _number(_value(row, '收盘', 'close')), int(_number(_value(row, '成交量', 'volume', 'vol'))), _number(_value(row, '涨跌幅', 'pct_chg', 'changePct'))))
            if values:
                db.execute_many('INSERT INTO IndexDaily (id,code,name,date,open,high,low,close,volume,changePct) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code,date) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,changePct=excluded.changePct', values)
            return len(values)
        if key == "etf_holdings":
            stored = 0
            incoming_codes: List[str] = []
            seen_codes: set[str] = set()
            for row in rows:
                stock_code = _code(_value(row, "stock_code", "stockCode", "code", "ticker", default=""))
                if not stock_code or stock_code in seen_codes:
                    continue
                seen_codes.add(stock_code)
                incoming_codes.append(stock_code)
                stock_name = str(_value(row, "stock_name", "stockName", "name", default=stock_code))
                if self._is_placeholder_stock_name(stock_name, stock_code):
                    stock_name = stock_code
                db.execute_many("INSERT INTO ETFHolding (id, etfCode, stockCode, stockName, weight, shares, marketValue, updateDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(etfCode, stockCode) DO UPDATE SET stockName=CASE WHEN excluded.stockName != excluded.stockCode AND excluded.stockName != '' THEN excluded.stockName ELSE ETFHolding.stockName END, weight=excluded.weight, shares=excluded.shares, marketValue=excluded.marketValue, updateDate=excluded.updateDate", [(uuid.uuid4().hex, code, stock_code, stock_name, _number(_value(row, "weight", default=0)), _number(_value(row, "shares"), 0) if _value(row, "shares") is not None else None, _number(_value(row, "market_value", "marketValue"), 0) if _value(row, "market_value", "marketValue") is not None else None, now)])
                stored += 1
            existing_count_rows = db.execute(
                "SELECT COUNT(*) AS count FROM ETFHolding WHERE etfCode = ?",
                (code,),
            ) or []
            existing_count = int(existing_count_rows[0].get('count') or 0) if existing_count_rows else 0
            # 上游偶尔只返回报告期中的少量持仓。已有完整 Top10 时，不允许这种
            # 不完整快照删除其余成分；待下一次完整结果再做全量替换。
            snapshot_complete = len(set(incoming_codes)) >= 10 or existing_count < 10
            if incoming_codes and snapshot_complete:
                placeholders = ','.join('?' for _ in incoming_codes)
                db.update(f"DELETE FROM ETFHolding WHERE etfCode = ? AND stockCode NOT IN ({placeholders})", (code, *incoming_codes))
            elif incoming_codes:
                logger.warning(
                    'ETF持仓快照不足10条，保留历史完整成分: etf=%s incoming=%s existing=%s',
                    code, len(set(incoming_codes)), existing_count,
                )
            return stored
        if key == "etf_realtime":
            stored = 0
            for row in rows:
                date = _date(_value(row, "日期", "date", default=now)) or now[:10]
                ticker = _code(_value(row, "代码", "ticker", "code", default=code), code)
                db.execute_many("INSERT INTO ETFDaily (id, ticker, name, date, open, high, low, close, volume, amount, nav, shares, premium) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL) ON CONFLICT(ticker, date) DO UPDATE SET name=CASE WHEN excluded.name != '' THEN excluded.name ELSE ETFDaily.name END, open=CASE WHEN excluded.open > 0 THEN excluded.open ELSE ETFDaily.open END, high=CASE WHEN excluded.high > 0 THEN excluded.high ELSE ETFDaily.high END, low=CASE WHEN excluded.low > 0 THEN excluded.low ELSE ETFDaily.low END, close=CASE WHEN excluded.close > 0 THEN excluded.close ELSE ETFDaily.close END, volume=CASE WHEN excluded.volume > 0 THEN excluded.volume ELSE ETFDaily.volume END, amount=CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE ETFDaily.amount END", [(uuid.uuid4().hex, ticker, str(_value(row, "名称", "name", default=code)), date, _number(_value(row, "开盘", "open")), _number(_value(row, "最高", "high")), _number(_value(row, "最低", "low")), _number(_value(row, "最新价", "收盘", "close")), int(_number(_value(row, "成交量", "volume"))), _number(_value(row, "成交额", "amount")))])
                stored += 1
            return stored
        if key == "constituent_stock_realtime":
            stored = 0
            for row in rows:
                ticker = _code(_value(row, "代码", "股票代码", "ticker", "stock_code", "stockCode", default=""))
                if not ticker:
                    continue
                date = _date(_value(row, "日期", "date", default=now)) or now[:10]
                db.execute_many("INSERT INTO StockDaily (id, ticker, market, date, open, high, low, close, volume, amount) VALUES (?, ?, 'CN', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ticker, date) DO UPDATE SET open=CASE WHEN excluded.open > 0 THEN excluded.open ELSE StockDaily.open END, high=CASE WHEN excluded.high > 0 THEN excluded.high ELSE StockDaily.high END, low=CASE WHEN excluded.low > 0 THEN excluded.low ELSE StockDaily.low END, close=CASE WHEN excluded.close > 0 THEN excluded.close ELSE StockDaily.close END, volume=CASE WHEN excluded.volume > 0 THEN excluded.volume ELSE StockDaily.volume END, amount=CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE StockDaily.amount END", [(uuid.uuid4().hex, ticker, date, _number(_value(row, "开盘", "今开", "open")), _number(_value(row, "最高", "high")), _number(_value(row, "最低", "low")), _number(_value(row, "最新价", "收盘", "close", "last")), int(_number(_value(row, "成交量", "volume", "vol"))), _number(_value(row, "成交额", "amount")))])
                stored += 1
            return stored
        if key == "constituent_stock_daily":
            values = []
            for row in rows:
                ticker = _code(_value(row, "stockCode", "stock_code", "股票代码", "代码", "ticker", "code", default=""))
                if not ticker:
                    continue
                date = _date(_value(row, "日期", "date", "trade_date", default=now)) or now[:10]
                open_price = _number(_value(row, "开盘", "今开", "open"))
                high_price = _number(_value(row, "最高", "high"))
                low_price = _number(_value(row, "最低", "low"))
                close_price = _number(_value(row, "收盘", "最新价", "close"))
                if not self._valid_daily_row(row):
                    continue
                values.append((uuid.uuid4().hex, ticker, stock_market(ticker).upper(), date, open_price, high_price, low_price, close_price, int(_number(_value(row, "成交量", "volume", "vol"))), _number(_value(row, "成交额", "amount"))))
            if values:
                db.execute_many("INSERT INTO StockDaily (id,ticker,market,date,open,high,low,close,volume,amount) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ticker,date) DO UPDATE SET market=excluded.market,open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,amount=excluded.amount", values)
            return len(values)
        if key == "etf_daily":
            stored = 0
            for row in rows:
                date = _date(_value(row, "日期", "date", "trade_date"))
                if not date:
                    continue
                open_price = _number(_value(row, "开盘", "open"))
                high_price = _number(_value(row, "最高", "high"))
                low_price = _number(_value(row, "最低", "low"))
                close_price = _number(_value(row, "收盘", "close"))
                if min(open_price, high_price, low_price, close_price) <= 0:
                    continue
                db.execute_many("INSERT INTO ETFDaily (id, ticker, name, date, open, high, low, close, volume, amount, nav, shares, premium) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL) ON CONFLICT(ticker, date) DO UPDATE SET name=excluded.name, open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, amount=excluded.amount", [(uuid.uuid4().hex, _code(code), str(_value(row, "名称", "name", default=code)), date, open_price, high_price, low_price, close_price, int(_number(_value(row, "成交量", "volume", "vol"))), _number(_value(row, "成交额", "amount")))])
                stored += 1
            return stored
        if key == "stock_financial":
            values = []
            for row in rows:
                stock_code = _code(_value(row, "stockCode", "stock_code", default=code), code)
                period = _date(_value(row, "报告期", "report_period", "end_date", 'period'))
                if not period:
                    continue
                values.append((uuid.uuid4().hex, stock_code, row.get('reportType') or 'income', period, _date(_value(row, "报告日期", "公告日期", "ann_date", "publish_date")), json.dumps(_clean_json(row), ensure_ascii=False, default=str, allow_nan=False), row.get('source') or provider, now, _hash(row)))
            if values:
                db.execute_many("INSERT INTO stock_financial_reports (id, stockCode, reportType, reportPeriod, publishDate, metricsJson, source, fetchedAt, contentHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stockCode, reportType, reportPeriod) DO UPDATE SET publishDate=excluded.publishDate,metricsJson=excluded.metricsJson,source=excluded.source,fetchedAt=excluded.fetchedAt,contentHash=excluded.contentHash", values)
            return len(values)
        if key == "stock_announcement":
            for index, row in enumerate(rows):
                stock_code = _code(_value(row, "stockCode", "stock_code", default=code), code)
                announcement_id = str(_value(row, "公告ID", "id", "url", '网址', default=_hash([stock_code, _value(row, '公告标题', 'title'), _value(row, '公告日期', 'publish_date', 'date')])))
                db.execute_many("INSERT INTO stock_announcements (id, stockCode, announcementId, title, eventType, publishDate, url, content, source, fetchedAt, contentHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stockCode, announcementId) DO UPDATE SET title=excluded.title,eventType=excluded.eventType,publishDate=excluded.publishDate,url=COALESCE(excluded.url,stock_announcements.url),content=COALESCE(excluded.content,stock_announcements.content),source=excluded.source,fetchedAt=excluded.fetchedAt,contentHash=excluded.contentHash", [(uuid.uuid4().hex, stock_code, announcement_id, str(_value(row, "公告标题", "title", default="")), str(_value(row, "公告类型", "event_type", default="")), _date(_value(row, "公告日期", "publish_date", "date")), _value(row, "url", "链接", '网址'), _value(row, "content", "正文", 'summary'), row.get('source') or provider, now, _hash(row))])
            return len(rows)
        return len(rows)

    def _store_quotes(self, key, code, rows):
        instrument_type = {'index_realtime': 'INDEX', 'etf_realtime': 'ETF', 'constituent_stock_realtime': 'STOCK'}[key]
        values = []
        instrument_names = []
        for row in rows:
            ticker = code if instrument_type != 'STOCK' else _code(_value(row, '代码', '股票代码', 'stockCode', 'ticker', default=''))
            price = _number(_value(row, '最新价', '收盘', 'close', 'last', 'price'))
            if not ticker or not math.isfinite(price) or price <= 0:
                continue
            def optional(*keys):
                value = _value(row, *keys)
                number = _number(value, float('nan'))
                return number if math.isfinite(number) else None
            market = stock_market(ticker) if instrument_type == 'STOCK' else 'cn'
            change = optional('涨跌幅', 'pct_chg', 'changePct')
            previous = optional('昨收', '昨收价', 'pre_close', 'previousClose')
            if previous is None and change is not None and change > -100:
                previous = price / (1 + change / 100)
            trade_date = _date(_value(row, '数据日期', '日期', 'date', 'trade_date'))
            if not trade_date:
                # Timestamp-less payloads cannot become a fabricated current-day candle.
                table, column = ('IndexDaily', 'code') if instrument_type == 'INDEX' else ('ETFDaily', 'ticker') if instrument_type == 'ETF' else ('StockDaily', 'ticker')
                latest = db.execute(f'SELECT max(date) AS date FROM {table} WHERE {column}=?', (ticker,))
                trade_date = _date(latest[0]['date']) if latest and latest[0]['date'] else ''
            values.append((uuid.uuid4().hex, instrument_type, ticker, market.upper(), row.get('currency') or ('HKD' if market == 'hk' else 'USD' if market == 'us' else 'CNY'), price, previous, optional('开盘', '今开', 'open'), optional('最高', 'high'), optional('最低', 'low'), optional('成交量', 'volume', 'vol'), optional('成交额', 'amount'), change, trade_date, row.get('source') or key, datetime.now(timezone.utc).isoformat()))
            name = _value(row, '名称', '股票名称', '证券简称', 'name', 'shortName')
            if instrument_type == 'STOCK' and not self._is_placeholder_stock_name(name, ticker):
                instrument_names.append((uuid.uuid4().hex, ticker, str(name).strip(), market.upper()))
        if values:
            db.execute_many('INSERT INTO market_quotes (id,instrumentType,code,market,currency,price,previousClose,open,high,low,volume,amount,changePct,tradeDate,source,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(instrumentType,code) DO UPDATE SET market=excluded.market,currency=excluded.currency,price=excluded.price,previousClose=excluded.previousClose,open=excluded.open,high=excluded.high,low=excluded.low,volume=excluded.volume,amount=excluded.amount,changePct=excluded.changePct,tradeDate=excluded.tradeDate,source=excluded.source,fetchedAt=excluded.fetchedAt', values)
        if instrument_names:
            db.execute_many("INSERT INTO instruments (id,type,code,name,market,status,createdAt,updatedAt) VALUES (?, 'STOCK', ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(type,code) DO UPDATE SET name=excluded.name,market=excluded.market,status='active',updatedAt=CURRENT_TIMESTAMP", instrument_names)
        return len(values)


subscription_sync_service = SubscriptionSyncService()
