import pytest
from providers.provider_registry import InfluencerProviderRegistry
from providers.base_influencer_provider import BaseInfluencerProvider

class MockProvider(BaseInfluencerProvider):
    """Mock provider for testing"""
    async def fetch_user_info(self, account_id: str):
        return {'name': 'test'}

    async def fetch_user_posts(self, account_id: str, since=None, limit=20):
        return []

    async def validate_account(self, account_id: str):
        return True

def test_register_and_get_provider():
    """Test registering and retrieving a provider"""
    # Register mock provider
    InfluencerProviderRegistry.register_provider('test_api', MockProvider)

    # Retrieve it
    provider_class = InfluencerProviderRegistry.get_provider('test', 'api')

    assert provider_class == MockProvider

def test_get_nonexistent_provider_raises_error():
    """Test that getting unknown provider raises ValueError"""
    with pytest.raises(ValueError, match="Unsupported provider"):
        InfluencerProviderRegistry.get_provider('nonexistent', 'api')

def test_get_provider_with_default_driver():
    """Test get_provider defaults to 'api' driver"""
    InfluencerProviderRegistry.register_provider('default_api', MockProvider)

    provider_class = InfluencerProviderRegistry.get_provider('default')

    assert provider_class == MockProvider
