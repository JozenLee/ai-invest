from typing import Dict, Type
from providers.base_influencer_provider import BaseInfluencerProvider

class InfluencerProviderRegistry:
    """
    Registry for managing influencer providers
    Supports dynamic registration and retrieval by platform + driver type
    """

    _providers: Dict[str, Type[BaseInfluencerProvider]] = {}

    @classmethod
    def register_provider(cls, key: str, provider_class: Type[BaseInfluencerProvider]):
        """
        Register a provider class

        Args:
            key: Registry key (format: "platform_drivertype", e.g. "weibo_api")
            provider_class: Provider class (subclass of BaseInfluencerProvider)
        """
        cls._providers[key] = provider_class

    @classmethod
    def get_provider(cls, platform: str, driver_type: str = 'api') -> Type[BaseInfluencerProvider]:
        """
        Get provider class by platform and driver type

        Args:
            platform: Platform name (e.g. 'weibo', 'bilibili')
            driver_type: Driver type ('api' or 'crawler'), defaults to 'api'

        Returns:
            Provider class

        Raises:
            ValueError: If provider not found
        """
        key = f"{platform}_{driver_type}"
        provider_class = cls._providers.get(key)

        if not provider_class:
            raise ValueError(f"Unsupported provider: {key}")

        return provider_class

    @classmethod
    def list_providers(cls) -> Dict[str, Type[BaseInfluencerProvider]]:
        """Get all registered providers"""
        return cls._providers.copy()

    @classmethod
    def clear(cls):
        """Clear all registered providers (for testing)"""
        cls._providers.clear()
