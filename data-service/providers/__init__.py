"""
Influencer Provider System
Pluggable providers for different platforms
"""

from providers.weibo_provider import WeiboAPIProvider
from providers.provider_registry import InfluencerProviderRegistry

__version__ = "1.0.0"

# Register providers
InfluencerProviderRegistry.register_provider('weibo_api', WeiboAPIProvider)
