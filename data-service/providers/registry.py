# 数据源注册表 + 降级调度
# 管理所有 provider 实例，按类别配置的优先级自动降级
# 支持通过 CategoryConfig 自定义每个数据类别的数据源优先级和缓存策略

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd
from providers.base import DataProvider

# 缓存文件目录
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)


@dataclass
class CategoryConfig:
    """数据类别配置

    每个数据类别（如 index_spot, northbound_flow 等）可以独立配置：
    - sources: 数据源优先级列表，按顺序尝试
    - cache_ttl: 缓存TTL（秒）
    - fallback_to_file: 所有数据源失败时是否降级到文件缓存
    """
    sources: List[str]
    cache_ttl: int = 600
    fallback_to_file: bool = True


# 默认配置：每个数据类别的数据源优先级和缓存策略
DEFAULT_CATEGORY_CONFIG: Dict[str, CategoryConfig] = {
    # 指数
    "index_spot": CategoryConfig(
        sources=["tushare", "akshare", "xueqiu"],
        cache_ttl=30,
    ),
    "index_daily": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=300,
    ),
    "index_realtime": CategoryConfig(
        sources=["tushare", "akshare", "xueqiu"],
        cache_ttl=30,
    ),
    "index_list": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=3600,  # 指数列表变化不频繁
    ),
    # 个股
    "stock_spot": CategoryConfig(
        sources=["tushare", "akshare", "xueqiu"],
        cache_ttl=30,
    ),
    "stock_daily": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=300,
    ),
    # ETF
    "etf_realtime": CategoryConfig(
        sources=["tushare", "akshare", "xueqiu"],
        cache_ttl=30,
    ),
    "etf_daily": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=300,
    ),
    "etf_nav": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=300,
    ),
    "etf_list": CategoryConfig(
        sources=["akshare"],
        cache_ttl=3600,  # ETF列表变化不频繁
    ),
    # 资金流向
    "market_capital_flow": CategoryConfig(
        sources=["tushare"],
        cache_ttl=600,
        fallback_to_file=False,
    ),
    "sector_capital_flow": CategoryConfig(
        sources=["tushare"],
        cache_ttl=600,
        fallback_to_file=False,
    ),
    "northbound_flow": CategoryConfig(
        sources=["tushare"],
        cache_ttl=600,
        fallback_to_file=False,
    ),
    "northbound_history": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=600,
    ),
    "stock_capital_flow": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=600,
    ),
    "margin_data": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=600,
    ),
    "market_fund_flow_rank": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=600,
    ),
    # 新闻资讯
    "news": CategoryConfig(
        sources=["tushare", "newsnow", "akshare", "xueqiu"],
        cache_ttl=300,
        fallback_to_file=False,
    ),
    "market_sentiment": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=60,
    ),
    # 龙虎榜和个股资金流向
    "lhb_data": CategoryConfig(
        sources=["tushare"],
        cache_ttl=600,
        fallback_to_file=False,
    ),
    "market_volume_amplification": CategoryConfig(
        sources=["tushare"],
        cache_ttl=600,
        fallback_to_file=False,
    ),
    "lhb_detail": CategoryConfig(
        sources=["tushare", "akshare"],
        cache_ttl=3600,
        fallback_to_file=True,
    ),
    "individual_capital_flow": CategoryConfig(
        sources=["akshare"],
        cache_ttl=600,
        fallback_to_file=True,
    ),
}


