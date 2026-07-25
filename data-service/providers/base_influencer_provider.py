from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from datetime import datetime

class BaseInfluencerProvider(ABC):
    """Base class for all influencer providers"""
    
    def __init__(self, config: Dict):
        """
        Initialize provider with configuration
        
        Args:
            config: Provider configuration dict
                - platform: Platform name
                - driver_type: 'api' or 'crawler'
                - Additional platform-specific config
        """
        self.config = config
        self.platform = config.get('platform')
        self.driver_type = config.get('driver_type', 'api')
    
    @abstractmethod
    async def fetch_user_info(self, account_id: str) -> Dict:
        """
        Fetch user profile information
        
        Args:
            account_id: Platform-specific account identifier
            
        Returns:
            Dict with keys: name, avatar_url, description, verified, followers_count
        """
        pass
    
    @abstractmethod
    async def fetch_user_posts(
        self, 
        account_id: str, 
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        Fetch user's posts/dynamics
        
        Args:
            account_id: Platform-specific account identifier
            since: Only fetch posts after this time (optional)
            limit: Maximum number of posts to fetch
            
        Returns:
            List of post dicts (use normalize_post for standard format)
        """
        pass
    
    @abstractmethod
    async def validate_account(self, account_id: str) -> bool:
        """
        Check if account exists and is accessible
        
        Args:
            account_id: Platform-specific account identifier
            
        Returns:
            True if account exists, False otherwise
        """
        pass
    
    def normalize_post(self, raw_post: Dict) -> Dict:
        """
        Convert platform-specific post format to standard format
        
        Args:
            raw_post: Platform-specific post data
            
        Returns:
            Standardized post dict with keys:
                - content: Post text content
                - url: Original post URL
                - publish_time: datetime object
                - media_type: 'text', 'image', or 'video'
                - media_urls: List of media URLs
                - likes, comments, shares: Engagement metrics
        """
        return {
            'content': raw_post.get('content', ''),
            'url': raw_post.get('url'),
            'publish_time': raw_post.get('publish_time'),
            'media_type': raw_post.get('media_type', 'text'),
            'media_urls': raw_post.get('media_urls', []),
            'likes': raw_post.get('likes', 0),
            'comments': raw_post.get('comments', 0),
            'shares': raw_post.get('shares', 0),
        }
