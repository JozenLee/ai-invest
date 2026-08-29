import pandas as pd
import pytest
from unittest.mock import AsyncMock, Mock, patch

from providers.multi_source_provider import MultiSourceProvider
from providers.tushare_provider import TushareProvider


@pytest.mark.asyncio
async def test_index_spot_uses_rt_k_during_trading():
    provider = TushareProvider(token="test")
    provider._api_url = "http://tushare.test"
    provider._api_key = "test"

    async def call_api(api, **params):
        assert api == "rt_k"
        assert params["ts_code"] == "000001.SH"
        return pd.DataFrame([{
            "last": 3912.34,
            "pre_close": 3905.20,
            "change": 7.14,
            "pct_chg": 0.18,
            "vol": 123,
            "amount": 456,
        }])

    provider._call_api = AsyncMock(side_effect=call_api)

    with patch("providers.tushare_provider.is_trading_hours", return_value=True):
        result = await provider.get_index_spot()

    assert not result.empty
    assert result.iloc[0]["最新价"] == 3912.34
    assert provider._call_api.await_count == 5
    assert all(call.args[0] == "rt_k" for call in provider._call_api.await_args_list)


@pytest.mark.asyncio
async def test_index_spot_uses_daily_only_outside_trading():
    provider = TushareProvider(token="test")
    provider._api_url = "http://tushare.test"
    provider._api_key = "test"

    async def call_api(api, **params):
        assert api == "index_daily"
        return pd.DataFrame([{
            "trade_date": "20260821",
            "close": 3905.20,
            "change": 1.48,
            "pct_chg": 0.04,
        }])

    provider._call_api = AsyncMock(side_effect=call_api)

    with patch("providers.tushare_provider.is_trading_hours", return_value=False):
        result = await provider.get_index_spot()

    assert not result.empty
    assert result.iloc[0]["数据日期"] == "2026-08-21"
    assert all(call.args[0] == "index_daily" for call in provider._call_api.await_args_list)


@pytest.mark.asyncio
async def test_etf_daily_normalizes_tushare_volume_field():
    provider = TushareProvider(token="test")
    provider._api_url = "http://tushare.test"
    provider._api_key = "test"
    provider._call_api = AsyncMock(return_value=pd.DataFrame([{
        "trade_date": "20260821",
        "open": 1.0,
        "high": 1.1,
        "low": 0.9,
        "close": 1.05,
        "vol": 123456,
        "amount": 789012.5,
        "pct_chg": 1.2,
    }]))

    result = await provider.get_etf_daily("159000", "20260801", "20260825")

    assert result.iloc[0]["volume"] == 123456
    assert result.iloc[0]["amount"] == 789012.5
    assert result.iloc[0]["date"].strftime("%Y-%m-%d") == "2026-08-21"


@pytest.mark.asyncio
async def test_stock_spot_skips_rt_k_outside_trading_hours():
    provider = TushareProvider(token="test")
    provider._api_url = "http://tushare.test"
    provider._api_key = "test"

    async def call_api(api, **params):
        assert api == "daily"
        return pd.DataFrame([{"trade_date": "20260821", "close": 10, "pct_chg": 1}])

    provider._call_api = AsyncMock(side_effect=call_api)
    with patch("providers.tushare_provider.is_trading_hours", return_value=False):
        result = await provider.get_stock_spot(["300502"])

    assert len(result) == 1
    assert provider._call_api.await_args_list[0].args[0] == "daily"


@pytest.mark.asyncio
async def test_etf_spot_uses_fund_daily_outside_trading_hours():
    provider = TushareProvider(token="test")
    provider._api_url = "http://tushare.test"
    provider._api_key = "test"

    async def call_api(api, **params):
        assert api == "fund_daily"
        return pd.DataFrame([{"trade_date": "20260821", "close": 1.2, "pct_chg": 0.5}])

    provider._call_api = AsyncMock(side_effect=call_api)
    with patch("providers.tushare_provider.is_trading_hours", return_value=False):
        result = await provider.get_etf_realtime(["159738"])

    assert len(result) == 1
    assert provider._call_api.await_args_list[0].args[0] == "fund_daily"


