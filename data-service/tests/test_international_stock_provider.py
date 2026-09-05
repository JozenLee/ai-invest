import pandas as pd
import pytest
from unittest.mock import AsyncMock, Mock

from providers.international_stock_provider import InternationalStockProvider
from providers.stock_symbols import canonical_stock_code, provider_symbol, stock_market
from providers.openbb_provider import OpenBBProvider


def test_international_symbol_mapping():
    assert canonical_stock_code('00700.HK') == '700.hk'
    assert provider_symbol('700.hk', 'tushare') == '00700.HK'
    assert provider_symbol('700.hk', 'akshare') == '00700'
    assert provider_symbol('700.hk') == '0700.HK'
    assert stock_market('700.hk') == 'hk'
    assert stock_market('AAPL') == 'us'


@pytest.mark.asyncio
async def test_hk_history_prefers_complete_tushare_result():
    tushare = Mock(available=True)
    tushare.request_dataframe = AsyncMock(return_value=pd.DataFrame([{'trade_date': f'2026{i // 28 + 1:02}{i % 28 + 1:02}', 'open': 10, 'high': 12, 'low': 9, 'close': 11, 'vol': 5, 'amount': 6} for i in range(120)]))
    provider = InternationalStockProvider(tushare, Mock(), None, Mock())
    rows = await provider.kline('700.hk', 'hk', '2026-01-01', '2026-09-01')
    assert len(rows) == 120
    assert rows[0]['market'] == 'HK' and rows[0]['currency'] == 'HKD'
    tushare.request_dataframe.assert_awaited_once_with('hk_daily', ts_code='00700.HK', start_date='20260101', end_date='20260901')


@pytest.mark.asyncio
async def test_hk_history_falls_back_when_gateway_only_returns_one_row():
    tushare = Mock(available=True)
    tushare.request_dataframe = AsyncMock(return_value=pd.DataFrame([{'trade_date': '20260901', 'open': 10, 'high': 12, 'low': 9, 'close': 11}]))
    ak = Mock()
    ak.stock_hk_hist.return_value = pd.DataFrame([{'日期': f'2026-08-{i + 1:02}', '开盘': 10, '最高': 12, '最低': 9, '收盘': 11} for i in range(20)])
    openbb = Mock()
    openbb.get_kline = AsyncMock(return_value=[])
    provider = InternationalStockProvider(tushare, openbb, ak, Mock())
    rows = await provider.kline('700.hk', 'hk', '2026-01-01', '2026-09-01')
    assert len(rows) == 20 and rows[0]['source'] == 'akshare_eastmoney'


@pytest.mark.asyncio
async def test_openbb_historical_adapter_still_executes():
    provider = object.__new__(OpenBBProvider)
    provider.enabled = True
    provider.logger = Mock()
    provider._obb = Mock()
    provider._obb.equity.price.historical.return_value.to_df.return_value = pd.DataFrame([{'date': '2026-09-03', 'close': 10}])
    rows = await provider.get_kline('AAPL', '2026-01-01', '2026-09-04', 'us')
    assert rows[0]['close'] == 10


@pytest.mark.asyncio
async def test_international_trading_session_prefers_live_quote(monkeypatch):
    monkeypatch.setattr('providers.international_stock_provider.market_open', lambda market: True)
    openbb = Mock()
    openbb.get_quote = AsyncMock(return_value={'date': '2026-09-03', 'close': 433, 'source': 'yfinance_quote'})
    provider = InternationalStockProvider(Mock(), openbb, None, Mock())
    provider.kline = AsyncMock()
    rows = await provider.quote('700.hk', 'hk')
    assert rows[0]['代码'] == '700.hk'
    provider.kline.assert_not_awaited()
