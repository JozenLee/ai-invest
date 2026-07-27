import aiohttp
import asyncio
import logging
from typing import List, Dict, Optional
from datetime import datetime
from providers.base_influencer_provider import BaseInfluencerProvider

logger = logging.getLogger(__name__)


def extract_category_from_official(user_info: Dict) -> str:
    """
    从Bilibili用户认证信息中提取领域分类

    Args:
        user_info: fetch_user_info返回的用户信息字典

    Returns:
        领域分类字符串
    """
    official = user_info.get('official', {})
    if not official or official.get('type', -1) < 0:
        return '未分类'

    # 优先从title提取
    title = official.get('title', '')
    if title:
        category = _extract_category_from_text(title)
        if category:
            return category

    # 其次从desc提取
    desc = official.get('desc', '')
    if desc:
        category = _extract_category_from_text(desc)
        if category:
            return category

    return '未分类'


def _extract_category_from_text(text: str) -> str:
    """
    从文本中提取领域关键词

    使用关键词匹配策略
    """
    # 领域关键词映射（按匹配优先级排序）
    category_keywords = {
        '半导体': ['半导体', '芯片', '集成电路', 'IC'],
        'AI': ['AI', '人工智能', '机器学习', '深度学习'],
        '科技': ['科技', '数码', '技术', '互联网'],
        '财经': ['财经', '金融', '投资', '股票', '基金'],
        '汽车': ['汽车', '新能源车', '电动车'],
        '医药': ['医药', '医疗', '生物'],
        '消费': ['消费', '零售', '电商'],
        '能源': ['能源', '电力', '光伏', '风电'],
    }

    text_lower = text.lower()

    # 遍历关键词进行匹配
    for category, keywords in category_keywords.items():
        for keyword in keywords:
            if keyword.lower() in text_lower:
                return category

    return ''


