"""
社交媒体数据源Provider
支持微博、B站、小红书等平台的数据采集
"""

import asyncio
import aiohttp
import json
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup
import pandas as pd

from .base import DataProvider


class SocialMediaProvider(DataProvider):
    """社交媒体数据源基类"""

    def __init__(self, config: Dict[str, Any] = None):
        super().__init__()
        self.config = config or {}
        self.session = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """获取HTTP会话"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
            )
        return self.session

    async def close(self):
        """关闭会话"""
        if self.session and not self.session.closed:
            await self.session.close()

    async def fetch_user_posts(self, account_id: str, limit: int = 20) -> List[Dict]:
        """获取用户动态"""
        raise NotImplementedError

    async def search_posts(self, keyword: str, limit: int = 50) -> List[Dict]:
        """搜索相关帖子"""
        raise NotImplementedError

    def _parse_post(self, raw_data: Dict) -> Dict:
        """解析帖子数据为标准格式"""
        return {
            'id': raw_data.get('id', ''),
            'content': raw_data.get('content', ''),
            'publish_time': raw_data.get('publish_time', datetime.now()),
            'author': raw_data.get('author', ''),
            'author_id': raw_data.get('author_id', ''),
            'url': raw_data.get('url', ''),
            'likes': raw_data.get('likes', 0),
            'comments': raw_data.get('comments', 0),
            'reposts': raw_data.get('reposts', 0),
            'platform': self.__class__.__name__.replace('Provider', '').lower(),
            'raw_data': raw_data
        }


class WeiboProvider(SocialMediaProvider):
    """微博数据源"""

    BASE_URL = 'https://m.weibo.cn'

    async def fetch_user_posts(self, account_id: str, limit: int = 20) -> List[Dict]:
        """获取微博用户动态"""
        try:
            session = await self._get_session()
            url = f'{self.BASE_URL}/api/container/getIndex'
            params = {
                'type': 'uid',
                'value': account_id,
                'containerid': f'107603{account_id}',
            }

            async with session.get(url, params=params) as response:
                if response.status != 200:
                    return []

                data = await response.json()
                cards = data.get('data', {}).get('cards', [])

                posts = []
                for card in cards[:limit]:
                    if card.get('card_type') == 9:
                        mblog = card.get('mblog', {})
                        post = self._parse_post({
                            'id': mblog.get('id', ''),
                            'content': self._clean_html(mblog.get('text', '')),
                            'publish_time': self._parse_weibo_time(mblog.get('created_at', '')),
                            'author': mblog.get('user', {}).get('screen_name', ''),
                            'author_id': account_id,
                            'url': f'https://weibo.com/{account_id}/{mblog.get("bid", "")}',
                            'likes': mblog.get('attitudes_count', 0),
                            'comments': mblog.get('comments_count', 0),
                            'reposts': mblog.get('reposts_count', 0),
                        })
                        posts.append(post)

                return posts

        except Exception as e:
            print(f'微博获取用户动态失败: {e}')
            return []

    async def search_posts(self, keyword: str, limit: int = 50) -> List[Dict]:
        """搜索微博"""
        try:
            session = await self._get_session()
            url = f'{self.BASE_URL}/api/container/getIndex'
            params = {
                'containerid': f'100103type=1&q={keyword}',
                'page_type': 'searchall',
            }

            async with session.get(url, params=params) as response:
                if response.status != 200:
                    return []

                data = await response.json()
                cards = data.get('data', {}).get('cards', [])

                posts = []
                for card in cards:
                    if card.get('card_type') == 9:
                        mblog = card.get('mblog', {})
                        post = self._parse_post({
                            'id': mblog.get('id', ''),
                            'content': self._clean_html(mblog.get('text', '')),
                            'publish_time': self._parse_weibo_time(mblog.get('created_at', '')),
                            'author': mblog.get('user', {}).get('screen_name', ''),
                            'author_id': mblog.get('user', {}).get('id', ''),
                            'url': f'https://weibo.com/{mblog.get("user", {}).get("id", "")}/{mblog.get("bid", "")}',
                            'likes': mblog.get('attitudes_count', 0),
                            'comments': mblog.get('comments_count', 0),
                            'reposts': mblog.get('reposts_count', 0),
                        })
                        posts.append(post)

                return posts[:limit]

        except Exception as e:
            print(f'微博搜索失败: {e}')
            return []

    def _clean_html(self, html: str) -> str:
        """清理HTML标签"""
        soup = BeautifulSoup(html, 'html.parser')
        return soup.get_text()

    def _parse_weibo_time(self, time_str: str) -> datetime:
        """解析微博时间格式"""
        try:
            if '分钟前' in time_str:
                minutes = int(re.search(r'(\d+)', time_str).group(1))
                return datetime.now() - timedelta(minutes=minutes)
            elif '小时前' in time_str:
                hours = int(re.search(r'(\d+)', time_str).group(1))
                return datetime.now() - timedelta(hours=hours)
            elif '刚刚' in time_str:
                return datetime.now()
            elif '昨天' in time_str:
                return datetime.now() - timedelta(days=1)
            else:
                return datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S')
        except:
            return datetime.now()


class BilibiliProvider(SocialMediaProvider):
    """B站数据源"""

    BASE_URL = 'https://api.bilibili.com'

    async def fetch_user_posts(self, account_id: str, limit: int = 20) -> List[Dict]:
        """获取B站用户动态"""
        try:
            session = await self._get_session()
            url = f'{self.BASE_URL}/x/space/arc/search'
            params = {
                'mid': account_id,
                'ps': limit,
                'tid': 0,
                'pn': 1,
                'order': 'pubdate',
            }

            async with session.get(url, params=params) as response:
                if response.status != 200:
                    return []

                data = await response.json()
                vlist = data.get('data', {}).get('list', {}).get('vlist', [])

                posts = []
                for video in vlist[:limit]:
                    post = self._parse_post({
                        'id': str(video.get('bvid', '')),
                        'content': video.get('description', ''),
                        'publish_time': datetime.fromtimestamp(video.get('created', 0)),
                        'author': video.get('author', ''),
                        'author_id': account_id,
                        'url': f'https://www.bilibili.com/video/{video.get("bvid", "")}',
                        'likes': 0,  # B站API不直接返回点赞数
                        'comments': video.get('comment', 0),
                        'reposts': 0,
                        'title': video.get('title', ''),
                        'duration': video.get('length', ''),
                        'play': video.get('play', 0),
                    })
                    posts.append(post)

                return posts

        except Exception as e:
            print(f'B站获取用户动态失败: {e}')
            return []

    async def search_posts(self, keyword: str, limit: int = 50) -> List[Dict]:
        """搜索B站视频"""
        try:
            session = await self._get_session()
            url = f'{self.BASE_URL}/x/web-interface/search/all/v2'
            params = {
                'keyword': keyword,
                'page': 1,
                'pagesize': limit,
            }

            async with session.get(url, params=params) as response:
                if response.status != 200:
                    return []

                data = await response.json()
                results = data.get('data', {}).get('result', [])

                posts = []
                for result_type in results:
                    if result_type.get('result_type') == 'video':
                        for video in result_type.get('data', [])[:limit]:
                            post = self._parse_post({
                                'id': video.get('bvid', ''),
                                'content': video.get('description', ''),
                                'publish_time': datetime.fromtimestamp(video.get('pubdate', 0)),
                                'author': video.get('author', ''),
                                'author_id': video.get('mid', ''),
                                'url': f'https://www.bilibili.com/video/{video.get("bvid", "")}',
                                'likes': 0,
                                'comments': video.get('review', 0),
                                'reposts': 0,
                                'title': video.get('title', ''),
                                'duration': video.get('duration', ''),
                                'play': video.get('play', 0),
                            })
                            posts.append(post)

                return posts[:limit]

        except Exception as e:
            print(f'B站搜索失败: {e}')
            return []


class XiaohongshuProvider(SocialMediaProvider):
    """小红书数据源"""

    BASE_URL = 'https://www.xiaohongshu.com'

    async def fetch_user_posts(self, account_id: str, limit: int = 20) -> List[Dict]:
        """获取小红书用户笔记
        注意：小红书API需要认证，这里使用模拟数据
        实际使用时需要实现登录逻辑或使用官方API
        """
        # 小红书没有公开API，需要爬虫或官方合作
        # 这里返回空列表，实际使用时需要实现具体逻辑
        print(f'小红书数据采集需要实现登录逻辑，account_id: {account_id}')
        return []

    async def search_posts(self, keyword: str, limit: int = 50) -> List[Dict]:
        """搜索小红书笔记
        注意：小红书API需要认证，这里使用模拟数据
        """
        print(f'小红书搜索需要实现登录逻辑，keyword: {keyword}')
        return []


class RSSProvider(SocialMediaProvider):
    """RSS订阅数据源"""

    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.feeds = config.get('feeds', []) if config else []

    async def add_feed(self, url: str, name: str = ''):
        """添加RSS订阅源"""
        self.feeds.append({
            'url': url,
            'name': name or url,
        })

    async def fetch_user_posts(self, account_id: str, limit: int = 20) -> List[Dict]:
        """获取RSS订阅内容
        account_id 在这里作为feed的标识
        """
        feed = next((f for f in self.feeds if f.get('name') == account_id or f.get('url') == account_id), None)
        if not feed:
            return []

        try:
            session = await self._get_session()
            async with session.get(feed['url']) as response:
                if response.status != 200:
                    return []

                content = await response.text()
                return self._parse_rss(content, limit)

        except Exception as e:
            print(f'RSS获取失败: {e}')
            return []

    async def search_posts(self, keyword: str, limit: int = 50) -> List[Dict]:
        """搜索所有RSS源中的内容"""
        all_posts = []
        for feed in self.feeds:
            posts = await self.fetch_user_posts(feed['name'], limit)
            # 过滤包含关键词的帖子
            filtered = [p for p in posts if keyword.lower() in p.get('content', '').lower()]
            all_posts.extend(filtered)

        return all_posts[:limit]

    def _parse_rss(self, content: str, limit: int) -> List[Dict]:
        """解析RSS XML"""
        try:
            soup = BeautifulSoup(content, 'xml')
            items = soup.find_all('item')

            posts = []
            for item in items[:limit]:
                title = item.find('title')
                description = item.find('description')
                link = item.find('link')
                pub_date = item.find('pubDate')

                post = self._parse_post({
                    'id': link.get_text() if link else '',
                    'content': f"{title.get_text() if title else ''} {description.get_text() if description else ''}",
                    'publish_time': self._parse_rss_time(pub_date.get_text() if pub_date else ''),
                    'author': '',
                    'author_id': '',
                    'url': link.get_text() if link else '',
                    'likes': 0,
                    'comments': 0,
                    'reposts': 0,
                })
                posts.append(post)

            return posts

        except Exception as e:
            print(f'RSS解析失败: {e}')
            return []

    def _parse_rss_time(self, time_str: str) -> datetime:
        """解析RSS时间格式"""
        try:
            # RFC 822 format: "Mon, 01 Jan 2024 00:00:00 +0000"
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(time_str)
        except:
            return datetime.now()


# 数据源注册表
SOCIAL_PROVIDERS = {
    'weibo': WeiboProvider,
    'bilibili': BilibiliProvider,
    'xiaohongshu': XiaohongshuProvider,
    'rss': RSSProvider,
}


def get_social_provider(provider_name: str, config: Dict[str, Any] = None) -> Optional[SocialMediaProvider]:
    """获取社交媒体数据源实例"""
    provider_class = SOCIAL_PROVIDERS.get(provider_name)
    if provider_class:
        return provider_class(config)
    return None
