# data-service/services/neo4j_service.py
from neo4j import AsyncGraphDatabase, AsyncDriver
from typing import Optional, Dict, List, Any
import os
import uuid
from datetime import datetime

class Neo4jService:
    """Neo4j数据库服务封装"""

    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD")
        self.database = os.getenv("NEO4J_DATABASE", "neo4j")
        self.driver: Optional[AsyncDriver] = None

    async def connect(self) -> None:
        """建立Neo4j连接"""
        if not self.driver:
            self.driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password)
            )
            # 验证连接
            await self.driver.verify_connectivity()

    async def close(self) -> None:
        """关闭连接"""
        if self.driver:
            await self.driver.close()
            self.driver = None

    async def execute_query(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """执行Cypher查询"""
        if not self.driver:
            await self.connect()

        async with self.driver.session(database=self.database) as session:
            result = await session.run(query, parameters or {})
            records = await result.data()
            return records

    async def create_industry(self, data: Dict[str, Any]) -> str:
        """
        创建产业根节点

        Args:
            data: {
                "name": "产业名称",
                "code": "industry_code",
                "version": "1.0",
                "description": "可选描述"
            }

        Returns:
            产业ID (UUID)
        """
        industry_id = str(uuid.uuid4())

        query = """
        CREATE (i:Industry {
            id: $id,
            name: $name,
            code: $code,
            version: $version,
            description: $description,
            created_at: datetime(),
            updated_at: datetime(),
            created_by: 'ai_auto',
            is_active: true
        })
        RETURN i.id as id
        """

        params = {
            "id": industry_id,
            "name": data["name"],
            "code": data["code"],
            "version": data.get("version", "1.0"),
            "description": data.get("description", "")
        }

        result = await self.execute_query(query, params)
        return result[0]["id"]

    async def create_node(
        self,
        label: str,
        properties: Dict[str, Any]
    ) -> str:
        """
        创建通用节点

        Args:
            label: 节点标签（Stage, Segment, Company等）
            properties: 节点属性字典

        Returns:
            节点ID
        """
        node_id = properties.get("id", str(uuid.uuid4()))
        properties["id"] = node_id
        properties["created_at"] = datetime.now().isoformat()
        properties["updated_at"] = datetime.now().isoformat()

        # 构建属性字符串
        props_str = ", ".join([f"{k}: ${k}" for k in properties.keys()])

        query = f"""
        CREATE (n:{label} {{{props_str}}})
        RETURN n.id as id
        """

        result = await self.execute_query(query, properties)
        return result[0]["id"]

    async def create_relationship(
        self,
        from_id: str,
        to_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        创建节点间关系

        Args:
            from_id: 源节点ID
            to_id: 目标节点ID
            rel_type: 关系类型（HAS_STAGE, HAS_SEGMENT, SUPPLIES等）
            properties: 关系属性（可选）
        """
        props = properties or {}
        props["created_at"] = datetime.now().isoformat()

        props_str = ", ".join([f"{k}: ${k}" for k in props.keys()])
        props_clause = f"{{{props_str}}}" if props else ""

        query = f"""
        MATCH (a {{id: $from_id}}), (b {{id: $to_id}})
        CREATE (a)-[r:{rel_type} {props_clause}]->(b)
        """

        params = {"from_id": from_id, "to_id": to_id, **props}
        await self.execute_query(query, params)

    async def get_industry_graph(self, industry_id: str) -> Dict[str, Any]:
        """
        获取产业完整图谱数据

        Returns:
            {
                "industry": {...},
                "stages": [...]
            }
        """
        # 获取产业信息
        industry_query = """
        MATCH (i:Industry {id: $industry_id})
        RETURN i
        """
        industry_result = await self.execute_query(
            industry_query,
            {"industry_id": industry_id}
        )

        if not industry_result:
            return {"industry": None, "stages": []}

        industry = industry_result[0]["i"]

        # 获取完整层级结构
        graph_query = """
        MATCH (i:Industry {id: $industry_id})-[:HAS_STAGE]->(stage:Stage)
        OPTIONAL MATCH (stage)-[:HAS_SEGMENT]->(segment:Segment)
        OPTIONAL MATCH (segment)-[:CONTAINS]->(company:Company)
        RETURN stage, segment, company
        ORDER BY stage.order, segment.order
        """

        graph_result = await self.execute_query(
            graph_query,
            {"industry_id": industry_id}
        )

        # 组织数据结构
        stages_dict = {}
        for record in graph_result:
            stage = record["stage"]
            segment = record.get("segment")
            company = record.get("company")

            stage_id = stage["id"]
            if stage_id not in stages_dict:
                stages_dict[stage_id] = {
                    **stage,
                    "segments": {}
                }

            if segment:
                segment_id = segment["id"]
                if segment_id not in stages_dict[stage_id]["segments"]:
                    stages_dict[stage_id]["segments"][segment_id] = {
                        **segment,
                        "companies": []
                    }

                if company:
                    stages_dict[stage_id]["segments"][segment_id]["companies"].append(company)

        # 转换为列表
        stages = []
        for stage_data in stages_dict.values():
            stage_data["segments"] = list(stage_data["segments"].values())
            stages.append(stage_data)

        return {
            "industry": industry,
            "stages": stages
        }


# 全局实例
_neo4j_service: Optional[Neo4jService] = None

def get_neo4j_service() -> Neo4jService:
    """获取Neo4j服务单例"""
    global _neo4j_service
    if _neo4j_service is None:
        _neo4j_service = Neo4jService()
    return _neo4j_service
