import asyncio
import json
import sqlite3
from unittest.mock import AsyncMock, Mock

import pytest

from db import Database
from services import subscription_sync_service as module


@pytest.fixture
def service(monkeypatch, tmp_path):
    database = Database(str(tmp_path / 'sync.db'))
    with sqlite3.connect(database.db_path) as conn:
        conn.executescript('''
            CREATE TABLE subscription_datasets (id TEXT PRIMARY KEY, status TEXT,
              lastStartedAt TEXT, lastSuccessAt TEXT, lastError TEXT, nextRunAt TEXT, updatedAt TEXT);
            CREATE TABLE data_fetch_runs (id TEXT PRIMARY KEY, datasetId TEXT, targetCode TEXT,
              status TEXT, startedAt TEXT, completedAt TEXT, fetchedCount INTEGER DEFAULT 0,
              storedCount INTEGER DEFAULT 0, durationMs INTEGER, qualityStatus TEXT, error TEXT);
            CREATE TABLE raw_payloads (id TEXT, datasetKey TEXT, targetCode TEXT, provider TEXT, payload TEXT, contentHash TEXT, fetchedAt TEXT);
            CREATE TABLE StockDaily (id TEXT PRIMARY KEY, ticker TEXT, market TEXT, date TEXT,
              open REAL, high REAL, low REAL, close REAL, volume INTEGER, amount REAL, UNIQUE(ticker,date));
            CREATE TABLE IndexDaily (id TEXT PRIMARY KEY, code TEXT, name TEXT, date TEXT,
              open REAL, high REAL, low REAL, close REAL, volume INTEGER, changePct REAL, UNIQUE(code,date));
            CREATE TABLE ETFHolding (id TEXT PRIMARY KEY, etfCode TEXT, stockCode TEXT,
              stockName TEXT, weight REAL, shares REAL, marketValue REAL, updateDate TEXT,
              UNIQUE(etfCode,stockCode));
            CREATE TABLE instruments (id TEXT PRIMARY KEY, type TEXT, code TEXT, name TEXT,
              market TEXT, status TEXT, createdAt TEXT, updatedAt TEXT, UNIQUE(type,code));
            INSERT INTO subscription_datasets (id,status) VALUES ('dataset','queued');
            INSERT INTO data_fetch_runs (id,datasetId,status,startedAt) VALUES ('run','dataset','queued','2026-09-01');
        ''')
    monkeypatch.setattr(module, 'db', database)
    monkeypatch.setattr(module, 'ETFProvider', Mock)
    monkeypatch.setattr(module, 'StockProvider', Mock)
    instance = module.SubscriptionSyncService()
    instance.max_retries = 1
    return instance


DATASET = {'id': 'dataset', 'code': '159995', 'datasetKey': 'constituent_stock_daily', 'tradingIntervalSeconds': 300, 'closedIntervalSeconds': 3600}
ROW = {'date': '2026-09-03', 'open': 10, 'high': 12, 'low': 9, 'close': 11}


@pytest.mark.asyncio
async def test_index_close_uses_fresh_feed_when_primary_is_old(service, monkeypatch):
    import pandas as pd
    monkeypatch.setattr(service, '_history_range', lambda *args: ('2026-09-01', '2026-09-04'))
    monkeypatch.setattr(service, '_expected_index_close_date', AsyncMock(return_value='2026-09-04'))
    monkeypatch.setattr(module.data_service, 'get_index_daily', AsyncMock(return_value=pd.DataFrame([ROW])))
    fallback = AsyncMock(return_value=pd.DataFrame([{**ROW, 'date': '2026-09-04'}]))
    monkeypatch.setattr(module, 'TushareProvider', lambda: Mock(get_index_daily=fallback))
    rows = await service._fetch('index_daily', 'sh000001')
    assert rows[-1]['date'] == '2026-09-04'
    fallback.assert_awaited_once_with('sh000001', '20260904', '20260904')
    assert rows[0]['date'] == '2026-09-03'


