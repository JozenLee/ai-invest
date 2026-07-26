import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from workers.data_cleanup import cleanup_expired_posts
import aiosqlite
import tempfile
import os


class MockDatabase:
    """Test database wrapper"""

    def __init__(self, db_path):
        self.db_path = db_path

    def get_connection(self):
        """Return a context manager for database connection"""
        return _ConnectionContextManager(self.db_path)


class _ConnectionContextManager:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = None

    async def __aenter__(self):
        self.conn = await aiosqlite.connect(self.db_path)
        self.conn.row_factory = aiosqlite.Row
        return self.conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            await self.conn.commit()
        else:
            await self.conn.rollback()
        await self.conn.close()


@pytest_asyncio.fixture
async def test_db():
    """Create a temporary test database"""
    # Create temp file
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    db = MockDatabase(path)

    # Create schema
    async with db.get_connection() as conn:
        await conn.execute("""
            CREATE TABLE Influencer (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                platform TEXT NOT NULL,
                accountId TEXT NOT NULL,
                dataRetentionDays INTEGER DEFAULT 90,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            )
        """)

        await conn.execute("""
            CREATE TABLE InfluencerPost (
                id TEXT PRIMARY KEY,
                influencerId TEXT NOT NULL,
                content TEXT NOT NULL,
                publishTime TEXT,
                createdAt TEXT NOT NULL
            )
        """)

    yield db

    # Cleanup
    os.unlink(path)


@pytest.mark.asyncio
async def test_cleanup_expired_posts(test_db):
    """测试清理过期动态"""
    # 创建influencer，保留期30天
    async with test_db.get_connection() as conn:
        await conn.execute("""
            INSERT INTO Influencer (
                id, name, platform, accountId, dataRetentionDays, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ('inf1', 'Test', 'bilibili', '123', 30, '2024-01-01', '2024-01-01'))

    # 插入过期和未过期的动态
    now = datetime.now()
    expired_time = now - timedelta(days=35)
    recent_time = now - timedelta(days=10)

    async with test_db.get_connection() as conn:
        # 过期动态
        await conn.execute("""
            INSERT INTO InfluencerPost (
                id, influencerId, content, publishTime, createdAt
            ) VALUES (?, ?, ?, ?, ?)
        """, ('post1', 'inf1', 'Old post', expired_time.isoformat(), expired_time.isoformat()))

        # 未过期动态
        await conn.execute("""
            INSERT INTO InfluencerPost (
                id, influencerId, content, publishTime, createdAt
            ) VALUES (?, ?, ?, ?, ?)
        """, ('post2', 'inf1', 'Recent post', recent_time.isoformat(), recent_time.isoformat()))

    # 执行清理
    deleted_count = await cleanup_expired_posts(test_db)

    # 验证只删除了过期的
    assert deleted_count == 1

    async with test_db.get_connection() as conn:
        cursor = await conn.execute("SELECT COUNT(*) as cnt FROM InfluencerPost")
        row = await cursor.fetchone()
        assert row['cnt'] == 1

        # 确认剩下的是未过期的
        cursor = await conn.execute("SELECT id FROM InfluencerPost")
        row = await cursor.fetchone()
        assert row['id'] == 'post2'


@pytest.mark.asyncio
async def test_cleanup_respects_different_retention_days(test_db):
    """测试不同influencer的不同保留期"""
    # 创建两个influencer，不同保留期
    async with test_db.get_connection() as conn:
        await conn.execute("""
            INSERT INTO Influencer (
                id, name, platform, accountId, dataRetentionDays, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ('inf1', 'Test1', 'bilibili', '123', 30, '2024-01-01', '2024-01-01'))

        await conn.execute("""
            INSERT INTO Influencer (
                id, name, platform, accountId, dataRetentionDays, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ('inf2', 'Test2', 'bilibili', '456', 60, '2024-01-01', '2024-01-01'))

    # 插入40天前的动态（对inf1过期，对inf2未过期）
    old_time = datetime.now() - timedelta(days=40)

    async with test_db.get_connection() as conn:
        await conn.execute("""
            INSERT INTO InfluencerPost (
                id, influencerId, content, publishTime, createdAt
            ) VALUES (?, ?, ?, ?, ?)
        """, ('post1', 'inf1', 'Post 1', old_time.isoformat(), old_time.isoformat()))

        await conn.execute("""
            INSERT INTO InfluencerPost (
                id, influencerId, content, publishTime, createdAt
            ) VALUES (?, ?, ?, ?, ?)
        """, ('post2', 'inf2', 'Post 2', old_time.isoformat(), old_time.isoformat()))

    # 执行清理
    deleted_count = await cleanup_expired_posts(test_db)

    # 只有inf1的动态被删除
    assert deleted_count == 1

    async with test_db.get_connection() as conn:
        cursor = await conn.execute("SELECT influencerId FROM InfluencerPost")
        row = await cursor.fetchone()
        assert row['influencerId'] == 'inf2'
