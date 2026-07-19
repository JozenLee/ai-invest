"""
Provider 加载器
动态加载和管理不同的数据源 Provider
"""
from typing import Optional, Dict, Any
from .bilibili_provider import BilibiliProvider
from .weibo_provider import WeiboProvider
from .xiaohongshu_provider import XiaohongshuProvider
from .schemas import get_provider_schema, validate_provider_config, list_provider_schemas


class ProviderLoader:
    """Provider 动态加载器"""

    # 注册的 Provider 类型
    PROVIDERS = {
        'bilibili': BilibiliProvider,
        'weibo': WeiboProvider,
        'xiaohongshu': XiaohongshuProvider,
    }

    # Provider 实例缓存 {cache_key: provider_instance}
    _cache: Dict[str, Any] = {}
    
    @classmethod
    def load_provider(cls, provider_name: str, config: Optional[Dict[str, Any]] = None, use_cache: bool = True):
        """
        加载指定的 Provider 实例

        Args:
            provider_name: Provider 名称 (bilibili/weibo/xiaohongshu)
            config: Provider 配置参数
            use_cache: 是否使用缓存实例

        Returns:
            Provider 实例

        Raises:
            ValueError: 如果 Provider 不存在或配置无效
        """
        if provider_name not in cls.PROVIDERS:
            raise ValueError(f"Unknown provider: {provider_name}. Available: {list(cls.PROVIDERS.keys())}")

        config = config or {}

        # 配置验证
        is_valid, errors = validate_provider_config(provider_name, config)
        if not is_valid:
            raise ValueError(f"Invalid config for {provider_name}: {'; '.join(errors)}")

        # 生成缓存键
        cache_key = cls._generate_cache_key(provider_name, config)

        # 检查缓存
        if use_cache and cache_key in cls._cache:
            return cls._cache[cache_key]

        # 创建新实例
        provider_class = cls.PROVIDERS[provider_name]

        # 根据不同的 Provider 类型初始化
        if provider_name == 'bilibili':
            # B站可能需要凭证
            credential = config.get('credential')
            instance = provider_class(credential=credential)
        else:
            # 其他 Provider 暂时不需要特殊参数
            instance = provider_class()

        # 缓存实例
        if use_cache:
            cls._cache[cache_key] = instance

        return instance
    
    @classmethod
    def list_providers(cls) -> list:
        """
        列出所有可用的 Provider
        
        Returns:
            Provider 名称列表
        """
        return list(cls.PROVIDERS.keys())
    
    @classmethod
    def get_provider_info(cls, provider_name: str) -> Dict[str, Any]:
        """
        获取 Provider 的信息

        Args:
            provider_name: Provider 名称

        Returns:
            Provider 信息字典
        """
        # 从 schemas.py 获取完整信息
        return get_provider_schema(provider_name)

    @classmethod
    def get_all_provider_info(cls) -> list[Dict[str, Any]]:
        """
        获取所有 Provider 的信息

        Returns:
            Provider 信息列表
        """
        return list_provider_schemas()

    @classmethod
    def clear_cache(cls, provider_name: Optional[str] = None):
        """
        清除 Provider 实例缓存

        Args:
            provider_name: 要清除的 Provider 名称，None 表示清除所有
        """
        if provider_name is None:
            cls._cache.clear()
        else:
            # 清除特定 Provider 的所有缓存
            keys_to_remove = [k for k in cls._cache.keys() if k.startswith(f"{provider_name}:")]
            for key in keys_to_remove:
                del cls._cache[key]

    @classmethod
    def get_cache_stats(cls) -> Dict[str, Any]:
        """
        获取缓存统计信息

        Returns:
            缓存统计字典
        """
        cache_by_provider: Dict[str, int] = {}
        for key in cls._cache.keys():
            provider_name = key.split(':')[0]
            cache_by_provider[provider_name] = cache_by_provider.get(provider_name, 0) + 1

        return {
            'total_cached': len(cls._cache),
            'by_provider': cache_by_provider,
        }

    @classmethod
    def _generate_cache_key(cls, provider_name: str, config: Dict[str, Any]) -> str:
        """
        生成缓存键

        Args:
            provider_name: Provider 名称
            config: 配置字典

        Returns:
            缓存键字符串
        """
        # 使用关键配置字段生成缓存键
        key_parts = [provider_name]

        if provider_name == 'bilibili':
            key_parts.append(str(config.get('uid', '')))
        elif provider_name == 'weibo':
            key_parts.append(str(config.get('uid', '')))
        elif provider_name == 'xiaohongshu':
            key_parts.append(str(config.get('user_id', '')))

        return ':'.join(key_parts)


# 测试代码
if __name__ == '__main__':
    import asyncio

    async def test():
        # 列出所有 Provider
        print("=== Available Providers ===")
        print(ProviderLoader.list_providers())

        # 获取 Provider 信息
        print("\n=== Provider Info ===")
        for name in ProviderLoader.list_providers():
            info = ProviderLoader.get_provider_info(name)
            print(f"\n{info['displayName']}: {info['description']}")

        # 测试配置验证
        print("\n=== Config Validation ===")
        try:
            # 无效配置（缺少必填字段）
            ProviderLoader.load_provider('bilibili', {}, use_cache=False)
        except ValueError as e:
            print(f"Expected error: {e}")

        # 加载并测试 B站 Provider（有效配置）
        print("\n=== Testing Bilibili Provider ===")
        bilibili = ProviderLoader.load_provider('bilibili', {'uid': 123456})
        user_info = await bilibili.get_user_info(123456)
        print(f"User: {user_info['name']}")

        # 测试缓存
        print("\n=== Testing Cache ===")
        bilibili2 = ProviderLoader.load_provider('bilibili', {'uid': 123456})
        print(f"Same instance: {bilibili is bilibili2}")
        print(f"Cache stats: {ProviderLoader.get_cache_stats()}")

        # 加载不同配置的实例
        bilibili3 = ProviderLoader.load_provider('bilibili', {'uid': 789012})
        print(f"Different instance: {bilibili is not bilibili3}")
        print(f"Cache stats: {ProviderLoader.get_cache_stats()}")

        # 清除缓存
        ProviderLoader.clear_cache()
        print(f"After clear: {ProviderLoader.get_cache_stats()}")

    asyncio.run(test())