@pytest.mark.asyncio
async def test_index_close_calendar_respects_holidays_and_is_shared(service, monkeypatch):
    import pandas as pd
    calendar = AsyncMock(return_value=pd.DataFrame([
        {'cal_date': '20260930', 'is_open': 1}, {'cal_date': '20261001', 'is_open': 0}]))
    monkeypatch.setattr(module, 'TushareProvider', lambda: Mock(request_dataframe=calendar))
    assert await service._expected_index_close_date() == '2026-09-30'
    assert await service._expected_index_close_date() == '2026-09-30'
    calendar.assert_awaited_once()


@pytest.mark.asyncio
async def test_old_index_close_is_failed_and_retried_not_success(service, monkeypatch):
    import pandas as pd
    from datetime import datetime, timezone
    monkeypatch.setattr(service, '_history_range', lambda *args: ('2026-09-01', '2026-09-04'))
    monkeypatch.setattr(service, '_expected_index_close_date', AsyncMock(return_value='2026-09-04'))
    monkeypatch.setattr(module.data_service, 'get_index_daily', AsyncMock(return_value=pd.DataFrame([ROW])))
    monkeypatch.setattr(module, 'TushareProvider', lambda: Mock(get_index_daily=AsyncMock(return_value=pd.DataFrame([ROW]))))
    assert not await service.run_dataset({**DATASET, 'code': 'sh000001', 'datasetKey': 'index_daily'})
    row = module.db.execute('SELECT * FROM subscription_datasets')[0]
    assert row['status'] == 'failed'
    assert row['lastSuccessAt'] is None
    assert '2026-09-04' in row['lastError']
    assert 0 < (datetime.fromisoformat(row['nextRunAt']) - datetime.now(timezone.utc)).total_seconds() <= 300


@pytest.mark.asyncio
async def test_partial_realtime_does_not_keep_legacy_half_hour_backoff(service, monkeypatch):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    row = {'id': 'dataset', 'datasetKey': 'constituent_stock_realtime', 'status': 'partial', 'market': 'CN', 'nextRunAt': (now + timedelta(minutes=20)).isoformat(), 'lastStartedAt': (now - timedelta(minutes=10)).isoformat()}
    monkeypatch.setattr(module.db, 'execute', lambda *args: [row])
    assert await service.list_due_datasets() == [row]


def test_news_write_is_committed_and_idempotent(service):
    module.db.update('CREATE TABLE NewsArticle (id TEXT PRIMARY KEY,title TEXT,content TEXT,source TEXT,url TEXT,publishTime TEXT,category TEXT,createdAt TEXT)')
    row = {'新闻标题': '算力研究', '新闻内容': '测试证据', '发布时间': '2026-09-03 20:00:00', '来源': 'Tushare'}
    assert service._store_news([row]) == 1
    assert service._store_news([row]) == 1
    rows = module.db.execute('SELECT * FROM NewsArticle')
    assert len(rows) == 1
    assert rows[0]['publishTime'] == '2026-09-03T12:00:00+00:00'
    assert rows[0]['source'] == 'Tushare'


@pytest.mark.asyncio
async def test_turnover_subscription_keeps_raw_rows(service, monkeypatch):
    import pandas as pd
    request = AsyncMock(return_value=pd.DataFrame([{'trade_date': '20260903', 'amount': 12345.0}]))
    monkeypatch.setattr(module, 'TushareProvider', lambda: Mock(request_dataframe=request))
    result = await service._fetch('market_volume', 'sh000001')
    assert result['raw'] is True
    assert result['data'][0]['amount'] == 12345.0
    assert 'amplification' not in result
    assert request.call_args.args == ('index_daily',)


@pytest.mark.asyncio
async def test_sector_flow_uses_promax_multi_session_history_in_yuan(service, monkeypatch):
    import pandas as pd
    request = AsyncMock(return_value=pd.DataFrame([
        {'trade_date': '20260904', 'content_type': '行业', 'ts_code': 'BK1036', 'name': '半导体', 'net_amount': 123.0, 'net_amount_rate': 1.2, 'pct_change': 0.5, 'close': 1000},
        {'trade_date': '20260904', 'content_type': '概念', 'ts_code': 'BK0001', 'name': '芯片概念', 'net_amount': 999.0},
    ]))
    monkeypatch.setattr(module, 'TushareProvider', lambda: Mock(request_dataframe=request))
    fallback = AsyncMock()
    monkeypatch.setattr(module.data_service, 'get_sector_capital_flow', fallback)
    result = await service._fetch('sector_capital_flow', 'sh000001')
    assert result['source'] == 'Tushare/moneyflow_ind_dc'
    assert result['unit'] == '元'
    assert len(result['data']) == 1
    assert result['data'][0]['名称'] == '半导体'
    assert result['data'][0]['今日主力净流入-净额'] == 123.0
    request.assert_awaited_once()
    fallback.assert_not_awaited()


