"""
Provider 加载器
动态加载和管理不同的数据源 Provider
"""
from typing import Optional, Dict, Any
from .bilibili_provider import BilibiliProvider
from .weibo_provider import WeiboProvider
from .xiaohongshu_provider import XiaohongshuProvider


class ProviderLoader:
    """Provider 动态加载器"""
    
    # 注册的 Provider 类型
    PROVIDERS = {
        'bilibili': BilibiliProvider,
        'weibo': WeiboProvider,
        'xiaohongshu': XiaohongshuProvider,
    }
    
    @classmethod
    def load_provider(cls, provider_name: str, config: Optional[Dict[str, Any]] = None):
        """
        加载指定的 Provider 实例
        
        Args:
            provider_name: Provider 名称 (bilibili/weibo/xiaohongshu)
            config: Provider 配置参数
            
        Returns:
            Provider 实例
            
        Raises:
            ValueError: 如果 Provider 不存在
        """
        if provider_name not in cls.PROVIDERS:
            raise ValueError(f"Unknown provider: {provider_name}. Available: {list(cls.PROVIDERS.keys())}")
        
        provider_class = cls.PROVIDERS[provider_name]
        config = config or {}
        
        # 根据不同的 Provider 类型初始化
        if provider_name == 'bilibili':
            # B站可能需要凭证
            credential = config.get('credential')
            return provider_class(credential=credential)
        else:
            # 其他 Provider 暂时不需要特殊参数
            return provider_class()
    
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
        info_map = {
            'bilibili': {
                'name': 'bilibili',
                'display_name': 'B站',
                'description': '获取B站UP主的视频和动态',
                'requires_auth': False,
                'config_schema': {
                    'uid': {'type': 'integer', 'required': True, 'description': 'B站用户UID'},
                },
            },
            'weibo': {
                'name': 'weibo',
                'display_name': '微博',
                'description': '获取微博用户的微博动态（当前为模拟数据）',
                'requires_auth': False,
                'config_schema': {
                    'uid': {'type': 'string', 'required': True, 'description': '微博用户UID'},
                },
            },
            'xiaohongshu': {
                'name': 'xiaohongshu',
                'display_name': '小红书',
                'description': '获取小红书用户的笔记（当前为模拟数据）',
                'requires_auth': False,
                'config_schema': {
                    'user_id': {'type': 'string', 'required': True, 'description': '小红书用户ID'},
                },
            },
        }
        
        if provider_name not in info_map:
            raise ValueError(f"Unknown provider: {provider_name}")
        
        return info_map[provider_name]


# 测试代码
if __name__ == '__main__':
    import asyncio
    
    async def test():
        # 列出所有 Provider
        print("Available Providers:", ProviderLoader.list_providers())
        
        # 获取 Provider 信息
        for name in ProviderLoader.list_providers():
            info = ProviderLoader.get_provider_info(name)
            print(f"\n{info['display_name']}: {info['description']}")
        
        # 加载并测试 B站 Provider
        print("\n=== Testing Bilibili Provider ===")
        bilibili = ProviderLoader.load_provider('bilibili')
        user_info = await bilibili.get_user_info(123456)
        print(f"User: {user_info['name']}")
        
        # 加载并测试微博 Provider
        print("\n=== Testing Weibo Provider ===")
        weibo = ProviderLoader.load_provider('weibo')
        posts = await weibo.fetch_user_posts('test_uid', limit=3)
        print(f"Posts: {len(posts)} items")
    
    asyncio.run(test())
