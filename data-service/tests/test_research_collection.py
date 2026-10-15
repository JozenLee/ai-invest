import pytest
from datetime import datetime
from zoneinfo import ZoneInfo
import pandas as pd
from unittest.mock import AsyncMock
from services.research_collection import collect_research, collect_calendar, fetch_orderbook as real_fetch_orderbook


@pytest.fixture(autouse=True)
def no_live_orderbook(monkeypatch):
    monkeypatch.setattr('services.research_collection.fetch_orderbook', lambda code: (_ for _ in ()).throw(ValueError('test unavailable')))


@pytest.mark.asyncio
async def test_calendar_keeps_closed_days():
    provider = AsyncMock()
    provider.request_dataframe.return_value = pd.DataFrame([{'cal_date': '20260904', 'is_open': 1}, {'cal_date': '20260905', 'is_open': 0}])
    result = await collect_calendar(provider, '20260904', '20260905')
    assert len(result['data']) == 2
    assert result['source'] == 'Tushare/trade_cal'


@pytest.mark.asyncio
async def test_calendar_rejects_open_days_only_payload():
    provider = AsyncMock()
    provider.request_dataframe.return_value = pd.DataFrame([{'cal_date':'20260904','is_open':1},{'cal_date':'20260907','is_open':1}])
    with pytest.raises(ValueError,match='闭市日期'):
        await collect_research(provider,'research_calendar','sh000001')


@pytest.mark.asyncio
async def test_partial_bundle_never_fills_missing_values_or_logs_secret_url():
    provider = AsyncMock()
    async def request(api, **params):
        if api == 'fund_adj':
            return pd.DataFrame([{'trade_date': '20260904', 'adj_factor': 1}])
        raise ValueError('secret-token-in-url')
    provider.request_dataframe.side_effect = request
    result = await collect_research(provider, 'etf_research', '159995')
    assert result['quality'] == 'partial'
    assert result['data']['nav'] == []
    assert 'secret-token' not in str(result)
    assert result['data']['factors'][0]['adj_factor'] == 1


@pytest.mark.asyncio
async def test_bundle_filters_provider_rows_to_requested_instrument_and_bounds_large_series():
    provider = AsyncMock()
    async def request(api, **params):
        if api == 'etf_basic':
            return pd.DataFrame([{'ts_code': '159995.SZ', 'index_code': '980017.SZ'}])
        if api == 'etf_share_size':
            return pd.DataFrame([
                {'ts_code': '159995.SZ', 'trade_date': f'202609{day:02}', 'total_share': day}
                for day in range(1, 6)
            ] + [{'ts_code': '510300.SH', 'trade_date': '20260905', 'total_share': 999}])
        return pd.DataFrame([{'ts_code': params.get('ts_code', '159995.SZ'), 'trade_date': '20260904', 'close': 1}])
    provider.request_dataframe.side_effect = request
    result = await collect_research(provider, 'etf_research', '159995')
    assert len(result['data']['shares']) == 2
    assert {row['ts_code'] for row in result['data']['shares']} == {'159995.SZ'}
    assert result['data']['shares'][0]['trade_date'] == '20260905'


@pytest.mark.asyncio
async def test_all_failures_are_not_success():
    provider = AsyncMock()
    provider.request_dataframe.side_effect = ValueError('denied')
    with pytest.raises(ValueError, match='全部不可用'):
        await collect_research(provider, 'etf_research', '159995')


def test_orderbook_requires_identity_source_timestamp_and_valid_spread():
    from services.research_collection import normalize_orderbook
    quote = {'f57': '159995', 'f19': 1.0, 'f39': 1.001, 'f86': 1788480000}
    result = normalize_orderbook(quote, '159995')
    assert 9 < result['spreadBps'] < 10
    assert result['publishedAt']
    with pytest.raises(ValueError):
        normalize_orderbook({**quote, 'f57': '510300'}, '159995')
    with pytest.raises(ValueError):
        normalize_orderbook({**quote, 'f39': 0}, '159995')


