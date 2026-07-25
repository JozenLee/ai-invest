"""
时间提取工具
从新闻页面中提取真实的发布时间
"""

import logging
import asyncio
import re
from datetime import datetime
from typing import Optional
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class TimeExtractor:
    """从新闻URL中提取真实发布时间"""

    def __init__(self, timeout: int = 5, max_concurrent: int = 3):
        """
        初始化时间提取器

        Args:
            timeout: 请求超时时间（秒）
            max_concurrent: 最大并发请求数
        """
        self.timeout = timeout
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        })

    async def extract_publish_time(self, url: str) -> Optional[str]:
        """
        从URL提取发布时间

        Args:
            url: 新闻文章URL

        Returns:
            发布时间字符串 (YYYY-MM-DD HH:MM:SS) 或 None
        """
        if not url:
            return None

        async with self.semaphore:
            try:
                # 根据域名选择提取方法
                if 'wallstreetcn.com' in url:
                    return await self._extract_wallstreetcn(url)
                elif 'cls.cn' in url:
                    return await self._extract_cls(url)
                elif 'thepaper.cn' in url:
                    return await self._extract_thepaper(url)
                elif '36kr.com' in url:
                    return await self._extract_36kr(url)
                else:
                    # 通用方法
                    return await self._extract_generic(url)
            except Exception as e:
                logger.debug(f"提取时间失败: {url}, error={str(e)}")
                return None

    async def _fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """异步获取页面内容"""
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.session.get(url, timeout=self.timeout)
            )

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                logger.debug(f"成功获取页面: {url}, 内容长度={len(response.content)}")
                return soup
            else:
                logger.debug(f"HTTP {response.status_code}: {url}")
                return None
        except Exception as e:
            logger.debug(f"请求失败: {url}, error={str(e)}")
            return None

    async def _extract_wallstreetcn(self, url: str) -> Optional[str]:
        """提取华尔街见闻的发布时间"""
        soup = await self._fetch_page(url)
        if not soup:
            logger.warning(f"无法获取页面: {url}")
            return None

        # 方法1: <time> 标签
        time_elem = soup.find('time')
        if time_elem:
            datetime_attr = time_elem.get('datetime')
            logger.info(f"找到time标签: datetime={datetime_attr}")
            if datetime_attr:
                try:
                    dt = datetime.fromisoformat(datetime_attr.replace('Z', '+00:00'))
                    result = dt.strftime('%Y-%m-%d %H:%M:%S')
                    logger.info(f"成功提取时间: {result}")
                    return result
                except Exception as e:
                    logger.warning(f"解析time标签失败: {e}")

        # 方法2: meta标签
        meta = soup.find('meta', {'property': 'article:published_time'})
        if meta:
            content = meta.get('content')
            logger.info(f"找到meta标签: content={content}")
            if content:
                try:
                    dt = datetime.fromisoformat(content.replace('Z', '+00:00'))
                    result = dt.strftime('%Y-%m-%d %H:%M:%S')
                    logger.info(f"成功提取时间: {result}")
                    return result
                except Exception as e:
                    logger.warning(f"解析meta标签失败: {e}")

        logger.warning(f"未找到时间信息: {url}")
        return None

    async def _extract_cls(self, url: str) -> Optional[str]:
        """提取财联社的发布时间"""
        soup = await self._fetch_page(url)
        if not soup:
            return None

        # 财联社的时间通常在特定class中
        time_elem = soup.find('span', class_=re.compile(r'time|date'))
        if time_elem:
            text = time_elem.get_text(strip=True)
            parsed_time = self._parse_chinese_time(text)
            if parsed_time:
                return parsed_time

        # 备用：meta标签
        meta = soup.find('meta', {'property': 'article:published_time'})
        if meta and meta.get('content'):
            try:
                dt = datetime.fromisoformat(meta['content'].replace('Z', '+00:00'))
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            except:
                pass

        return None

    async def _extract_thepaper(self, url: str) -> Optional[str]:
        """提取澎湃新闻的发布时间"""
        soup = await self._fetch_page(url)
        if not soup:
            return None

        # 澎湃的时间格式
        time_elem = soup.find('div', class_=re.compile(r'time|date'))
        if time_elem:
            text = time_elem.get_text(strip=True)
            parsed_time = self._parse_chinese_time(text)
            if parsed_time:
                return parsed_time

        return None

    async def _extract_36kr(self, url: str) -> Optional[str]:
        """提取36氪的发布时间"""
        soup = await self._fetch_page(url)
        if not soup:
            return None

        # 36氪时间元素
        time_elem = soup.find('time')
        if time_elem:
            if time_elem.get('datetime'):
                try:
                    dt = datetime.fromisoformat(time_elem['datetime'].replace('Z', '+00:00'))
                    return dt.strftime('%Y-%m-%d %H:%M:%S')
                except:
                    pass

            text = time_elem.get_text(strip=True)
            parsed_time = self._parse_chinese_time(text)
            if parsed_time:
                return parsed_time

        return None

    async def _extract_generic(self, url: str) -> Optional[str]:
        """通用时间提取方法"""
        soup = await self._fetch_page(url)
        if not soup:
            return None

        # 尝试多种通用方法

        # 1. <time> 标签
        time_elem = soup.find('time')
        if time_elem and time_elem.get('datetime'):
            try:
                dt = datetime.fromisoformat(time_elem['datetime'].replace('Z', '+00:00'))
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            except:
                pass

        # 2. meta标签
        for prop in ['article:published_time', 'datePublished', 'publishdate']:
            meta = soup.find('meta', {'property': prop}) or soup.find('meta', {'name': prop})
            if meta and meta.get('content'):
                try:
                    dt = datetime.fromisoformat(meta['content'].replace('Z', '+00:00'))
                    return dt.strftime('%Y-%m-%d %H:%M:%S')
                except:
                    pass

        return None

    def _parse_chinese_time(self, text: str) -> Optional[str]:
        """
        解析中文时间格式
        支持: 2026年7月24日 11:07, 2026-07-24 11:07:27 等
        """
        if not text:
            return None

        # 模式1: 2026年7月24日 11:07
        pattern1 = r'(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})'
        match = re.search(pattern1, text)
        if match:
            year, month, day, hour, minute = match.groups()
            return f"{year}-{month.zfill(2)}-{day.zfill(2)} {hour.zfill(2)}:{minute}:00"

        # 模式2: 2026-07-24 11:07:27
        pattern2 = r'(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})'
        match = re.search(pattern2, text)
        if match:
            return match.group(0)

        # 模式3: 2026-07-24 11:07
        pattern3 = r'(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})'
        match = re.search(pattern3, text)
        if match:
            return f"{match.group(0)}:00"

        return None


# 全局单例
time_extractor = TimeExtractor()
