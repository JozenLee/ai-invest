"""
Test influencer readonly fields validation and schedule fields
"""
import pytest
import sys
import os
import sqlite3

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Clean up test data before and after tests"""
    db_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prisma", "dev.db")

    def clean():
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM Influencer WHERE accountId LIKE 'test_%'")
            cursor.execute("DELETE FROM InfluencerPost WHERE influencerId LIKE 'test_%'")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Cleanup warning: {e}")

    # Clean before tests
    clean()
    yield
    # Clean after tests
    clean()


def test_create_with_schedule_fields():
    """测试创建时包含调度配置字段"""
    response = client.post("/api/influencers", json={
        "name": "测试大V",
        "platform": "bilibili",
        "accountId": "test_schedule123",
        "scheduleType": "daily",
        "dailyFetchTimes": ["12:00", "18:00"],
        "dataRetentionDays": 60
    })

    assert response.status_code == 200
    data = response.json()
    assert data["scheduleType"] == "daily"
    assert data["dailyFetchTimes"] == ["12:00", "18:00"]
    assert data["dataRetentionDays"] == 60


def test_create_with_default_schedule():
    """测试创建时使用默认调度配置"""
    response = client.post("/api/influencers", json={
        "name": "默认配置大V",
        "platform": "weibo",
        "accountId": "test_default456"
    })

    assert response.status_code == 200
    data = response.json()
    assert data["scheduleType"] == "polling"
    assert data["dataRetentionDays"] == 30


def test_update_readonly_field_rejected():
    """测试更新只读字段被拒绝"""
    # 先创建一个influencer
    create_response = client.post("/api/influencers", json={
        "name": "测试大V",
        "platform": "bilibili",
        "accountId": "test_readonly456"
    })
    assert create_response.status_code == 200
    influencer_id = create_response.json()["id"]

    # 尝试修改只读字段 - name
    update_response = client.put(f"/api/influencers/{influencer_id}", json={
        "name": "修改后的名称",
        "platform": "bilibili",
        "accountId": "test_readonly456"
    })

    assert update_response.status_code == 400
    assert "不允许手动修改" in update_response.json()["detail"]


def test_update_platform_rejected():
    """测试修改platform被拒绝"""
    # 创建
    create_response = client.post("/api/influencers", json={
        "name": "测试大V",
        "platform": "bilibili",
        "accountId": "test_platform789"
    })
    influencer_id = create_response.json()["id"]

    # 尝试修改platform
    update_response = client.put(f"/api/influencers/{influencer_id}", json={
        "name": "测试大V",
        "platform": "weibo",  # 改变平台
        "accountId": "test_platform789"
    })

    assert update_response.status_code == 400
    assert "platform" in update_response.json()["detail"]


def test_update_account_id_rejected():
    """测试修改accountId被拒绝"""
    # 创建
    create_response = client.post("/api/influencers", json={
        "name": "测试大V",
        "platform": "bilibili",
        "accountId": "test_original123"
    })
    influencer_id = create_response.json()["id"]

    # 尝试修改accountId
    update_response = client.put(f"/api/influencers/{influencer_id}", json={
        "name": "测试大V",
        "platform": "bilibili",
        "accountId": "test_changed456"  # 改变账号ID
    })

    assert update_response.status_code == 400
    assert "accountId" in update_response.json()["detail"]


def test_update_editable_fields_success():
    """测试更新可编辑字段成功"""
    # 创建
    create_response = client.post("/api/influencers", json={
        "name": "测试大V",
        "platform": "bilibili",
        "accountId": "test_editable789"
    })
    assert create_response.status_code == 200
    influencer_id = create_response.json()["id"]

    # 更新可编辑字段
    update_response = client.put(f"/api/influencers/{influencer_id}", json={
        "name": "测试大V",  # 保持不变
        "platform": "bilibili",  # 保持不变
        "accountId": "test_editable789",  # 保持不变
        "tags": ["AI", "科技"],
        "priority": "high",
        "scheduleType": "polling",
        "fetchInterval": 45,
        "dataRetentionDays": 90
    })

    assert update_response.status_code == 200
    data = update_response.json()
    assert data["priority"] == "high"
    assert data["scheduleType"] == "polling"
    assert data["fetchInterval"] == 45
    assert data["dataRetentionDays"] == 90


def test_update_schedule_to_daily():
    """测试更新调度类型为daily并设置时间"""
    # 创建
    create_response = client.post("/api/influencers", json={
        "name": "测试大V",
        "platform": "weibo",
        "accountId": "test_daily123"
    })
    influencer_id = create_response.json()["id"]

    # 更新为daily调度
    update_response = client.put(f"/api/influencers/{influencer_id}", json={
        "name": "测试大V",
        "platform": "weibo",
        "accountId": "test_daily123",
        "scheduleType": "daily",
        "dailyFetchTimes": ["09:00", "15:00", "21:00"]
    })

    assert update_response.status_code == 200
    data = update_response.json()
    assert data["scheduleType"] == "daily"
    assert data["dailyFetchTimes"] == ["09:00", "15:00", "21:00"]