@pytest.mark.asyncio
async def test_index_valuation_falls_back_to_constituent_daily_basic():
    from services import research_collection as module
    module._daily_basic_cache.clear()
    provider = AsyncMock()
    async def request(api, **params):
        if api == 'etf_basic':
            return pd.DataFrame([{'ts_code': '159995.SZ', 'index_code': '980017.SZ'}])
        if api == 'index_dailybasic':
            return pd.DataFrame()
        if api == 'index_daily':
            return pd.DataFrame([{'ts_code':'980017.SZ','trade_date':'20260904','open':1,'high':1,'low':1,'close':1}])
        if api == 'index_weight':
            return pd.DataFrame([{'index_code':'980017.SZ','trade_date':'20260831','con_code':'600000.SH','weight':60},{'index_code':'980017.SZ','trade_date':'20260831','con_code':'000001.SZ','weight':40}])
        if api == 'daily_basic':
            return pd.DataFrame([{'ts_code':'600000.SH','trade_date':'20260904','pe_ttm':20,'pb':2},{'ts_code':'000001.SZ','trade_date':'20260904','pe_ttm':10,'pb':1}])
        if api == 'fund_nav':
            return pd.DataFrame([{'ts_code':'159995.SZ','nav_date':'20260904','ann_date':'20260904','unit_nav':1,'adj_nav':2}])
        return pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260904','close':1,'adj_factor':1,'total_share':1}])
    provider.request_dataframe.side_effect = request
    result = await collect_research(provider, 'etf_research', '159995')
    assert result['data']['indexValuation'][0]['pe_ttm'] == pytest.approx(14.285714, rel=1e-5)
    assert result['sources']['indexValuation'] == 'Tushare/index_weight+daily_basic'


@pytest.mark.asyncio
async def test_calendar_queries_both_states_in_bounded_windows():
    provider = AsyncMock()
    async def request(api, **params):
        days = pd.date_range(params['start_date'], params['end_date'])
        assert len(days) <= 118
        return pd.DataFrame([{'cal_date': day.strftime('%Y%m%d'), 'is_open': int(day.weekday() < 5)}
                             for day in days if str(int(day.weekday() < 5)) == params['is_open']])
    provider.request_dataframe.side_effect = request
    result = await collect_calendar(provider, '20260101', '20260907')
    assert len(result['data']) == len(pd.date_range('20260101', '20260907'))
    assert {row['is_open'] for row in result['data']} == {0, 1}


def test_tencent_orderbook_fallback_keeps_source_time_and_identity(monkeypatch):
    import requests
    from unittest.mock import Mock
    from services.research_collection import fetch_orderbook, normalize_tencent_orderbook
    fields = [''] * 31
    fields[2], fields[9], fields[19], fields[30] = '159995', '1.119', '1.120', '20260904145900'
    text = 'v_sz159995="' + '~'.join(fields) + '";'
    response = Mock(content=text.encode('gb18030'))
    monkeypatch.setattr(requests.Session, 'get', Mock(side_effect=[requests.ConnectionError(), response]))
    result = real_fetch_orderbook('159995')
    assert result['source'] == 'tencent/orderbook'
    assert result['publishedAt'].startswith('2026-09-04T06:59:00')
    assert 8 < result['spreadBps'] < 9
    with pytest.raises(ValueError):
        normalize_tencent_orderbook(text, '159801')
    fields[19] = '0'
    with pytest.raises(ValueError):
        normalize_tencent_orderbook('v_sz159995="' + '~'.join(fields) + '";', '159995')


@pytest.mark.asyncio
async def test_calendar_uses_explicit_predecessors_when_gateway_ignores_closed_filter():
    provider = AsyncMock()
    provider.request_dataframe.return_value = pd.DataFrame([
        {'cal_date':'20260904','is_open':1,'pretrade_date':'20260903'},
        {'cal_date':'20260907','is_open':1,'pretrade_date':'20260904'},
    ])
    result = await collect_calendar(provider, '20260904', '20260906')
    assert [row['is_open'] for row in result['data']] == [1,0,0]
    assert result['data'][-1]['state_basis'] == 'trade_cal.pretrade_date'
    provider.request_dataframe.return_value = pd.DataFrame([
        {'cal_date':'20260904','is_open':1,'pretrade_date':'20260903'},
        {'cal_date':'20260907','is_open':1,'pretrade_date':'20260903'},
    ])
    with pytest.raises(ValueError, match='冲突'):
        await collect_calendar(provider, '20260904', '20260906')


