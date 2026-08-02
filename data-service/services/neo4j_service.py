# data-service/services/neo4j_service.py
"""Neo4j服务：管理图数据库连接和操作"""
import os
from typing import Optional, Dict, Any, List
from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from contextlib import asynccontextmanager


class Neo4jService:
    """Neo4j图数据库服务"""

    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "ai-invest-neo4j-2024")
        self.database = os.getenv("NEO4J_DATABASE", "neo4j")
        self._driver: Optional[AsyncDriver] = None

    async def connect(self):
        """建立Neo4j连接"""
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password)
            )

    async def close(self):
        """关闭Neo4j连接"""
        if self._driver:
            await self._driver.close()
            self._driver = None

    @asynccontextmanager
    async def session(self):
        """获取Neo4j会话（上下文管理器）"""
        if self._driver is None:
            await self.connect()

        async with self._driver.session(database=self.database) as s:
            yield s

    async def verify_connectivity(self) -> bool:
        """验证Neo4j连接"""
        try:
            async with self.session() as s:
                result = await s.run("RETURN 1 as num")
                record = await result.single()
                return record["num"] == 1
        except Exception as e:
            print(f"Neo4j连接失败: {e}")
            return False

    async def create_industry(
        self,
        industry_id: str,
        code: str,
        name: str,
        description: Optional[str] = None
    ) -> str:
        """
        创建产业节点

        Args:
            industry_id: 产业唯一ID
            code: 产业代码
            name: 产业名称
            description: 产业描述

        Returns:
            str: 创建的节点ID
        """
        async with self.session() as s:
            query = """
            MERGE (i:Industry {id: $industry_id})
            SET i.code = $code,
                i.name = $name,
                i.description = $description,
                i.updated_at = datetime()
            RETURN i.id as id
            """
            result = await s.run(
                query,
                industry_id=industry_id,
                code=code,
                name=name,
                description=description
            )
            record = await result.single()
            return record["id"]

    async def create_node(
        self,
        node_id: str,
        label: str,
        properties: Dict[str, Any]
    ) -> str:
        """
        创建图谱节点（通用方法）

        Args:
            node_id: 节点唯一ID
            label: 节点标签（Stage/Segment/Company）
            properties: 节点属性

        Returns:
            str: 创建的节点ID
        """
        async with self.session() as s:
            # 构建SET子句
            set_clauses = ["n.id = $node_id", "n.updated_at = datetime()"]
            params = {"node_id": node_id}

            for key, value in properties.items():
                set_clauses.append(f"n.{key} = ${key}")
                params[key] = value

            set_clause = ", ".join(set_clauses)

            query = f"""
            MERGE (n:{label} {{id: $node_id}})
            SET {set_clause}
            RETURN n.id as id
            """

            result = await s.run(query, **params)
            record = await result.single()
            return record["id"]

    async def create_relationship(
        self,
        from_id: str,
        to_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        创建节点间关系

        Args:
            from_id: 源节点ID
            to_id: 目标节点ID
            rel_type: 关系类型
            properties: 关系属性

        Returns:
            bool: 是否创建成功
        """
        async with self.session() as s:
            # 构建SET子句
            set_clause = "r.updated_at = datetime()"
            params = {"from_id": from_id, "to_id": to_id}

            if properties:
                set_clauses = ["r.updated_at = datetime()"]
                for key, value in properties.items():
                    set_clauses.append(f"r.{key} = ${key}")
                    params[key] = value
                set_clause = ", ".join(set_clauses)

            query = f"""
            MATCH (a {{id: $from_id}}), (b {{id: $to_id}})
            MERGE (a)-[r:{rel_type}]->(b)
            SET {set_clause}
            RETURN id(r) as rel_id
            """

            result = await s.run(query, **params)
            record = await result.single()
            return record is not None

    async def clear_database(self):
        """清空数据库（仅用于测试）"""
        async with self.session() as s:
            await s.run("MATCH (n) DETACH DELETE n")


# 全局实例
_neo4j_service: Optional[Neo4jService] = None


def get_neo4j_service() -> Neo4jService:
    """获取Neo4j服务单例"""
    global _neo4j_service
    if _neo4j_service is None:
        _neo4j_service = Neo4jService()
    return _neo4j_service
