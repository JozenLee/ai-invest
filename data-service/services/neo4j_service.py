# data-service/services/neo4j_service.py
"""Neo4j服务：管理图数据库连接和操作"""
import os
from typing import Optional, Dict, Any, List
from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from contextlib import asynccontextmanager
from .cache_service import cache_service


class Neo4jService:
    """Neo4j图数据库服务"""

    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD")
        self.database = os.getenv("NEO4J_DATABASE", "neo4j")
        self._driver: Optional[AsyncDriver] = None

    async def connect(self):
        """建立Neo4j连接"""
        if self._driver is None:
            if not self.password:
                raise RuntimeError("NEO4J_PASSWORD must be configured before connecting to Neo4j")
            self._driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password),
                max_connection_lifetime=3600,  # 1小时后回收连接
                max_connection_pool_size=50,
                connection_acquisition_timeout=60,
                keep_alive=True  # 保持连接活跃
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

        # 验证驱动器健康状态
        try:
            await self._driver.verify_connectivity()
        except Exception:
            # 连接失效，重新建立
            await self.close()
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
            OPTIONAL MATCH (segment)-[:INCLUDES]->(company:Company)
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
            OPTIONAL MATCH (segment)-[:INCLUDES]->(company:Company)
            WITH i, stage, segment,
                 collect(DISTINCT {
                     id: company.id,
                     name: company.name,
                     name_en: company.name_en,
                     ticker: company.ticker,
                     exchange: company.exchange,
                     country: company.country,
                     market_position: company.market_position,
                     key_products: company.key_products,
                     description: company.description
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
                segment.order as segment_order,
                segment.matched_etfs as matched_etfs,
                segment.matched_indices as matched_indices,
                segment.last_matched_at as last_matched_at,
                companies
            ORDER BY stage.order, segment.order
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

                    # 解析JSON字符串格式的匹配结果
                    import json
                    matched_etfs = []
                    matched_indices = []

                    if record.get("matched_etfs"):
                        try:
                            matched_etfs = json.loads(record["matched_etfs"]) if isinstance(record["matched_etfs"], str) else record["matched_etfs"]
                        except:
                            matched_etfs = []

                    if record.get("matched_indices"):
                        try:
                            matched_indices = json.loads(record["matched_indices"]) if isinstance(record["matched_indices"], str) else record["matched_indices"]
                        except:
                            matched_indices = []

                    # 转换Neo4j DateTime为字符串
                    last_matched_at = record.get("last_matched_at")
                    if last_matched_at:
                        last_matched_at = last_matched_at.isoformat() if hasattr(last_matched_at, 'isoformat') else str(last_matched_at)

                    segment_data = {
                        "id": segment_id,
                        "code": record["segment_code"],
                        "name": record["segment_name"],
                        "description": record["segment_description"],
                        "key_categories": record["segment_key_categories"] or [],
                        "order": record["segment_order"] if record["segment_order"] is not None else 0,
                        "company_count": len(companies),
                        "top_companies": companies,  # 返回所有企业，保持与预览一致
                        "matched_etfs": matched_etfs,
                        "matched_indices": matched_indices,
                        "last_matched_at": last_matched_at
                    }
                    swimlane_data["lanes"][stage_code]["segments"].append(segment_data)

            return swimlane_data

    async def delete_industry(self, industry_id: str) -> bool:
        """
        删除产业及其所有关联数据

        Args:
            industry_id: 产业ID

        Returns:
            bool: 是否删除成功
        """
        async with self.session() as s:
            # 删除产业及其所有关联的阶段、环节、企业节点
            query = """
            MATCH (i:Industry {id: $industry_id})
            OPTIONAL MATCH (i)-[:HAS_STAGE]->(stage:Stage)
            OPTIONAL MATCH (stage)-[:HAS_SEGMENT]->(segment:Segment)
            OPTIONAL MATCH (segment)-[:INCLUDES]->(company:Company)
            DETACH DELETE i, stage, segment, company
            RETURN count(i) as deleted_count
            """
            result = await s.run(query, industry_id=industry_id)
            record = await result.single()

            if record and record["deleted_count"] > 0:
                return True
            return False

    # ==================== 新闻分类相关方法 ====================

    async def get_all_industry_segments_for_classification(
        self,
        use_cache: bool = True
    ) -> List[Dict[str, Any]]:
        """
        获取所有产业的Segment列表用于新闻分类

        Args:
            use_cache: 是否使用缓存

        Returns:
            List[Dict]: Segment列表，每个包含:
                - industry_code: 产业代码
                - industry_name: 产业名称
                - stage_code: 阶段代码
                - stage_name: 阶段名称
                - segment_code: 环节代码
                - segment_name: 环节名称
                - keywords: 关键词列表
                - tag_codes: 关联的Tag代码列表
        """
        # 尝试从缓存获取
        if use_cache:
            cached_data = cache_service.get_classification_segments()
            if cached_data is not None:
                return cached_data

        # 从Neo4j查询
        async with self.session() as s:
            query = """
            MATCH (i:Industry)-[:HAS_STAGE]->(st:Stage)-[:HAS_SEGMENT]->(seg:Segment)
            RETURN i.code AS industry_code,
                   i.name AS industry_name,
                   st.code AS stage_code,
                   st.name AS stage_name,
                   seg.code AS segment_code,
                   seg.name AS segment_name,
                   COALESCE(seg.key_categories, []) AS keywords,
                   COALESCE(seg.tag_codes, []) AS tag_codes,
                   COALESCE(seg.description, '') AS description
            ORDER BY i.name, st.code, seg.code
            """
            result = await s.run(query)
            records = await result.data()

            # 缓存结果
            if use_cache and records:
                cache_service.set_classification_segments(records)

            return records

    async def get_segments_by_industry(
        self,
        industry_code: str
    ) -> List[Dict[str, Any]]:
        """
        获取某个产业的所有Segment（用于前端筛选器）

        Args:
            industry_code: 产业代码

        Returns:
            List[Dict]: Segment列表
        """
        async with self.session() as s:
            query = """
            MATCH (i:Industry {code: $industry_code})-[:HAS_STAGE]->(st:Stage)-[:HAS_SEGMENT]->(seg:Segment)
            RETURN st.name AS stage_name,
                   st.code AS stage_code,
                   seg.code AS segment_code,
                   seg.name AS segment_name,
                   COALESCE(seg.description, '') AS description,
                   COALESCE(st.order, 0) AS stage_order,
                   COALESCE(seg.order, 0) AS segment_order
            ORDER BY stage_order, segment_order
            """
            result = await s.run(query, industry_code=industry_code)
            records = await result.data()
            return records

    async def get_tag_codes_by_segments(
        self,
        segment_codes: List[str]
    ) -> List[str]:
        """
        根据Segment codes获取关联的Tag codes（用于新闻筛选）

        Args:
            segment_codes: Segment代码列表

        Returns:
            List[str]: Tag代码列表（去重）
        """
        async with self.session() as s:
            query = """
            MATCH (seg:Segment)-[:HAS_TAG]->(t:TagRef)
            WHERE seg.code IN $segment_codes
            RETURN collect(DISTINCT t.code) AS tag_codes
            """
            result = await s.run(query, segment_codes=segment_codes)
            record = await result.single()

            if record and record["tag_codes"]:
                return record["tag_codes"]

            # 如果没有通过关系找到，尝试从Segment的tag_codes属性获取
            query2 = """
            MATCH (seg:Segment)
            WHERE seg.code IN $segment_codes AND seg.tag_codes IS NOT NULL
            UNWIND seg.tag_codes AS tag_code
            RETURN collect(DISTINCT tag_code) AS tag_codes
            """
            result2 = await s.run(query2, segment_codes=segment_codes)
            record2 = await result2.single()

            return record2["tag_codes"] if record2 and record2["tag_codes"] else []

    async def find_segments_by_tags(
        self,
        tag_codes: List[str]
    ) -> List[Dict[str, Any]]:
        """
        根据Tag codes查找关联的Segments（用于新闻分类后反查）

        Args:
            tag_codes: Tag代码列表

        Returns:
            List[Dict]: Segment列表，按匹配度排序
        """
        async with self.session() as s:
            query = """
            MATCH (seg:Segment)-[:HAS_TAG]->(t:TagRef)
            WHERE t.code IN $tag_codes
            RETURN seg.code AS segment_code,
                   seg.name AS segment_name,
                   collect(t.code) AS matched_tags,
                   count(t) AS match_count
            ORDER BY match_count DESC
            """
            result = await s.run(query, tag_codes=tag_codes)
            records = await result.data()
            return records

    async def get_segment_impact_chain(
        self,
        industry_code: str,
        segment_code: str,
        max_depth: int = 3
    ) -> Dict[str, Any]:
        """
        获取某个Segment的影响链路（图遍历）

        Args:
            industry_code: 产业代码
            segment_code: 环节代码
            max_depth: 最大遍历深度

        Returns:
            Dict: 包含上下游影响链路
                - direct: 当前Segment信息
                - upstream: 上游节点列表
                - downstream: 下游节点列表
                - cross_industry: 跨产业关联
        """
        async with self.session() as s:
            # 1. 获取当前Segment信息
            direct_query = """
            MATCH (i:Industry {code: $industry_code})-[:HAS_STAGE]->(st:Stage)-[:HAS_SEGMENT]->(seg:Segment {code: $segment_code})
            RETURN seg.code AS segment_code,
                   seg.name AS segment_name,
                   seg.description AS description,
                   st.name AS stage_name,
                   i.name AS industry_name
            """
            direct_result = await s.run(
                direct_query,
                industry_code=industry_code,
                segment_code=segment_code
            )
            direct_record = await direct_result.single()

            if not direct_record:
                return None

            # 2. 查询下游影响（SUPPLIES/INFLUENCES关系）
            downstream_query = """
            MATCH path = (source:Segment {code: $segment_code})-[r:SUPPLIES|INFLUENCES*1..%d]->(target:Segment)
            WHERE ALL(rel IN relationships(path) WHERE COALESCE(rel.weight, 0.5) > 0.3)
            WITH DISTINCT target, relationships(path), length(path) AS distance
            MATCH (target)<-[:HAS_SEGMENT]-(st:Stage)<-[:HAS_STAGE]-(i:Industry)
            RETURN target.code AS segment_code,
                   target.name AS segment_name,
                   i.code AS industry_code,
                   i.name AS industry_name,
                   st.name AS stage_name,
                   distance,
                   [rel IN relationships(path) | type(rel)] AS relationship_types
            ORDER BY distance, target.name
            LIMIT 20
            """ % max_depth
            downstream_result = await s.run(downstream_query, segment_code=segment_code)
            downstream_records = await downstream_result.data()

            # 3. 查询上游影响（反向遍历）
            upstream_query = """
            MATCH path = (source:Segment)-[r:SUPPLIES|INFLUENCES*1..%d]->(target:Segment {code: $segment_code})
            WHERE ALL(rel IN relationships(path) WHERE COALESCE(rel.weight, 0.5) > 0.3)
            WITH DISTINCT source, relationships(path), length(path) AS distance
            MATCH (source)<-[:HAS_SEGMENT]-(st:Stage)<-[:HAS_STAGE]-(i:Industry)
            RETURN source.code AS segment_code,
                   source.name AS segment_name,
                   i.code AS industry_code,
                   i.name AS industry_name,
                   st.name AS stage_name,
                   distance,
                   [rel IN relationships(path) | type(rel)] AS relationship_types
            ORDER BY distance, source.name
            LIMIT 20
            """ % max_depth
            upstream_result = await s.run(upstream_query, segment_code=segment_code)
            upstream_records = await upstream_result.data()

            # 4. 识别跨产业关联
            cross_industry = []
            for record in downstream_records + upstream_records:
                if record["industry_code"] != industry_code:
                    if record not in cross_industry:
                        cross_industry.append(record)

            return {
                "direct": dict(direct_record),
                "upstream": upstream_records,
                "downstream": downstream_records,
                "cross_industry": cross_industry
            }

    async def update_segment_classification_metadata(
        self,
        segment_code: str,
        news_keywords: Optional[List[str]] = None,
        tag_codes: Optional[List[str]] = None
    ) -> bool:
        """
        更新Segment的分类元数据

        Args:
            segment_code: Segment代码
            news_keywords: 新闻关键词列表
            tag_codes: Tag代码列表

        Returns:
            bool: 是否更新成功
        """
        async with self.session() as s:
            set_clauses = []
            params = {"segment_code": segment_code}

            if news_keywords is not None:
                set_clauses.append("seg.news_keywords = $news_keywords")
                params["news_keywords"] = news_keywords

            if tag_codes is not None:
                set_clauses.append("seg.tag_codes = $tag_codes")
                params["tag_codes"] = tag_codes

            if not set_clauses:
                return False

            set_clause = ", ".join(set_clauses)
            query = f"""
            MATCH (seg:Segment {{code: $segment_code}})
            SET {set_clause}, seg.updated_at = datetime()
            RETURN seg.code AS segment_code
            """

            result = await s.run(query, **params)
            record = await result.single()
            return record is not None

    async def link_segment_to_tags(
        self,
        segment_code: str,
        tag_codes: List[str],
        relevance: float = 1.0
    ) -> int:
        """
        在Neo4j中建立Segment -> TagRef关系

        Args:
            segment_code: Segment代码
            tag_codes: Tag代码列表
            relevance: 相关度

        Returns:
            int: 创建的关系数量
        """
        async with self.session() as s:
            query = """
            MATCH (seg:Segment {code: $segment_code})
            UNWIND $tag_codes AS tag_code
            MERGE (t:TagRef {code: tag_code})
            MERGE (seg)-[r:HAS_TAG]->(t)
            SET r.relevance = $relevance, r.updated_at = datetime()
            RETURN count(r) AS relationship_count
            """
            result = await s.run(
                query,
                segment_code=segment_code,
                tag_codes=tag_codes,
                relevance=relevance
            )
            record = await result.single()
            return record["relationship_count"] if record else 0


# 全局实例
_neo4j_service: Optional[Neo4jService] = None


def get_neo4j_service() -> Neo4jService:
    """获取Neo4j服务单例"""
    global _neo4j_service
    if _neo4j_service is None:
        _neo4j_service = Neo4jService()
    return _neo4j_service