@pytest.mark.asyncio
async def test_parallel_valuation_reads_share_a_lock_on_the_running_loop():
    import asyncio
    from services import research_collection as module
    module._daily_basic_cache.clear()
    provider = AsyncMock()
    async def request(*args, **kwargs):
        await asyncio.sleep(0)
        return pd.DataFrame([{'ts_code': '600000.SH', 'pe_ttm': 10}])
    provider.request_dataframe.side_effect = request
    results = await asyncio.gather(*(module._market_daily_basic(provider, '20260907') for _ in range(4)))
    provider.request_dataframe.assert_awaited_once()
    assert all(result == results[0] for result in results)


@pytest.mark.asyncio
async def test_current_session_is_retried_separately_from_cached_history():
    provider = AsyncMock()
    async def request(api, **params):
        if api == 'etf_basic':
            return pd.DataFrame([{'ts_code':'159995.SZ','index_code':'980017.SZ'}])
        day = params.get('trade_date', '20260904')
        return pd.DataFrame([{'ts_code':params.get('ts_code','159995.SZ'),'trade_date':day,
                              'open':1,'high':1,'low':1,'close':1,'amount':100,'adj_factor':1}])
    provider.request_dataframe.side_effect = request
    result = await collect_research(provider,'etf_research','159995',expected_session='2026-09-07',as_of=datetime(2026,9,8,9,tzinfo=ZoneInfo('Asia/Shanghai')))
    for field in ('daily','factors','indexDaily','shares'):
        assert {row['trade_date'] for row in result['data'][field]} == {'20260904','20260907'}


@pytest.mark.asyncio
async def test_shares_before_publication_are_pending_not_failed():
    provider = AsyncMock()
    async def request(api, **params):
        if api == 'etf_share_size':
            assert 'trade_date' not in params, 'must not demand unpublished shares'
            return pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260904','total_share':100}])
        if api == 'fund_nav':
            return pd.DataFrame([{'ts_code':'159995.SZ','nav_date':'20260907','ann_date':'20260907','unit_nav':1}])
        return pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260907','adj_factor':1}])
    provider.request_dataframe.side_effect = request
    result=await collect_research(provider,'etf_research','159995',expected_session='2026-09-07',as_of=datetime(2026,9,7,19,30,tzinfo=ZoneInfo('Asia/Shanghai')))
    assert result['fieldStatus']['shares']['status']=='pending-publication'
    assert 'shares' not in result['failures']
    assert result['fieldStatus']['shares']['expectedAt']=='2026-09-08T08:30:00+08:00'


@pytest.mark.asyncio
async def test_recent_and_exact_nav_queries_repair_old_wide_response():
    provider = AsyncMock()
    async def request(api, **params):
        if api=='fund_nav':
            day='20260907' if params.get('nav_date') else '20260904' if params.get('start_date')=='20260824' else '20260828'
            return pd.DataFrame([{'ts_code':'159995.SZ','nav_date':day,'ann_date':day,'unit_nav':1,'adj_nav':2}])
        return pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260907','adj_factor':1}])
    provider.request_dataframe.side_effect=request
    result=await collect_research(provider,'etf_research','159995',expected_session='2026-09-07',as_of=datetime(2026,9,7,19,30,tzinfo=ZoneInfo('Asia/Shanghai')))
    assert result['fieldStatus']['nav']['status']=='available'
    assert [row['nav_date'] for row in result['data']['nav']]==['20260907','20260904','20260828']


@pytest.mark.asyncio
async def test_empty_share_response_after_release_is_a_real_gap():
    provider=AsyncMock()
    async def request(api,**params):
        if api=='etf_share_size':return pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260904','total_share':100}])
        return pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260907','adj_factor':1}])
    provider.request_dataframe.side_effect=request
    result=await collect_research(provider,'etf_research','159995',expected_session='2026-09-07',as_of=datetime(2026,9,8,9,tzinfo=ZoneInfo('Asia/Shanghai')))
    assert 'shares' in result['failures']
    assert result.get('fieldStatus',{}).get('shares',{}).get('status')!='pending-publication'

