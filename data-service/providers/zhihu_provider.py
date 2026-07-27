"""
Zhihu Provider - 知乎数据提供者

使用知乎半公开 API 获取用户信息和动态数据。
支持内容类型：answer（回答）、article（文章）、pin（想法）、video（视频）
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

from providers.base_influencer_provider import BaseInfluencerProvider
from core import (
    BaseHTTPClient,
    get_rate_limiter,
    get_random_user_agent,
    parse_timestamp,
)

logger = logging.getLogger(__name__)


class ZhihuAPIProvider(BaseInfluencerProvider):
    """Zhihu API Provider using semi-public APIs"""

    def __init__(self, config: Dict):
        super().__init__(config)
        self.base_url = "https://www.zhihu.com"

        # Rate limiter will be initialized lazily (1 req/3s for Zhihu)
        self.rate_limiter = None
        self._rate_limiter_initialized = False

        # Parse cookies from config
        self.cookies = config.get('cookies', {})
        if not self.cookies:
            cookie_str = config.get('cookie_str', '')
            if cookie_str:
                self.cookies = self._parse_cookie_string(cookie_str)

        # Initialize HTTP client
        self.http_client = BaseHTTPClient(
            base_url=self.base_url,
            headers=self._get_default_headers(),
            cookies=self.cookies,
            timeout=config.get('timeout', 10),
            max_retries=config.get('max_retries', 3),
            retry_delay=config.get('retry_delay', 2),
        )

    def _parse_cookie_string(self, cookie_str: str) -> Dict:
        """Parse cookie string into dict"""
        cookies = {}
        for item in cookie_str.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key.strip()] = value.strip()
        return cookies

    async def _ensure_rate_limiter(self):
        """Initialize rate limiter lazily"""
        if not self._rate_limiter_initialized:
            # 1 req/3s = 0.333 req/s, capacity=3 allows small bursts
            self.rate_limiter = await get_rate_limiter('zhihu', rate=1/3, capacity=3)
            self._rate_limiter_initialized = True

    def _get_default_headers(self) -> Dict:
        """Get default request headers with anti-crawler protection"""
        return {
            'User-Agent': get_random_user_agent(),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.zhihu.com/',
            'Origin': 'https://www.zhihu.com',
            'x-requested-with': 'fetch',
        }

    async def fetch_user_info(self, account_id: str) -> Dict:
        """
        Fetch Zhihu user information

        Args:
            account_id: Zhihu url_token (e.g., 'excited-vczh')

        Returns:
            Dict with user info: name, avatar_url, description, verified, followers_count
        """
        # Apply rate limiting
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()

        url = f"/api/v4/members/{account_id}"
        params = {
            'include': 'allow_message,is_followed,is_following,is_org,is_blocking,employments,answer_count,follower_count,articles_count,gender,badge[?(type=best_answerer)].topics'
        }

        try:
            result = await self.http_client.get(url, params=params)

            if not result:
                logger.error(f"Failed to fetch Zhihu user info for {account_id}")
                return {}

            # Check for error response
            if 'error' in result:
                error_msg = result.get('error', {}).get('message', 'Unknown error')
                logger.error(f"Zhihu API error: {error_msg}")
                return {}

            # Parse user data
            name = result.get('name', '')
            avatar_url = result.get('avatar_url', '').replace('_is', '_xl')  # Get larger avatar
            headline = result.get('headline', '')
            description = result.get('description', headline)
            is_org = result.get('is_org', False)

            # Check verification badge
            badge = result.get('badge', [])
            verified = is_org or len(badge) > 0

            # Get follower count
            followers_count = result.get('follower_count', 0)

            # Build profile URL
            url_token = result.get('url_token', account_id)
            profile_url = f"https://www.zhihu.com/people/{url_token}"

            logger.info(f"Successfully fetched Zhihu user info for {account_id}")

            return {
                'name': name,
                'avatar_url': avatar_url,
                'description': description,
                'verified': verified,
                'followers_count': followers_count,
                'profile_url': profile_url,
            }

        except Exception as e:
            logger.error(f"Failed to fetch Zhihu user info: {e}", exc_info=True)
            return {}

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        Fetch Zhihu user activities (answers, articles, pins, etc.)

        Args:
            account_id: Zhihu url_token
            since: Only fetch posts after this time (optional)
            limit: Maximum number of posts to fetch

        Returns:
            List of post dicts in standard format
        """
        # First get user ID from url_token
        user_info = await self.fetch_user_info(account_id)
        if not user_info:
            logger.error(f"Cannot fetch posts: user {account_id} not found")
            return []

        # Apply rate limiting
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()

        # Zhihu uses numeric ID for activities API, need to extract from profile
        # For simplicity, we'll fetch activities using url_token with a different endpoint
        url = f"/api/v4/members/{account_id}/activities"
        params = {
            'limit': min(limit, 20),  # Zhihu API typically limits to 20 per request
            'desktop': 'true',
        }

        try:
            result = await self.http_client.get(url, params=params)

            if not result:
                logger.error(f"Failed to fetch Zhihu posts for {account_id}")
                return []

            # Check for error response
            if 'error' in result:
                error_msg = result.get('error', {}).get('message', 'Unknown error')
                logger.error(f"Zhihu API error: {error_msg}")
                return []

            # Parse activities
            data = result.get('data', [])
            posts = []

            for item in data:
                post = self._parse_activity(item)
                if post:
                    # Filter by since parameter if provided
                    if since and post.get('publish_time'):
                        if post['publish_time'] < since:
                            continue
                    posts.append(post)

            # Apply limit
            posts = posts[:limit]

            logger.info(f"Fetched {len(posts)} posts for Zhihu user {account_id} (since: {since})")
            return posts

        except Exception as e:
            logger.error(f"Failed to fetch Zhihu posts: {e}", exc_info=True)
            return []

    async def validate_account(self, account_id: str) -> bool:
        """
        Validate if Zhihu account exists

        Args:
            account_id: Zhihu url_token

        Returns:
            True if account exists, False otherwise
        """
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info and user_info.get('name'))

    def _parse_activity(self, raw: Dict) -> Optional[Dict]:
        """
        Parse Zhihu activity to standard format

        Handles different content types: answer, article, pin, video
        """
        try:
            activity_type = raw.get('type', '')
            target = raw.get('target', {})

            if not target:
                return None

            # Determine content type
            content_type = self._determine_content_type(activity_type, target)
            if not content_type:
                return None

            # Extract common fields
            created_time = target.get('created_time') or target.get('created')
            publish_time = None
            if created_time:
                publish_time = parse_timestamp(created_time)

            # Parse based on content type
            if content_type == 'answer':
                return self._parse_answer(target, publish_time)
            elif content_type == 'article':
                return self._parse_article(target, publish_time)
            elif content_type == 'pin':
                return self._parse_pin(target, publish_time)
            elif content_type == 'video':
                return self._parse_video(target, publish_time)
            else:
                return None

        except Exception as e:
            logger.warning(f"Failed to parse Zhihu activity: {e}")
            return None

    def _determine_content_type(self, activity_type: str, target: Dict) -> Optional[str]:
        """Determine content type from activity"""
        # Check target type first
        target_type = target.get('type', '').lower()

        if 'answer' in activity_type.lower() or target_type == 'answer':
            return 'answer'
        elif 'article' in activity_type.lower() or target_type == 'article':
            return 'article'
        elif 'pin' in activity_type.lower() or target_type == 'pin':
            return 'pin'
        elif 'video' in activity_type.lower() or target_type == 'zvideo':
            return 'video'

        return None

    def _parse_answer(self, target: Dict, publish_time: Optional[datetime]) -> Dict:
        """Parse answer (回答)"""
        # Extract answer content
        content = target.get('content', '') or target.get('excerpt', '')

        # Extract question info
        question = target.get('question', {})
        question_id = str(question.get('id', ''))
        question_title = question.get('title', '')

        # Build URL
        answer_id = target.get('id')
        url = f"https://www.zhihu.com/question/{question_id}/answer/{answer_id}"

        # Extract metrics
        voteup_count = target.get('voteup_count', 0)
        votedown_count = target.get('votedown_count', 0)
        comment_count = target.get('comment_count', 0)
        is_featured = target.get('is_featured', False)

        return {
            'content': f"{question_title}\n\n{content}",
            'url': url,
            'publish_time': publish_time,
            'media_type': 'text',
            'media_urls': [],
            'likes': voteup_count,
            'comments': comment_count,
            'shares': 0,  # Zhihu doesn't provide share count directly
            # Extra fields for ZhihuPostExtra
            'extra': {
                'contentType': 'answer',
                'questionId': question_id,
                'questionTitle': question_title,
                'voteupCount': voteup_count,
                'votedownCount': votedown_count,
                'isFeatured': is_featured,
            }
        }

    def _parse_article(self, target: Dict, publish_time: Optional[datetime]) -> Dict:
        """Parse article (文章)"""
        title = target.get('title', '')
        excerpt = target.get('excerpt', '')
        content = f"{title}\n\n{excerpt}"

        # Build URL
        article_id = target.get('id')
        url = f"https://zhuanlan.zhihu.com/p/{article_id}"

        # Extract metrics
        voteup_count = target.get('voteup_count', 0)
        comment_count = target.get('comment_count', 0)

        # Detect media type from image_url
        image_url = target.get('image_url', '')
        media_urls = [image_url] if image_url else []

        return {
            'content': content,
            'url': url,
            'publish_time': publish_time,
            'media_type': 'image' if media_urls else 'text',
            'media_urls': media_urls,
            'likes': voteup_count,
            'comments': comment_count,
            'shares': 0,
            'extra': {
                'contentType': 'article',
                'questionId': None,
                'questionTitle': None,
                'voteupCount': voteup_count,
                'votedownCount': 0,
                'isFeatured': False,
            }
        }

    def _parse_pin(self, target: Dict, publish_time: Optional[datetime]) -> Dict:
        """Parse pin (想法)"""
        content_list = target.get('content', [])

        # Parse content array (Zhihu pins use structured content)
        content_text = ''
        media_urls = []

        if isinstance(content_list, list):
            for item in content_list:
                if isinstance(item, dict):
                    item_type = item.get('type', '')
                    if item_type == 'text':
                        content_text += item.get('content', '')
                    elif item_type == 'image':
                        image_url = item.get('url', '')
                        if image_url:
                            media_urls.append(image_url)
                    elif item_type == 'video':
                        video_url = item.get('url', '')
                        if video_url:
                            media_urls.append(video_url)

        # Fallback to excerpt if content parsing failed
        if not content_text:
            content_text = target.get('excerpt_title', '')

        # Build URL
        pin_id = target.get('id')
        url = f"https://www.zhihu.com/pin/{pin_id}"

        # Extract metrics
        like_count = target.get('like_count', 0)
        comment_count = target.get('comment_count', 0)

        # Determine media type
        media_type = 'text'
        if media_urls:
            # Check if any URL suggests video
            has_video = any('video' in url.lower() for url in media_urls)
            media_type = 'video' if has_video else 'image'

        return {
            'content': content_text,
            'url': url,
            'publish_time': publish_time,
            'media_type': media_type,
            'media_urls': media_urls,
            'likes': like_count,
            'comments': comment_count,
            'shares': 0,
            'extra': {
                'contentType': 'pin',
                'questionId': None,
                'questionTitle': None,
                'voteupCount': like_count,
                'votedownCount': 0,
                'isFeatured': False,
            }
        }

    def _parse_video(self, target: Dict, publish_time: Optional[datetime]) -> Dict:
        """Parse video (视频)"""
        title = target.get('title', '')
        description = target.get('description', '')
        content = f"{title}\n\n{description}"

        # Build URL
        video_id = target.get('id')
        url = f"https://www.zhihu.com/zvideo/{video_id}"

        # Extract video URL
        video_url = target.get('video', {}).get('playlist_url', '')
        media_urls = [video_url] if video_url else []

        # Extract metrics
        like_count = target.get('like_count', 0)
        comment_count = target.get('comment_count', 0)

        return {
            'content': content,
            'url': url,
            'publish_time': publish_time,
            'media_type': 'video',
            'media_urls': media_urls,
            'likes': like_count,
            'comments': comment_count,
            'shares': 0,
            'extra': {
                'contentType': 'video',
                'questionId': None,
                'questionTitle': None,
                'voteupCount': like_count,
                'votedownCount': 0,
                'isFeatured': False,
            }
        }

    async def close(self):
        """Close HTTP client session"""
        await self.http_client.close()
