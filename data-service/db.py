"""
SQLite 数据库访问层
使用 aiosqlite 直接操作数据库，与 Prisma Schema 保持一致
"""

import aiosqlite
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
import os

logger = logging.getLogger(__name__)

# 数据库路径（与 Prisma 使用同一个数据库文件）
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "prisma", "dev.db")


class Database:
    """数据库访问类"""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        logger.info(f"数据库路径: {self.db_path}")

    @asynccontextmanager
    async def get_connection(self):
        """获取数据库连接（上下文管理器）"""
        conn = await aiosqlite.connect(self.db_path)
        conn.row_factory = aiosqlite.Row
        try:
            yield conn
            await conn.commit()
        except Exception as e:
            await conn.rollback()
            logger.error(f"数据库事务失败: {e}")
            raise e
        finally:
            await conn.close()

    # ============ NewsArticle 操作 ============

    async def insert_news_article(self, article: Dict[str, Any]) -> Optional[str]:
        """
        插入新闻文章

        Args:
            article: 文章数据字典

        Returns:
            文章ID，如果已存在则返回None
        """
        try:
            async with self.get_connection() as conn:
                cursor = await conn.execute("""
                    INSERT INTO NewsArticle (
                        id, title, content, summary, source, url, publishTime,
                        category, categoryId, categoryConfidence, domainId, domainIds,
                        sourceId, sentiment, sentimentLabel, sentimentConfidence,
                        impact, entities, keywords, sectors, aiProcessed, aiProcessedAt,
                        aiError, expiresAt, createdAt
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                """, (
                    article.get('id'),
                    article.get('title'),
                    article.get('content'),
                    article.get('summary'),
                    article.get('source'),
                    article.get('url'),
                    article.get('publishTime'),
                    article.get('category'),
                    article.get('categoryId'),
                    article.get('categoryConfidence'),
                    article.get('domainId'),
                    article.get('domainIds'),
                    article.get('sourceId'),
                    article.get('sentiment'),
                    article.get('sentimentLabel'),
                    article.get('sentimentConfidence'),
                    article.get('impact'),
                    article.get('entities'),
                    article.get('keywords'),
                    article.get('sectors'),
                    1 if article.get('aiProcessed') else 0,
                    article.get('aiProcessedAt'),
                    article.get('aiError'),
                    article.get('expiresAt'),
                    article.get('createdAt', datetime.utcnow().isoformat())
                ))
                logger.debug(f"插入文章成功: {article.get('title')[:50]}")
                return article.get('id')
        except aiosqlite.IntegrityError as e:
            if 'UNIQUE constraint failed' in str(e):
                logger.debug(f"文章已存在: {article.get('url')}")
                return None
            logger.error(f"插入文章失败: {e}")
            raise e
        except Exception as e:
            logger.error(f"插入文章失败: {e}, title={article.get('title', '')[:50]}")
            return None

    async def check_article_exists(self, url: str) -> bool:
        """检查文章是否存在"""
        if not url:
            return False

        try:
            async with self.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT id FROM NewsArticle WHERE url = ? LIMIT 1",
                    (url,)
                )
                result = await cursor.fetchone()
                return result is not None
        except Exception as e:
            logger.error(f"检查文章存在性失败: {e}")
            return False

    async def delete_expired_articles(self, before_date: str) -> int:
        """删除过期文章"""
        try:
            async with self.get_connection() as conn:
                cursor = await conn.execute(
                    "DELETE FROM NewsArticle WHERE expiresAt < ?",
                    (before_date,)
                )
                deleted_count = cursor.rowcount
                logger.info(f"删除过期文章: {deleted_count} 条")
                return deleted_count
        except Exception as e:
            logger.error(f"删除过期文章失败: {e}")
            return 0

    # ============ DataSourceLog 操作 ============

    async def create_datasource_log(self, log: Dict[str, Any]) -> str:
        """创建采集日志"""
        try:
            async with self.get_connection() as conn:
                log_id = log.get('id', f"log_{int(datetime.utcnow().timestamp() * 1000)}")
                await conn.execute("""
                    INSERT INTO DataSourceLog (
                        id, sourceId, jobId, status, message,
                        fetchedCount, processedCount, failedCount,
                        duration, errorDetail, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    log_id,
                    log.get('sourceId'),
                    log.get('jobId'),
                    log.get('status', 'running'),
                    log.get('message'),
                    log.get('fetchedCount', 0),
                    log.get('processedCount', 0),
                    log.get('failedCount', 0),
                    log.get('duration'),
                    log.get('errorDetail'),
                    datetime.utcnow().isoformat()
                ))
                logger.debug(f"创建采集日志: {log_id}")
                return log_id
        except Exception as e:
            logger.error(f"创建采集日志失败: {e}")
            return f"log_{int(datetime.utcnow().timestamp() * 1000)}"

    async def update_datasource_log(self, log_id: str, updates: Dict[str, Any]):
        """更新采集日志"""
        if not updates:
            return

        try:
            fields = []
            values = []
            for key, value in updates.items():
                fields.append(f"{key} = ?")
                values.append(value)

            values.append(log_id)
            query = f"UPDATE DataSourceLog SET {', '.join(fields)} WHERE id = ?"

            async with self.get_connection() as conn:
                await conn.execute(query, values)
                logger.debug(f"更新采集日志: {log_id}")
        except Exception as e:
            logger.error(f"更新采集日志失败: {e}")

    # ============ DataSource 操作 ============

    async def get_datasource(self, source_id: str) -> Optional[Dict]:
        """获取数据源配置"""
        try:
            async with self.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM DataSource WHERE id = ?",
                    (source_id,)
                )
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            logger.error(f"获取数据源失败: {e}")
            return None

    async def get_active_datasources(self) -> List[Dict]:
        """获取所有激活的数据源"""
        try:
            async with self.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM DataSource WHERE isActive = 1 ORDER BY createdAt DESC"
                )
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"获取激活数据源失败: {e}")
            return []

    async def update_datasource_status(
        self,
        source_id: str,
        status: str,
        last_fetch_at: str,
        error_message: Optional[str] = None
    ):
        """更新数据源状态"""
        try:
            async with self.get_connection() as conn:
                await conn.execute("""
                    UPDATE DataSource
                    SET lastFetchStatus = ?,
                        lastFetchAt = ?,
                        errorMessage = ?,
                        updatedAt = ?
                    WHERE id = ?
                """, (status, last_fetch_at, error_message, datetime.utcnow().isoformat(), source_id))
                logger.debug(f"更新数据源状态: {source_id} -> {status}")
        except Exception as e:
            logger.error(f"更新数据源状态失败: {e}")

    # ============ StorageConfig 操作 ============

    async def get_storage_config(self) -> Dict:
        """获取存储配置（单例）"""
        try:
            async with self.get_connection() as conn:
                cursor = await conn.execute("SELECT * FROM StorageConfig LIMIT 1")
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                # 如果不存在，返回默认值
                logger.warning("StorageConfig 不存在，返回默认值")
                return {
                    'retentionDays': 7,
                    'maxArticles': 10000,
                    'archiveEnabled': False,
                    'cleanupSchedule': '0 2 * * *'
                }
        except Exception as e:
            logger.error(f"获取存储配置失败: {e}")
            return {
                'retentionDays': 7,
                'maxArticles': 10000,
                'archiveEnabled': False,
                'cleanupSchedule': '0 2 * * *'
            }

    async def update_storage_config(self, config: Dict[str, Any]):
        """更新存储配置"""
        try:
            async with self.get_connection() as conn:
                # 先检查是否存在配置
                cursor = await conn.execute("SELECT id FROM StorageConfig LIMIT 1")
                existing = await cursor.fetchone()

                if existing:
                    # 更新
                    await conn.execute("""
                        UPDATE StorageConfig
                        SET retentionDays = ?,
                            maxArticles = ?,
                            archiveEnabled = ?,
                            cleanupSchedule = ?,
                            updatedAt = ?
                        WHERE id = ?
                    """, (
                        config.get('retentionDays'),
                        config.get('maxArticles'),
                        1 if config.get('archiveEnabled') else 0,
                        config.get('cleanupSchedule'),
                        datetime.now().isoformat(),
                        existing['id']
                    ))
                    logger.info("更新存储配置成功")
                else:
                    # 创建
                    await conn.execute("""
                        INSERT INTO StorageConfig (
                            id, retentionDays, maxArticles, archiveEnabled,
                            cleanupSchedule, createdAt, updatedAt
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        f"config_{int(datetime.now().timestamp())}",
                        config.get('retentionDays', 7),
                        config.get('maxArticles', 10000),
                        1 if config.get('archiveEnabled', False) else 0,
                        config.get('cleanupSchedule', '0 2 * * *'),
                        datetime.now().isoformat(),
                        datetime.now().isoformat()
                    ))
                    logger.info("创建存储配置成功")
        except Exception as e:
            logger.error(f"更新存储配置失败: {e}")

    # ============ Influencer 操作 ============

    async def insert_influencer_post(self, post: Dict[str, Any]) -> Optional[str]:
        """插入大V动态"""
        try:
            async with self.get_connection() as conn:
                post_id = post.get('id', f"post_{int(datetime.now().timestamp() * 1000)}")
                await conn.execute("""
                    INSERT INTO InfluencerPost (
                        id, influencerId, content, originalUrl, publishTime,
                        sentiment, extractedTopics, relatedDomains, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    post_id,
                    post.get('influencerId'),
                    post.get('content'),
                    post.get('originalUrl'),
                    post.get('publishTime'),
                    post.get('sentiment'),
                    post.get('extractedTopics'),
                    post.get('relatedDomains'),
                    datetime.now().isoformat()
                ))
                logger.debug(f"插入大V动态: {post_id}")
                return post_id
        except Exception as e:
            logger.error(f"插入大V动态失败: {e}")
            return None

    async def get_influencers_by_platform(self, platform: str) -> List[Dict]:
        """获取指定平台的大V列表"""
        try:
            async with self.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM Influencer WHERE platform = ? AND isActive = 1",
                    (platform,)
                )
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"获取大V列表失败: {e}")
            return []


# 全局数据库实例
db = Database()
