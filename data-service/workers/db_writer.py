"""
数据库写入线程池
使用独立线程批量写入数据，避免阻塞主流程
"""

import logging
import time
import json
import httpx
from queue import Queue, Empty
from threading import Thread
from typing import List
from datetime import datetime

from models.article import AnalyzedArticle

logger = logging.getLogger(__name__)


class DatabaseWriter:
    """数据库写入线程池"""

    def __init__(
        self,
        workers: int = 2,
        batch_size: int = 10,
        retry_limit: int = 3,
        nextjs_url: str = "http://localhost:3000"
    ):
        """
        初始化数据库写入器

        Args:
            workers: 工作线程数量，默认2
            batch_size: 批量写入大小，默认10条
            retry_limit: 失败重试次数，默认3次
            nextjs_url: Next.js API地址
        """
        self.queue = Queue()
        self.batch_size = batch_size
        self.retry_limit = retry_limit
        self.nextjs_url = nextjs_url
        self.threads = []
        self.running = True

        # 统计指标
        self.stats = {
            'total_enqueued': 0,
            'total_saved': 0,
            'total_failed': 0
        }

        # 启动工作线程
        for i in range(workers):
            t = Thread(
                target=self._worker,
                name=f"DBWriter-{i}",
                daemon=True
            )
            t.start()
            self.threads.append(t)

        logger.info(f"数据库写入器初始化完成，线程数: {workers}, 批量大小: {batch_size}")

    def enqueue(self, articles: List[AnalyzedArticle]):
        """
        将分析完的数据加入队列

        Args:
            articles: 分析后的文章列表
        """
        for article in articles:
            self.queue.put(article)
            self.stats['total_enqueued'] += 1

        logger.info(f"加入队列: {len(articles)} 条记录")

    def _worker(self):
        """工作线程主循环"""
        batch = []

        while self.running:
            try:
                # 2秒超时等待
                article = self.queue.get(timeout=2.0)
                batch.append(article)

                # 达到批量大小时写入
                if len(batch) >= self.batch_size:
                    self._batch_write(batch)
                    batch = []

            except Empty:
                # 超时但有数据，写入
                if batch:
                    self._batch_write(batch)
                    batch = []

    def _batch_write(self, articles: List[AnalyzedArticle]):
        """
        批量写入数据库（带重试）

        Args:
            articles: 分析后的文章列表
        """
        for attempt in range(self.retry_limit):
            try:
                self._write_to_database(articles)
                self.stats['total_saved'] += len(articles)
                logger.info(f"成功写入 {len(articles)} 条记录")
                return

            except Exception as e:
                wait_time = 2 ** attempt  # 指数退避: 1s, 2s, 4s
                logger.warning(
                    f"写入失败 (尝试 {attempt + 1}/{self.retry_limit}): {e}"
                )
                if attempt < self.retry_limit - 1:
                    time.sleep(wait_time)

        # 重试失败，记录错误
        self.stats['total_failed'] += len(articles)
        self._log_failed_writes(articles)

    def _write_to_database(self, articles: List[AnalyzedArticle]):
        """
        通过Next.js API写入数据库

        Args:
            articles: 分析后的文章列表
        """
        # 转换为API格式
        payload = [
            {
                'id': a.id,
                'title': a.title,
                'content': a.content,
                'summary': a.summary or a.title[:100],  # 使用AI生成的摘要，fallback到标题
                'source': a.source,
                'url': a.url,
                'publishTime': a.publishTime,
                'categoryId': a.categoryId,
                'categoryConfidence': a.categoryConfidence,
                'domainId': a.domainId,
                'domainIds': json.dumps(a.domainIds) if a.domainIds else None,
                'segmentCodes': json.dumps(a.segmentCodes) if a.segmentCodes else None,
                'sentiment': a.sentiment,
                'sentimentLabel': a.sentimentLabel,
                'sentimentConfidence': a.sentimentConfidence,
                'impact': a.impact,
                'keywords': a.keywords,
                'entities': a.entities,
                'sectors': a.sectors,
                'aiProcessed': a.aiProcessed,
                'aiProcessedAt': a.aiProcessedAt.isoformat() if a.aiProcessedAt else None,
                'aiError': a.aiError
            }
            for a in articles
        ]

        # 调用Next.js批量保存API
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{self.nextjs_url}/api/events/batch-save",
                json={'articles': payload}
            )
            response.raise_for_status()

    def _log_failed_writes(self, articles: List[AnalyzedArticle]):
        """
        记录写入失败的数据

        Args:
            articles: 失败的文章列表
        """
        failed_ids = [a.id for a in articles]
        logger.error(f"写入失败，记录ID: {failed_ids}")

        # TODO: 可选择写入错误日志文件或数据库表
        with open('failed_writes.log', 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now().isoformat()} - Failed IDs: {failed_ids}\n")

    def get_stats(self) -> dict:
        """
        获取统计指标

        Returns:
            统计数据字典
        """
        return {
            **self.stats,
            'queue_size': self.queue.qsize(),
            'success_rate': (
                self.stats['total_saved'] / self.stats['total_enqueued']
                if self.stats['total_enqueued'] > 0
                else 0
            )
        }

    def shutdown(self):
        """关闭写入器，等待队列清空"""
        logger.info("正在关闭数据库写入器...")
        self.running = False

        # 等待所有线程结束
        for t in self.threads:
            t.join(timeout=5.0)

        logger.info(f"数据库写入器已关闭，统计: {self.get_stats()}")
