import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app


def test_validate_bilibili_account_success():
    """测试Bilibili账号验证成功"""
    # Mock the BilibiliAPIProvider
    mock_user_info = {
        'name': 'bilibili',
        'avatar_url': 'https://i0.hdslb.com/bfs/face/example.jpg',
        'profile_url': 'https://space.bilibili.com/2',
        'category': '科技',
        'verified': True,
        'followers_count': 1000000
    }

    with patch('routers.influencers.BilibiliAPIProvider') as MockProvider:
        mock_instance = MockProvider.return_value
        mock_instance.fetch_user_info = AsyncMock(return_value=mock_user_info)

        client = TestClient(app)
        response = client.post("/api/influencers/validate", json={
            "platform": "bilibili",
            "accountId": "2"  # bilibili官方账号
        })

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert "name" in data["data"]
        assert data["data"]["name"] == "bilibili"
        assert "avatarUrl" in data["data"]
        assert "category" in data["data"]


def test_validate_unsupported_platform():
    """测试不支持的平台"""
    client = TestClient(app)
    response = client.post("/api/influencers/validate", json={
        "platform": "weibo",
        "accountId": "123456"
    })

    assert response.status_code == 400
    data = response.json()
    assert "该平台暂不支持自动获取" in data["detail"]


def test_validate_invalid_account():
    """测试无效账号ID"""
    # Mock the BilibiliAPIProvider to return empty result
    with patch('routers.influencers.BilibiliAPIProvider') as MockProvider:
        mock_instance = MockProvider.return_value
        mock_instance.fetch_user_info = AsyncMock(return_value={})

        client = TestClient(app)
        response = client.post("/api/influencers/validate", json={
            "platform": "bilibili",
            "accountId": "99999999999"
        })

        assert response.status_code == 400
        data = response.json()
        assert "无法获取用户信息" in data["detail"]
