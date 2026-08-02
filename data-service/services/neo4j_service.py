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

    # ==================== 查询方法 (Task 11) ====================

    async def list_industries(self) -> List[Dict[str, Any]]:
        """
        查询所有产业列表

        Returns:
            List[Dict]: 产业列表，每个产业包含 id, code, name, description
        """
        async with self.session() as s:
            query = """
            MATCH (i:Industry)
            RETURN i.id as id, i.code as code, i.name as name, i.description as description
            ORDER BY i.name
            """
            result = await s.run(query)
            records = await result.data()
            return records

    async def get_industry_basic(self, industry_id: str) -> Optional[Dict[str, Any]]:
        """
        获取产业基本信息

        Args:
            industry_id: 产业ID

        Returns:
            Dict: 产业基本信息，包含 id, code, name, description
            None: 产业不存在
        """
        async with self.session() as s:
            query = """
            MATCH (i:Industry {id: $industry_id})
            RETURN i.id as id, i.code as code, i.name as name, i.description as description
            """
            result = await s.run(query, industry_id=industry_id)
            record = await result.single()
            if record:
                return dict(record)
            return None

    async def get_industry_full_graph(self, industry_id: str) -> Optional[Dict[str, Any]]:
        """
        获取产业完整图谱（嵌套结构）

        Args:
            industry_id: 产业ID

        Returns:
            Dict: 嵌套结构 {industry: {}, stages: [{stage: {}, segments: [{segment: {}, companies: []}]}]}
            None: 产业不存在
        """
        async with self.session() as s:
            # 1. 验证产业是否存在
            check_query = "MATCH (i:Industry {id: $industry_id}) RETURN i"
            check_result = await s.run(check_query, industry_id=industry_id)
            if not await check_result.single():
                return None

            # 2. 查询完整图谱结构
            query = """
            MATCH (i:Industry {id: $industry_id})
            OPTIONAL MATCH (i)-[:HAS_STAGE]->(stage:Stage)
            OPTIONAL MATCH (stage)-[:HAS_SEGMENT]->(segment:Segment)
            OPTIONAL MATCH (segment)-[:HAS_COMPANY]->(company:Company)
            RETURN
                i.id as industry_id,
                i.code as industry_code,
                i.name as industry_name,
                i.description as industry_description,
                stage.id as stage_id,
                stage.code as stage_code,
                stage.name as stage_name,
                stage.description as stage_description,
                segment.id as segment_id,
                segment.code as segment_code,
                segment.name as segment_name,
                segment.description as segment_description,
                segment.key_categories as segment_key_categories,
                company.id as company_id,
                company.name as company_name,
                company.name_en as company_name_en,
                company.ticker as company_ticker,
                company.exchange as company_exchange,
                company.country as company_country,
                company.market_position as company_market_position,
                company.key_products as company_key_products,
                company.description as company_description
            ORDER BY stage.code, segment.code, company.market_position, company.name
            """
            result = await s.run(query, industry_id=industry_id)
            records = await result.data()

            # 3. 组织嵌套数据结构
            if not records:
                return None

            # 产业基本信息
            first_record = records[0]
            graph_data = {
                "industry": {
                    "id": first_record["industry_id"],
                    "code": first_record["industry_code"],
                    "name": first_record["industry_name"],
                    "description": first_record["industry_description"]
                },
                "stages": []
            }

            # 使用字典组织阶段和环节
            stages_dict = {}

            for record in records:
                stage_id = record["stage_id"]
                segment_id = record["segment_id"]
                company_id = record["company_id"]

                # 跳过空阶段
                if not stage_id:
                    continue

                # 添加阶段
                if stage_id not in stages_dict:
                    stages_dict[stage_id] = {
                        "id": stage_id,
                        "code": record["stage_code"],
                        "name": record["stage_name"],
                        "description": record["stage_description"],
                        "segments": {}
                    }

                # 添加环节
                if segment_id and segment_id not in stages_dict[stage_id]["segments"]:
                    stages_dict[stage_id]["segments"][segment_id] = {
                        "id": segment_id,
                        "code": record["segment_code"],
                        "name": record["segment_name"],
                        "description": record["segment_description"],
                        "key_categories": record["segment_key_categories"] or [],
                        "companies": []
                    }

                # 添加企业
                if company_id and segment_id:
                    company_data = {
                        "id": company_id,
                        "name": record["company_name"],
                        "name_en": record["company_name_en"],
                        "ticker": record["company_ticker"],
                        "exchange": record["company_exchange"],
                        "country": record["company_country"],
                        "market_position": record["company_market_position"],
                        "key_products": record["company_key_products"] or [],
                        "description": record["company_description"]
                    }
                    stages_dict[stage_id]["segments"][segment_id]["companies"].append(company_data)

            # 转换为列表结构
            for stage in stages_dict.values():
                stage["segments"] = list(stage["segments"].values())
                graph_data["stages"].append(stage)

            return graph_data

    async def get_industry_swimlane_data(self, industry_id: str) -> Optional[Dict[str, Any]]:
        """
        获取产业泳道图数据（扁平化结构）

        Args:
            industry_id: 产业ID

        Returns:
            Dict: 扁平化结构 {industry: {}, lanes: {stage_code: {stage: {}, segments: [...]}}}
            None: 产业不存在
        """
        async with self.session() as s:
            # 1. 验证产业是否存在
            check_query = "MATCH (i:Industry {id: $industry_id}) RETURN i"
            check_result = await s.run(check_query, industry_id=industry_id)
            if not await check_result.single():
                return None

            # 2. 查询泳道数据
            query = """
            MATCH (i:Industry {id: $industry_id})
            OPTIONAL MATCH (i)-[:HAS_STAGE]->(stage:Stage)
            OPTIONAL MATCH (stage)-[:HAS_SEGMENT]->(segment:Segment)
            OPTIONAL MATCH (segment)-[:HAS_COMPANY]->(company:Company)
            WITH i, stage, segment,
                 collect(DISTINCT {
                     id: company.id,
                     name: company.name,
                     ticker: company.ticker,
                     market_position: company.market_position
                 }) as companies
            RETURN
                i.id as industry_id,
                i.code as industry_code,
                i.name as industry_name,
                i.description as industry_description,
                stage.id as stage_id,
                stage.code as stage_code,
                stage.name as stage_name,
                stage.description as stage_description,
                segment.id as segment_id,
                segment.code as segment_code,
                segment.name as segment_name,
                segment.description as segment_description,
                segment.key_categories as segment_key_categories,
                companies
            ORDER BY stage.code, segment.code
            """
            result = await s.run(query, industry_id=industry_id)
            records = await result.data()

            # 3. 组织泳道数据结构
            if not records:
                return None

            first_record = records[0]
            swimlane_data = {
                "industry": {
                    "id": first_record["industry_id"],
                    "code": first_record["industry_code"],
                    "name": first_record["industry_name"],
                    "description": first_record["industry_description"]
                },
                "lanes": {}
            }

            # 按阶段组织泳道
            for record in records:
                stage_code = record["stage_code"]
                segment_id = record["segment_id"]

                # 跳过空阶段
                if not stage_code:
                    continue

                # 初始化泳道
                if stage_code not in swimlane_data["lanes"]:
                    swimlane_data["lanes"][stage_code] = {
                        "stage": {
                            "id": record["stage_id"],
                            "code": stage_code,
                            "name": record["stage_name"],
                            "description": record["stage_description"]
                        },
                        "segments": []
                    }

                # 添加环节
                if segment_id:
                    # 过滤掉空企业
                    companies = [c for c in record["companies"] if c.get("id")]

                    segment_data = {
                        "id": segment_id,
                        "code": record["segment_code"],
                        "name": record["segment_name"],
                        "description": record["segment_description"],
                        "key_categories": record["segment_key_categories"] or [],
                        "company_count": len(companies),
                        "top_companies": companies[:5]  # 只返回前5家企业
                    }
                    swimlane_data["lanes"][stage_code]["segments"].append(segment_data)

            return swimlane_data


# 全局实例
_neo4j_service: Optional[Neo4jService] = None


def get_neo4j_service() -> Neo4jService:
    """获取Neo4j服务单例"""
    global _neo4j_service
    if _neo4j_service is None:
        _neo4j_service = Neo4jService()
    return _neo4j_service
