# tests/test_registry.py
import pytest
import pandas as pd
from unittest.mock import AsyncMock
from providers.registry import ProviderRegistry, CategoryConfig


class TestRegistryFetch:
    """Registry.fetch() 降级调度测试"""

    @pytest.fixture
    def setup(self):
        self.akshare = AsyncMock()
        self.tushare = AsyncMock()
        self.xueqiu = AsyncMock()
        self.registry = ProviderRegistry()
        self.registry._providers = {
            "akshare": self.akshare,
            "tushare": self.tushare,
            "xueqiu": self.xueqiu,
        }

    @pytest.mark.asyncio
    async def test_success_first_source(self, setup):
        """第一个数据源成功，直接返回"""
        self.akshare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty
        self.akshare.get_index_spot.assert_called_once()
        self.tushare.get_index_spot.assert_not_called()

    @pytest.mark.asyncio
    async def test_fallback_to_second_source(self, setup):
        """第一个源失败，降级到第二个源"""
        self.akshare.get_index_spot.side_effect = Exception("AKShare失败")
        self.tushare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty
        self.akshare.get_index_spot.assert_called_once()
        self.tushare.get_index_spot.assert_called_once()

    @pytest.mark.asyncio
    async def test_fallback_to_third_source(self, setup):
        """前两个源失败，降级到第三个源"""
        self.akshare.get_index_spot.side_effect = Exception("失败")
        self.tushare.get_index_spot.side_effect = Exception("失败")
        self.xueqiu.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty

    @pytest.mark.asyncio
    async def test_all_sources_failed(self, setup):
        """所有数据源失败，抛出异常"""
        # 禁用文件缓存降级
        self.registry._config["index_spot"].fallback_to_file = False

        self.akshare.get_index_spot.side_effect = Exception("失败")
        self.tushare.get_index_spot.side_effect = Exception("失败")
        self.xueqiu.get_index_spot.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await self.registry.fetch(
                category="index_spot",
                method="get_index_spot",
                cache_key="test",
            )

    @pytest.mark.asyncio
    async def test_empty_dataframe_fallback(self, setup):
        """第一个源返回空 DataFrame，尝试下一个源"""
        self.akshare.get_index_spot.return_value = pd.DataFrame()
        self.tushare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty

    @pytest.mark.asyncio
    async def test_not_implemented_skip(self, setup):
        """provider 不支持该方法，跳过"""
        self.akshare.get_index_spot.side_effect = NotImplementedError()
        self.tushare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty


class TestCategoryConfig:
    """CategoryConfig 配置测试"""

    def test_custom_config_override(self):
        """自定义配置可以覆盖默认配置"""
        custom = {
            "index_spot": CategoryConfig(
                sources=["xueqiu", "akshare"],
                cache_ttl=15,
            ),
        }
        registry = ProviderRegistry(custom_config=custom)

        assert registry._config["index_spot"].sources == ["xueqiu", "akshare"]
        assert registry._config["index_spot"].cache_ttl == 15

    def test_default_config_preserved(self):
        """未覆盖的类别保留默认配置"""
        custom = {"index_spot": CategoryConfig(sources=["xueqiu"])}
        registry = ProviderRegistry(custom_config=custom)

        assert registry._config["index_daily"].sources == ["tushare", "akshare"]

    def test_unknown_category_raises(self):
        """未知的数据类别抛出异常"""
        registry = ProviderRegistry()

        async def test():
            await registry.fetch(category="unknown_category", method="test")

        import asyncio
        with pytest.raises(ValueError):
            asyncio.run(test())