class CacheManager:
    """两级缓存管理器（内存 + 文件）

    从 AKShareClient 迁移，保持相同的缓存行为。
    """

    def __init__(self):
        self._memory_cache: Dict[str, Any] = {}
        self._memory_cache_ttl: Dict[str, datetime] = {}

    def get_memory(self, key: str) -> Optional[Any]:
        """读取内存缓存"""
        if key in self._memory_cache:
            if datetime.now() < self._memory_cache_ttl.get(key, datetime.min):
                return self._memory_cache[key]
        return None

    def set_memory(self, key: str, data: Any, ttl_seconds: int):
        """写入内存缓存"""
        self._memory_cache[key] = data
        self._memory_cache_ttl[key] = datetime.now() + timedelta(seconds=ttl_seconds)

    def get_file(self, key: str) -> Optional[Any]:
        """读取文件缓存"""
        path = os.path.join(CACHE_DIR, f"{key}.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return None

    def set_file(self, key: str, data: Any):
        """写入文件缓存"""
        path = os.path.join(CACHE_DIR, f"{key}.json")
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:
            print(f"写入文件缓存失败: {e}")

    def get(self, key: str) -> Optional[Any]:
        """读取缓存：先内存，再文件（回填内存）"""
        cached = self.get_memory(key)
        if cached is not None:
            return cached
        cached = self.get_file(key)
        if cached is not None:
            self.set_memory(key, cached, ttl_seconds=600)
            return cached
        return None

    def set(self, key: str, data: Any, memory_ttl: int = 600):
        """写入缓存：内存 + 文件"""
        self.set_memory(key, data, ttl_seconds=memory_ttl)
        self.set_file(key, data)

    def invalidate(self, key: str):
        """清除指定缓存"""
        self._memory_cache.pop(key, None)
        self._memory_cache_ttl.pop(key, None)
        path = os.path.join(CACHE_DIR, f"{key}.json")
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass


class ProviderRegistry:
    """数据源注册表

    管理所有 provider 实例，按 CATEGORY_SOURCES 配置的优先级自动降级。
    同时提供带缓存的 fetch 方法，路由层通过 DataService 调用。

    支持自定义配置：
        custom_config = {
            "index_spot": CategoryConfig(
                sources=["xueqiu", "akshare"],  # 优先使用雪球
                cache_ttl=15,
            ),
        }
        registry = ProviderRegistry(custom_config=custom_config)
    """

    def __init__(self, custom_config: Optional[Dict[str, CategoryConfig]] = None):
        self._providers: Dict[str, DataProvider] = {}
        self._last_sources: Dict[str, str] = {}
        self.cache = CacheManager()
        # 合并默认配置和自定义配置
        self._config = {**DEFAULT_CATEGORY_CONFIG}
        if custom_config:
            self._config.update(custom_config)

    def register(self, provider: DataProvider):
        """注册数据源"""
        self._providers[provider.name] = provider
        print(f"[Registry] 注册数据源: {provider.name}")

    def get_provider(self, name: str) -> Optional[DataProvider]:
        """获取指定名称的数据源"""
        return self._providers.get(name)

    def list_providers(self) -> List[str]:
        """列出所有已注册的数据源名称"""
        return list(self._providers.keys())

    def get_last_source(self, category: str) -> str:
        """返回某类数据最近一次实际命中的数据源。"""
        return self._last_sources.get(category, "不可用")

    @staticmethod
    def _source_label(source_name: str) -> str:
        return {
            "tushare": "Tushare",
            "akshare": "AKShare",
            "eastmoney_direct": "东方财富",
            "sina": "新浪财经",
            "xueqiu": "雪球",
            "cache": "缓存",
        }.get(source_name, source_name)

    async def fetch(self, category: str, method: str, cache_key: Optional[str] = None,
                    cache_ttl: Optional[int] = None, **kwargs) -> Any:
        """按优先级尝试各数据源，自动降级

        Args:
            category: 数据类别（对应 _config 的 key）
            method: provider 上的方法名
            cache_key: 缓存 key（None 则不使用缓存）
            cache_ttl: 内存缓存 TTL（秒），None 则使用 CategoryConfig 默认值
            **kwargs: 传递给 provider 方法的参数

        Returns:
            第一个成功返回的数据

        Raises:
            ValueError: 未知的数据类别
            Exception: 所有数据源都失败时，抛出最后一个异常
        """
        config = self._config.get(category)
        if not config:
            raise ValueError(f"未知的数据类别: {category}")

        sources = config.sources
        ttl = cache_ttl or config.cache_ttl

        # 先检查内存缓存
        if cache_key:
            cached = self.cache.get_memory(cache_key)
            if cached is not None and self._is_valid_category_result(category, cached):
                # 内存缓存保留首次获取时的真实来源；只有没有来源记录时才标记为缓存。
                self._last_sources.setdefault(category, "缓存")
                return cached

        last_error = None

        for source_name in sources:
            provider = self._providers.get(source_name)
            if not provider:
                continue

            try:
                result = await getattr(provider, method)(**kwargs)

                # 判断结果是否有效
                if self._is_valid_result(result) and self._is_valid_category_result(category, result):
                    self._last_sources[category] = self._source_label(source_name)
                    # 写入缓存
                    if cache_key:
                        serializable = self._to_serializable(result)
                        if serializable is not None:
                            self.cache.set(cache_key, serializable, memory_ttl=ttl)
                    return result
                else:
                    print(f"[Registry] {source_name}.{method} 返回空数据，尝试下一个源")
            except NotImplementedError:
                # 该 provider 不支持此方法，跳过
                continue
            except Exception as e:
                print(f"[Registry] {source_name}.{method} 失败: {e}")
                last_error = e
                continue

        # 所有源都失败，尝试文件缓存降级
        # 交易时段禁止指数行情回退到文件缓存。文件缓存通常是上一交易日收盘，
        # 若在盘中返回它会被上层误认为实时行情。
        allow_file_fallback = not (
            category == "index_spot" and self._is_market_open()
        )
        if cache_key and config.fallback_to_file and allow_file_fallback:
            cached = self.cache.get_file(cache_key)
            if cached is not None and self._is_valid_category_result(category, cached):
                print(f"[Registry] 所有数据源失败，使用文件缓存: {cache_key}")
                self._last_sources[category] = "缓存"
                self.cache.set_memory(cache_key, cached, ttl_seconds=ttl)
                return cached

        raise last_error or Exception(f"无可用数据源: {category}")

    @staticmethod
    def _is_market_open() -> bool:
        """判断是否处于A股交易时段，避免盘中使用收盘缓存。"""
        from utils.trading_hours import is_trading_hours
        return is_trading_hours()

    @staticmethod
    def _is_valid_result(result: Any) -> bool:
        """判断结果是否有效（非空 + 数据合理性验证）"""
        if result is None:
            return False
        if isinstance(result, pd.DataFrame):
            if result.empty:
                return False
            # 验证指数数据：检测假数据（价格均为整百）
            if "最新价" in result.columns:
                prices = result["最新价"].dropna()
                if not prices.empty:
                    all_round_hundred = all(float(p) % 100 == 0 for p in prices if float(p) > 0)
                    if all_round_hundred:
                        print("[Registry] 检测到疑似假数据（价格均为整百），视为无效")
                        return False
            return True
        if isinstance(result, dict):
            return len(result) > 0
        if isinstance(result, list):
            return len(result) > 0
        return True

    @staticmethod
    def _is_valid_category_result(category: str, result: Any) -> bool:
        """对北向资金占位零值做类别级校验。"""
        if category in {"northbound_flow", "northbound_history"} and isinstance(result, dict):
            value = result.get("value")
            return value is not None and value != 0
        return True

    @staticmethod
    def _to_serializable(data: Any) -> Any:
        """将数据转为可 JSON 序列化的格式"""
        import pandas as pd
        if isinstance(data, pd.DataFrame):
            return data.to_dict("records")
        if isinstance(data, (dict, list)):
            return data
        return None


# 全局单例
registry = ProviderRegistry()
