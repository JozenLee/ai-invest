"""
数据库连接模块
使用 Prisma Client Python 连接 SQLite 数据库
"""

from prisma import Prisma
import logging

logger = logging.getLogger(__name__)

# 全局 Prisma 客户端实例
db = Prisma()

async def connect_db():
    """连接数据库"""
    try:
        await db.connect()
        logger.info("数据库连接成功")
    except Exception as e:
        logger.error(f"数据库连接失败: {e}")
        raise

async def disconnect_db():
    """断开数据库连接"""
    try:
        await db.disconnect()
        logger.info("数据库已断开")
    except Exception as e:
        logger.error(f"数据库断开失败: {e}")
        raise

__all__ = ["db", "connect_db", "disconnect_db"]
