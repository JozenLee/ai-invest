import aiohttp
import logging
from typing import List, Dict, Optional
from datetime import datetime
from dateutil import parser
from providers.base_influencer_provider import BaseInfluencerProvider

logger = logging.getLogger(__name__)

class WeiboAPIProvider(BaseInfluencerProvider):
    """Weibo Open Platform API Provider"""

    def __init__(self, config: Dict):
        super().__init__(config)
        self.api_key = config.get('api_key')
        self.api_secret = config.get('api_secret')
        self.access_token = config.get('access_token')
        self.base_url = "https://api.weibo.com/2"

    async def fetch_user_info(self, account_id: str) -> Dict:
        """Fetch Weibo user information"""
        url = f"{self.base_url}/users/show.json"
        params = {
            'uid': account_id,
            'access_token': self.access_token
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            'name': data.get('screen_name'),
                            'avatar_url': data.get('avatar_large'),
                            'description': data.get('description'),
                            'verified': data.get('verified', False),
                            'followers_count': data.get('followers_count', 0)
                        }
                    else:
                        logger.error(f"Weibo API error: {response.status}")
                        return {}
        except Exception as e:
            logger.error(f"Failed to fetch Weibo user info: {e}")
            return {}

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """Fetch Weibo user timeline"""
        url = f"{self.base_url}/statuses/user_timeline.json"
        params = {
            'uid': account_id,
            'count': min(limit, 100),
            'access_token': self.access_token
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        statuses = data.get('statuses', [])
                        return [self._parse_weibo(status) for status in statuses]
                    else:
                        logger.error(f"Weibo API error: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"Failed to fetch Weibo posts: {e}")
            return []

    async def validate_account(self, account_id: str) -> bool:
        """Validate if Weibo account exists"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info)

    def _parse_weibo(self, raw: Dict) -> Dict:
        """Parse Weibo status to standard format"""
        return {
            'content': raw.get('text', ''),
            'url': f"https://weibo.com/{raw.get('user', {}).get('id')}/{raw.get('id')}",
            'publish_time': self._parse_weibo_time(raw.get('created_at')),
            'media_type': 'image' if raw.get('pic_urls') else 'text',
            'media_urls': [pic['thumbnail_pic'] for pic in raw.get('pic_urls', [])],
            'likes': raw.get('attitudes_count', 0),
            'comments': raw.get('comments_count', 0),
            'shares': raw.get('reposts_count', 0),
        }

    def _parse_weibo_time(self, time_str: str) -> datetime:
        """Parse Weibo time format: 'Tue May 31 17:46:55 +0800 2011'"""
        try:
            return parser.parse(time_str)
        except:
            return datetime.now()
