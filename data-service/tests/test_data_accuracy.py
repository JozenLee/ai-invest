"""
数据准确性测试
防止缓存key不匹配、日期错误等问题
"""

import pytest
import asyncio
from datetime import datetime, time
from unittest.mock import patch, MagicMock
import pandas as pd

from services.data_service import data_service
from utils.trading_hours import get_last_trading_date, is_trading_hours


class TestCacheKeyConsistency:
    """测试缓存key一致性，防止index_spot vs market_overview类型的错误"""

    @pytest.mark.asyncio
    async def test_index_spot_cache_key_matches_file_name(self):
        """
        测试: get_index_spot的cache_key应为"market_overview"
        防止: cache_key="index_spot"导致缓存未命中
        """
        # 检查data_service.py中的实现
        import inspect
        source = inspect.getsource(data_service.get_index_spot)

        # 验证使用了正确的cache_key
        assert 'cache_key="market_overview"' in source, \
            "get_index_spot应使用cache_key='market_overview'而不是'index_spot'"

    @pytest.mark.asyncio
    async def test_market_capital_flow_cache_key_consistent(self):
        """
        测试: get_market_capital_flow的cache_key应与文件名一致
        """
        import inspect
        source = inspect.getsource(data_service.get_market_capital_flow)

        # 验证使用了"market_capital_flow"
        assert 'cache_key="market_capital_flow"' in source, \
            "get_market_capital_flow应使用cache_key='market_capital_flow'"

    @pytest.mark.asyncio
    async def test_sector_capital_flow_cache_key_pattern(self):
        """
        测试: get_sector_capital_flow的cache_key应包含indicator参数
        """
        import inspect
        source = inspect.getsource(data_service.get_sector_capital_flow)

        # 验证cache_key包含indicator
        assert 'f"sector_capital_flow_{indicator}"' in source or \
               'cache_key=f"sector_capital_flow_{indicator}"' in source, \
            "get_sector_capital_flow的cache_key应包含indicator参数"


class TestTradingDateLogic:
    """测试交易日期逻辑，防止盘前显示当天数据"""

    def test_get_last_trading_date_logic(self):
        """
        测试: get_last_trading_date在不同时间段的返回值
        """
        from utils.trading_hours import get_last_trading_date

        # 周一盘前（9:00）应返回上周五
        with patch('utils.trading_hours.datetime') as mock_dt:
            mock_dt.now.return_value = datetime(2024, 7, 29, 9, 0)  # 周一9:00
            mock_dt.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)
            result = get_last_trading_date()
            # 应该是上周五 2024-07-26
            assert result == "2024-07-26"

        # 周二盘前（9:00）应返回周一
        with patch('utils.trading_hours.datetime') as mock_dt:
            mock_dt.now.return_value = datetime(2024, 7, 30, 9, 0)  # 周二9:00
            mock_dt.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)
            result = get_last_trading_date()
            assert result == "2024-07-29"

        # 周六应返回周五
        with patch('utils.trading_hours.datetime') as mock_dt:
            mock_dt.now.return_value = datetime(2024, 7, 27, 15, 0)  # 周六15:00
            mock_dt.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)
            result = get_last_trading_date()
            assert result == "2024-07-26"

    @pytest.mark.asyncio
    async def test_akshare_provider_uses_get_last_trading_date(self):
        """
        测试: AKShare Provider必须使用get_last_trading_date()而不是datetime.now()
        防止: 盘前时间显示当天日期
        """
        from providers.akshare_provider import AKShareProvider
        import inspect

        source = inspect.getsource(AKShareProvider.get_market_capital_flow)

        # 验证使用了get_last_trading_date
        assert 'get_last_trading_date()' in source, \
            "AKShareProvider.get_market_capital_flow应使用get_last_trading_date()而不是datetime.now()"

        # 确保没有直接使用datetime.now().strftime作为日期
        lines = source.split('\n')
        for line in lines:
            if '"日期"' in line or "'日期'" in line:
                # 日期行不应该包含datetime.now().strftime
                assert 'datetime.now().strftime' not in line, \
                    f"日期字段不应使用datetime.now(): {line}"

    @pytest.mark.asyncio
    async def test_sina_provider_uses_get_last_trading_date(self):
        """
        测试: Sina Provider必须使用get_last_trading_date()
        """
        from providers.sina_provider import SinaProvider
        import inspect

        source = inspect.getsource(SinaProvider.get_market_capital_flow)

        # 验证使用了get_last_trading_date
        assert 'get_last_trading_date()' in source, \
            "SinaProvider.get_market_capital_flow应使用get_last_trading_date()"

        # 确保没有直接使用datetime.now().strftime作为日期
        lines = source.split('\n')
        for line in lines:
            if '"日期"' in line or "'日期'" in line:
                assert 'datetime.now().strftime' not in line, \
                    f"日期字段不应使用datetime.now(): {line}"


