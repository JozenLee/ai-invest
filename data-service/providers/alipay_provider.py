"""
Alipay Provider - 支付宝生活号数据提供者

技术方案说明：
==============

1. 官方 API 限制：
   - 支付宝开放平台 API 需要企业认证
   - 需要签约"生活号"产品权限
   - 个人开发者无法获取 access_token
   - API: alipay.open.public.message.content.query（需要 OAuth 2.0）

2. 当前实现方案：
   - 使用支付宝生活号移动端 H5 页面的公开接口
   - 通过解析 JSON 数据获取生活号信息和文章列表
   - 无需认证，但需要正确的 User-Agent 和 Headers
   - 数据来源：支付宝小程序的公开 API (https://render.alipay.com)

3. 备选方案（如果当前方案失效）：
   - 爬取支付宝生活号 Web 页面（需要 Selenium/Playwright）
   - 使用支付宝小程序的公开接口（需要研究小程序协议）
   - 等待官方开放更多权限

4. 数据字段映射：
   - articleType: 文章类型（news/service/promotion）
   - category: 分类标签
   - serviceId: 关联的服务ID
   - hasService: 是否包含服务链接
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
    clean_text,
)

logger = logging.getLogger(__name__)


class AlipayAPIProvider(BaseInfluencerProvider):
    """
    Alipay Life Account Provider

    使用支付宝公开接口获取生活号信息和文章列表

    注意：
    - 官方 API 需要企业认证，当前使用公开接口
    - 请求频率限制：1 req/2s，避免被限流
    - 数据可能不如官方 API 完整，但足够满足基本需求
    """

    def __init__(self, config: Dict):
        super().__init__(config)

        # 支付宝生活号 API 基础 URL
        # 使用移动端 H5 页面的数据接口
        self.base_url = "https://render.alipay.com"
        self.api_base = "https://openapi.alipay.com"  # 官方 API（需要认证）

        # 初始化限流器（1 req/2s = 0.5 req/s）
        self.rate_limiter = None

        # 解析配置中的认证信息（如果有官方 API 权限）
        self.app_id = config.get('app_id')
        self.private_key = config.get('private_key')
        self.alipay_public_key = config.get('alipay_public_key')
        self.has_official_api = bool(self.app_id and self.private_key)

        # 初始化 HTTP 客户端
        self.http_client = BaseHTTPClient(
            base_url=self.base_url,
            headers=self._get_default_headers(),
            timeout=config.get('timeout', 15),
            max_retries=config.get('max_retries', 3),
            retry_delay=config.get('retry_delay', 2),
        )

        if self.has_official_api:
            logger.info("Alipay provider initialized with official API credentials")
        else:
            logger.info("Alipay provider initialized with public API fallback")

    async def _get_rate_limiter(self):
        """延迟初始化 rate limiter（避免事件循环问题）"""
        if self.rate_limiter is None:
            self.rate_limiter = await get_rate_limiter('alipay', rate=0.5, capacity=5)
        return self.rate_limiter

    def _get_default_headers(self) -> Dict:
        """获取默认请求头，模拟支付宝客户端"""
        return {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Alipay/10.5.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://render.alipay.com/',
            'Origin': 'https://render.alipay.com',
        }

    async def fetch_user_info(self, account_id: str) -> Dict:
        """
        获取支付宝生活号信息

        Args:
            account_id: 生活号ID（通常是数字ID或生活号唯一标识）
                      例如: '2088123456789012' 或 'alipay-life-service'

        Returns:
            Dict with user info: name, avatar_url, description, verified, followers_count
        """
        # 应用限流
        limiter = await self._get_rate_limiter()
        await limiter.acquire()

        # 尝试使用官方 API（如果有权限）
        if self.has_official_api:
            result = await self._fetch_user_info_official(account_id)
            if result:
                return result
            logger.warning("Official API failed, falling back to public API")

        # 备选方案：使用公开接口
        # 支付宝生活号的公开页面 API
        # 注意：这个 URL 可能需要根据实际情况调整
        url = f"/p/f/fd-j6lzqrgm/pages/publish/index.html"
        params = {
            'userId': account_id,
            '__webview_options__': 'pd=no',
        }

        try:
            result = await self.http_client.get(url, params=params)

            if not result:
                logger.error(f"Failed to fetch Alipay user info for {account_id}")
                return {}

            # 解析返回数据
            # 注意：实际数据结构可能不同，需要根据响应调整
            data = result.get('data', {}) or result

            # 提取用户信息
            name = data.get('name') or data.get('userName') or data.get('accountName', '')
            avatar_url = data.get('avatar') or data.get('logo') or data.get('headImg', '')
            description = data.get('intro') or data.get('description') or data.get('briefIntro', '')
            verified = data.get('certified', False) or data.get('isVerified', False)
            followers_count = data.get('fansCount', 0) or data.get('followerCount', 0)

            # 构建生活号 URL
            profile_url = f"https://render.alipay.com/p/s/life-account/{account_id}"

            logger.info(f"Successfully fetched Alipay user info for {account_id}")

            return {
                'name': name,
                'avatar_url': avatar_url,
                'description': description,
                'verified': verified,
                'followers_count': followers_count,
                'profile_url': profile_url,
            }

        except Exception as e:
            logger.error(f"Failed to fetch Alipay user info: {e}", exc_info=True)
            return {}

    async def _fetch_user_info_official(self, account_id: str) -> Optional[Dict]:
        """
        使用官方 API 获取生活号信息（需要企业认证）

        官方 API 文档：
        https://opendocs.alipay.com/open/054kxb

        需要的权限：
        - alipay.open.public.info.query（查询生活号基础信息）
        """
        logger.info("Attempting to use official Alipay API (requires enterprise certification)")

        # TODO: 实现官方 API 调用
        # 需要实现 RSA 签名、参数加密等复杂逻辑
        # 参考：https://opendocs.alipay.com/open/291/106074

        logger.warning("Official Alipay API not yet implemented - requires enterprise certification")
        return None

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        获取支付宝生活号文章列表

        Args:
            account_id: 生活号ID
            since: 只获取此时间之后的文章（可选）
            limit: 最大获取数量

        Returns:
            List of post dicts in standard format
        """
        # 应用限流
        limiter = await self._get_rate_limiter()
        await limiter.acquire()

        # 尝试使用官方 API
        if self.has_official_api:
            result = await self._fetch_user_posts_official(account_id, since, limit)
            if result:
                return result
            logger.warning("Official API failed, falling back to public API")

        # 备选方案：使用公开接口
        url = f"/p/f/fd-j6lzqrgm/api/article/list.json"
        params = {
            'userId': account_id,
            'pageSize': min(limit, 50),
            'pageNum': 1,
        }

        try:
            result = await self.http_client.get(url, params=params)

            if not result:
                logger.error(f"Failed to fetch Alipay posts for {account_id}")
                return []

            # 解析返回数据
            data = result.get('data', {})
            articles = data.get('articles', []) or data.get('list', []) or result.get('list', [])

            posts = []
            for article in articles:
                post = self._parse_article(article, account_id)
                if post:
                    # 按时间过滤
                    if since and post.get('publish_time'):
                        if post['publish_time'] < since:
                            continue
                    posts.append(post)

            # 应用限制
            posts = posts[:limit]

            logger.info(f"Fetched {len(posts)} posts for Alipay user {account_id} (since: {since})")
            return posts

        except Exception as e:
            logger.error(f"Failed to fetch Alipay posts: {e}", exc_info=True)
            return []

    async def _fetch_user_posts_official(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> Optional[List[Dict]]:
        """
        使用官方 API 获取文章列表

        官方 API:
        - alipay.open.public.message.content.query（查询生活号消息）
        """
        logger.info("Attempting to use official Alipay API for posts")

        # TODO: 实现官方 API 调用

        logger.warning("Official Alipay API for posts not yet implemented")
        return None

    async def validate_account(self, account_id: str) -> bool:
        """
        验证支付宝生活号是否存在

        Args:
            account_id: 生活号ID

        Returns:
            True if account exists, False otherwise
        """
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info and user_info.get('name'))

    def _parse_article(self, raw: Dict, account_id: str) -> Optional[Dict]:
        """
        解析支付宝文章数据为标准格式

        Args:
            raw: 原始文章数据
            account_id: 生活号ID

        Returns:
            标准化的文章字典
        """
        try:
            # 提取基本信息
            article_id = raw.get('id') or raw.get('articleId') or raw.get('contentId', '')
            title = raw.get('title', '')
            summary = raw.get('summary') or raw.get('desc') or raw.get('brief', '')
            content = f"{title}\n\n{summary}".strip()

            # 清理文本
            content = clean_text(content, max_length=1000)

            # 构建文章 URL
            # 支付宝生活号文章的标准格式
            url = raw.get('url') or raw.get('link') or f"https://render.alipay.com/p/s/life-article/{article_id}"

            # 解析发布时间
            publish_time = None
            pub_time_str = raw.get('publishTime') or raw.get('gmtCreate') or raw.get('createTime')
            if pub_time_str:
                publish_time = parse_timestamp(pub_time_str)

            # 提取封面图片
            cover_url = raw.get('cover') or raw.get('coverImg') or raw.get('imageUrl', '')
            media_urls = [cover_url] if cover_url else []

            # 判断媒体类型
            media_type = 'image' if media_urls else 'text'
            if raw.get('videoUrl') or raw.get('video'):
                media_type = 'video'
                video_url = raw.get('videoUrl') or raw.get('video', {}).get('url')
                if video_url:
                    media_urls.append(video_url)

            # 提取互动数据
            likes = raw.get('likeCount', 0) or raw.get('praiseCount', 0)
            comments = raw.get('commentCount', 0)
            shares = raw.get('shareCount', 0) or raw.get('forwardCount', 0)
            views = raw.get('readCount', 0) or raw.get('viewCount', 0)

            # 提取支付宝特有字段
            article_type = raw.get('type', 'news')  # news/service/promotion
            category = raw.get('category') or raw.get('tag')
            service_id = raw.get('serviceId')
            has_service = bool(service_id or raw.get('serviceUrl'))

            # 标准化 articleType
            type_mapping = {
                'article': 'news',
                'news': 'news',
                'service': 'service',
                'promotion': 'promotion',
                'ad': 'promotion',
                'product': 'service',
            }
            article_type = type_mapping.get(article_type.lower(), 'news')

            return {
                'content': content,
                'url': url,
                'publish_time': publish_time,
                'media_type': media_type,
                'media_urls': media_urls,
                'likes': likes,
                'comments': comments,
                'shares': shares,
                # 支付宝特有的扩展字段
                'extra': {
                    'articleType': article_type,
                    'category': category,
                    'serviceId': service_id,
                    'hasService': has_service,
                    'viewCount': views,
                }
            }

        except Exception as e:
            logger.warning(f"Failed to parse Alipay article: {e}")
            return None

    async def close(self):
        """关闭 HTTP 客户端"""
        await self.http_client.close()