class BilibiliAPIProvider(BaseInfluencerProvider):
    """Bilibili Open Platform API Provider"""

    def __init__(self, config: Dict):
        super().__init__(config)
        self.api_key = config.get('api_key')
        self.access_token = config.get('access_token')
        self.base_url = "https://api.bilibili.com"

        # Cookie configuration for authentication
        self.cookies = config.get('cookies', {})
        if not self.cookies:
            # Use default cookie string from config
            cookie_str = config.get('cookie_str', '')
            if cookie_str:
                self.cookies = self._parse_cookie_string(cookie_str)

    def _parse_cookie_string(self, cookie_str: str) -> Dict:
        """Parse cookie string into dict"""
        cookies = {}
        for item in cookie_str.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key.strip()] = value.strip()
        return cookies

    def _get_headers(self, account_id: str = None) -> Dict:
        """Get request headers with anti-crawler protection"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }

        if account_id:
            headers['Referer'] = f'https://space.bilibili.com/{account_id}'
            headers['Origin'] = 'https://space.bilibili.com'

        return headers

    async def fetch_user_info(self, account_id: str, retry_count: int = 0) -> Dict:
        """Fetch Bilibili user information with retry logic"""
        url = f"{self.base_url}/x/space/acc/info"
        params = {'mid': account_id}
        headers = self._get_headers(account_id)

        max_retries = self.config.get('max_retries', 3)
        retry_delay = self.config.get('retry_delay', 2)

        try:
            async with aiohttp.ClientSession(cookies=self.cookies) as session:
                # Add progressive delay to avoid rate limiting
                base_delay = 1.5 if retry_count == 0 else retry_delay * (retry_count + 1)
                await asyncio.sleep(base_delay)

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
                                'profile_url': f'https://space.bilibili.com/{account_id}'
                            }
                        else:
                            error_code = result.get('code')
                            error_msg = result.get('message')

                            # Handle rate limiting with retry
                            if error_code == -799 and retry_count < max_retries:
                                wait_time = retry_delay * (2 ** retry_count)  # Exponential backoff
                                logger.warning(f"Bilibili rate limit hit (attempt {retry_count + 1}/{max_retries}), retrying in {wait_time}s...")
                                await asyncio.sleep(wait_time)
                                return await self.fetch_user_info(account_id, retry_count + 1)

                            logger.error(f"Bilibili API error code: {error_code}, message: {error_msg}")
                            return {}
                    else:
                        logger.error(f"Bilibili API HTTP error: {response.status}")
                        return {}
        except asyncio.TimeoutError:
            logger.error(f"Timeout fetching Bilibili user info for {account_id}")
            return {}
        except Exception as e:
            logger.error(f"Failed to fetch Bilibili user info: {e}")
            return {}

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        Fetch Bilibili user dynamics

        Note: Bilibili web API only returns recent dynamics (typically ~20 items).
        For historical data within retention period, multiple fetches may be needed.
        """
        url = f"{self.base_url}/x/polymer/web-dynamic/v1/feed/space"
        params = {'host_mid': account_id}
        headers = self._get_headers(account_id)

        try:
            async with aiohttp.ClientSession(cookies=self.cookies) as session:
                # Add delay to avoid rate limiting
                await asyncio.sleep(1)

                async with session.get(url, params=params, headers=headers) as response:
                    if response.status == 200:
                        result = await response.json()
                        if result.get('code') == 0:
                            data = result.get('data', {})
                            items = data.get('items', [])

                            # Parse all items first
                            parsed_posts = [self._parse_dynamic(item) for item in items]

                            # Filter by since parameter if provided
                            # Keep posts that are >= since (within retention period)
                            if since:
                                filtered_posts = []
                                for post in parsed_posts:
                                    pub_time = post.get('publish_time')
                                    if pub_time:
                                        # Keep posts published on or after the since date
                                        if pub_time >= since:
                                            filtered_posts.append(post)
                                    else:
                                        # Keep posts without timestamp (safer approach)
                                        filtered_posts.append(post)
                                parsed_posts = filtered_posts

                            # Apply limit after filtering
                            result_posts = parsed_posts[:limit]
                            logger.info(f"Fetched {len(result_posts)} posts for Bilibili user {account_id} (since: {since})")
                            return result_posts
                        else:
                            error_code = result.get('code')
                            error_msg = result.get('message')
                            if error_code == -799:
                                logger.warning(f"Bilibili rate limit exceeded (code: -799). Please wait before retrying.")
                            else:
                                logger.error(f"Bilibili API error code: {error_code}, message: {error_msg}")
                            return []
                    else:
                        logger.error(f"Bilibili API HTTP error: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"Failed to fetch Bilibili posts: {e}", exc_info=True)
            return []

    async def validate_account(self, account_id: str) -> bool:
        """Validate if Bilibili account exists"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info)

    def _parse_dynamic(self, raw: Dict) -> Dict:
        """Parse Bilibili dynamic to standard format"""
        dynamic_id = raw.get('id_str', '')
        modules = raw.get('modules', {})
        dynamic_type = raw.get('type', '')

        # Extract content based on dynamic type
        module_dynamic = modules.get('module_dynamic', {})
        content = ''

        # Try to get text from desc field (for DYNAMIC_TYPE_WORD, DYNAMIC_TYPE_FORWARD)
        desc = module_dynamic.get('desc')
        if desc and isinstance(desc, dict):
            content = desc.get('text', '')

        # If no content yet, try major field (for videos, articles, etc.)
        if not content:
            major = module_dynamic.get('major', {})
            if major:
                # Video type
                archive = major.get('archive')
                if archive:
                    content = archive.get('title', '') + ' ' + archive.get('desc', '')
                    content = content.strip()

                # Article type
                if not content:
                    article = major.get('article')
                    if article:
                        content = article.get('title', '') + ' ' + article.get('desc', '')
                        content = content.strip()

                # Draw type (multi-image)
                if not content:
                    draw = major.get('draw')
                    if draw:
                        items = draw.get('items', [])
                        # Get text from first image's description
                        if items and len(items) > 0:
                            content = items[0].get('desc', '')

        # Extract stats
        module_stat = modules.get('module_stat', {})
        likes = module_stat.get('like', {}).get('count', 0) if isinstance(module_stat.get('like'), dict) else 0
        comments = module_stat.get('comment', {}).get('count', 0) if isinstance(module_stat.get('comment'), dict) else 0
        shares = module_stat.get('forward', {}).get('count', 0) if isinstance(module_stat.get('forward'), dict) else 0

        # Determine media type
        media_type = 'video' if 'AV' in dynamic_type or 'VIDEO' in dynamic_type else 'text'

        # Build URL - 统一使用 t.bilibili.com 格式，这是B站动态的标准格式
        # dynamic_id (id_str) 是动态的唯一标识符，适用于所有动态类型
        # 注意：不要使用 rid_str，那是资源ID（如视频AV号），不是动态ID
        url = f"https://t.bilibili.com/{dynamic_id}"

        # Debug logging
        logger.debug(f"Parsed dynamic: id={dynamic_id}, type={dynamic_type}, url={url}")

        # Extract timestamp (Bilibili uses Unix timestamp in module_author)
        publish_time = None
        module_author = modules.get('module_author', {})
        pub_ts = module_author.get('pub_ts')
        if pub_ts:
            try:
                # pub_ts might be string or int, convert to int first
                if isinstance(pub_ts, str):
                    pub_ts = int(pub_ts)
                publish_time = datetime.fromtimestamp(pub_ts)
            except (ValueError, TypeError, OSError) as e:
                logger.warning(f"Invalid timestamp for dynamic {dynamic_id}: {pub_ts}, error: {e}")

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
