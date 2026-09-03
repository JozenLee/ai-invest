"""按标的订阅采集数据并落盘到共享 SQLite。"""

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from db import db
from providers.etf_provider import ETFProvider
from providers.stock_provider import StockProvider
from services.data_service import data_service
from utils.trading_hours import is_trading_hours

logger = logging.getLogger(__name__)


DATASET_DEFAULTS = {
    "etf_realtime": (180, 3600),
    "etf_daily": (86400, 86400),
    "etf_holdings": (86400, 86400),
    "constituent_stock_realtime": (300, 3600),
    "constituent_stock_daily": (86400, 86400),
    "stock_financial": (86400, 86400),
    "stock_announcement": (900, 3600),
}

GLOBAL_DATASETS = {
    "index_daily", "market_capital_flow", "sector_capital_flow", "news",
}


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, default=str, sort_keys=True).encode()).hexdigest()


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
    return normalized


class SubscriptionSyncService:
    def __init__(self):
        self.etf_provider = ETFProvider()
        self.stock_provider = StockProvider()
        self._locks: Dict[str, asyncio.Lock] = {}
        self._run_due_lock = asyncio.Lock()
        self._fetch_semaphore = asyncio.Semaphore(4)
        self.max_retries = 3

    async def list_due_datasets(self) -> List[Dict[str, Any]]:
        rows = db.execute(
            """SELECT d.id, d.datasetKey, d.enabled, d.tradingIntervalSeconds,
                      d.closedIntervalSeconds, d.nextRunAt, s.enabled AS subscriptionEnabled,
                      i.code, i.type
                 FROM subscription_datasets d
                 JOIN data_subscriptions s ON s.id = d.subscriptionId
                 JOIN instruments i ON i.id = s.instrumentId
                WHERE d.enabled = 1 AND s.enabled = 1
                ORDER BY d.nextRunAt ASC"""
        )
        now = datetime.now(timezone.utc)
        due = []
        for row in rows:
            next_run = row.get("nextRunAt")
            if not next_run:
                due.append(row)
                continue
            try:
                parsed = datetime.fromisoformat(str(next_run).replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                if parsed <= now:
                    due.append(row)
            except ValueError:
                due.append(row)
        return due

    async def run_due(self) -> int:
        if self._run_due_lock.locked():
            return 0
        async with self._run_due_lock:
            await self._ensure_subscription_datasets()
            datasets = await self.list_due_datasets()
            if not datasets:
                return 0
            results = await asyncio.gather(
                *(self.run_dataset(dataset) for dataset in datasets),
                return_exceptions=True,
            )
            return sum(result is True for result in results)

    async def _ensure_subscription_datasets(self) -> None:
        """Backfill datasets added after an ETF subscription was created."""
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
            for dataset_key in ('constituent_stock_daily', 'stock_financial', 'stock_announcement'):
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
        """同步不依赖 ETF 订阅的市场与资讯资产。"""
        result = {key: 0 for key in GLOBAL_DATASETS}
        schedule = db.execute("SELECT enabled, tradingIntervalSeconds, closedIntervalSeconds, lastRunAt FROM data_subscription_schedules WHERE scope = 'market_index' LIMIT 1")
        should_sync_index = True
        if schedule:
            config = schedule[0]
            if not config.get("enabled"):
                should_sync_index = False
            last_run = config.get("lastRunAt")
            interval = int(config.get("tradingIntervalSeconds") if is_trading_hours() else config.get("closedIntervalSeconds") or 120)
            if should_sync_index and last_run:
                try:
                    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(str(last_run).replace("Z", "+00:00"))).total_seconds()
                    if elapsed < interval:
                        should_sync_index = False
                except ValueError:
                    pass
        if should_sync_index:
            try:
                frame = await data_service.get_index_spot(force_refresh=True)
                result["index_daily"] = self._store_index_spot(frame)
                if schedule:
                    timestamp = datetime.now(timezone.utc).isoformat()
                    db.update("UPDATE data_subscription_schedules SET lastRunAt=?, updatedAt=? WHERE scope = 'market_index'", (timestamp, timestamp))
            except Exception:
                logger.exception("指数资产同步失败")
        try:
            flow = await data_service.get_market_capital_flow()
            result["market_capital_flow"] = self._store_market_flow(flow)
        except Exception:
            logger.exception("市场资金流资产同步失败")
        try:
            sectors = await data_service.get_sector_capital_flow("今日", force_refresh=True)
            result["sector_capital_flow"] = self._store_sector_flow(sectors)
        except Exception:
            logger.exception("板块资金流资产同步失败")
        try:
            frame = await data_service.get_news(keyword="财联社", limit=100)
            result["news"] = self._store_news(frame)
        except Exception:
            logger.exception("资讯资产同步失败")
        return result

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
            article_id = hashlib.sha256(f"{title}|{published}".encode()).hexdigest()[:24]
            db.execute("INSERT OR IGNORE INTO NewsArticle (id, title, content, source, url, publishTime, category, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (article_id, title, str(_value(row, "新闻内容", "content", default=title)), str(_value(row, "文章来源", "source", default="财联社")), _value(row, "链接", "url"), str(published), "market", datetime.now(timezone.utc).isoformat()))
            stored += 1
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
                result = await self._fetch_with_retry(key, code)
                stored = await asyncio.to_thread(self._store, key, code, result)
                completed = datetime.now(timezone.utc)
                interval = int(dataset.get("tradingIntervalSeconds") if is_trading_hours() else dataset.get("closedIntervalSeconds") or DATASET_DEFAULTS.get(key, (300, 3600))[1])
                next_run = completed + timedelta(seconds=max(30, interval))
                db.update("UPDATE data_fetch_runs SET status='success', fetchedCount=?, storedCount=?, durationMs=?, qualityStatus='verified', completedAt=? WHERE id=?", (len(result) if isinstance(result, list) else 1, stored, int((completed - started).total_seconds() * 1000), completed.isoformat(), run_id))
                db.update("UPDATE subscription_datasets SET status='success', lastSuccessAt=?, nextRunAt=?, updatedAt=? WHERE id=?", (completed.isoformat(), next_run.isoformat(), completed.isoformat(), dataset_id))
                return True
            except Exception as error:
                completed = datetime.now(timezone.utc)
                logger.exception("订阅采集失败 dataset=%s code=%s", key, code)
                db.update("UPDATE data_fetch_runs SET status='failed', error=?, durationMs=?, completedAt=? WHERE id=?", (str(error), int((completed - started).total_seconds() * 1000), completed.isoformat(), run_id))
                db.update("UPDATE subscription_datasets SET status='failed', lastError=?, nextRunAt=?, updatedAt=? WHERE id=?", (str(error), (completed + timedelta(minutes=5)).isoformat(), completed.isoformat(), dataset_id))
                return False

    async def _fetch(self, key: str, code: str) -> Any:
        if key == "etf_realtime":
            frame = await data_service.get_etf_realtime([code])
            return frame.to_dict("records") if frame is not None else []
        if key == "etf_daily":
            end = datetime.now().strftime("%Y%m%d")
            start = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")
            frame = await data_service.get_etf_daily(code, start, end)
            return frame.to_dict("records") if frame is not None else []
        if key == "etf_holdings":
            holdings = await self.etf_provider.get_holdings(code)
            return await self._ensure_holding_names(code, holdings)
        if key == "constituent_stock_realtime":
            holdings = await self.etf_provider.get_holdings(code)
            symbols = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker"))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker")
            ))
            frame = await data_service.get_stock_spot(symbols) if symbols else []
            return frame.to_dict("records") if hasattr(frame, "to_dict") else frame
        if key == "constituent_stock_daily":
            holdings = await self.etf_provider.get_holdings(code)
            symbols = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker"))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker")
            ))
            start = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
            end = datetime.now().strftime("%Y-%m-%d")
            semaphore = asyncio.Semaphore(8)

            async def fetch_one(symbol: str) -> List[Dict[str, Any]]:
                try:
                    async with semaphore:
                        rows = await self.stock_provider.get_kline(symbol, "daily", start, end, "cn")
                    return [{**row, "stockCode": symbol} for row in (rows or []) if isinstance(row, dict)]
                except Exception as error:
                    logger.warning("企业历史K线获取失败 stock=%s error=%s", symbol, error)
                    return []

            batches = await asyncio.gather(*(fetch_one(symbol) for symbol in symbols))
            return [row for batch in batches for row in batch]
        if key == "stock_financial":
            holdings = await self.etf_provider.get_holdings(code)
            targets = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker", default=""))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker", default="")
            ))
            result = []
            for target in [item for item in targets if item]:
                for row in (await self.stock_provider.get_financial_report(target, "income", "cn") or []):
                    result.append({**row, "stockCode": target})
            return result
        if key == "stock_announcement":
            start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            holdings = await self.etf_provider.get_holdings(code)
            targets = list(dict.fromkeys(
                _code(_value(row, "stock_code", "stockCode", "code", "ticker", default=""))
                for row in holdings[:100]
                if _value(row, "stock_code", "stockCode", "code", "ticker", default="")
            ))
            result = []
            for target in [item for item in targets if item]:
                for row in (await self.stock_provider.get_announcements(target, start, datetime.now().strftime("%Y-%m-%d"), "cn") or []):
                    result.append({**row, "stockCode": target})
            return result
        raise ValueError(f"unsupported dataset: {key}")

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
                    info = await self.stock_provider.get_stock_info(stock_code, 'cn')
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

    async def _fetch_with_retry(self, key: str, code: str) -> Any:
        """Bound external API concurrency and retry transient provider failures."""
        async with self._fetch_semaphore:
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
        payload = json.dumps(result, ensure_ascii=False, default=str)
        db.insert("INSERT INTO raw_payloads (id, datasetKey, targetCode, provider, payload, contentHash, fetchedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", (uuid.uuid4().hex, key, code, provider, payload, _hash(result), now))
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
            stored = 0
            for row in rows:
                ticker = _code(_value(row, "stockCode", "stock_code", "股票代码", "代码", "ticker", "code", default=""))
                if not ticker:
                    continue
                date = _date(_value(row, "日期", "date", "trade_date", default=now)) or now[:10]
                open_price = _number(_value(row, "开盘", "今开", "open"))
                high_price = _number(_value(row, "最高", "high"))
                low_price = _number(_value(row, "最低", "low"))
                close_price = _number(_value(row, "收盘", "最新价", "close"))
                if min(open_price, high_price, low_price, close_price) <= 0:
                    continue
                db.execute_many("INSERT INTO StockDaily (id, ticker, market, date, open, high, low, close, volume, amount) VALUES (?, ?, 'CN', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ticker, date) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, amount=excluded.amount", [(uuid.uuid4().hex, ticker, date, open_price, high_price, low_price, close_price, int(_number(_value(row, "成交量", "volume", "vol"))), _number(_value(row, "成交额", "amount")))])
                stored += 1
            return stored
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
            for row in rows:
                stock_code = _code(_value(row, "stockCode", "stock_code", default=code), code)
                period = str(_value(row, "报告期", "report_period", "end_date", default="unknown"))
                db.execute_many("INSERT INTO stock_financial_reports (id, stockCode, reportType, reportPeriod, publishDate, metricsJson, source, fetchedAt, contentHash) VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?) ON CONFLICT(stockCode, reportType, reportPeriod) DO UPDATE SET metricsJson=excluded.metricsJson, source=excluded.source, fetchedAt=excluded.fetchedAt, contentHash=excluded.contentHash", [(uuid.uuid4().hex, stock_code, period, _date(_value(row, "报告日期", "公告日期", "ann_date", "publish_date")), json.dumps(row, ensure_ascii=False, default=str), provider, now, _hash(row))])
            return len(rows)
        if key == "stock_announcement":
            for index, row in enumerate(rows):
                stock_code = _code(_value(row, "stockCode", "stock_code", default=code), code)
                announcement_id = str(_value(row, "公告ID", "id", "url", default=f"{stock_code}-{index}-{_date(_value(row, '公告日期', 'publish_date'))}"))
                db.execute_many("INSERT INTO stock_announcements (id, stockCode, announcementId, title, eventType, publishDate, url, content, source, fetchedAt, contentHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stockCode, announcementId) DO UPDATE SET title=excluded.title, eventType=excluded.eventType, publishDate=excluded.publishDate, url=excluded.url, content=excluded.content, source=excluded.source, fetchedAt=excluded.fetchedAt, contentHash=excluded.contentHash", [(uuid.uuid4().hex, stock_code, announcement_id, str(_value(row, "公告标题", "title", default="")), str(_value(row, "公告类型", "event_type", default="")), _date(_value(row, "公告日期", "publish_date", "date")), _value(row, "url", "链接"), _value(row, "content", "正文"), provider, now, _hash(row))])
            return len(rows)
        return len(rows)


subscription_sync_service = SubscriptionSyncService()