def test_tushare_provider_keeps_rest_for_auto_when_legacy_sdk_config_exists(monkeypatch):
    monkeypatch.setenv("TUSHARE_API_URL", "https://rest.example/tushare/pro")
    monkeypatch.setenv("TUSHARE_API_KEY", "rest-key")
    monkeypatch.setenv("TUSHARE_HTTP_URL", "https://quantdata.example")
    monkeypatch.setenv("TUSHARE_GATEWAY_TOKEN", "tk_live_test")
    monkeypatch.setenv("TUSHARE_TRANSPORT", "auto")

    class FakeSdk:
        def pro_api(self, token, timeout):
            assert token == "tk_live_test"
            assert timeout == 30
            return type("Client", (), {})()

    import providers.tushare_provider as module
    original = module.tushare_sdk
    module.tushare_sdk = FakeSdk()
    try:
        provider = module.TushareProvider()
    finally:
        module.tushare_sdk = original

    assert provider._sdk is None
    assert provider._sdk_url == "https://quantdata.example"


def test_tushare_provider_uses_sdk_only_when_explicitly_requested(monkeypatch):
    monkeypatch.setenv("TUSHARE_API_URL", "https://rest.example/tushare/pro")
    monkeypatch.setenv("TUSHARE_API_KEY", "rest-key")
    monkeypatch.setenv("TUSHARE_HTTP_URL", "https://quantdata.example")
    monkeypatch.setenv("TUSHARE_GATEWAY_TOKEN", "tk_live_test")
    monkeypatch.setenv("TUSHARE_TRANSPORT", "sdk")

    class FakeSdk:
        def pro_api(self, token, timeout):
            assert token == "tk_live_test"
            assert timeout == 30
            return type("Client", (), {})()

    import providers.tushare_provider as module
    original = module.tushare_sdk
    module.tushare_sdk = FakeSdk()
    try:
        provider = module.TushareProvider()
    finally:
        module.tushare_sdk = original

    assert provider._sdk is not None


@pytest.mark.asyncio
async def test_multi_etf_history_reuses_single_fund_daily_response_per_etf():
    source = MultiSourceProvider.__new__(MultiSourceProvider)
    source.etf_fetch_concurrency = 1
    source.logger = Mock()
    source.get_etf_spot_data = AsyncMock()
    source.tushare = type("FakeTushare", (), {
        "available": True,
        "get_etf_daily": AsyncMock(return_value=pd.DataFrame([{
            "date": "2026-08-27",
            "close": 1.181,
            "pct_chg": 4.42,
            "volume": 6851150.0,
            "amount": 796527.0,
        }])),
    })()

    rows = await source.get_multiple_etf_data(["159995"], with_history=True, period_days=90)

    assert len(rows) == 1
    assert rows[0]["current_price"] == 1.181
    assert rows[0]["change_pct"] == 4.42
    assert rows[0]["history_days"] == 1
    source.tushare.get_etf_daily.assert_awaited_once()
    source.get_etf_spot_data.assert_not_awaited()


@pytest.mark.asyncio
async def test_etf_scale_uses_tushare_fund_share():
    provider = TushareProvider(token="test")
    provider._api_url = "http://tushare.test"
    provider._api_key = "test"
    provider.request_dataframe = AsyncMock(return_value=pd.DataFrame([
        {"trade_date": "20260820", "fd_share": 1000},
        {"trade_date": "20260821", "fd_share": 1200},
    ]))

    result = await provider.get_etf_scale("159000")

    assert result["shares"] == 1200
    provider.request_dataframe.assert_awaited_once()
    assert provider.request_dataframe.await_args.args[0] == "fund_share"
