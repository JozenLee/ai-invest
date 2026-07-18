# tests/test_interfaces/test_northbound_flow.py
import pytest


class TestNorthboundFlow:
    """北向资金接口测试"""

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_northbound_dict):
        mock_akshare.get_northbound_flow.return_value = sample_northbound_dict

        result = await data_service.get_northbound_flow()

        assert isinstance(result, dict)
        assert "value" in result
        assert "shConnect" in result
        assert "szConnect" in result

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_northbound_dict):
        mock_akshare.get_northbound_flow.side_effect = Exception("失败")
        mock_tushare.get_northbound_flow.return_value = sample_northbound_dict

        result = await data_service.get_northbound_flow()

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_all_failed(self, registry, mock_akshare, mock_tushare):
        # 禁用文件缓存降级
        registry._config["northbound_flow"].fallback_to_file = False
        from services.data_service import DataService
        data_service = DataService(reg=registry)

        mock_akshare.get_northbound_flow.side_effect = Exception("失败")
        mock_tushare.get_northbound_flow.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_northbound_flow()
