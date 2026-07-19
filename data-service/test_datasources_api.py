"""
测试数据源API端点
"""

import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(__file__))


async def test_datasources_api():
    """测试数据源API端点"""
    from fastapi.testclient import TestClient
    from main import app

    print("=" * 60)
    print("测试数据源API端点")
    print("=" * 60)

    client = TestClient(app)

    # 测试 1: POST /api/datasources/fetch (原有端点)
    print("\n【测试 1】POST /api/datasources/fetch")
    response = client.post("/api/datasources/fetch", json={
        "source_id": "test_source",
        "source_config": {
            "driverType": "api",
            "provider": "akshare",
            "keyword": "测试"
        }
    })
    print(f"  状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  结果: {data.get('message', 'N/A')}")
    else:
        print(f"  错误: {response.text}")

    # 测试 2: POST /api/datasources/{source_id}/fetch (新端点)
    print("\n【测试 2】POST /api/datasources/{source_id}/fetch")
    # 注意：这需要数据库中存在该数据源
    response = client.post("/api/datasources/cailian_default/fetch")
    print(f"  状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  结果: {data.get('message', 'N/A')}")
    elif response.status_code == 404:
        print(f"  数据源不存在（预期，需要先在数据库中创建）")
    else:
        print(f"  错误: {response.text}")

    # 测试 3: PATCH /api/datasources/{source_id}/schedule (新端点)
    print("\n【测试 3】PATCH /api/datasources/{source_id}/schedule")
    response = client.patch("/api/datasources/cailian_default/schedule", json={
        "updateFrequency": 60,
        "driverConfig": {
            "driverType": "api",
            "provider": "akshare",
            "keyword": "财联社"
        }
    })
    print(f"  状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  结果: {data.get('message', 'N/A')}")
    elif response.status_code == 404:
        print(f"  数据源不存在（预期，需要先在数据库中创建）")
    else:
        print(f"  错误: {response.text}")

    # 测试 4: 获取调度器状态
    print("\n【测试 4】GET /api/scheduler/status")
    response = client.get("/api/scheduler/status")
    print(f"  状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  调度器运行: {data.get('is_running', False)}")
        print(f"  活跃任务数: {len(data.get('jobs', []))}")
        for job in data.get('jobs', []):
            print(f"    - {job['id']}: {job.get('status', 'unknown')}")

    print("\n" + "=" * 60)
    print("API端点测试完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_datasources_api())
