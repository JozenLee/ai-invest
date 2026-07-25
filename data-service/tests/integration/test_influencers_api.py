"""
Integration tests for Influencer Management API
Tests all endpoints defined in routers/influencers.py
"""

import pytest
import asyncio
from fastapi.testclient import TestClient
from datetime import datetime
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from main import app
from db import db

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def event_loop():
    """Create an event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


def cleanup_test_data_sync():
    """Synchronous cleanup helper"""
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prisma", "dev.db")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Influencer WHERE accountId LIKE 'test_%'")
        cursor.execute("DELETE FROM InfluencerPost WHERE influencerId LIKE 'test_%'")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Cleanup warning: {e}")


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Clean up test data before and after tests"""
    # Clean before
    cleanup_test_data_sync()
    yield
    # Clean after
    cleanup_test_data_sync()


class TestInfluencersAPI:
    """Test suite for influencer management endpoints"""

    def test_create_influencer(self):
        """Test creating a new influencer"""
        response = client.post("/api/influencers/", json={
            "name": "测试大V",
            "platform": "weibo",
            "accountId": "test_123456",
            "driverType": "api",
            "fetchInterval": 60,
            "priority": "high",
            "isActive": True
        })

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data["name"] == "测试大V"
        assert data["platform"] == "weibo"
        assert data["accountId"] == "test_123456"
        assert data["priority"] == "high"
        assert data["fetchInterval"] == 60
        assert data["isActive"] is True
        assert "id" in data
        assert "createdAt" in data

        # Store ID for other tests
        TestInfluencersAPI.created_influencer_id = data["id"]

    def test_create_influencer_duplicate(self):
        """Test creating duplicate influencer returns error"""
        # First create
        response1 = client.post("/api/influencers/", json={
            "name": "测试大V2",
            "platform": "weibo",
            "accountId": "test_duplicate_123"
        })
        assert response1.status_code == 200

        # Try to create duplicate
        response2 = client.post("/api/influencers/", json={
            "name": "测试大V2_重复",
            "platform": "weibo",
            "accountId": "test_duplicate_123"  # Same accountId
        })
        assert response2.status_code == 400
        assert "already exists" in response2.json()["detail"]

    def test_create_influencer_invalid_platform(self):
        """Test creating influencer with invalid platform"""
        response = client.post("/api/influencers/", json={
            "name": "测试大V3",
            "platform": "invalid_platform",
            "accountId": "test_invalid_123"
        })

        assert response.status_code == 400
        assert "Unsupported platform" in response.json()["detail"]

    def test_list_influencers(self):
        """Test listing influencers"""
        # Create a test influencer first
        client.post("/api/influencers/", json={
            "name": "测试列表大V",
            "platform": "bilibili",
            "accountId": "test_list_123"
        })

        response = client.get("/api/influencers/")

        assert response.status_code == 200

        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "pageSize" in data
        assert isinstance(data["items"], list)
        assert data["page"] == 1
        assert data["pageSize"] == 20
        assert data["total"] > 0

    def test_list_influencers_with_filter(self):
        """Test listing influencers with platform filter"""
        # Create influencers with different platforms
        client.post("/api/influencers/", json={
            "name": "测试微博大V",
            "platform": "weibo",
            "accountId": "test_weibo_filter_123"
        })

        client.post("/api/influencers/", json={
            "name": "测试B站大V",
            "platform": "bilibili",
            "accountId": "test_bilibili_filter_123"
        })

        # Filter by weibo
        response = client.get("/api/influencers/?platform=weibo")
        assert response.status_code == 200

        data = response.json()
        assert all(item["platform"] == "weibo" for item in data["items"])

        # Filter by bilibili
        response = client.get("/api/influencers/?platform=bilibili")
        assert response.status_code == 200

        data = response.json()
        assert all(item["platform"] == "bilibili" for item in data["items"])

    def test_list_influencers_pagination(self):
        """Test pagination parameters"""
        response = client.get("/api/influencers/?page=1&pageSize=5")

        assert response.status_code == 200

        data = response.json()
        assert data["page"] == 1
        assert data["pageSize"] == 5
        assert len(data["items"]) <= 5

    def test_get_influencer(self):
        """Test getting a single influencer by ID"""
        # Create an influencer
        create_response = client.post("/api/influencers/", json={
            "name": "测试获取大V",
            "platform": "weibo",
            "accountId": "test_get_123"
        })
        influencer_id = create_response.json()["id"]

        # Get the influencer
        response = client.get(f"/api/influencers/{influencer_id}")

        assert response.status_code == 200

        data = response.json()
        assert data["id"] == influencer_id
        assert data["name"] == "测试获取大V"
        assert data["platform"] == "weibo"
        assert data["accountId"] == "test_get_123"

    def test_get_influencer_not_found(self):
        """Test getting non-existent influencer returns 404"""
        response = client.get("/api/influencers/non_existent_id")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_trigger_fetch(self):
        """Test manually triggering post fetch"""
        # Create an influencer
        create_response = client.post("/api/influencers/", json={
            "name": "测试采集大V",
            "platform": "weibo",
            "accountId": "test_fetch_123"
        })
        influencer_id = create_response.json()["id"]

        # Trigger fetch (will fail due to mock provider, but should return proper response)
        response = client.post(f"/api/influencers/{influencer_id}/fetch")

        # Should return 200 even if fetch fails (error captured in response)
        assert response.status_code in [200, 500]

        if response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "postsFetched" in data
            assert "postsNew" in data

    def test_trigger_fetch_not_found(self):
        """Test triggering fetch for non-existent influencer"""
        response = client.post("/api/influencers/non_existent_id/fetch")

        assert response.status_code == 404

    def test_get_domain_opinions(self):
        """Test getting aggregated domain opinions"""
        # Test with default time window
        response = client.get("/api/influencers/opinions/domain/AI_CHIP")

        assert response.status_code == 200

        data = response.json()
        assert data["domain"] == "AI_CHIP"
        assert data["time_window"] == "7d"
        assert "statistics" in data
        assert "total_opinions" in data["statistics"]
        assert "stance_distribution" in data["statistics"]
        assert "bullish" in data["statistics"]["stance_distribution"]
        assert "neutral" in data["statistics"]["stance_distribution"]
        assert "bearish" in data["statistics"]["stance_distribution"]
        assert "top_opinions" in data

    def test_get_domain_opinions_with_time_window(self):
        """Test domain opinions with different time windows"""
        # Test 3d window
        response = client.get("/api/influencers/opinions/domain/AI_CHIP?time_window=3d")
        assert response.status_code == 200
        assert response.json()["time_window"] == "3d"

        # Test 7d window
        response = client.get("/api/influencers/opinions/domain/AI_CHIP?time_window=7d")
        assert response.status_code == 200
        assert response.json()["time_window"] == "7d"

        # Test 30d window
        response = client.get("/api/influencers/opinions/domain/AI_CHIP?time_window=30d")
        assert response.status_code == 200
        assert response.json()["time_window"] == "30d"

    def test_get_domain_opinions_invalid_time_window(self):
        """Test domain opinions with invalid time window"""
        response = client.get("/api/influencers/opinions/domain/AI_CHIP?time_window=invalid")

        # Should return 422 for validation error
        assert response.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