@pytest.mark.asyncio
async def test_margin_gateway_uses_single_trade_date(service, monkeypatch):
    import pandas as pd
    request = AsyncMock(return_value=pd.DataFrame([{'trade_date': '20260903', 'rzrqye': 100.0}]))
    monkeypatch.setattr(module, 'TushareProvider', lambda: Mock(request_dataframe=request))
    await service._fetch('margin_balance', 'sh000001')
    assert 'trade_date' in request.call_args.kwargs
    assert 'start_date' not in request.call_args.kwargs


@pytest.mark.asyncio
async def test_market_dataset_stores_snapshot_with_real_counts(service, monkeypatch):
    payload = {'data': [{'名称': '芯片', '今日主力净流入-净额': 100000000, '今日涨跌幅': 1}], 'source': 'Tushare'}
    monkeypatch.setattr(service, '_fetch_with_retry', AsyncMock(return_value=payload))
    assert await service.run_dataset({**DATASET, 'datasetKey': 'sector_capital_flow'})
    run = module.db.execute("SELECT * FROM data_fetch_runs WHERE id='run'")[0]
    assert run['storedCount'] == 1 and run['fetchedCount'] == 1
    assert run['status'] == 'success'
    assert json.loads(module.db.execute('SELECT payload FROM raw_payloads')[0]['payload']) == payload


