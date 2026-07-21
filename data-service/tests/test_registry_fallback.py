"""
测试 ProviderRegistry 的降级逻辑

验证当首选数据源失败时，系统能够自动降级到备用数据源，
并正确标记数据质量等级（dataQuality）。
"""

import pytest
from unittest.mock import MagicMock, AsyncMock
from providers.registry import ProviderRegistry, CategoryConfig


@pytest.mark.asyncio
async def test_fallback_sina_to_akshare():
    """测试新浪失败时降级到AKShare

    场景：
    1. 新浪数据源（sina）失败抛出异常
    2. 自动降级到 AKShare 数据源
    3. 返回 AKShare 数据，dataQuality 标记为 "estimated"
    """
    # 创建自定义配置的注册表
    custom_config = {
        "market_capital_flow": CategoryConfig(
            sources=["sina", "akshare"],
            cache_ttl=600,
            fallback_to_file=False,  # 关闭文件缓存，确保只测试降级逻辑
        ),
    }
    registry = ProviderRegistry(custom_config=custom_config)

    # Mock SinaProvider 失败
    sina = MagicMock()
    sina.name = "sina"
    sina.get_market_capital_flow = AsyncMock(side_effect=Exception("新浪API失败"))
    registry.register(sina)

    # Mock AKShareProvider 成功
    akshare = MagicMock()
    akshare.name = "akshare"
    akshare.get_market_capital_flow = AsyncMock(return_value={
        "主力净流入-净额": 1000000000,
        "小单净流入-净额": -500000000,
        "中单净流入-净额": -300000000,
        "大单净流入-净额": 800000000,
        "超大单净流入-净额": 200000000,
        "dataQuality": "estimated",
        "source": "akshare",
    })
    registry.register(akshare)

    # 执行fetch
    result = await registry.fetch(
        "market_capital_flow",
        "get_market_capital_flow",
        cache_key=None,  # 不使用缓存，确保测试降级逻辑
    )

    # 验证降级逻辑
    assert result is not None
    assert result["dataQuality"] == "estimated"
    assert result["source"] == "akshare"
    assert result["主力净流入-净额"] == 1000000000

    # 验证调用顺序：先尝试新浪，再降级到AKShare
    sina.get_market_capital_flow.assert_called_once()
    akshare.get_market_capital_flow.assert_called_once()


@pytest.mark.asyncio
async def test_primary_source_success():
    """测试首选数据源成功时不降级

    场景：
    1. 新浪数据源（sina）成功返回数据
    2. 不尝试 AKShare 数据源
    3. 返回新浪数据，dataQuality 标记为 "realtime"
    """
    custom_config = {
        "market_capital_flow": CategoryConfig(
            sources=["sina", "akshare"],
            cache_ttl=600,
            fallback_to_file=False,
        ),
    }
    registry = ProviderRegistry(custom_config=custom_config)

    # Mock SinaProvider 成功
    sina = MagicMock()
    sina.name = "sina"
    sina.get_market_capital_flow = AsyncMock(return_value={
        "主力净流入-净额": 2000000000,
        "dataQuality": "realtime",
        "source": "sina",
    })
    registry.register(sina)

    # Mock AKShareProvider（不应被调用）
    akshare = MagicMock()
    akshare.name = "akshare"
    akshare.get_market_capital_flow = AsyncMock(return_value={
        "主力净流入-净额": 1000000000,
        "dataQuality": "estimated",
        "source": "akshare",
    })
    registry.register(akshare)

    # 执行fetch
    result = await registry.fetch(
        "market_capital_flow",
        "get_market_capital_flow",
        cache_key=None,
    )

    # 验证结果
    assert result is not None
    assert result["dataQuality"] == "realtime"
    assert result["source"] == "sina"
    assert result["主力净流入-净额"] == 2000000000

    # 验证只调用了新浪，未调用AKShare
    sina.get_market_capital_flow.assert_called_once()
    akshare.get_market_capital_flow.assert_not_called()


@pytest.mark.asyncio
async def test_all_sources_fail_raises_exception():
    """测试所有数据源都失败时抛出异常

    场景：
    1. 新浪数据源失败
    2. AKShare数据源也失败
    3. 抛出最后一个异常
    """
    custom_config = {
        "market_capital_flow": CategoryConfig(
            sources=["sina", "akshare"],
            cache_ttl=600,
            fallback_to_file=False,  # 关闭文件缓存降级
        ),
    }
    registry = ProviderRegistry(custom_config=custom_config)

    # Mock SinaProvider 失败
    sina = MagicMock()
    sina.name = "sina"
    sina.get_market_capital_flow = AsyncMock(side_effect=Exception("新浪API失败"))
    registry.register(sina)

    # Mock AKShareProvider 也失败
    akshare = MagicMock()
    akshare.name = "akshare"
    akshare.get_market_capital_flow = AsyncMock(side_effect=Exception("AKShare API失败"))
    registry.register(akshare)

    # 执行fetch，应该抛出异常
    with pytest.raises(Exception) as exc_info:
        await registry.fetch(
            "market_capital_flow",
            "get_market_capital_flow",
            cache_key=None,
        )

    # 验证抛出的是最后一个异常（AKShare的异常）
    assert "AKShare API失败" in str(exc_info.value)

    # 验证两个数据源都被尝试了
    sina.get_market_capital_flow.assert_called_once()
    akshare.get_market_capital_flow.assert_called_once()


@pytest.mark.asyncio
async def test_empty_result_triggers_fallback():
    """测试空结果触发降级

    场景：
    1. 新浪返回空字典（无效数据）
    2. 自动降级到 AKShare
    3. 返回 AKShare 数据
    """
    custom_config = {
        "market_capital_flow": CategoryConfig(
            sources=["sina", "akshare"],
            cache_ttl=600,
            fallback_to_file=False,
        ),
    }
    registry = ProviderRegistry(custom_config=custom_config)

    # Mock SinaProvider 返回空字典
    sina = MagicMock()
    sina.name = "sina"
    sina.get_market_capital_flow = AsyncMock(return_value={})
    registry.register(sina)

    # Mock AKShareProvider 成功
    akshare = MagicMock()
    akshare.name = "akshare"
    akshare.get_market_capital_flow = AsyncMock(return_value={
        "主力净流入-净额": 1000000000,
        "dataQuality": "estimated",
        "source": "akshare",
    })
    registry.register(akshare)

    # 执行fetch
    result = await registry.fetch(
        "market_capital_flow",
        "get_market_capital_flow",
        cache_key=None,
    )

    # 验证降级到AKShare
    assert result is not None
    assert result["dataQuality"] == "estimated"
    assert result["source"] == "akshare"

    # 验证两个数据源都被尝试了
    sina.get_market_capital_flow.assert_called_once()
    akshare.get_market_capital_flow.assert_called_once()
