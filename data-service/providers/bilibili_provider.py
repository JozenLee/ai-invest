import aiohttp
import asyncio
import logging
from typing import List, Dict, Optional
from datetime import datetime
from providers.base_influencer_provider import BaseInfluencerProvider

logger = logging.getLogger(__name__)

class BilibiliAPIProvider(BaseInfluencerProvider):
    """Bilibili Open Platform API Provider"""

    def __init__(self, config: Dict):
        super().__init__(config)
        self.api_key = config.get('api_key')
        self.access_token = config.get('access_token')
        self.base_url = "https://api.bilibili.com"
        self.retry_delay = config.get('retry_delay', 2)  # 重试延迟（秒）
        self.max_retries = config.get('max_retries', 3)  # 最大重试次数

        # Cookie 配置（用于绕过反爬虫）
        self.cookies = config.get('cookies', {})

    async def fetch_user_info(self, account_id: str) -> Dict:
        """Fetch Bilibili user information with retry logic"""
        url = f"{self.base_url}/x/space/acc/info"
        params = {
            'mid': account_id
        }

        headers = self._get_headers(f'https://space.bilibili.com/{account_id}')

        for attempt in range(self.max_retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                        if response.status == 200:
                            result = await response.json()
                            if result.get('code') == 0:
                                data = result.get('data', {})
                                official = data.get('official', {})
                                logger.info(f"Successfully fetched Bilibili user info for {account_id}")
                                return {
                                    'name': data.get('name'),
                                    'avatar_url': data.get('face'),
                                    'description': data.get('sign'),
                                    'verified': official.get('type', -1) >= 0,
                                    'followers_count': data.get('follower', 0)
                                }
                            elif result.get('code') == -799:
                                # 请求过于频繁，需要等待
                                logger.warning(f"Bilibili rate limit hit (attempt {attempt + 1}/{self.max_retries}), waiting {self.retry_delay}s...")
                                if attempt < self.max_retries - 1:
                                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                                    continue
                            else:
                                logger.error(f"Bilibili API error code: {result.get('code')}, message: {result.get('message')}")
                                return {}
                        elif response.status == 412:
                            # 反爬虫拦截
                            logger.warning(f"Bilibili anti-bot protection triggered (attempt {attempt + 1}/{self.max_retries})")
                            if attempt < self.max_retries - 1:
                                await asyncio.sleep(self.retry_delay * (attempt + 1))
                                continue
                            return {}
                        else:
                            logger.error(f"Bilibili API HTTP error: {response.status}")
                            return {}
            except asyncio.TimeoutError:
                logger.warning(f"Bilibili API timeout (attempt {attempt + 1}/{self.max_retries})")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    continue
            except Exception as e:
                logger.error(f"Failed to fetch Bilibili user info: {e}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    continue

        return {}

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """Fetch Bilibili user dynamics with retry logic"""
        url = f"{self.base_url}/x/polymer/web-dynamic/v1/feed/space"
        params = {
            'host_mid': account_id
        }

        headers = self._get_headers(f'https://space.bilibili.com/{account_id}/dynamic')

        for attempt in range(self.max_retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                        if response.status == 200:
                            result = await response.json()
                            if result.get('code') == 0:
                                data = result.get('data', {})
                                items = data.get('items', [])

                                # Parse all items first
                                parsed_posts = []
                                for item in items:
                                    parsed = self._parse_dynamic(item)
                                    if parsed:  # 只添加成功解析的项
                                        parsed_posts.append(parsed)

                                # Filter by since parameter if provided
                                if since:
                                    parsed_posts = [
                                        post for post in parsed_posts
                                        if post.get('publish_time') and post['publish_time'] > since
                                    ]

                                # Apply limit after filtering
                                result_posts = parsed_posts[:limit]
                                logger.info(f"Successfully fetched {len(result_posts)} Bilibili posts for {account_id}")
                                return result_posts
                            elif result.get('code') == -799:
                                # 请求过于频繁
                                logger.warning(f"Bilibili rate limit hit when fetching posts (attempt {attempt + 1}/{self.max_retries})")
                                if attempt < self.max_retries - 1:
                                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                                    continue
                            else:
                                logger.error(f"Bilibili API error code: {result.get('code')}, message: {result.get('message')}")
                                return []
                        elif response.status == 412:
                            logger.warning(f"Bilibili anti-bot protection when fetching posts (attempt {attempt + 1}/{self.max_retries})")
                            if attempt < self.max_retries - 1:
                                await asyncio.sleep(self.retry_delay * (attempt + 1))
                                continue
                            return []
                        else:
                            logger.error(f"Bilibili API HTTP error: {response.status}")
                            return []
            except asyncio.TimeoutError:
                logger.warning(f"Bilibili API timeout when fetching posts (attempt {attempt + 1}/{self.max_retries})")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    continue
            except Exception as e:
                logger.error(f"Failed to fetch Bilibili posts: {e}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    continue

        return []

    async def validate_account(self, account_id: str) -> bool:
        """Validate if Bilibili account exists"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info)

    def _get_headers(self, referer: str) -> Dict[str, str]:
        """Get request headers with anti-bot measures"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': referer,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Origin': 'https://space.bilibili.com',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
        }

        # 添加 Cookie（如果配置了）
        if self.cookies:
            cookie_parts = []
            for key, value in self.cookies.items():
                cookie_parts.append(f"{key}={value}")
            headers['Cookie'] = "; ".join(cookie_parts)
            logger.debug("Using Bilibili cookies for authentication")

        return headers

    def _parse_dynamic(self, raw: Dict) -> Dict:
        """Parse Bilibili dynamic to standard format"""
        if not raw or not isinstance(raw, dict):
            logger.warning(f"Invalid dynamic data: {type(raw)}")
            return None

        dynamic_id = raw.get('id_str', '')
        modules = raw.get('modules') or {}

        # Extract content
        module_dynamic = modules.get('module_dynamic') or {}
        desc = module_dynamic.get('desc') or {}
        content = desc.get('text', '')

        # Extract stats
        module_stat = modules.get('module_stat') or {}
        likes_obj = module_stat.get('like') or {}
        comments_obj = module_stat.get('comment') or {}
        forward_obj = module_stat.get('forward') or {}

        likes = likes_obj.get('count', 0) if isinstance(likes_obj, dict) else 0
        comments = comments_obj.get('count', 0) if isinstance(comments_obj, dict) else 0
        shares = forward_obj.get('count', 0) if isinstance(forward_obj, dict) else 0

        # Determine media type
        dynamic_type = raw.get('type', '')
        media_type = 'video' if 'AV' in dynamic_type or 'VIDEO' in dynamic_type else 'text'

        # Build URL
        basic = raw.get('basic') or {}
        comment_id = basic.get('comment_id_str', dynamic_id)
        url = f"https://www.bilibili.com/opus/{comment_id}"

        # Extract timestamp (Bilibili uses Unix timestamp in module_author)
        publish_time = None
        module_author = modules.get('module_author') or {}
        pub_ts = module_author.get('pub_ts')
        if pub_ts:
            try:
                # 转换为整数（API 可能返回字符串）
                if isinstance(pub_ts, str):
                    pub_ts = int(pub_ts)

                # Bilibili 使用秒级时间戳
                # 验证时间戳是否在合理范围内（2020-2100年）
                if 1577836800 < pub_ts < 4102444800:  # 2020年1月1日 到 2100年1月1日
                    publish_time = datetime.fromtimestamp(pub_ts)
                else:
                    logger.debug(f"Timestamp out of range for dynamic {dynamic_id}: {pub_ts}")
            except (ValueError, TypeError, OSError, OverflowError) as e:
                logger.debug(f"Invalid timestamp for dynamic {dynamic_id}: {pub_ts}, error: {e}")

        return {
            'content': content,
            'url': url,
            'publish_time': publish_time,
            'media_type': media_type,
            'media_urls': [],
            'likes': likes,
            'comments': comments,
            'shares': shares,
        }
