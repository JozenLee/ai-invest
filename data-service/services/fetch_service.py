"""
采集任务管理服务
负责执行数据源采集任务，集成AI清洗，并持久化到本地数据库
"""

import logging
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# 延迟导入避免循环依赖
def get_db():
    """获取数据库实例"""
    try:
        from db import db
        return db
    except ImportError:
        logger.warning("Prisma Client未安装，数据持久化功能不可用")
        return None


class FetchService:
    """采集任务管理服务"""

    def __init__(self):
        self.is_running = False
        self.active_tasks = {}

    async def execute_fetch_task(
        self,
        source_id: str,
        source_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        执行单个数据源的采集任务

        Args:
            source_id: 数据源ID
            source_config: 数据源配置

        Returns:
            采集结果字典
        """
        start_time = datetime.now()
        log_id = None

        try:
            logger.info(f"开始采集任务: source_id={source_id}")

            # 创建采集日志（初始状态）
            log_id = await self._create_fetch_log(source_id, "running")

            # 1. 根据 driverType 获取对应的 Provider
            driver_type = source_config.get("driverType", "api")
            provider = await self._get_provider(driver_type, source_config)

            # 2. 执行数据采集
            raw_data = await self._fetch_data(provider, source_config)
            fetched_count = len(raw_data)
            logger.info(f"采集完成: source_id={source_id}, count={fetched_count}")

            # 3. AI数据清洗（情感分析、分类、实体识别）
            processed_data = await self._process_with_ai(raw_data, source_id)
            processed_count = len([d for d in processed_data if d.get("aiProcessed")])
            failed_count = len([d for d in processed_data if d.get("aiError")])

            logger.info(
                f"AI处理完成: source_id={source_id}, "
                f"processed={processed_count}, failed={failed_count}"
            )

            # 4. 持久化到本地数据库
            stored_count = await self._store_to_database(processed_data, source_id)

            # 5. 计算耗时
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # 6. 更新采集日志
            await self._update_fetch_log(
                log_id=log_id,
                status="success",
                fetched_count=fetched_count,
                processed_count=processed_count,
                failed_count=failed_count,
                duration=duration_ms,
                message=f"成功采集并处理 {stored_count} 条数据"
            )

            # 7. 更新数据源状态
            await self._update_source_status(
                source_id=source_id,
                status="success",
                last_fetch_at=datetime.now()
            )

            return {
                "success": True,
                "source_id": source_id,
                "fetched_count": fetched_count,
                "processed_count": processed_count,
                "failed_count": failed_count,
                "stored_count": stored_count,
                "duration_ms": duration_ms
            }

        except Exception as e:
            logger.error(f"采集任务失败: source_id={source_id}, error={str(e)}")

            # 更新失败日志
            if log_id:
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                await self._update_fetch_log(
                    log_id=log_id,
                    status="failed",
                    fetched_count=0,
                    processed_count=0,
                    failed_count=0,
                    duration=duration_ms,
                    message=str(e),
                    error_detail=str(e)
                )

            # 更新数据源状态
            await self._update_source_status(
                source_id=source_id,
                status="failed",
                last_fetch_at=datetime.now(),
                error_message=str(e)
            )

            return {
                "success": False,
                "source_id": source_id,
                "error": str(e)
            }

    async def batch_fetch(self, source_ids: List[str]) -> List[Dict[str, Any]]:
        """
        批量并行采集多个数据源

        Args:
            source_ids: 数据源ID列表

        Returns:
            采集结果列表
        """
        logger.info(f"开始批量采集: count={len(source_ids)}")

        # TODO: 从数据库获取数据源配置
        # 这里先返回空结果，等集成 Prisma Client 后实现
        tasks = []
        for source_id in source_ids:
            # task = self.execute_fetch_task(source_id, config)
            # tasks.append(task)
            pass

        # results = await asyncio.gather(*tasks, return_exceptions=True)
        results = []

        logger.info(f"批量采集完成: total={len(results)}")
        return results

    async def _get_provider(self, driver_type: str, config: Dict[str, Any]):
        """根据驱动类型获取对应的 Provider"""
        # TODO: 实现驱动注册表，动态获取 Provider
        # 目前先使用现有的 AKShare Provider
        from services.data_service import data_service
        return data_service

    async def _fetch_data(self, provider, config: Dict[str, Any]) -> List[Dict]:
        """执行数据采集"""
        try:
            # 目前使用财联社新闻作为示例
            import pandas as pd
            df = await provider.get_news(keyword="财联社", limit=50)

            if df.empty:
                return []

            # 转换为字典列表
            news_list = []
            for idx, row in df.iterrows():
                news_list.append({
                    "title": str(row.get("新闻标题", "")),
                    "content": str(row.get("新闻内容", "")),
                    "url": str(row.get("新闻链接", "")),
                    "publishTime": str(row.get("发布时间", "")),
                    "source": "财联社"
                })

            return news_list

        except Exception as e:
            logger.error(f"数据采集失败: {e}")
            return []

    async def _process_with_ai(
        self,
        raw_data: List[Dict],
        source_id: str
    ) -> List[Dict]:
        """
        AI数据清洗：情感分析、分类、实体识别

        Args:
            raw_data: 原始数据列表
            source_id: 数据源ID

        Returns:
            处理后的数据列表
        """
        processed_data = []

        # TODO: 集成 content_analyzer.py 进行AI分析
        # 目前使用简单的规则处理
        for item in raw_data:
            try:
                title = item.get("title", "")
                content = item.get("content", "")

                # 简单分类
                category = self._categorize_news(title)

                # 简单情感分析
                sentiment_score, sentiment_label = self._simple_sentiment(title)

                # 提取板块
                sectors = self._extract_sectors(title)

                processed_item = {
                    **item,
                    "category": category,
                    "sentiment": sentiment_score,
                    "sentimentLabel": sentiment_label,
                    "sentimentConfidence": 0.6,  # 简单规则的置信度较低
                    "sectors": sectors,
                    "aiProcessed": True,
                    "aiProcessedAt": datetime.now().isoformat(),
                    "aiError": None
                }

                processed_data.append(processed_item)

            except Exception as e:
                logger.error(f"AI处理单条数据失败: {e}")
                processed_data.append({
                    **item,
                    "aiProcessed": False,
                    "aiError": str(e)
                })

        return processed_data

    def _categorize_news(self, title: str) -> str:
        """简单分类逻辑"""
        title_lower = title.lower()

        if any(kw in title_lower for kw in ["政策", "补贴", "规划", "意见"]):
            return "policy"
        elif any(kw in title_lower for kw in ["财报", "业绩", "营收", "利润"]):
            return "earnings"
        elif any(kw in title_lower for kw in ["发布", "新品", "产品", "推出"]):
            return "product"
        elif any(kw in title_lower for kw in ["合作", "并购", "收购", "战略"]):
            return "partnership"
        elif any(kw in title_lower for kw in ["供应", "产能", "出货", "订单"]):
            return "supply"
        elif any(kw in title_lower for kw in ["技术", "突破", "研发", "创新"]):
            return "tech"
        else:
            return "market"

    def _simple_sentiment(self, title: str) -> tuple:
        """简单情感分析"""
        positive_words = ["上涨", "利好", "增长", "突破", "创新", "成功", "盈利"]
        negative_words = ["下跌", "利空", "下滑", "失败", "亏损", "暴跌"]

        pos_count = sum(1 for word in positive_words if word in title)
        neg_count = sum(1 for word in negative_words if word in title)

        if pos_count > neg_count:
            return 0.5, "bullish"
        elif neg_count > pos_count:
            return -0.5, "bearish"
        else:
            return 0.0, "neutral"

    def _extract_sectors(self, title: str) -> List[str]:
        """提取板块"""
        sectors = []
        sector_keywords = {
            "半导体": ["半导体", "芯片", "GPU"],
            "光通信": ["光模块", "光通信"],
            "服务器": ["服务器", "算力"],
            "AI应用": ["大模型", "人工智能", "AI"]
        }

        for sector, keywords in sector_keywords.items():
            if any(kw in title for kw in keywords):
                sectors.append(sector)

        return sectors

    async def _store_to_database(
        self,
        data: List[Dict],
        source_id: str
    ) -> int:
        """
        持久化数据到本地数据库
        """
        db = get_db()
        if not db:
            logger.warning("数据库不可用，跳过持久化")
            return 0

        stored_count = 0

        try:
            for item in data:
                try:
                    # 解析发布时间
                    publish_time = self._parse_publish_time(item.get("publishTime", ""))

                    # 计算过期时间（默认7天后）
                    expires_at = datetime.now() + timedelta(days=7)

                    # 准备数据
                    article_data = {
                        "title": item.get("title", "")[:500],  # 限制长度
                        "content": item.get("content", "")[:10000],
                        "summary": item.get("title", "")[:200],
                        "source": item.get("source", "未知"),
                        "url": item.get("url"),
                        "publishTime": publish_time,
                        "category": item.get("category", "market"),
                        "sentiment": item.get("sentiment"),
                        "sentimentLabel": item.get("sentimentLabel"),
                        "sentimentConfidence": item.get("sentimentConfidence", 0.0),
                        "sectors": str(item.get("sectors", [])),  # JSON字符串
                        "sourceId": source_id,
                        "aiProcessed": item.get("aiProcessed", False),
                        "aiProcessedAt": datetime.fromisoformat(item["aiProcessedAt"]) if item.get("aiProcessedAt") else None,
                        "aiError": item.get("aiError"),
                        "expiresAt": expires_at
                    }

                    # 检查是否已存在（根据URL去重）
                    if article_data["url"]:
                        existing = await db.newsarticle.find_first(
                            where={"url": article_data["url"]}
                        )
                        if existing:
                            logger.debug(f"文章已存在，跳过: {article_data['url']}")
                            continue

                    # 插入数据库
                    await db.newsarticle.create(data=article_data)
                    stored_count += 1

                except Exception as e:
                    logger.error(f"插入单条数据失败: {e}, title={item.get('title', '')[:50]}")
                    continue

            logger.info(f"数据持久化完成: source_id={source_id}, stored={stored_count}/{len(data)}")
            return stored_count

        except Exception as e:
            logger.error(f"数据持久化失败: {e}")
            return stored_count

    def _parse_publish_time(self, time_str: str) -> datetime:
        """解析发布时间"""
        if not time_str:
            return datetime.now()

        try:
            # 尝试标准格式
            for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d"]:
                try:
                    return datetime.strptime(time_str, fmt)
                except ValueError:
                    continue

            # 相对时间处理
            import re
            now = datetime.now()

            if "天前" in time_str:
                match = re.search(r"(\d+)\s*天前", time_str)
                if match:
                    return now - timedelta(days=int(match.group(1)))
            elif "小时前" in time_str:
                match = re.search(r"(\d+)\s*小时前", time_str)
                if match:
                    return now - timedelta(hours=int(match.group(1)))
            elif "分钟前" in time_str:
                match = re.search(r"(\d+)\s*分钟前", time_str)
                if match:
                    return now - timedelta(minutes=int(match.group(1)))

            return now

        except Exception as e:
            logger.warning(f"时间解析失败: {time_str}, error={e}")
            return datetime.now()

    async def _create_fetch_log(
        self,
        source_id: str,
        status: str
    ) -> str:
        """创建采集日志"""
        db = get_db()
        if not db:
            return f"log_{datetime.now().timestamp()}"

        try:
            log = await db.datasourcelog.create(
                data={
                    "sourceId": source_id,
                    "status": status,
                    "message": "采集任务启动",
                    "fetchedCount": 0,
                    "processedCount": 0,
                    "failedCount": 0
                }
            )
            return log.id
        except Exception as e:
            logger.error(f"创建采集日志失败: {e}")
            return f"log_{datetime.now().timestamp()}"

    async def _update_fetch_log(
        self,
        log_id: str,
        status: str,
        fetched_count: int = 0,
        processed_count: int = 0,
        failed_count: int = 0,
        duration: int = 0,
        message: str = "",
        error_detail: str = ""
    ):
        """更新采集日志"""
        db = get_db()
        if not db:
            return

        try:
            await db.datasourcelog.update(
                where={"id": log_id},
                data={
                    "status": status,
                    "message": message,
                    "fetchedCount": fetched_count,
                    "processedCount": processed_count,
                    "failedCount": failed_count,
                    "duration": duration,
                    "errorDetail": error_detail
                }
            )
        except Exception as e:
            logger.error(f"更新采集日志失败: {e}")

    async def _update_source_status(
        self,
        source_id: str,
        status: str,
        last_fetch_at: datetime,
        error_message: str = ""
    ):
        """更新数据源状态"""
        db = get_db()
        if not db:
            return

        try:
            await db.datasource.update(
                where={"id": source_id},
                data={
                    "lastFetchStatus": status,
                    "lastFetchAt": last_fetch_at,
                    "errorMessage": error_message if error_message else None
                }
            )
        except Exception as e:
            logger.error(f"更新数据源状态失败: {e}")


# 全局单例
fetch_service = FetchService()
