"""
NewsNow API Provider
基于 NewsNow 开源API (MIT Licensed) 提供财经新闻聚合
数据源: https://github.com/ourongxing/newsnow

支持的财经平台:
- wallstreetcn-hot: 华尔街见闻热榜
- cls-hot: 财联社热榜
- thepaper: 澎湃财经
- 36kr: 36氪
- jinse: 金色财经(加密货币)
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
import pandas as pd
import requests
from requests.exceptions import RequestException, Timeout

from .base import DataProvider

logger = logging.getLogger(__name__)


class NewsNowProvider(DataProvider):
    """NewsNow API 数据提供者"""

    name = "newsnow"

    # NewsNow API 端点
    BASE_URL = "https://newsnow.busiyi.world/api/s"

    # 支持的财经平台配置
    FINANCIAL_PLATFORMS = {
        "wallstreetcn-hot": {
            "name": "华尔街见闻",
            "category": "综合财经媒体",
            "description": "专业财经媒体，实时全球金融市场动态"
        },
        "cls-hot": {
            "name": "财联社",
            "category": "综合财经媒体",
            "description": "7x24小时财经快讯，A股核心资讯源"
        },
        "thepaper": {
            "name": "澎湃财经",
            "category": "综合财经媒体",
            "description": "澎湃新闻财经频道，宏观经济与产业新闻"
        },
        "36kr": {
            "name": "36氪",
            "category": "科技创投媒体",
            "description": "科技创业投资资讯，关注新经济领域"
        },
        "jinse": {
            "name": "金色财经",
            "category": "加密货币媒体",
            "description": "区块链与加密货币行业资讯"
        }
    }

    def __init__(self, timeout: int = 10):
        """
        初始化 NewsNow Provider

        Args:
            timeout: 请求超时时间（秒）
        """
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": "https://newsnow.busiyi.world/",
            "Origin": "https://newsnow.busiyi.world",
            "Connection": "keep-alive",
        })

    async def get_news(
        self,
        keyword: str = "wallstreetcn-hot",
        limit: int = 50,
        api: str = "newsnow"
    ) -> pd.DataFrame:
        """
        获取 NewsNow 新闻数据

        Args:
            keyword: 平台ID (wallstreetcn-hot/cls-hot/thepaper/36kr/jinse)
            limit: 返回条数限制
            api: API类型标识（预留，暂时未使用）

        Returns:
            DataFrame with columns: 新闻标题/新闻内容/新闻链接/发布时间/来源/平台ID/排名
        """
        platform_id = keyword if keyword in self.FINANCIAL_PLATFORMS else "wallstreetcn-hot"

        logger.info(f"[NewsNow] 开始获取新闻: platform={platform_id}, limit={limit}")

        try:
            # 调用 NewsNow API（返回元组：items列表和updatedTime）
            news_items, updated_time = await self._fetch_from_api(platform_id)

            if not news_items:
                logger.warning(f"[NewsNow] 未获取到数据: platform={platform_id}")
                return pd.DataFrame()

            # 转换为标准格式
            records = []
            platform_info = self.FINANCIAL_PLATFORMS.get(platform_id, {})
            source_name = platform_info.get("name", platform_id)

            for idx, item in enumerate(news_items[:limit]):
                # 提取发布时间（优先级：item级别时间字段 > API级别updatedTime > 当前时间）
                publish_time = self._extract_publish_time(item, updated_time)

                # NewsNow API 返回字段: id, title, url, mobileUrl(可选)
                record = {
                    "新闻标题": item.get("title", ""),
                    "新闻内容": item.get("title", ""),  # NewsNow API 只有标题
                    "新闻链接": item.get("url", ""),
                    "发布时间": publish_time,
                    "来源": source_name,
                    "平台ID": platform_id,
                    "排名": idx + 1,
                }
                records.append(record)

            df = pd.DataFrame(records)

            # 尝试从页面提取真实发布时间（异步批量处理）
            df = await self._enrich_publish_times(df)

            logger.info(f"[NewsNow] 成功获取 {len(df)} 条新闻")
            return df

        except Exception as e:
            logger.error(f"[NewsNow] 获取新闻失败: {str(e)}")
            return pd.DataFrame()

    async def _fetch_from_api(self, platform_id: str) -> tuple[List[Dict[str, Any]], Optional[str]]:
        """
        调用 NewsNow API 获取原始数据

        Args:
            platform_id: 平台标识

        Returns:
            元组: (新闻条目列表, API更新时间)
        """
        try:
            # NewsNow API 参数
            params = {
                "id": platform_id,
            }

            # 使用 asyncio 包装同步请求
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.session.get(
                    self.BASE_URL,
                    params=params,
                    timeout=self.timeout
                )
            )

            response.raise_for_status()
            data = response.json()

            # NewsNow API 返回格式: {"status": ..., "id": ..., "updatedTime": ..., "items": [...], "info": ...}
            items = []
            updated_time = None

            if isinstance(data, dict):
                # 提取updatedTime（API级别的更新时间）
                if "updatedTime" in data:
                    updated_time = data["updatedTime"]

                # 提取items列表
                if "items" in data:
                    items = data["items"]
                elif "data" in data:
                    items = data["data"]
                elif "list" in data:
                    items = data["list"]
                else:
                    logger.warning(f"[NewsNow] 未知的dict结构，keys: {list(data.keys())}")
                    logger.debug(f"[NewsNow] 实际响应: {data}")
                    return [], None

            elif isinstance(data, list):
                items = data
            else:
                logger.warning(f"[NewsNow] 未知的API响应格式: {type(data)}")
                return [], None

            if items:
                logger.info(f"[NewsNow] API返回 {len(items)} 条数据, updatedTime={updated_time}")
            else:
                logger.warning(f"[NewsNow] API返回空数据")

            return items, updated_time

        except Timeout:
            logger.error(f"[NewsNow] 请求超时: platform={platform_id}")
            return [], None
        except RequestException as e:
            logger.error(f"[NewsNow] 请求失败: {str(e)}")
            return [], None
        except Exception as e:
            logger.error(f"[NewsNow] 未知错误: {str(e)}")
            return [], None

    async def _enrich_publish_times(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        批量从新闻页面提取真实发布时间

        Args:
            df: 包含新闻链接和初始发布时间的DataFrame

        Returns:
            更新了发布时间的DataFrame
        """
        try:
            from utils.time_extractor import time_extractor

            # 批量提取真实时间
            urls = df['新闻链接'].tolist()
            tasks = [time_extractor.extract_publish_time(url) for url in urls]

            # 限制总提取时间（避免采集任务超时）
            try:
                extracted_times = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=30.0  # 30秒超时
                )
            except asyncio.TimeoutError:
                logger.warning("[NewsNow] 批量提取发布时间超时，使用原始时间")
                return df

            # 更新成功提取的时间
            updated_count = 0
            for idx, extracted_time in enumerate(extracted_times):
                if isinstance(extracted_time, str) and extracted_time:
                    df.at[idx, '发布时间'] = extracted_time
                    updated_count += 1

            if updated_count > 0:
                logger.info(f"[NewsNow] 成功提取 {updated_count}/{len(df)} 条新闻的真实发布时间")
            else:
                logger.warning(f"[NewsNow] 未能提取任何真实发布时间，使用API时间")

            return df

        except Exception as e:
            logger.warning(f"[NewsNow] 提取真实发布时间失败，使用原始时间: {e}")
            return df

    def _extract_publish_time(self, item: Dict[str, Any], api_updated_time: Optional[str] = None) -> str:
        """
        从NewsNow API响应中提取发布时间

        注意：NewsNow API的item级别不提供时间字段（仅有id/title/url），
        因此使用API级别的updatedTime作为所有新闻的发布时间基准。

        优先级：
        1. time字段（item级别，Unix时间戳 - 实际不存在）
        2. pubDate字段（item级别，ISO格式 - 实际不存在）
        3. updatedTime（API级别，所有新闻共享此时间）
        4. 当前时间（最后的降级方案）

        Args:
            item: NewsNow API返回的单条新闻数据
            api_updated_time: API级别的updatedTime字段

        Returns:
            时间字符串 (YYYY-MM-DD HH:MM:SS)
        """
        try:
            # 优先级1: time字段（item级别，Unix时间戳）
            if "time" in item and item["time"]:
                try:
                    timestamp = int(item["time"])
                    # 检测是毫秒还是秒（如果大于10位数字，则为毫秒）
                    if timestamp > 10000000000:
                        timestamp = timestamp / 1000
                    dt = datetime.fromtimestamp(timestamp)
                    return dt.strftime("%Y-%m-%d %H:%M:%S")
                except (ValueError, TypeError, OSError) as e:
                    logger.warning(f"[NewsNow] 解析time字段失败: {e}, value={item.get('time')}")

            # 优先级2: pubDate字段（item级别，ISO格式）
            if "pubDate" in item and item["pubDate"]:
                try:
                    dt = datetime.fromisoformat(str(item["pubDate"]).replace("Z", "+00:00"))
                    return dt.strftime("%Y-%m-%d %H:%M:%S")
                except (ValueError, TypeError) as e:
                    logger.warning(f"[NewsNow] 解析pubDate字段失败: {e}, value={item.get('pubDate')}")

            # 优先级3: API级别的updatedTime
            if api_updated_time:
                try:
                    # 可能是时间戳或ISO格式
                    if isinstance(api_updated_time, (int, float)):
                        timestamp = int(api_updated_time)
                        if timestamp > 10000000000:
                            timestamp = timestamp / 1000
                        dt = datetime.fromtimestamp(timestamp)
                    else:
                        # 尝试ISO格式
                        dt = datetime.fromisoformat(str(api_updated_time).replace("Z", "+00:00"))
                    return dt.strftime("%Y-%m-%d %H:%M:%S")
                except (ValueError, TypeError, OSError) as e:
                    logger.warning(f"[NewsNow] 解析updatedTime失败: {e}, value={api_updated_time}")

            # 降级方案：使用当前时间（仅在API完全没有时间信息时）
            logger.warning(f"[NewsNow] 未找到任何时间字段，使用当前时间作为降级方案")
            return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        except Exception as e:
            logger.error(f"[NewsNow] 提取发布时间时发生未知错误: {e}")
            return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ==================== 以下方法为必须实现的抽象方法，NewsNow不支持这些数据 ====================

    async def get_index_spot(self) -> pd.DataFrame:
        raise NotImplementedError(f"{self.name} 不支持指数行情数据")

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError(f"{self.name} 不支持指数K线数据")

    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError(f"{self.name} 不支持指数实时数据")

    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError(f"{self.name} 不支持个股行情数据")

    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str, adjust: str = "qfq") -> pd.DataFrame:
        raise NotImplementedError(f"{self.name} 不支持个股K线数据")

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError(f"{self.name} 不支持ETF行情数据")

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError(f"{self.name} 不支持ETF K线数据")

    async def get_market_capital_flow(self) -> Dict:
        raise NotImplementedError(f"{self.name} 不支持资金流向数据")

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        raise NotImplementedError(f"{self.name} 不支持板块资金流向数据")

    async def get_northbound_flow(self) -> Dict:
        raise NotImplementedError(f"{self.name} 不支持北向资金数据")

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        raise NotImplementedError(f"{self.name} 不支持北向资金历史数据")

    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        raise NotImplementedError(f"{self.name} 不支持个股资金流向数据")

    async def get_margin_data(self) -> Dict:
        raise NotImplementedError(f"{self.name} 不支持融资融券数据")
