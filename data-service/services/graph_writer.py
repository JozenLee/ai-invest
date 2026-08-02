# data-service/services/graph_writer.py
"""图谱数据写入Neo4j的辅助函数"""
from typing import Dict
from models.industry_models import ExplorationResult
from services.neo4j_service import Neo4jService


async def write_graph_to_neo4j(
    result: ExplorationResult,
    neo4j_service: Neo4jService
) -> Dict[str, int]:
    """
    将ExplorationResult写入Neo4j图数据库

    Args:
        result: 完整的产业链探索结果
        neo4j_service: Neo4j服务实例

    Returns:
        Dict[str, int]: 统计信息
            - industries: 创建的产业节点数
            - stages: 创建的阶段节点数
            - segments: 创建的环节节点数
            - companies: 创建的企业节点数
            - relationships: 创建的关系数
    """
    stats = {
        "industries": 0,
        "stages": 0,
        "segments": 0,
        "companies": 0,
        "relationships": 0
    }

    # 维护name->id映射，用于创建关系
    company_name_to_id: Dict[str, str] = {}

    # 1. 创建产业节点
    industry = result.structure.industry
    industry_id = f"industry_{industry.code}"

    await neo4j_service.create_industry(
        industry_id=industry_id,
        code=industry.code,
        name=industry.name,
        description=industry.description
    )
    stats["industries"] += 1

    # 2. 遍历产业链结构：Stage → Segment → Company
    for stage in result.structure.structure:
        # 2.1 创建Stage节点
        stage_id = f"stage_{industry.code}_{stage.stage_code}"

        await neo4j_service.create_node(
            node_id=stage_id,
            label="Stage",
            properties={
                "code": stage.stage_code,
                "name": stage.stage,
                "description": stage.description
            }
        )
        stats["stages"] += 1

        # 2.2 创建 Industry → Stage 关系
        await neo4j_service.create_relationship(
            from_id=industry_id,
            to_id=stage_id,
            rel_type="HAS_STAGE",
            properties={"order": stage.stage_code}
        )
        stats["relationships"] += 1

        # 2.3 遍历Segment
        for segment in stage.segments:
            segment_id = f"segment_{industry.code}_{segment.code}"

            await neo4j_service.create_node(
                node_id=segment_id,
                label="Segment",
                properties={
                    "code": segment.code,
                    "name": segment.name,
                    "description": segment.description,
                    "key_categories": segment.key_categories
                }
            )
            stats["segments"] += 1

            # 2.4 创建 Stage → Segment 关系
            await neo4j_service.create_relationship(
                from_id=stage_id,
                to_id=segment_id,
                rel_type="HAS_SEGMENT"
            )
            stats["relationships"] += 1

            # 2.5 获取该segment的详细信息
            segment_detail = result.details.get(segment.code)
            if not segment_detail:
                continue

            # 2.6 创建Company节点
            for company in segment_detail.companies:
                # 生成唯一ID（使用ticker或name）
                company_id = f"company_{company.ticker}" if company.ticker else f"company_{company.name.replace(' ', '_')}"

                await neo4j_service.create_node(
                    node_id=company_id,
                    label="Company",
                    properties={
                        "name": company.name,
                        "name_en": company.name_en,
                        "ticker": company.ticker,
                        "exchange": company.exchange,
                        "country": company.country,
                        "market_position": company.market_position,
                        "key_products": company.key_products,
                        "description": company.description
                    }
                )
                stats["companies"] += 1

                # 记录name->id映射
                company_name_to_id[company.name] = company_id
                if company.name_en:
                    company_name_to_id[company.name_en] = company_id

                # 2.7 创建 Segment → Company 关系
                await neo4j_service.create_relationship(
                    from_id=segment_id,
                    to_id=company_id,
                    rel_type="INCLUDES"
                )
                stats["relationships"] += 1

            # 2.8 创建企业间关系（SUPPLIES 和 COMPETES_WITH）
            for relationship in segment_detail.relationships:
                from_company_id = company_name_to_id.get(relationship.from_company)
                to_company_id = company_name_to_id.get(relationship.to_company)

                # 只有当两个企业都存在时才创建关系
                if from_company_id and to_company_id:
                    await neo4j_service.create_relationship(
                        from_id=from_company_id,
                        to_id=to_company_id,
                        rel_type=relationship.type,
                        properties={
                            "confidence": relationship.confidence,
                            "description": relationship.description
                        }
                    )
                    stats["relationships"] += 1

    return stats
