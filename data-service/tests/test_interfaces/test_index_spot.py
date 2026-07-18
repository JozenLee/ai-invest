# tests/test_interfaces/test_index_spot.py
import pytest
import pandas as pd
from unittest.mock import AsyncMock


class TestIndexSpot:
    """指数实时行情接口测试"""

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_index_df):
        """正常返回数据"""
        mock_akshare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty
        assert len(result) == 5
        mock_akshare.get_index_spot.assert_called_once()

    @pytest.mark.asyncio
    async def test_fallback_to_tushare(self, data_service, mock_akshare, mock_tushare, sample_index_df):
        """AKShare 失败，降级到 Tushare"""
        mock_akshare.get_index_spot.side_effect = Exception("AKShare失败")
        mock_tushare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty
        mock_akshare.get_index_spot.assert_called_once()
        mock_tushare.get_index_spot.assert_called_once()

    @pytest.mark.asyncio
    async def test_fallback_to_xueqiu(self, data_service, mock_akshare, mock_tushare, mock_xueqiu, sample_index_df):
        """前两个源失败，降级到雪球"""
        mock_akshare.get_index_spot.side_effect = Exception("失败")
        mock_tushare.get_index_spot.side_effect = Exception("失败")
        mock_xueqiu.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty

    @pytest.mark.asyncio
    async def test_all_sources_failed(self, registry, mock_akshare, mock_tushare, mock_xueqiu):
        """所有数据源失败"""
        # 禁用文件缓存降级，确保测试行为正确
        registry._config["index_spot"].fallback_to_file = False
        from services.data_service import DataService
        data_service = DataService(reg=registry)

        mock_akshare.get_index_spot.side_effect = Exception("失败")
        mock_tushare.get_index_spot.side_effect = Exception("失败")
        mock_xueqiu.get_index_spot.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_index_spot()

    @pytest.mark.asyncio
    async def test_empty_dataframe_fallback(self, data_service, mock_akshare, mock_tushare, sample_index_df):
        """第一个源返回空 DataFrame，尝试下一个源"""
        mock_akshare.get_index_spot.return_value = pd.DataFrame()
        mock_tushare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty

    @pytest.mark.asyncio
    async def test_returns_dataframe(self, data_service, mock_akshare, sample_index_df):
        """确保返回 DataFrame 类型"""
        mock_akshare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert isinstance(result, pd.DataFrame)
