"""
抖音（Douyin）Crawler Provider

使用抖音移动端 API 获取用户信息和视频列表
注意：抖音反爬严格，需要处理签名验证
"""
import asyncio
import logging
import json
from typing import List, Dict, Optional
from datetime import datetime
from providers.base_influencer_provider import BaseInfluencerProvider
from core import BaseHTTPClient, get_rate_limiter, get_random_user_agent, parse_timestamp

logger = logging.getLogger(__name__)


class DouyinCrawlerProvider(BaseInfluencerProvider):
    """抖音 Crawler Provider - 基于移动端 API"""

    def __init__(self, config: Dict):
        super().__init__(config)
        self.base_url = "https://www.douyin.com"

        # 初始化 HTTP 客户端
        self.client = BaseHTTPClient(
            base_url=self.base_url,
            timeout=config.get('timeout', 10),
            max_retries=config.get('max_retries', 2)
        )

        # 初始化限流器（抖音更保守：1 req/4s）
        self.rate_limiter = None

    async def _ensure_rate_limiter(self):
        """延迟初始化限流器"""
        if self.rate_limiter is None:
            self.rate_limiter = await get_rate_limiter(
                platform="douyin",
                rate=0.25,  # 1 request per 4 seconds
                capacity=5
            )

    def _get_headers(self, referer: str = None) -> Dict:
        """构建请求头，模拟移动端浏览器"""
        headers = {
            'User-Agent': get_random_user_agent(),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        }

        if referer:
            headers['Referer'] = referer

        return headers

    async def fetch_user_info(self, account_id: str) -> Dict:
        """
        获取抖音用户信息

        Args:
            account_id: 抖音用户ID (sec_uid 或 短链ID)

        Returns:
            用户信息字典: {name, avatar_url, description, verified, followers_count}
        """
        await self._ensure_rate_limiter()

        try:
            # 等待限流器
            await self.rate_limiter.acquire(1)

            # 抖音用户主页 API
            # 注意：实际 API 可能需要额外参数如 device_id, iid 等
            url = f"/aweme/v1/web/aweme/detail/"
            params = {
                'sec_uid': account_id,
                'aid': '6383',  # 抖音 Web 版 app_id
            }

            headers = self._get_headers(referer=f"https://www.douyin.com/user/{account_id}")

            logger.info(f"Fetching Douyin user info for {account_id}")

            response = await self.client.get(url, params=params, headers=headers)

            if not response:
                logger.error(f"Failed to fetch Douyin user info: empty response")
                return {}

            # 解析响应
            # 抖音 API 返回结构：{"status_code": 0, "data": {...}}
            status_code = response.get('status_code', -1)

            if status_code != 0:
                logger.error(f"Douyin API error: status_code={status_code}")
                return {}

            # 提取用户信息
            aweme_detail = response.get('aweme_detail', {})
            author = aweme_detail.get('author', {})

            if not author:
                logger.warning(f"No author data found for {account_id}")
                return {}

            user_info = {
                'name': author.get('nickname', ''),
                'avatar_url': author.get('avatar_larger', {}).get('url_list', [''])[0],
                'description': author.get('signature', ''),
                'verified': author.get('verification_type', 0) > 0,
                'followers_count': author.get('follower_count', 0),
                'profile_url': f'https://www.douyin.com/user/{account_id}'
            }

            logger.info(f"Successfully fetched Douyin user: {user_info.get('name')}")
            return user_info

        except Exception as e:
            logger.error(f"Failed to fetch Douyin user info: {e}", exc_info=True)
            return {}

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        获取抖音用户视频列表

        Args:
            account_id: 抖音用户ID
            since: 仅获取此时间之后的视频
            limit: 最大获取数量

        Returns:
            视频列表
        """
        await self._ensure_rate_limiter()

        try:
            # 等待限流器
            await self.rate_limiter.acquire(1)

            # 抖音视频列表 API
            url = f"/aweme/v1/web/aweme/post/"
            params = {
                'sec_uid': account_id,
                'count': min(limit, 35),  # 单次最多返回 35 条
                'max_cursor': 0,  # 分页游标
                'aid': '6383',
            }

            headers = self._get_headers(referer=f"https://www.douyin.com/user/{account_id}")

            logger.info(f"Fetching Douyin posts for {account_id} (limit: {limit})")

            response = await self.client.get(url, params=params, headers=headers)

            if not response:
                logger.error(f"Failed to fetch Douyin posts: empty response")
                return []

            status_code = response.get('status_code', -1)

            if status_code != 0:
                logger.error(f"Douyin API error: status_code={status_code}")
                return []

            # 解析视频列表
            aweme_list = response.get('aweme_list', [])

            if not aweme_list:
                logger.warning(f"No videos found for {account_id}")
                return []

            # 解析每个视频
            posts = []
            for aweme in aweme_list:
                post = self._parse_aweme(aweme)

                # 根据 since 参数过滤
                if since and post.get('publish_time'):
                    if post['publish_time'] < since:
                        continue

                posts.append(post)

                # 达到限制数量
                if len(posts) >= limit:
                    break

            logger.info(f"Fetched {len(posts)} Douyin posts for {account_id}")
            return posts

        except Exception as e:
            logger.error(f"Failed to fetch Douyin posts: {e}", exc_info=True)
            return []

    async def validate_account(self, account_id: str) -> bool:
        """
        验证抖音账号是否存在

        Args:
            account_id: 抖音用户ID

        Returns:
            True 如果账号存在，False 否则
        """
        user_info = await self.fetch_user_info(account_id)
        is_valid = bool(user_info and user_info.get('name'))

        if is_valid:
            logger.info(f"Douyin account {account_id} is valid")
        else:
            logger.warning(f"Douyin account {account_id} is invalid or not accessible")

        return is_valid

    def _parse_aweme(self, aweme: Dict) -> Dict:
        """
        解析抖音视频数据

        Args:
            aweme: 原始视频数据

        Returns:
            标准化视频数据
        """
        aweme_id = aweme.get('aweme_id', '')

        # 视频描述
        desc = aweme.get('desc', '')

        # 统计数据
        statistics = aweme.get('statistics', {})
        likes = statistics.get('digg_count', 0)
        comments = statistics.get('comment_count', 0)
        shares = statistics.get('share_count', 0)

        # 视频信息
        video = aweme.get('video', {})
        duration = video.get('duration', 0) // 1000  # 毫秒转秒
        cover_url = video.get('cover', {}).get('url_list', [''])[0]
        play_url = video.get('play_addr', {}).get('url_list', [''])[0]

        # 音乐信息
        music = aweme.get('music', {})
        music_id = music.get('id', '')
        music_title = music.get('title', '')
        music_author = music.get('author', '')

        # 挑战标签（话题）
        challenge_tags = []
        text_extra = aweme.get('text_extra', [])
        for item in text_extra:
            if item.get('hashtag_name'):
                challenge_tags.append(item.get('hashtag_name'))

        # 发布时间
        create_time = aweme.get('create_time', 0)
        publish_time = None
        if create_time:
            try:
                publish_time = datetime.fromtimestamp(int(create_time))
            except (ValueError, TypeError, OSError) as e:
                logger.warning(f"Invalid timestamp for aweme {aweme_id}: {create_time}, error: {e}")

        # 构建视频 URL
        url = f"https://www.douyin.com/video/{aweme_id}"

        # 判断是否为广告
        is_ad = aweme.get('is_ads', False) or aweme.get('is_commerce', False)

        # 媒体 URLs
        media_urls = []
        if cover_url:
            media_urls.append(cover_url)
        if play_url:
            media_urls.append(play_url)

        # 返回标准格式
        post = {
            'content': desc,
            'url': url,
            'publish_time': publish_time,
            'media_type': 'video',
            'media_urls': media_urls,
            'likes': likes,
            'comments': comments,
            'shares': shares,
        }

        # Douyin 特有字段（用于存储到 DouyinPostExtra 表）
        post['douyin_extra'] = {
            'video_duration': duration,
            'music_id': music_id,
            'music_title': music_title,
            'music_author': music_author,
            'challenge_tags': json.dumps(challenge_tags, ensure_ascii=False),
            'is_ad': is_ad,
        }

        return post

    async def close(self):
        """关闭资源"""
        if self.client:
            await self.client.close()


# 测试代码
if __name__ == '__main__':
    async def test():
        """测试 DouyinCrawlerProvider"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

        config = {
            'platform': 'douyin',
            'driver_type': 'crawler',
            'timeout': 10,
            'max_retries': 2,
        }

        provider = DouyinCrawlerProvider(config)

        try:
            # 测试账号（需要替换为真实的 sec_uid）
            test_account = "MS4wLjABAAAA_example_sec_uid"

            # 测试账号验证
            logger.info("\n=== Testing account validation ===")
            is_valid = await provider.validate_account(test_account)
            logger.info(f"Account valid: {is_valid}")

            if is_valid:
                # 测试获取用户信息
                logger.info("\n=== Testing fetch_user_info ===")
                user_info = await provider.fetch_user_info(test_account)
                logger.info(f"User info: {json.dumps(user_info, indent=2, ensure_ascii=False)}")

                # 测试获取视频列表
                logger.info("\n=== Testing fetch_user_posts ===")
                posts = await provider.fetch_user_posts(test_account, limit=5)
                logger.info(f"Fetched {len(posts)} posts")

                for i, post in enumerate(posts[:2], 1):
                    logger.info(f"\nPost {i}:")
                    logger.info(f"  Content: {post['content'][:50]}...")
                    logger.info(f"  URL: {post['url']}")
                    logger.info(f"  Likes: {post['likes']}, Comments: {post['comments']}")
                    if 'douyin_extra' in post:
                        logger.info(f"  Duration: {post['douyin_extra']['video_duration']}s")
                        logger.info(f"  Music: {post['douyin_extra']['music_title']}")

        finally:
            await provider.close()

    asyncio.run(test())
