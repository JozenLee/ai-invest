import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime
from services.influencer_fetch_service import InfluencerFetchService
import aiosqlite
import tempfile
import os


class MockDatabase:
    """Test database wrapper that uses a shared connection"""

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
                category TEXT,
                avatarUrl TEXT,
                profileUrl TEXT,
                driverType TEXT DEFAULT 'api',
                providerConfig TEXT,
                lastFetchAt TEXT,
                lastFetchStatus TEXT,
                lastFetchError TEXT,
                isActive INTEGER DEFAULT 1,
                fetchInterval INTEGER DEFAULT 60,
                priority INTEGER DEFAULT 0,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            )
        """)

        await conn.execute("""
            CREATE TABLE InfluencerPost (
                id TEXT PRIMARY KEY,
                influencerId TEXT NOT NULL,
                content TEXT NOT NULL,
                originalUrl TEXT,
                publishTime TEXT,
                mediaType TEXT DEFAULT 'text',
                mediaUrls TEXT,
                engagement TEXT,
                aiProcessed INTEGER DEFAULT 0,
                createdAt TEXT NOT NULL
            )
        """)

        await conn.execute("""
            CREATE TABLE InfluencerFetchLog (
                id TEXT PRIMARY KEY,
                influencerId TEXT NOT NULL,
                platform TEXT NOT NULL,
                status TEXT NOT NULL,
                postsFetched INTEGER DEFAULT 0,
                postsNew INTEGER DEFAULT 0,
                durationMs INTEGER DEFAULT 0,
                errorMessage TEXT,
                createdAt TEXT NOT NULL
            )
        """)

    yield db

    # Cleanup
    os.unlink(path)


@pytest.mark.asyncio
async def test_sync_platform_info_on_fetch(test_db):
    """测试抓取时同步平台信息"""
    service = InfluencerFetchService(test_db)

    # Create influencer
    async with test_db.get_connection() as conn:
        await conn.execute("""
            INSERT INTO Influencer (
                id, name, platform, accountId, category, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ('test_id', '旧名称', 'bilibili', '123', '旧领域', '2024-01-01', '2024-01-01'))

    # Mock provider
    mock_provider_instance = AsyncMock()
    mock_provider_instance.fetch_user_info.return_value = {
        'name': '更新后的名称',
        'avatar_url': 'https://new-avatar.jpg',
        'profile_url': 'https://new-profile',
        'category': '新领域',
    }
    mock_provider_instance.fetch_user_posts.return_value = []

    mock_provider_class = MagicMock(return_value=mock_provider_instance)

    with patch('providers.provider_registry.InfluencerProviderRegistry.get_provider', return_value=mock_provider_class):
        # Execute fetch (will trigger sync)
        result = await service.fetch_influencer_posts('test_id')

        assert result['success'] == True

        # Verify info was updated
        async with test_db.get_connection() as conn:
            cursor = await conn.execute("SELECT * FROM Influencer WHERE id = ?", ('test_id',))
            row = await cursor.fetchone()

        assert row['name'] == '更新后的名称'
        assert row['avatarUrl'] == 'https://new-avatar.jpg'
        assert row['category'] == '新领域'


@pytest.mark.asyncio
async def test_no_sync_on_fetch_failure(test_db):
    """测试获取用户信息失败时不更新"""
    service = InfluencerFetchService(test_db)

    # Create influencer
    async with test_db.get_connection() as conn:
        await conn.execute("""
            INSERT INTO Influencer (
                id, name, platform, accountId, category, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ('test_id', '原名称', 'bilibili', '123', '原领域', '2024-01-01', '2024-01-01'))

    # Mock provider returning empty
    mock_provider_instance = AsyncMock()
    mock_provider_instance.fetch_user_info.return_value = {}
    mock_provider_instance.fetch_user_posts.return_value = []

    mock_provider_class = MagicMock(return_value=mock_provider_instance)

    with patch('providers.provider_registry.InfluencerProviderRegistry.get_provider', return_value=mock_provider_class):
        result = await service.fetch_influencer_posts('test_id')

        assert result['success'] == True

        # Verify info unchanged
        async with test_db.get_connection() as conn:
            cursor = await conn.execute("SELECT * FROM Influencer WHERE id = ?", ('test_id',))
            row = await cursor.fetchone()

        assert row['name'] == '原名称'
        assert row['category'] == '原领域'