def test_raw_payload_is_standard_json_when_provider_contains_nan(service):
    result = {'version': 1, 'data': {'nav': [{'unit_nav': 1.0, 'net_asset': float('nan')}]}}
    assert service._store('etf_research', '159995', result) == 1
    stored = module.db.execute('SELECT payload,contentHash FROM raw_payloads')[0]
    parsed = json.loads(stored['payload'], parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    assert parsed['data']['nav'][0]['net_asset'] is None
    assert stored['contentHash'] == module._hash(parsed)


@pytest.mark.asyncio
async def test_market_empty_response_is_not_verified(service, monkeypatch):
    monkeypatch.setattr(module.data_service, 'get_northbound_flow', AsyncMock(return_value={}))
    with pytest.raises(ValueError, match='无有效数据'):
        await service._fetch('northbound_flow', 'sh000001')


@pytest.mark.asyncio
@pytest.mark.parametrize('rows,stored', [([], 0), ([ROW], 0)])
async def test_empty_or_unstored_data_is_failed(service, monkeypatch, rows, stored):
    monkeypatch.setattr(service, '_fetch_with_retry', AsyncMock(return_value=rows))
    monkeypatch.setattr(service, '_store', Mock(return_value=stored))
    assert not await service.run_dataset(DATASET)
    run = module.db.execute("SELECT * FROM data_fetch_runs WHERE id='run'")[0]
    assert run['status'] == 'failed'
    assert run['qualityStatus'] == 'unavailable'
    assert run['error']


@pytest.mark.asyncio
async def test_partial_batch_stores_good_rows_but_does_not_claim_success(service, monkeypatch):
    batch = module.CompanyBatch([ROW], {'000002': 'timeout'}, ['000001'])
    monkeypatch.setattr(service, '_fetch_with_retry', AsyncMock(return_value=batch))
    store = Mock(return_value=1)
    monkeypatch.setattr(service, '_store', store)
    assert not await service.run_dataset(DATASET)
    run = module.db.execute("SELECT * FROM data_fetch_runs WHERE id='run'")[0]
    assert run['status'] == 'partial' and run['storedCount'] == 1
    assert json.loads(run['error'])['failedCodes'] == ['000002']
    assert module.db.execute("SELECT lastSuccessAt FROM subscription_datasets")[0]['lastSuccessAt'] is None


@pytest.mark.asyncio
async def test_successful_run_reuses_queue_and_clears_error(service, monkeypatch):
    monkeypatch.setattr(service, '_fetch_with_retry', AsyncMock(return_value=[ROW]))
    monkeypatch.setattr(service, '_store', Mock(return_value=1))
    assert await service.run_dataset(DATASET)
    rows = module.db.execute('SELECT * FROM data_fetch_runs')
    assert len(rows) == 1 and rows[0]['status'] == 'success'
    assert rows[0]['storedCount'] == 1


@pytest.mark.asyncio
async def test_daily_collects_errors_and_rejects_invalid_ohlc(service, monkeypatch):
    monkeypatch.setattr(service, '_company_holdings', AsyncMock(return_value=[{'stockCode': '000001'}, {'stockCode': '000002'}]))
    async def fetch(key, symbol, start, end):
        return [ROW] if symbol == '000001' else [{**ROW, 'open': float('nan')}]
    monkeypatch.setattr(service, '_company_request', fetch)
    result = await service._fetch('constituent_stock_daily', '159995')
    assert len(result) == 1
    assert result.succeeded == ['000001']
    assert list(result.failures) == ['000002']


@pytest.mark.asyncio
async def test_all_company_requests_failing_is_not_empty_success(service, monkeypatch):
    monkeypatch.setattr(service, '_company_holdings', AsyncMock(return_value=[{'stockCode': '000001'}]))
    monkeypatch.setattr(service, '_company_request', AsyncMock(side_effect=RuntimeError('upstream unavailable')))
    with pytest.raises(ValueError, match='upstream unavailable'):
        await service._fetch('constituent_stock_daily', '159995')


@pytest.mark.asyncio
async def test_shared_company_requests_are_deduplicated(service):
    service.stock_provider.get_kline = AsyncMock(return_value=[ROW])
    await asyncio.gather(*(service._company_request('constituent_stock_daily', '000001') for _ in range(3)))
    service.stock_provider.get_kline.assert_awaited_once()


@pytest.mark.asyncio
async def test_holding_name_resolution_uses_detected_market(service):
    service.stock_provider.get_stock_info = AsyncMock(return_value={'name': '腾讯控股'})
    service.stock_provider.get_stock_names = AsyncMock(return_value={})

    rows = await service._ensure_holding_names('159273', [
        {'stock_code': '00700.HK', 'stock_name': '00700.HK', 'weight': 9.39},
    ])

    service.stock_provider.get_stock_info.assert_awaited_once_with('700.hk', 'hk')
    assert rows[0]['stock_name'] == '腾讯控股'


@pytest.mark.asyncio
async def test_holding_refresh_reuses_real_name_when_source_returns_code(service):
    module.db.execute_many('INSERT INTO ETFHolding (id,etfCode,stockCode,stockName) VALUES (?,?,?,?)', [
        ('holding', '159995', '002049', '紫光国微'),
    ])
    service.stock_provider.get_stock_info = AsyncMock()
    rows = await service._ensure_holding_names('159995', [{'stock_code': '002049', 'stock_name': '002049.SZ'}])
    assert rows[0]['stock_name'] == '紫光国微'
    service.stock_provider.get_stock_info.assert_not_awaited()


def test_holding_storage_does_not_overwrite_name_with_suffixed_code(service):
    service._store('etf_holdings', '159995', [{'stock_code': '002049', 'stock_name': '紫光国微'}])
    service._store('etf_holdings', '159995', [{'stock_code': '002049', 'stock_name': '002049.SZ'}])
    assert module.db.execute('SELECT stockName FROM ETFHolding')[0]['stockName'] == '紫光国微'


def test_restart_closes_orphans_and_schedules_recovery(service):
    module.db.update("UPDATE subscription_datasets SET status='running'")
    service.recover_interrupted_runs()
    assert module.db.execute('SELECT status FROM data_fetch_runs')[0]['status'] == 'failed'
    dataset = module.db.execute('SELECT * FROM subscription_datasets')[0]
    assert dataset['status'] == 'pending' and dataset['nextRunAt']


@pytest.mark.parametrize('row', [{**ROW, 'close': 0}, {**ROW, 'high': float('inf')}, {**ROW, 'date': ''}])
def test_invalid_daily_rows_are_not_stored(service, row):
    assert not service._valid_daily_row(row)


@pytest.mark.asyncio
async def test_daily_sync_end_to_end_persists_and_reports_counts(service, monkeypatch):
    monkeypatch.setattr(service, '_company_holdings', AsyncMock(return_value=[{'stockCode': '000001.SZ'}]))
    service.stock_provider.get_kline = AsyncMock(return_value=[{**ROW, 'vol': 123, 'amount': 456}])
    assert await service.run_dataset(DATASET)
    stored = module.db.execute('SELECT * FROM StockDaily')
    assert len(stored) == 1
    assert stored[0]['ticker'] == '000001'
    assert stored[0]['date'] == '2026-09-03'
    assert stored[0]['close'] == 11 and stored[0]['volume'] == 123
    run = module.db.execute("SELECT * FROM data_fetch_runs WHERE id='run'")[0]
    assert run['status'] == 'success' and run['storedCount'] == 1
    assert run['qualityStatus'] == 'verified'


def test_storage_rejects_nan_and_invalid_dates(service):
    assert service._store('constituent_stock_daily', '159995', [
        {**ROW, 'stockCode': '000001', 'close': float('nan')},
        {**ROW, 'stockCode': '000001', 'date': 'invalid'},
    ]) == 0
    assert module.db.execute('SELECT * FROM StockDaily') == []


def test_index_daily_persists_with_the_same_ohlc_contract(service):
    assert service._store('index_daily', 'sh000001', [ROW]) == 1
    row = module.db.execute('SELECT * FROM IndexDaily')[0]
    assert row['code'] == 'sh000001' and row['close'] == 11
    assert service._store('index_daily', 'sh000001', [{**ROW, 'close': 12}]) == 1
    assert len(module.db.execute('SELECT * FROM IndexDaily')) == 1


def test_stock_quote_updates_canonical_instrument_name(service):
    with sqlite3.connect(module.db.db_path) as conn:
        conn.execute('''CREATE TABLE market_quotes (id TEXT PRIMARY KEY, instrumentType TEXT,
          code TEXT, market TEXT, currency TEXT, price REAL, previousClose REAL, open REAL,
          high REAL, low REAL, volume REAL, amount REAL, changePct REAL, tradeDate TEXT,
          source TEXT, fetchedAt TEXT, UNIQUE(instrumentType,code))''')
    stored = service._store_quotes('constituent_stock_realtime', '159995', [{
        '代码': '002049.SZ', '名称': '紫光国微', '最新价': 62.76, '日期': '2026-09-04',
    }])

    assert stored == 1
    instrument = module.db.execute("SELECT code,name FROM instruments WHERE type='STOCK'")[0]
    assert instrument == {'code': '002049', 'name': '紫光国微'}


@pytest.mark.asyncio
async def test_dispatch_does_not_block_new_quotes_behind_slow_reports(service, monkeypatch):
    monkeypatch.setattr(module, 'get_config', lambda: service.config)
    monkeypatch.setattr(service, '_ensure_subscription_datasets', AsyncMock())
    slow = {'id': 'slow', 'datasetKey': 'stock_announcement', 'status': 'queued'}
    quote = {'id': 'quote', 'datasetKey': 'constituent_stock_realtime', 'status': 'queued'}
    monkeypatch.setattr(service, 'list_due_datasets', AsyncMock(side_effect=[[slow], [slow, quote]]))
    gate = asyncio.Event()
    completed = []
    async def run(dataset):
        if dataset['id'] == 'slow':
            await gate.wait()
        completed.append(dataset['id'])
        return True
    monkeypatch.setattr(service, 'run_dataset', run)
    assert await asyncio.wait_for(service.run_due(), 1) == 1
    assert await asyncio.wait_for(service.run_due(), 1) == 1
    await asyncio.sleep(0)
    assert completed == ['quote']
    gate.set()
    await asyncio.gather(*service._tasks.values())
    assert completed.count('slow') == 1
