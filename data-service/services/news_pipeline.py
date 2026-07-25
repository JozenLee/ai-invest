"""
新闻处理管道
统筹采集、分析、存储、推送的完整流程
"""

import asyncio
import logging
import os
from typing import List
from datetime import datetime

from models.article import RawArticle, AnalyzedArticle, PipelineResult
from providers.newsnow_provider import NewsNowProvider
from workers.ai_analyzer import AIAnalyzer
from workers.db_writer import DatabaseWriter
from services.sse_manager import sse_manager

logger = logging.getLogger(__name__)


class NewsPipeline:
    """新闻处理管道统筹"""

    def __init__(
        self,
        provider: NewsNowProvider = None,
        analyzer: AIAnalyzer = None,
        writer: DatabaseWriter = None,
        nextjs_url: str = None
    ):
        """
        初始化管道

        Args:
            provider: 数据提供者
            analyzer: AI分析器
            writer: 数据库写入器
            nextjs_url: Next.js API地址
        """
        self.provider = provider or NewsNowProvider()
        self.analyzer = analyzer or AIAnalyzer(concurrency=5)

        # 获取Next.js URL
        nextjs_url = nextjs_url or os.getenv('NEXTJS_URL', 'http://localhost:3000')
        self.writer = writer or DatabaseWriter(workers=2, nextjs_url=nextjs_url)

        logger.info("新闻处理管道初始化完成")

    async def run(self, platform_id: str = "cls-hot", limit: int = 50) -> PipelineResult:
        """
        执行完整管道流程

        Args:
            platform_id: 平台ID
            limit: 采集数量限制

        Returns:
            管道执行结果
        """
        start_time = datetime.now()
        logger.info(f"开始执行新闻处理管道: platform={platform_id}, limit={limit}")

        try:
            # 1. 数据采集
            raw_articles = await self.fetch_from_sources(platform_id, limit)
            if not raw_articles:
                logger.warning("未采集到新闻数据")
                return PipelineResult(
                    fetched=0,
                    analyzed=0,
                    saved=0,
                    failed=0,
                    timestamp=datetime.now()
                )

            # 2. AI分析（异步并发）
            analyzed_articles = await self.analyzer.analyze_batch(raw_articles)

            # 3. 存储（后台线程）
            self.writer.enqueue(analyzed_articles)

            # 等待一小段时间让部分数据写入
            await asyncio.sleep(2)

            # 获取写入统计
            writer_stats = self.writer.get_stats()

            # 4. 推送更新事件
            await sse_manager.notify_batch_completed(
                fetched=len(raw_articles),
                analyzed=len(analyzed_articles),
                saved=writer_stats['total_saved'],
                failed=len(raw_articles) - len(analyzed_articles)
            )

            # 构建结果
            result = PipelineResult(
                fetched=len(raw_articles),
                analyzed=len(analyzed_articles),
                saved=writer_stats['total_saved'],
                failed=len(raw_articles) - len(analyzed_articles),
                timestamp=datetime.now()
            )

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(
                f"管道执行完成: 采集{result.fetched}条, "
                f"分析{result.analyzed}条, 保存{result.saved}条, "
                f"失败{result.failed}条, 耗时{elapsed:.2f}秒"
            )

            return result

        except Exception as e:
            logger.error(f"管道执行失败: {e}", exc_info=True)
            raise

    async def fetch_from_sources(
        self,
        platform_id: str = "cls-hot",
        limit: int = 50
    ) -> List[RawArticle]:
        """
        从数据源采集新闻

        Args:
            platform_id: 平台ID
            limit: 采集数量限制

        Returns:
            原始新闻列表
        """
        logger.info(f"开始采集新闻: platform={platform_id}, limit={limit}")

        try:
            # 调用NewsNowProvider获取数据
            df = await self.provider.get_news(keyword=platform_id, limit=limit)

            if df.empty:
                logger.warning(f"未获取到新闻数据: platform={platform_id}")
                return []

            # 转换为RawArticle列表
            articles = []
            for idx, row in df.iterrows():
                article = RawArticle(
                    id=f"{platform_id}_{idx}_{int(datetime.now().timestamp())}",
                    title=str(row.get('新闻标题', '')),
                    content=str(row.get('新闻内容', '')),
                    source=str(row.get('来源', platform_id)),
                    url=str(row.get('新闻链接', '')),
                    publishTime=str(row.get('发布时间', datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
                )
                articles.append(article)

            logger.info(f"成功采集 {len(articles)} 条新闻")
            return articles

        except Exception as e:
            logger.error(f"采集新闻失败: {e}", exc_info=True)
            return []

    async def get_stats(self) -> dict:
        """
        获取管道统计信息

        Returns:
            统计数据字典
        """
        return {
            'writer': self.writer.get_stats(),
            'sse': sse_manager.get_stats(),
            'timestamp': datetime.now().isoformat()
        }

    def shutdown(self):
        """关闭管道，清理资源"""
        logger.info("正在关闭新闻处理管道...")
        self.writer.shutdown()
        logger.info("新闻处理管道已关闭")