@pytest.mark.asyncio
async def test_exact_date_repairs_interior_factor_holes_and_preserves_verified_cache():
    from services.research_collection import repair_history_gaps
    provider = AsyncMock()
    provider.request_dataframe.return_value = pd.DataFrame([
        {'ts_code': '159995.SZ', 'trade_date': '20260903', 'adj_factor': 2},
        {'ts_code': 'WRONG.SZ', 'trade_date': '20260902', 'adj_factor': 99},
    ])
    data = {'factors': [{'ts_code': '159995.SZ', 'trade_date': '20260904', 'adj_factor': 2}]}
    cached = {'factors': [{'ts_code': '159995.SZ', 'trade_date': '20260902', 'adj_factor': 2}]}
    result = await repair_history_gaps(provider, data, '159995.SZ', ['2026-09-02','2026-09-03','2026-09-04'], cached, max_requests=1)
    assert result['fields']['factors']['status'] == 'available'
    assert len(data['factors']) == 3
    assert provider.request_dataframe.call_args.kwargs['start_date'] == '20260903'
    assert provider.request_dataframe.call_args.kwargs['end_date'] == '20260903'

@pytest.mark.asyncio
async def test_history_repair_does_not_fill_wrong_date_or_instrument_and_obeys_budget():
    from services.research_collection import repair_history_gaps
    provider = AsyncMock()
    provider.request_dataframe.return_value = pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260901','adj_factor':1}])
    data = {'factors': []}
    result = await repair_history_gaps(provider, data, '159995.SZ', ['2026-09-03','2026-09-04'], max_requests=1)
    assert result['requests'] == 1
    assert result['fields']['factors']['missingDates'] == ['20260903','20260904']
    assert data['factors'] == []

@pytest.mark.asyncio
async def test_history_repair_falls_back_only_to_verified_exact_date_rows():
    from services.research_collection import repair_history_gaps
    provider = AsyncMock()
    async def request(api, **params):
        if 'start_date' in params:
            raise RuntimeError('HTTP 503')
        return pd.DataFrame([{'ts_code':'159995.SZ','trade_date':'20260904','adj_factor':2}])
    provider.request_dataframe.side_effect = request
    data = {'factors': []}
    result = await repair_history_gaps(provider,data,'159995.SZ',['2026-09-04'],max_requests=2)
    assert result['requests'] == 2
    assert result['fields']['factors']['status'] == 'available'
    assert data['factors'][0]['adj_factor'] == 2

@pytest.mark.asyncio
async def test_empty_calendar_does_not_erase_history_or_invent_dates():
    from services.research_collection import repair_history_gaps
    provider = AsyncMock()
    data = {'factors':[{'ts_code':'159995.SZ','trade_date':'20260904','adj_factor':2}]}
    result = await repair_history_gaps(provider,data,'159995.SZ',[])
    assert result['requests'] == 0
    assert len(data['factors']) == 1
    provider.request_dataframe.assert_not_called()

@pytest.mark.asyncio
async def test_fee_collection_uses_fund_basic_and_checks_instrument():
    provider = AsyncMock()
    async def request(api, **params):
        if api == 'fund_basic':
            assert params['fields'] == 'ts_code,m_fee,c_fee'
            return pd.DataFrame([{'ts_code':'159995.SZ','m_fee':0.15,'c_fee':0.05}, {'ts_code':'510300.SH','m_fee':0.5}])
        if api == 'etf_basic':
            return pd.DataFrame([{'ts_code':'159995.SZ','index_code':'980017.SZ'}])
        raise ValueError('not provided')
    provider.request_dataframe.side_effect = request
    result = await collect_research(provider, 'etf_research', '159995')
    assert result['data']['fees'] == [{'ts_code':'159995.SZ','m_fee':0.15,'c_fee':0.05}]
    assert result['sources']['fees'] == 'Tushare/fund_basic'
    assert 'fees' not in result['failures']
