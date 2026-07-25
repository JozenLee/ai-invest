import pytest
import hashlib
from unittest.mock import AsyncMock, Mock, MagicMock, patch
from datetime import datetime, timedelta
from services.influencer_fetch_service import InfluencerFetchService

@pytest.fixture
def mock_provider():
    """Mock influencer provider"""
    provider = Mock()
    provider.fetch_user_posts = AsyncMock(return_value=[
        {
            'content': 'Test post 1',
            'url': 'http://example.com/post1',
            'publish_time': datetime.now(),
            'media_type': 'text',
            'media_urls': [],
            'likes': 100,
            'comments': 50,
            'shares': 30
        },
        {
            'content': 'Test post 2',
            'url': 'http://example.com/post2',
            'publish_time': datetime.now(),
            'media_type': 'image',
            'media_urls': ['http://example.com/img.jpg'],
            'likes': 200,
            'comments': 100,
            'shares': 60
        }
    ])
    return provider

@pytest.mark.asyncio
async def test_fetch_influencer_posts_success(mock_provider):
    """Test successful fetch and save of influencer posts"""
    # Setup mock influencer
    influencer = {
        'id': 'inf_123',
        'platform': 'weibo',
        'accountId': '1234567890',
        'driverType': 'api',
        'providerConfig': '{}',
        'lastFetchAt': None
    }

    # Create mock database
    mock_db = Mock()

    async def mock_get_connection(*args):
        conn = AsyncMock()

        async def mock_execute(query, *args):
            cursor = AsyncMock()

            if 'SELECT * FROM Influencer WHERE id' in query:
                cursor.fetchone = AsyncMock(return_value=influencer)
            elif 'SELECT content FROM InfluencerPost' in query:
                cursor.fetchall = AsyncMock(return_value=[])
            else:
                cursor.fetchone = AsyncMock(return_value=None)
                cursor.fetchall = AsyncMock(return_value=[])

            return cursor

        conn.execute = mock_execute
        conn.commit = AsyncMock()
        return conn

    cm = MagicMock()
    cm.__aenter__ = mock_get_connection
    cm.__aexit__ = AsyncMock(return_value=None)
    mock_db.get_connection = Mock(return_value=cm)

    # Create service
    service = InfluencerFetchService(mock_db)

    # Mock provider registry
    with patch('services.influencer_fetch_service.InfluencerProviderRegistry') as mock_registry:
        mock_provider_class = Mock(return_value=mock_provider)
        mock_registry.get_provider.return_value = mock_provider_class

        # Execute
        result = await service.fetch_influencer_posts('inf_123')

        # Verify
        assert result['success'] == True
        assert result['posts_fetched'] == 2
        assert result['posts_new'] == 2
        assert mock_provider.fetch_user_posts.called

@pytest.mark.asyncio
async def test_fetch_influencer_posts_deduplication(mock_provider):
    """Test deduplication logic using content hash"""
    # Setup mock influencer
    influencer = {
        'id': 'inf_123',
        'platform': 'weibo',
        'accountId': '1234567890',
        'driverType': 'api',
        'providerConfig': '{}',
        'lastFetchAt': None
    }

    # Mock existing posts - one with same content as new post
    existing_content = 'Test post 1'
    existing_posts = [{'content': existing_content}]

    # Create mock database
    mock_db = Mock()

    async def mock_get_connection(*args):
        conn = AsyncMock()

        async def mock_execute(query, *args):
            cursor = AsyncMock()

            if 'SELECT * FROM Influencer WHERE id' in query:
                cursor.fetchone = AsyncMock(return_value=influencer)
            elif 'SELECT content FROM InfluencerPost' in query:
                cursor.fetchall = AsyncMock(return_value=existing_posts)
            else:
                cursor.fetchone = AsyncMock(return_value=None)
                cursor.fetchall = AsyncMock(return_value=[])

            return cursor

        conn.execute = mock_execute
        conn.commit = AsyncMock()
        return conn

    cm = MagicMock()
    cm.__aenter__ = mock_get_connection
    cm.__aexit__ = AsyncMock(return_value=None)
    mock_db.get_connection = Mock(return_value=cm)

    # Create service
    service = InfluencerFetchService(mock_db)

    # Mock provider registry
    with patch('services.influencer_fetch_service.InfluencerProviderRegistry') as mock_registry:
        mock_provider_class = Mock(return_value=mock_provider)
        mock_registry.get_provider.return_value = mock_provider_class

        # Execute
        result = await service.fetch_influencer_posts('inf_123')

        # Verify - should only add 1 new post (Test post 2), dedupe Test post 1
        assert result['success'] == True
        assert result['posts_fetched'] == 2
        assert result['posts_new'] == 1  # Only one new post after deduplication