class TestDataSourcePriority:
    """测试数据源优先级配置"""

    def test_market_capital_flow_source_priority(self):
        """
        测试: market_capital_flow应该优先使用AKShare（真实数据）
        防止: 优先使用Sina估算数据
        """
        from providers.registry import DEFAULT_CATEGORY_CONFIG

        config = DEFAULT_CATEGORY_CONFIG.get("market_capital_flow")
        assert config is not None, "market_capital_flow配置不存在"

        sources = config.sources
        assert sources[0] == "akshare", \
            f"market_capital_flow应优先使用akshare，当前: {sources}"
        assert "sina" in sources, \
            "market_capital_flow应包含sina作为备用"


class TestDataIntegrity:
    """测试数据完整性和准确性"""

    @pytest.mark.asyncio
    async def test_index_spot_data_structure(self):
        """
        测试: get_index_spot返回的DataFrame结构
        """
        # Mock registry.fetch
        mock_data = pd.DataFrame([
            {
                "code": "sh000001",
                "name": "上证指数",
                "price": 3876.78,
                "change": 9.74,
                "changePct": 0.25,
            }
        ])

        with patch.object(data_service.registry, 'fetch', return_value=mock_data):
            result = await data_service.get_index_spot()

            assert isinstance(result, pd.DataFrame)
            assert not result.empty
            assert "code" in result.columns
            assert "price" in result.columns

    @pytest.mark.asyncio
    async def test_market_capital_flow_data_structure(self):
        """
        测试: get_market_capital_flow返回的数据结构
        """
        mock_data = {
            "主力净流入-净额": -2227971686.4,
            "主力净流入-净占比": -1.01,
            "日期": "2026-07-23",
            "source": "market_fund_flow",
            "dataQuality": "realtime",
        }

        with patch.object(data_service.registry, 'fetch', return_value=mock_data):
            result = await data_service.get_market_capital_flow()

            assert isinstance(result, dict)
            assert "日期" in result
            assert "主力净流入-净额" in result
            assert "source" in result
            assert "dataQuality" in result

    @pytest.mark.asyncio
    async def test_capital_flow_date_before_market_open(self):
        """
        测试: 盘前时间（9:30前）资金流向数据应该是上一交易日
        """
        # Mock当前时间为盘前
        with patch('utils.trading_hours.datetime') as mock_dt:
            mock_dt.now.return_value = datetime(2024, 7, 24, 9, 0)  # 9:00盘前
            mock_dt.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

            expected_date = get_last_trading_date()
            # 盘前应该返回昨天（如果昨天是交易日）或上个交易日
            assert expected_date < datetime(2024, 7, 24).strftime("%Y-%m-%d")


class TestAPIEndpoints:
    """测试API端点返回的数据准确性"""

    @pytest.mark.asyncio
    async def test_market_overview_api_consistency(self):
        """
        测试: /api/market/overview返回的数据与cache文件一致
        集成测试：验证整个数据流
        """
        # 这是一个集成测试标记，需要实际运行服务
        pytest.skip("需要运行服务器的集成测试")

    @pytest.mark.asyncio
    async def test_capital_flow_api_date_accuracy(self):
        """
        测试: /api/capital-flow/market返回的日期准确性
        """
        pytest.skip("需要运行服务器的集成测试")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
