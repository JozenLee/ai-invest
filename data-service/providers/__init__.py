"""
Influencer Provider System
Pluggable providers for different platforms
"""

from providers.weibo_provider import WeiboAPIProvider
from providers.bilibili_provider import BilibiliAPIProvider
from providers.zhihu_provider import ZhihuAPIProvider
from providers.xiaohongshu_provider import XiaohongshuAPIProvider
from providers.douyin_provider import DouyinCrawlerProvider
from providers.alipay_provider import AlipayAPIProvider
from providers.provider_registry import InfluencerProviderRegistry

__version__ = "1.0.0"

# Register providers
InfluencerProviderRegistry.register_provider('weibo_api', WeiboAPIProvider)
InfluencerProviderRegistry.register_provider('bilibili_api', BilibiliAPIProvider)
InfluencerProviderRegistry.register_provider('zhihu_api', ZhihuAPIProvider)
InfluencerProviderRegistry.register_provider('xiaohongshu_api', XiaohongshuAPIProvider)
InfluencerProviderRegistry.register_provider('douyin_crawler', DouyinCrawlerProvider)
InfluencerProviderRegistry.register_provider('alipay_api', AlipayAPIProvider)
