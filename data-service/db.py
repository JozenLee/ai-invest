"""
数据库连接模块
提供SQLite数据库连接（与Prisma共享同一个数据库）
"""

import sqlite3
from pathlib import Path
from typing import Optional
from datetime import datetime
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

    def get_datasource(self, source_id: str):
        """
        根据ID获取数据源配置

        Args:
            source_id: 数据源ID

        Returns:
            数据源配置字典，如果不存在返回None
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, type, driverType, provider, category, config,
                       updateFrequency, isActive, lastFetchAt, lastFetchStatus
                FROM DataSource
                WHERE id = ?
                LIMIT 1
            """, (source_id,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
        finally:
            conn.close()

    def check_article_exists(self, url: str) -> bool:
        """
        检查文章URL是否已存在

        Args:
            url: 文章URL

        Returns:
            bool: True表示存在，False表示不存在
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) as count FROM NewsArticle WHERE url = ?
            """, (url,))
            row = cursor.fetchone()
            return row['count'] > 0 if row else False
        finally:
            conn.close()

    def check_article_id_exists(self, article_id: str) -> bool:
        """
        检查文章ID是否已存在

        Args:
            article_id: 文章ID

        Returns:
            bool: True表示存在，False表示不存在
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) as count FROM NewsArticle WHERE id = ?
            """, (article_id,))
            row = cursor.fetchone()
            return row['count'] > 0 if row else False
        finally:
            conn.close()

    def get_category_id_by_code(self, code: str) -> Optional[str]:
        """根据代码获取分类ID"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id FROM NewsCategory WHERE code = ? LIMIT 1
            """, (code,))
            row = cursor.fetchone()
            return row['id'] if row else None
        finally:
            conn.close()

    def get_domain_id_by_code(self, code: str) -> Optional[str]:
        """根据代码获取领域ID"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id FROM Domain WHERE code = ? LIMIT 1
            """, (code,))
            row = cursor.fetchone()
            return row['id'] if row else None
        finally:
            conn.close()

    def insert_news_article(self, article_data: dict) -> bool:
        """
        插入新闻文章到数据库

        Args:
            article_data: 文章数据字典

        Returns:
            bool: 插入成功返回True，失败返回False
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            # createdAt使用当前时间，如果数据中没有提供
            created_at = article_data.get('createdAt') or datetime.now().isoformat()

            # 根据category代码查找categoryId
            category_code = article_data.get('category', 'global_market')
            category_id = self.get_category_id_by_code(category_code)

            # 根据domainIds的第一个元素查找domainId
            domain_ids_str = article_data.get('domainIds')
            domain_id = None
            if domain_ids_str:
                try:
                    import json
                    domain_ids = json.loads(domain_ids_str) if isinstance(domain_ids_str, str) else domain_ids_str
                    if domain_ids and len(domain_ids) > 0:
                        domain_id = self.get_domain_id_by_code(domain_ids[0])
                        import logging
                        logging.info(f"🔍 [DB] domainIds={domain_ids}, domain_id={domain_id}")
                except Exception as e:
                    import logging
                    logging.error(f"🔍 [DB] 解析domainIds失败: {e}, domainIds_str={domain_ids_str}")

            import logging
            logging.info(f"🔍 [DB] 插入: category={category_code}, categoryId={category_id}, domainId={domain_id}")

            cursor.execute("""
                INSERT INTO NewsArticle (
                    id, title, content, summary, source, url, publishTime,
                    category, categoryId, categoryConfidence,
                    domainId, domainIds, segmentCodes, sourceId,
                    sentiment, sentimentLabel, sentimentConfidence,
                    impact, keywords, entities, sectors,
                    aiProcessed, aiProcessedAt, expiresAt, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                article_data.get('id'),
                article_data.get('title'),
                article_data.get('content'),
                article_data.get('summary'),
                article_data.get('source'),
                article_data.get('url'),
                article_data.get('publishTime'),
                category_code,
                category_id,
                article_data.get('categoryConfidence', 0.0),
                domain_id,
                domain_ids_str,
                article_data.get('segmentCodes'),  # ✅ 添加 segmentCodes 字段
                article_data.get('sourceId'),
                article_data.get('sentiment'),
                article_data.get('sentimentLabel'),
                article_data.get('sentimentConfidence', 0.0),
                article_data.get('impact'),
                article_data.get('keywords'),
                article_data.get('entities'),
                article_data.get('sectors'),
                article_data.get('aiProcessed', True),
                article_data.get('aiProcessedAt'),
                article_data.get('expiresAt'),
                created_at
            ))
            conn.commit()
            return True
        except Exception as e:
            import logging
            logging.error(f"插入新闻失败: {e}, title={article_data.get('title', '')[:50]}")
            conn.rollback()
            return False
        finally:
            conn.close()

    def update_datasource_status(self, source_id: str, status: str, last_fetch_at: str = None, error_message: str = None) -> bool:
        """更新数据源状态"""
        from datetime import datetime
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            # 如果没有传入 last_fetch_at，使用当前时间
            fetch_time = last_fetch_at if last_fetch_at else datetime.now().isoformat()
            cursor.execute("""
                UPDATE DataSource
                SET lastFetchStatus = ?, errorMessage = ?, lastFetchAt = ?, updatedAt = ?
                WHERE id = ?
            """, (status, error_message, fetch_time, datetime.now().isoformat(), source_id))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            return False
        finally:
            conn.close()

    def create_datasource_log(self, log_data: dict) -> str:
        """创建数据源采集日志并返回日志ID"""
        import uuid
        log_id = str(uuid.uuid4())
        log_data_with_id = {**log_data, 'id': log_id}
        success = self.insert_datasource_log(log_data_with_id)
        return log_id if success else None

    def insert_datasource_log(self, log_data: dict) -> bool:
        """插入数据源采集日志"""
        from datetime import datetime
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO DataSourceLog (
                    id, sourceId, jobId, status, message,
                    fetchedCount, processedCount, failedCount, duration, errorDetail, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                log_data.get('id'),
                log_data.get('sourceId'),
                log_data.get('jobId'),
                log_data.get('status'),
                log_data.get('message'),
                log_data.get('fetchedCount', 0),
                log_data.get('processedCount', 0),
                log_data.get('failedCount', 0),
                log_data.get('duration'),
                log_data.get('errorDetail'),
                datetime.now().isoformat()
            ))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            return False
        finally:
            conn.close()

    def update_datasource_log(self, log_id: str, log_data: dict) -> bool:
        """更新数据源采集日志"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE DataSourceLog
                SET status = ?, message = ?, fetchedCount = ?, processedCount = ?,
                    failedCount = ?, duration = ?, errorDetail = ?
                WHERE id = ?
            """, (
                log_data.get('status'),
                log_data.get('message'),
                log_data.get('fetchedCount', 0),
                log_data.get('processedCount', 0),
                log_data.get('failedCount', 0),
                log_data.get('duration'),
                log_data.get('errorDetail'),
                log_id
            ))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            return False
        finally:
            conn.close()


# 全局数据库实例
db = Database()
