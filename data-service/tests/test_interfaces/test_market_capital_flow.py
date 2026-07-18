# tests/test_interfaces/test_market_capital_flow.py
import pytest


class TestMarketCapitalFlow:
    """大盘资金流向接口测试"""

    @pytest.fixture
    def sample_flow_dict(self):
        return {
            "主力净流入-净额": 1000000000.0,
            "主力净流入-净占比": 5.5,
            "中单净流入-净额": -500000000.0,
            "小单净流入-净额": -500000000.0,
            "日期": "2026-07-18",
            "source": "akshare",
        }

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_flow_dict):
        mock_akshare.get_market_capital_flow.return_value = sample_flow_dict

        result = await data_service.get_market_capital_flow()

        assert isinstance(result, dict)
        assert "主力净流入-净额" in result

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_flow_dict):
        mock_akshare.get_market_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_market_capital_flow.return_value = sample_flow_dict

        result = await data_service.get_market_capital_flow()

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_all_failed(self, registry, mock_akshare, mock_tushare):
        # 禁用文件缓存降级
        registry._config["market_capital_flow"].fallback_to_file = False
        from services.data_service import DataService
        data_service = DataService(reg=registry)

        mock_akshare.get_market_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_market_capital_flow.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_market_capital_flow()
