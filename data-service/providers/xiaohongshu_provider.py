"""
Xiaohongshu (小红书) API Provider

使用小红书移动端 Web API 获取用户信息和笔记内容
"""
import json
import logging
from typing import List, Dict, Optional
from datetime import datetime

from providers.base_influencer_provider import BaseInfluencerProvider
from core import (
    BaseHTTPClient,
    get_rate_limiter,
    get_random_user_agent,
    parse_timestamp,
    clean_text,
)

logger = logging.getLogger(__name__)


class XiaohongshuAPIProvider(BaseInfluencerProvider):
    """
    Xiaohongshu API Provider

    使用小红书移动端 Web API 获取：
    - 用户信息（用户名、头像、简介、认证状态）
    - 笔记列表（标题、内容、发布时间、互动数据）
    - 笔记详情（笔记类型、标签、收藏数等）
    """

    def __init__(self, config: Dict):
        super().__init__(config)
        self.base_url = "https://edith.xiaohongshu.com"

        # Cookie configuration (required for authentication)
        self.cookies = config.get('cookies', {})
        if not self.cookies:
            cookie_str = config.get('cookie_str', '')
            if cookie_str:
                self.cookies = self._parse_cookie_string(cookie_str)

        # Initialize HTTP client
        self.client = BaseHTTPClient(
            base_url=self.base_url,
            headers=self._get_default_headers(),
            cookies=self.cookies,
            timeout=config.get('timeout', 10),
            max_retries=config.get('max_retries', 3),
            retry_delay=config.get('retry_delay', 2.0),
        )

        # Rate limiter: 1 request per 2 seconds for Xiaohongshu
        self.rate_limiter = None
        self._rate_limiter_initialized = False

    async def _ensure_rate_limiter(self):
        """Lazy initialization of rate limiter"""
        if not self._rate_limiter_initialized:
            self.rate_limiter = await get_rate_limiter(
                platform='xiaohongshu',
                rate=0.5,  # 0.5 req/s = 1 req per 2 seconds
                capacity=2
            )
            self._rate_limiter_initialized = True

    def _parse_cookie_string(self, cookie_str: str) -> Dict:
        """Parse cookie string into dict"""
        cookies = {}
        for item in cookie_str.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key.strip()] = value.strip()
        return cookies

    def _get_default_headers(self) -> Dict:
        """Get default request headers"""
        return {
            'User-Agent': get_random_user_agent(prefer_desktop=False),  # Mobile UA
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Origin': 'https://www.xiaohongshu.com',
            'Referer': 'https://www.xiaohongshu.com/',
        }

    async def fetch_user_info(self, account_id: str) -> Dict:
        """
        Fetch Xiaohongshu user information

        Args:
            account_id: Xiaohongshu user ID

        Returns:
            Dict with keys: name, avatar_url, description, verified, followers_count
        """
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()

        url = f"/api/sns/web/v1/user/{account_id}"

        try:
            logger.info(f"Fetching Xiaohongshu user info: {account_id}")
            result = await self.client.get(url)

            if not result:
                logger.error(f"Empty response for user {account_id}")
                return {}

            # Check response code
            if result.get('code') != 0:
                error_msg = result.get('msg', 'Unknown error')
                logger.error(f"Xiaohongshu API error: {error_msg}")
                return {}

            data = result.get('data', {})
            if not data:
                logger.error(f"No data in response for user {account_id}")
                return {}

            # Parse user info
            basic_info = data.get('basic_info', {})
            interactions = data.get('interactions', [])

            # Extract follower count
            followers_count = 0
            for interaction in interactions:
                if interaction.get('type') == 'fans':
                    count_str = interaction.get('count', '0')
                    followers_count = self._parse_follower_count(count_str)
                    break

            user_info = {
                'name': basic_info.get('nickname', ''),
                'avatar_url': basic_info.get('images', ''),
                'description': basic_info.get('desc', ''),
                'verified': basic_info.get('red_official_verified', False),
                'followers_count': followers_count,
                'profile_url': f'https://www.xiaohongshu.com/user/profile/{account_id}'
            }

            logger.info(f"Successfully fetched Xiaohongshu user info: {user_info.get('name')}")
            return user_info

        except Exception as e:
            logger.error(f"Failed to fetch Xiaohongshu user info: {e}", exc_info=True)
            return {}

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        Fetch Xiaohongshu user posts (notes)

        Args:
            account_id: Xiaohongshu user ID
            since: Only fetch posts after this time (optional)
            limit: Maximum number of posts to fetch

        Returns:
            List of post dicts with standard format
        """
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()

        url = "/api/sns/web/v1/user_posted"
        params = {
            'user_id': account_id,
            'num': min(limit, 30),  # API supports max 30 per request
        }

        try:
            logger.info(f"Fetching Xiaohongshu posts for user {account_id} (limit={limit})")
            result = await self.client.get(url, params=params)

            if not result:
                logger.error(f"Empty response for user posts {account_id}")
                return []

            # Check response code
            if result.get('code') != 0:
                error_msg = result.get('msg', 'Unknown error')
                logger.error(f"Xiaohongshu API error: {error_msg}")
                return []

            data = result.get('data', {})
            notes = data.get('notes', [])

            if not notes:
                logger.info(f"No posts found for user {account_id}")
                return []

            # Parse posts
            parsed_posts = []
            for note in notes:
                parsed_post = self._parse_note(note, account_id)
                if parsed_post:
                    # Filter by since parameter if provided
                    if since:
                        pub_time = parsed_post.get('publish_time')
                        if pub_time and pub_time < since:
                            continue
                    parsed_posts.append(parsed_post)

            # Apply limit
            result_posts = parsed_posts[:limit]
            logger.info(f"Fetched {len(result_posts)} posts for Xiaohongshu user {account_id}")
            return result_posts

        except Exception as e:
            logger.error(f"Failed to fetch Xiaohongshu posts: {e}", exc_info=True)
            return []

    async def validate_account(self, account_id: str) -> bool:
        """
        Validate if Xiaohongshu account exists

        Args:
            account_id: Xiaohongshu user ID

        Returns:
            True if account exists, False otherwise
        """
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info and user_info.get('name'))

    def _parse_note(self, raw: Dict, account_id: str) -> Optional[Dict]:
        """
        Parse Xiaohongshu note to standard format

        Args:
            raw: Raw note data from API
            account_id: User ID (for constructing URL)

        Returns:
            Standardized post dict or None if parsing fails
        """
        try:
            note_id = raw.get('note_id', '')
            if not note_id:
                logger.warning("Note missing note_id, skipping")
                return None

            # Extract basic info
            title = raw.get('title', '')
            content = raw.get('desc', '')
            full_content = f"{title}\n{content}".strip() if title else content

            # Clean content
            full_content = clean_text(full_content)

            # Determine media type
            note_type = raw.get('type', '')
            if note_type == 'video':
                media_type = 'video'
            elif note_type == 'normal':
                media_type = 'image'
            else:
                media_type = 'text'

            # Extract media URLs
            media_urls = []
            cover = raw.get('cover', {})
            if isinstance(cover, dict):
                url_default = cover.get('url_default', '')
                if url_default:
                    media_urls.append(url_default)

            # Extract engagement metrics
            interact_info = raw.get('interact_info', {})
            likes = interact_info.get('liked_count', 0)

            # Convert string to int if needed
            if isinstance(likes, str):
                likes = int(likes) if likes.isdigit() else 0

            # Parse timestamp
            last_update_time = raw.get('last_update_time')
            publish_time = parse_timestamp(last_update_time)

            # Build post URL
            url = f"https://www.xiaohongshu.com/explore/{note_id}"

            # Extract extra data for XiaohongshuPostExtra table
            tag_list = raw.get('tag_list', [])
            tags = [tag.get('name', '') for tag in tag_list if isinstance(tag, dict)]

            # Store extra data in the post dict (will be saved to XiaohongshuPostExtra)
            extra_data = {
                'noteType': note_type,
                'tags': json.dumps(tags, ensure_ascii=False),
                'collects': 0,  # Not available in basic API response
                'hasGoodsLink': False,  # Would need detailed API
                'topicIds': None,
            }

            return {
                'content': full_content,
                'url': url,
                'publish_time': publish_time,
                'media_type': media_type,
                'media_urls': media_urls,
                'likes': likes,
                'comments': 0,  # Not available in list API
                'shares': 0,  # Not available in list API
                'extra_data': extra_data,  # Platform-specific data
            }

        except Exception as e:
            logger.error(f"Failed to parse note: {e}", exc_info=True)
            return None

    def _parse_follower_count(self, count_str: str) -> int:
        """
        Parse follower count string (e.g., "1.2万", "10.5K")

        Args:
            count_str: Follower count string

        Returns:
            Follower count as integer
        """
        if not count_str or not isinstance(count_str, str):
            return 0

        count_str = count_str.strip()

        try:
            # Check for Chinese units
            if '万' in count_str:
                number = float(count_str.replace('万', ''))
                return int(number * 10000)
            elif 'w' in count_str.lower():
                number = float(count_str.lower().replace('w', ''))
                return int(number * 10000)
            elif 'k' in count_str.lower():
                number = float(count_str.lower().replace('k', ''))
                return int(number * 1000)
            else:
                # Try direct conversion
                return int(float(count_str))
        except (ValueError, TypeError):
            logger.warning(f"Failed to parse follower count: {count_str}")
            return 0
