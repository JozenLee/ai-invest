# tests/test_interfaces/test_sector_capital_flow.py
import pytest


class TestSectorCapitalFlow:
    """板块资金流向接口测试"""

    @pytest.fixture
    def sample_sector_list(self):
        return [
            {"名称": "半导体", "今日涨跌幅": 2.5, "今日主力净流入-净额": 500000000},
            {"名称": "消费电子", "今日涨跌幅": 1.8, "今日主力净流入-净额": 300000000},
        ]

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_tushare, sample_sector_list):
        mock_tushare.get_sector_capital_flow.return_value = sample_sector_list

        result = await data_service.get_sector_capital_flow("今日")

        assert isinstance(result, list)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_sector_list):
        mock_akshare.get_sector_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_sector_capital_flow.return_value = sample_sector_list

        result = await data_service.get_sector_capital_flow("今日")

        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_all_failed(self, registry, mock_akshare, mock_tushare):
        # 禁用文件缓存降级
        registry._config["sector_capital_flow"].fallback_to_file = False
        from services.data_service import DataService
        data_service = DataService(reg=registry)

        mock_akshare.get_sector_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_sector_capital_flow.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_sector_capital_flow("今日")

    @pytest.mark.asyncio
    async def test_uses_file_cache_when_live_sources_fail(self, registry, mock_akshare, mock_tushare, tmp_path):
        from services.data_service import DataService

        registry._config["sector_capital_flow"].fallback_to_file = True
        registry.cache.set_file = lambda key, data: None
        registry.cache.get_file = lambda key: [{"名称": "半导体", "今日主力净流入-净额": 100000000}]
        mock_akshare.get_sector_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_sector_capital_flow.side_effect = Exception("失败")

        result = await DataService(reg=registry).get_sector_capital_flow("今日")

        assert result[0]["名称"] == "半导体"

    @pytest.mark.asyncio
    async def test_force_refresh_bypasses_memory_cache(self, registry, mock_tushare):
        from services.data_service import DataService

        service = DataService(reg=registry)
        mock_tushare.get_sector_capital_flow.return_value = [
            {"名称": "半导体", "今日主力净流入-净额": 100000000}
        ]
        first = await service.get_sector_capital_flow("今日")
        mock_tushare.get_sector_capital_flow.return_value = [
            {"名称": "消费电子", "今日主力净流入-净额": 200000000}
        ]

        cached = await service.get_sector_capital_flow("今日")
        refreshed = await service.get_sector_capital_flow("今日", force_refresh=True)

        assert cached == first
        assert refreshed[0]["名称"] == "消费电子"
        assert mock_tushare.get_sector_capital_flow.await_count == 2
