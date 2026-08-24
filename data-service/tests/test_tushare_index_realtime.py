import pandas as pd
import pytest
from unittest.mock import AsyncMock, patch

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
