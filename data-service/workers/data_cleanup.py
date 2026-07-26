"""
Data Cleanup Worker
定期清理过期的influencer动态数据
"""

import logging
from datetime import datetime
from db import Database

logger = logging.getLogger(__name__)


async def cleanup_expired_posts(db: Database) -> int:
    """
    清理过期的influencer动态

    根据每个influencer的dataRetentionDays配置清理过期数据

    Returns:
        清理的记录数
    """
    try:
        deleted_total = 0

        async with db.get_connection() as conn:
            # 获取所有influencer的保留配置
            cursor = await conn.execute("""
                SELECT id, name, dataRetentionDays FROM Influencer
            """)
            influencers = await cursor.fetchall()

        logger.info(f"Starting cleanup for {len(influencers)} influencers")

        # 对每个influencer执行清理
        for inf in influencers:
            influencer_id = inf['id']
            retention_days = inf['dataRetentionDays']

            async with db.get_connection() as conn:
                cursor = await conn.execute("""
                    DELETE FROM InfluencerPost
                    WHERE influencerId = ?
                    AND publishTime < datetime('now', '-' || ? || ' days')
                """, (influencer_id, retention_days))

                deleted_count = cursor.rowcount
                deleted_total += deleted_count

                if deleted_count > 0:
                    logger.info(f"Cleaned {deleted_count} expired posts for influencer {inf['name']} (retention: {retention_days} days)")

        logger.info(f"Cleanup completed: {deleted_total} posts deleted")
        return deleted_total

    except Exception as e:
        logger.error(f"Data cleanup failed: {e}")
        return 0


async def run_cleanup_task():
    """
    运行清理任务（供调度器调用）
    """
    from db import db  # Import from main db instance

    logger.info("Running scheduled data cleanup task")
    deleted = await cleanup_expired_posts(db)
    logger.info(f"Cleanup task completed: {deleted} posts deleted")
