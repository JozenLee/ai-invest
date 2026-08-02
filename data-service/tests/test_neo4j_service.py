import pytest
from services.neo4j_service import Neo4jService
import os

@pytest.mark.asyncio
async def test_neo4j_connection():
    """测试Neo4j连接"""
    service = Neo4jService()
    await service.connect()

    # 测试简单查询
    result = await service.execute_query("RETURN 1 as num")
    assert result[0]["num"] == 1

    await service.close()

@pytest.mark.asyncio
async def test_create_industry():
    """测试创建产业节点"""
    service = Neo4jService()
    await service.connect()

    industry_id = await service.create_industry({
        "name": "测试产业",
        "code": "test_industry",
        "version": "1.0"
    })

    assert industry_id is not None
    assert len(industry_id) > 0

    # 清理测试数据
    await service.execute_query(
        "MATCH (i:Industry {id: $id}) DELETE i",
        {"id": industry_id}
    )

    await service.close()
