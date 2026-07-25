import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime
from providers.bilibili_provider import BilibiliAPIProvider

@pytest.fixture
def provider():
    config = {
        'platform': 'bilibili',
        'driver_type': 'api',
        'api_key': 'test_key',
        'access_token': 'test_token'
    }
    return BilibiliAPIProvider(config)

@pytest.mark.asyncio
async def test_fetch_user_info_success(provider):
    """Test successful user info fetch"""
    mock_response_data = {
        'code': 0,
        'data': {
            'name': '测试UP主',
            'face': 'http://example.com/avatar.jpg',
            'sign': '这是个人简介',
            'official': {'type': 0},  # 0 = verified
            'follower': 50000
        }
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
        result = await provider.fetch_user_info('123456')

        assert result['name'] == '测试UP主'
        assert result['avatar_url'] == 'http://example.com/avatar.jpg'
        assert result['description'] == '这是个人简介'
        assert result['verified'] == True
        assert result['followers_count'] == 50000

@pytest.mark.asyncio
async def test_fetch_user_posts_success(provider):
    """Test successful posts fetch"""
    mock_response_data = {
        'code': 0,
        'data': {
            'items': [
                {
                    'id_str': '987654321',
                    'modules': {
                        'module_dynamic': {
                            'desc': {
                                'text': '这是一条测试动态'
                            }
                        },
                        'module_stat': {
                            'like': {'count': 200},
                            'comment': {'count': 80},
                            'forward': {'count': 40}
                        }
                    },
                    'type': 'DYNAMIC_TYPE_AV',  # video type
                    'basic': {
                        'comment_id_str': '987654321'
                    }
                }
            ]
        }
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
        result = await provider.fetch_user_posts('123456', limit=20)

        assert len(result) == 1
        assert result[0]['content'] == '这是一条测试动态'
        assert result[0]['likes'] == 200
        assert result[0]['comments'] == 80
        assert result[0]['shares'] == 40
        assert result[0]['media_type'] == 'video'

@pytest.mark.asyncio
async def test_validate_account_exists(provider):
    """Test account validation - exists"""
    with patch.object(provider, 'fetch_user_info', return_value={'name': '测试'}):
        result = await provider.validate_account('123456')
        assert result == True

@pytest.mark.asyncio
async def test_validate_account_not_exists(provider):
    """Test account validation - not exists"""
    with patch.object(provider, 'fetch_user_info', return_value={}):
        result = await provider.validate_account('invalid')
        assert result == False