@pytest.mark.asyncio
async def test_fetch_all_due(mock_provider):
    """Test batch fetch of all due influencers"""
    # Setup mock influencers - all should be processed
    now = datetime.now()
    due_time = now - timedelta(minutes=61)

    influencers = [
        {
            'id': 'inf_1',
            'platform': 'weibo',
            'accountId': '111',
            'driverType': 'api',
            'providerConfig': '{}',
            'fetchInterval': 60,
            'lastFetchAt': due_time.isoformat(),
            'isActive': 1
        },
        {
            'id': 'inf_2',
            'platform': 'weibo',
            'accountId': '222',
            'driverType': 'api',
            'providerConfig': '{}',
            'fetchInterval': 60,
            'lastFetchAt': due_time.isoformat(),
            'isActive': 1
        }
    ]

    # Create mock database
    mock_db = Mock()

    call_count = [0]

    async def mock_get_connection(*args):
        conn = AsyncMock()

        async def mock_execute(query, *args):
            cursor = AsyncMock()

            if 'SELECT * FROM Influencer' and 'isActive = 1' in query and 'WHERE id' not in query:
                # Query for due influencers
                cursor.fetchall = AsyncMock(return_value=influencers)
            elif 'SELECT * FROM Influencer WHERE id' in query:
                # Query for specific influencer
                call_count[0] += 1
                idx = (call_count[0] - 1) % len(influencers)
                cursor.fetchone = AsyncMock(return_value=influencers[idx])
            elif 'SELECT content FROM InfluencerPost' in query:
                cursor.fetchall = AsyncMock(return_value=[])
            else:
                cursor.fetchone = AsyncMock(return_value=None)
                cursor.fetchall = AsyncMock(return_value=[])

            return cursor

        conn.execute = mock_execute
        conn.commit = AsyncMock()
        return conn

    cm = MagicMock()
    cm.__aenter__ = mock_get_connection
    cm.__aexit__ = AsyncMock(return_value=None)
    mock_db.get_connection = Mock(return_value=cm)

    # Create service
    service = InfluencerFetchService(mock_db)

    # Mock provider registry
    with patch('services.influencer_fetch_service.InfluencerProviderRegistry') as mock_registry:
        mock_provider_class = Mock(return_value=mock_provider)
        mock_registry.get_provider.return_value = mock_provider_class

        # Execute
        result = await service.fetch_all_due()

        # Verify
        assert 'total_fetched' in result
        assert 'success_count' in result
        assert 'error_count' in result
        assert result['total_fetched'] == 2
        assert result['success_count'] == 2

@pytest.mark.asyncio
async def test_fetch_logs_creation(mock_provider):
    """Test that fetch logs are created correctly"""
    # Setup mock influencer
    influencer = {
        'id': 'inf_123',
        'platform': 'weibo',
        'accountId': '1234567890',
        'driverType': 'api',
        'providerConfig': '{}',
        'lastFetchAt': None
    }

    # Track log creation
    log_created = []

    # Create mock database
    mock_db = Mock()

    async def mock_get_connection(*args):
        conn = AsyncMock()

        async def mock_execute(query, *args):
            # Track INSERT INTO InfluencerFetchLog
            if 'INSERT INTO InfluencerFetchLog' in query:
                log_created.append(args)

            cursor = AsyncMock()

            if 'SELECT * FROM Influencer WHERE id' in query:
                cursor.fetchone = AsyncMock(return_value=influencer)
            elif 'SELECT content FROM InfluencerPost' in query:
                cursor.fetchall = AsyncMock(return_value=[])
            else:
                cursor.fetchone = AsyncMock(return_value=None)
                cursor.fetchall = AsyncMock(return_value=[])

            return cursor

        conn.execute = mock_execute
        conn.commit = AsyncMock()
        return conn

    cm = MagicMock()
    cm.__aenter__ = mock_get_connection
    cm.__aexit__ = AsyncMock(return_value=None)
    mock_db.get_connection = Mock(return_value=cm)

    # Create service
    service = InfluencerFetchService(mock_db)

    # Mock provider registry
    with patch('services.influencer_fetch_service.InfluencerProviderRegistry') as mock_registry:
        mock_provider_class = Mock(return_value=mock_provider)
        mock_registry.get_provider.return_value = mock_provider_class

        # Execute
        result = await service.fetch_influencer_posts('inf_123')

        # Verify log was created
        assert len(log_created) > 0
        log_data = log_created[0][0] if log_created[0] else ()  # Extract tuple from args
        assert log_data[1] == 'inf_123'  # influencerId
        assert log_data[2] == 'weibo'    # platform
        assert log_data[3] == 'success'  # status
