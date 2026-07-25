import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime
from providers.weibo_provider import WeiboAPIProvider

@pytest.fixture
def provider():
    config = {
        'platform': 'weibo',
        'driver_type': 'api',
        'api_key': 'test_key',
        'access_token': 'test_token'
    }
    return WeiboAPIProvider(config)

@pytest.mark.asyncio
async def test_fetch_user_info_success(provider):
    """Test successful user info fetch"""
    mock_response_data = {
        'screen_name': '测试用户',
        'avatar_large': 'http://example.com/avatar.jpg',
        'description': '这是简介',
        'verified': True,
        'followers_count': 10000
    }

    # Create proper async mock
    mock_response = Mock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value=mock_response_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=None)

    mock_session = Mock()
    mock_session.get = Mock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)

    with patch('aiohttp.ClientSession', return_value=mock_session):
        result = await provider.fetch_user_info('1234567890')

        assert result['name'] == '测试用户'
        assert result['avatar_url'] == 'http://example.com/avatar.jpg'
        assert result['verified'] == True
        assert result['followers_count'] == 10000

@pytest.mark.asyncio
async def test_fetch_user_posts_success(provider):
    """Test successful posts fetch"""
    mock_response_data = {
        'statuses': [
            {
                'id': '12345',
                'text': '这是一条测试微博',
                'created_at': 'Tue May 31 17:46:55 +0800 2011',
                'user': {'id': '1234567890'},
                'pic_urls': [],
                'attitudes_count': 100,
                'comments_count': 50,
                'reposts_count': 30
            }
        ]
    }

    # Create proper async mock
    mock_response = Mock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value=mock_response_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=None)

    mock_session = Mock()
    mock_session.get = Mock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)

    with patch('aiohttp.ClientSession', return_value=mock_session):
        result = await provider.fetch_user_posts('1234567890', limit=20)

        assert len(result) == 1
        assert result[0]['content'] == '这是一条测试微博'
        assert result[0]['likes'] == 100

@pytest.mark.asyncio
async def test_validate_account_exists(provider):
    """Test account validation - exists"""
    with patch.object(provider, 'fetch_user_info', return_value={'name': '测试'}):
        result = await provider.validate_account('1234567890')
        assert result == True

@pytest.mark.asyncio
async def test_validate_account_not_exists(provider):
    """Test account validation - not exists"""
    with patch.object(provider, 'fetch_user_info', return_value={}):
        result = await provider.validate_account('invalid')
        assert result == False
