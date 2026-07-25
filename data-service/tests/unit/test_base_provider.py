import pytest
from abc import ABC
from providers.base_influencer_provider import BaseInfluencerProvider

def test_base_provider_is_abstract():
    """Test that BaseInfluencerProvider cannot be instantiated directly"""
    with pytest.raises(TypeError):
        BaseInfluencerProvider({'platform': 'test'})

def test_base_provider_requires_abstract_methods():
    """Test that subclass must implement all abstract methods"""

    class IncompleteProvider(BaseInfluencerProvider):
        async def fetch_user_info(self, account_id: str):
            return {}

    with pytest.raises(TypeError):
        IncompleteProvider({'platform': 'test'})
