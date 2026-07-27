"""
DataParser - Utility functions for parsing and cleaning data.
"""
import re
import logging
from datetime import datetime
from typing import Optional, Any
from html import unescape

logger = logging.getLogger(__name__)


class DataParser:
    """
    数据解析工具类

    提供：
    - parse_timestamp(): 支持多种时间格式
    - clean_text(): 去除HTML标签、多余空格
    - detect_media_type(): 根据内容判断媒体类型
    """

    @staticmethod
    def parse_timestamp(value: Any) -> Optional[datetime]:
        """
        解析时间戳，支持多种格式

        支持的格式：
        - Unix 秒时间戳（整数或字符串）
        - Unix 毫秒时间戳（整数或字符串）
        - ISO 8601 格式（YYYY-MM-DDTHH:MM:SS）
        - 常见日期格式（YYYY-MM-DD HH:MM:SS）

        Args:
            value: 时间戳值（int/str/datetime）

        Returns:
            datetime 对象，解析失败返回 None
        """
        if value is None:
            return None

        # 如果已经是 datetime 对象
        if isinstance(value, datetime):
            return value

        try:
            # 尝试转换为数字（Unix 时间戳）
            if isinstance(value, (int, float)):
                timestamp = float(value)
            elif isinstance(value, str) and value.isdigit():
                timestamp = float(value)
            else:
                timestamp = None

            # 处理 Unix 时间戳
            if timestamp is not None:
                # 判断是秒还是毫秒（毫秒时间戳通常 > 10^12）
                if timestamp > 10**12:
                    # 毫秒时间戳
                    return datetime.fromtimestamp(timestamp / 1000)
                elif timestamp > 0:
                    # 秒时间戳
                    return datetime.fromtimestamp(timestamp)
                else:
                    logger.warning(f"Invalid timestamp value: {value}")
                    return None

            # 尝试解析 ISO 8601 格式
            if isinstance(value, str):
                # ISO 8601 with timezone
                if 'T' in value:
                    # 移除时区信息（简化处理）
                    clean_value = re.sub(r'[+-]\d{2}:\d{2}$', '', value)
                    clean_value = re.sub(r'Z$', '', clean_value)
                    try:
                        return datetime.fromisoformat(clean_value)
                    except ValueError:
                        pass

                # 尝试常见格式
                formats = [
                    '%Y-%m-%d %H:%M:%S',
                    '%Y-%m-%d %H:%M',
                    '%Y-%m-%d',
                    '%Y/%m/%d %H:%M:%S',
                    '%Y/%m/%d %H:%M',
                    '%Y/%m/%d',
                    '%d/%m/%Y %H:%M:%S',
                    '%d/%m/%Y',
                ]

                for fmt in formats:
                    try:
                        return datetime.strptime(value, fmt)
                    except ValueError:
                        continue

            logger.warning(f"Unable to parse timestamp: {value}")
            return None

        except (ValueError, TypeError, OSError) as e:
            logger.warning(f"Error parsing timestamp '{value}': {e}")
            return None

    @staticmethod
    def clean_text(text: str, max_length: Optional[int] = None) -> str:
        """
        清理文本内容

        - 移除 HTML 标签
        - 解码 HTML 实体
        - 去除多余空格和换行
        - 截断到指定长度

        Args:
            text: 原始文本
            max_length: 最大长度（可选）

        Returns:
            清理后的文本
        """
        if not text:
            return ""

        # 解码 HTML 实体
        text = unescape(text)

        # 移除 HTML 标签
        text = re.sub(r'<[^>]+>', '', text)

        # 移除脚本和样式标签内容
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)

        # 规范化空白字符
        text = re.sub(r'\s+', ' ', text)

        # 去除首尾空格
        text = text.strip()

        # 截断到指定长度
        if max_length and len(text) > max_length:
            text = text[:max_length].rstrip() + '...'

        return text

    @staticmethod
    def detect_media_type(content: Any, url: str = "", metadata: Optional[dict] = None) -> str:
        """
        检测媒体类型

        根据内容、URL 和元数据判断媒体类型

        Args:
            content: 内容数据（字符串或字典）
            url: URL 地址
            metadata: 额外的元数据

        Returns:
            媒体类型：'video', 'image', 'article', 'audio', 'text'
        """
        metadata = metadata or {}

        # 检查 URL 模式
        url_lower = url.lower()

        # 视频平台特征
        video_patterns = [
            r'youtube\.com/watch',
            r'youtu\.be/',
            r'bilibili\.com/(video|bangumi)',
            r'douyin\.com',
            r'tiktok\.com',
            r'v\.qq\.com',
            r'iqiyi\.com',
            r'\.mp4$',
            r'\.mov$',
            r'\.avi$',
            r'\.mkv$',
        ]

        for pattern in video_patterns:
            if re.search(pattern, url_lower):
                return 'video'

        # 图片特征
        image_patterns = [
            r'\.jpg$',
            r'\.jpeg$',
            r'\.png$',
            r'\.gif$',
            r'\.webp$',
            r'\.svg$',
            r'/image/',
            r'/photo/',
        ]

        for pattern in image_patterns:
            if re.search(pattern, url_lower):
                return 'image'

        # 音频特征
        audio_patterns = [
            r'\.mp3$',
            r'\.wav$',
            r'\.ogg$',
            r'\.m4a$',
            r'/audio/',
            r'podcast',
        ]

        for pattern in audio_patterns:
            if re.search(pattern, url_lower):
                return 'audio'

        # 文章特征
        article_patterns = [
            r'/article/',
            r'/post/',
            r'/blog/',
            r'/news/',
        ]

        for pattern in article_patterns:
            if re.search(pattern, url_lower):
                return 'article'

        # 检查元数据
        media_type = metadata.get('type') or metadata.get('media_type')
        if media_type:
            media_type_lower = str(media_type).lower()
            if any(t in media_type_lower for t in ['video', 'vid']):
                return 'video'
            if any(t in media_type_lower for t in ['image', 'photo', 'picture']):
                return 'image'
            if any(t in media_type_lower for t in ['audio', 'sound', 'music']):
                return 'audio'
            if any(t in media_type_lower for t in ['article', 'post', 'blog']):
                return 'article'

        # 检查内容关键词
        if isinstance(content, str):
            content_lower = content.lower()
            if any(kw in content_lower for kw in ['视频', '播放', 'video', 'play']):
                return 'video'
            if any(kw in content_lower for kw in ['图片', '照片', 'image', 'photo']):
                return 'image'

        # 默认为文本
        return 'text'

    @staticmethod
    def extract_urls(text: str) -> list[str]:
        """
        从文本中提取 URL

        Args:
            text: 文本内容

        Returns:
            URL 列表
        """
        if not text:
            return []

        # URL 正则模式
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'

        urls = re.findall(url_pattern, text)
        return urls

    @staticmethod
    def extract_hashtags(text: str) -> list[str]:
        """
        从文本中提取话题标签

        Args:
            text: 文本内容

        Returns:
            话题标签列表（不含 # 符号）
        """
        if not text:
            return []

        # 支持中英文话题标签
        hashtag_pattern = r'#([^\s#]+)'

        hashtags = re.findall(hashtag_pattern, text)
        return hashtags

    @staticmethod
    def extract_mentions(text: str) -> list[str]:
        """
        从文本中提取提及用户（@用户名）

        Args:
            text: 文本内容

        Returns:
            用户名列表（不含 @ 符号）
        """
        if not text:
            return []

        # 提及模式
        mention_pattern = r'@([^\s@]+)'

        mentions = re.findall(mention_pattern, text)
        return mentions

    @staticmethod
    def sanitize_filename(filename: str, max_length: int = 255) -> str:
        """
        清理文件名，移除非法字符

        Args:
            filename: 原始文件名
            max_length: 最大长度

        Returns:
            清理后的文件名
        """
        if not filename:
            return "untitled"

        # 移除非法字符
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)

        # 移除控制字符
        filename = re.sub(r'[\x00-\x1f\x7f]', '', filename)

        # 去除首尾空格和点
        filename = filename.strip('. ')

        # 截断到最大长度
        if len(filename) > max_length:
            filename = filename[:max_length]

        # 如果清理后为空，使用默认名称
        if not filename:
            filename = "untitled"

        return filename


# 便捷函数
def parse_timestamp(value: Any) -> Optional[datetime]:
    """解析时间戳（全局函数）"""
    return DataParser.parse_timestamp(value)


def clean_text(text: str, max_length: Optional[int] = None) -> str:
    """清理文本（全局函数）"""
    return DataParser.clean_text(text, max_length)


def detect_media_type(content: Any, url: str = "", metadata: Optional[dict] = None) -> str:
    """检测媒体类型（全局函数）"""
    return DataParser.detect_media_type(content, url, metadata)
