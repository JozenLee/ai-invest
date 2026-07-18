# tests/test_interfaces/test_index_daily.py
import pytest
import pandas as pd


class TestIndexDaily:
    """指数日K数据接口测试"""

    @pytest.fixture
    def sample_daily_df(self):
        return pd.DataFrame({
            "date": ["2026-07-15", "2026-07-16", "2026-07-17"],
            "open": [2990.0, 3000.0, 3010.0],
            "high": [3010.0, 3020.0, 3030.0],
            "low": [2980.0, 2990.0, 3000.0],
            "close": [3000.0, 3010.0, 3020.0],
            "volume": [1000000, 1100000, 1200000],
        })

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_daily_df):
        mock_akshare.get_index_daily.return_value = sample_daily_df

        result = await data_service.get_index_daily("sh000001", "20260701", "20260718")

        assert not result.empty
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_daily_df):
        mock_akshare.get_index_daily.side_effect = Exception("失败")
        mock_tushare.get_index_daily.return_value = sample_daily_df

        result = await data_service.get_index_daily("sh000001", "20260701", "20260718")

        assert not result.empty

    @pytest.mark.asyncio
    async def test_all_failed(self, registry, mock_akshare, mock_tushare):
        # 禁用文件缓存降级
        registry._config["index_daily"].fallback_to_file = False
        from services.data_service import DataService
        data_service = DataService(reg=registry)

        mock_akshare.get_index_daily.side_effect = Exception("失败")
        mock_tushare.get_index_daily.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_index_daily("sh000001", "20260701", "20260718")
