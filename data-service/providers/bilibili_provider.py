import aiohttp
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

    async def fetch_user_info(self, account_id: str) -> Dict:
        """Fetch Bilibili user information"""
        url = f"{self.base_url}/x/space/acc/info"
        params = {
            'mid': account_id
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        result = await response.json()
                        if result.get('code') == 0:
                            data = result.get('data', {})
                            official = data.get('official', {})

                            # 提取领域分类
                            category = extract_category_from_official({'official': official})

                            logger.info(f"Successfully fetched Bilibili user info for {account_id}")
                            return {
                                'name': data.get('name'),
                                'avatar_url': data.get('face'),
                                'description': data.get('sign'),
                                'verified': official.get('type', -1) >= 0,
                                'followers_count': data.get('follower', 0),
                                'category': category,
                                'profile_url': f'https://space.bilibili.com/{account_id}'
                            }
                        else:
                            logger.error(f"Bilibili API error code: {result.get('code')}")
                            return {}
                    else:
                        logger.error(f"Bilibili API HTTP error: {response.status}")
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
        """Fetch Bilibili user dynamics"""
        url = f"{self.base_url}/x/polymer/web-dynamic/v1/feed/space"
        params = {
            'host_mid': account_id
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        result = await response.json()
                        if result.get('code') == 0:
                            data = result.get('data', {})
                            items = data.get('items', [])

                            # Parse all items first
                            parsed_posts = [self._parse_dynamic(item) for item in items]

                            # Filter by since parameter if provided
                            if since:
                                parsed_posts = [
                                    post for post in parsed_posts
                                    if post.get('publish_time') and post['publish_time'] > since
                                ]

                            # Apply limit after filtering
                            return parsed_posts[:limit]
                        else:
                            logger.error(f"Bilibili API error code: {result.get('code')}")
                            return []
                    else:
                        logger.error(f"Bilibili API HTTP error: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"Failed to fetch Bilibili posts: {e}")
            return []

    async def validate_account(self, account_id: str) -> bool:
        """Validate if Bilibili account exists"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info)

    def _parse_dynamic(self, raw: Dict) -> Dict:
        """Parse Bilibili dynamic to standard format"""
        dynamic_id = raw.get('id_str', '')
        modules = raw.get('modules', {})

        # Extract content
        module_dynamic = modules.get('module_dynamic', {})
        desc = module_dynamic.get('desc', {})
        content = desc.get('text', '')

        # Extract stats
        module_stat = modules.get('module_stat', {})
        likes = module_stat.get('like', {}).get('count', 0)
        comments = module_stat.get('comment', {}).get('count', 0)
        shares = module_stat.get('forward', {}).get('count', 0)

        # Determine media type
        dynamic_type = raw.get('type', '')
        media_type = 'video' if 'AV' in dynamic_type or 'VIDEO' in dynamic_type else 'text'

        # Build URL
        basic = raw.get('basic', {})
        comment_id = basic.get('comment_id_str', dynamic_id)
        url = f"https://www.bilibili.com/opus/{comment_id}"

        # Extract timestamp (Bilibili uses Unix timestamp in module_author)
        publish_time = None
        module_author = modules.get('module_author', {})
        pub_ts = module_author.get('pub_ts')
        if pub_ts:
            try:
                publish_time = datetime.fromtimestamp(pub_ts)
            except (ValueError, TypeError, OSError):
                logger.warning(f"Invalid timestamp for dynamic {dynamic_id}: {pub_ts}")

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
