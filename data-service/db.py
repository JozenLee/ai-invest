"""
数据库连接模块
提供SQLite数据库连接（与Prisma共享同一个数据库）
"""

import sqlite3
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class Database:
    """数据库连接管理器"""

    def __init__(self, db_path: Optional[str] = None):
        """
        初始化数据库连接

        Args:
            db_path: 数据库文件路径，默认使用项目根目录的 prisma/dev.db
        """
        if db_path is None:
            # 默认使用 Prisma 的数据库文件
            project_root = Path(__file__).parent.parent
            db_path = str(project_root / "prisma" / "dev.db")

        self.db_path = db_path
        logger.info(f"Database initialized with path: {db_path}")

    def get_connection(self) -> sqlite3.Connection:
        """
        获取数据库连接

        Returns:
            sqlite3.Connection: 数据库连接对象
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # 使用字典式访问
        return conn

    def execute(self, query: str, params: tuple = ()):
        """
        执行查询并返回结果

        Args:
            query: SQL查询语句
            params: 查询参数

        Returns:
            查询结果列表
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, params)
            results = cursor.fetchall()
            return [dict(row) for row in results]
        finally:
            conn.close()

    def execute_many(self, query: str, params_list: list):
        """
        批量执行SQL语句

        Args:
            query: SQL语句
            params_list: 参数列表
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.executemany(query, params_list)
            conn.commit()
        finally:
            conn.close()

    def insert(self, query: str, params: tuple = ()):
        """
        插入数据并返回插入的ID

        Args:
            query: INSERT语句
            params: 参数

        Returns:
            插入的行ID
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def update(self, query: str, params: tuple = ()):
        """
        更新数据并返回受影响的行数

        Args:
            query: UPDATE语句
            params: 参数

        Returns:
            受影响的行数
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()


# 全局数据库实例
db = Database()
