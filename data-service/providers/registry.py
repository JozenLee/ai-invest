# 数据源注册表 + 降级调度
# 管理所有 provider 实例，按类别配置的优先级自动降级

import asyncio
import json
import os
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from providers.base import DataProvider

# 缓存文件目录
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# 每个数据类别的数据源优先级配置
# 修改此配置即可调整某类数据的首选数据源
CATEGORY_SOURCES: Dict[str, List[str]] = {
    # 指数
    "index_spot":           ["akshare", "tushare", "xueqiu"],
    "index_daily":          ["akshare", "tushare"],
    "index_realtime":       ["akshare", "tushare", "xueqiu"],
    # 个股
    "stock_spot":           ["akshare", "tushare", "xueqiu"],
    "stock_daily":          ["akshare", "tushare"],
    # ETF
    "etf_realtime":         ["akshare", "xueqiu", "tushare"],
    "etf_daily":            ["akshare", "tushare"],
    "etf_nav":              ["akshare", "tushare"],
    # 资金流向
    "market_capital_flow":  ["akshare", "tushare"],
    "sector_capital_flow":  ["akshare", "tushare"],
    "northbound_flow":      ["akshare", "tushare"],
    "northbound_history":   ["akshare", "tushare"],
    "stock_capital_flow":   ["akshare", "tushare"],
    "margin_data":          ["akshare", "tushare"],
    "market_fund_flow_rank": ["akshare", "tushare"],
    "market_sentiment":     ["akshare", "tushare"],
    # 新闻（仅 AKShare 支持）
    "news":                 ["akshare"],
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
    """

    def __init__(self):
        self._providers: Dict[str, DataProvider] = {}
        self.cache = CacheManager()

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

    async def fetch(self, category: str, method: str, cache_key: Optional[str] = None,
                    cache_ttl: int = 600, **kwargs) -> Any:
        """按优先级尝试各数据源，自动降级

        Args:
            category: 数据类别（对应 CATEGORY_SOURCES 的 key）
            method: provider 上的方法名
            cache_key: 缓存 key（None 则不使用缓存）
            cache_ttl: 内存缓存 TTL（秒）
            **kwargs: 传递给 provider 方法的参数

        Returns:
            第一个成功返回的数据

        Raises:
            Exception: 所有数据源都失败时，抛出最后一个异常
        """
        # 先检查缓存
        if cache_key:
            cached = self.cache.get_memory(cache_key)
            if cached is not None:
                return cached

        sources = CATEGORY_SOURCES.get(category, [])
        last_error = None

        for source_name in sources:
            provider = self._providers.get(source_name)
            if not provider:
                continue

            try:
                result = await getattr(provider, method)(**kwargs)

                # 判断结果是否有效
                if self._is_valid_result(result):
                    # 写入缓存
                    if cache_key:
                        serializable = self._to_serializable(result)
                        if serializable is not None:
                            self.cache.set(cache_key, serializable, memory_ttl=cache_ttl)
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
        if cache_key:
            cached = self.cache.get_file(cache_key)
            if cached is not None:
                print(f"[Registry] 所有数据源失败，使用文件缓存: {cache_key}")
                self.cache.set_memory(cache_key, cached, ttl_seconds=cache_ttl)
                return cached

        raise last_error or Exception(f"无可用数据源: {category}")

    @staticmethod
    def _is_valid_result(result: Any) -> bool:
        """判断结果是否有效（非空）"""
        if result is None:
            return False
        if isinstance(result, pd.DataFrame):
            return not result.empty
        if isinstance(result, dict):
            return len(result) > 0
        if isinstance(result, list):
            return len(result) > 0
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
