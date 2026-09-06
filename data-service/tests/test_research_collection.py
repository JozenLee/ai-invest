import pytest
import pandas as pd
from unittest.mock import AsyncMock
from services.research_collection import collect_research


@pytest.fixture(autouse=True)
def no_live_orderbook(monkeypatch):
    monkeypatch.setattr('services.research_collection.fetch_orderbook', lambda code: (_ for _ in ()).throw(ValueError('test unavailable')))


@pytest.mark.asyncio
async def test_calendar_keeps_closed_days():
    provider = AsyncMock()
    provider.request_dataframe.return_value = pd.DataFrame([{'cal_date': '20260904', 'is_open': 1}, {'cal_date': '20260905', 'is_open': 0}])
    result = await collect_research(provider, 'research_calendar', 'sh000001')
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
