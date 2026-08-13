"""
趋势分析路由
提供领域趋势的轻量级摘要和完整AI分析
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from services.trend_domain_service import get_domain_trend_service
from services.trend_knowledge_graph_service import get_knowledge_graph_trend_service
from db import db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/summary")
async def get_all_domains_summary(
    newsCount: int = Query(default=50, ge=10, le=200, description="分析的新闻数量"),
    useKnowledgeGraph: bool = Query(default=True, description="是否使用知识图谱分类")
):
    """
    获取所有领域的轻量级摘要（不调用AI）

    Args:
        newsCount: 分析的新闻数量（默认50条）
        useKnowledgeGraph: 是否使用知识图谱细分领域（默认True）

    Returns:
        所有领域的趋势摘要列表
    """
    try:
        logger.info(f"开始轻量级分析，新闻数量: {newsCount}, 使用知识图谱: {useKnowledgeGraph}")

        if useKnowledgeGraph:
            # 使用知识图谱版本（V3）
            service = get_knowledge_graph_trend_service(db)
            summaries = await service.analyze_all_segments_lightweight(newsCount)
        else:
            # 使用旧版本（V2）- 向后兼容
            service = get_domain_trend_service(db)
            summaries = await service.analyze_all_domains_lightweight(newsCount)

        if not summaries:
            return {
                "success": False,
                "error": "未能生成趋势摘要，请检查新闻数据",
                "data": None
            }

        logger.info(f"成功分析 {len(summaries)} 个领域")

        return {
            "success": True,
            "data": {
                "domains": summaries,
                "total": len(summaries),
                "newsCount": newsCount,  # 请求分析的新闻数量
                "actualNewsAnalyzed": newsCount  # 实际分析的不同新闻数量（用于前端显示）
            }
        }

    except Exception as e:
        logger.error(f"获取趋势摘要失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis")
async def get_domain_detailed_analysis(
    domain: str = Query(..., description="领域代码"),
    newsCount: int = Query(default=50, ge=10, le=200, description="分析的新闻数量"),
    includeAI: bool = Query(default=False, description="是否包含AI深度分析")
):
    """
    获取单领域的详细分析

    Args:
        domain: 领域代码（如：semiconductor, ai, battery, ai_hardware）
        newsCount: 分析的新闻数量（默认50条）
        includeAI: 是否包含AI深度分析（默认False，按需生成）

    Returns:
        单领域的详细分析结果
    """
    try:
        logger.info(f"开始分析，领域: {domain}, 新闻数量: {newsCount}, AI分析: {includeAI}")

        # 检测是否为知识图谱产业（如ai_hardware）
        # 知识图谱产业使用V3服务的轻量级分析，传统领域使用V2服务
        v3_service = get_knowledge_graph_trend_service(db)
        await v3_service.sync_knowledge_graph()

        # 判断是否为知识图谱产业
        is_kg_industry = any(ind['code'] == domain for ind in v3_service.industries)

        if is_kg_industry:
            logger.info(f"领域 {domain} 是知识图谱产业，使用V3服务分析")
            # 获取概览数据（已包含该产业的统计）
            summaries = await v3_service.analyze_all_segments_lightweight(newsCount)
            analysis = next((s for s in summaries if s['domainCode'] == domain), None)

            if not analysis:
                return {
                    "success": False,
                    "error": f"未能生成领域 {domain} 的分析结果，可能是领域不存在或无相关新闻",
                    "data": None
                }

            # 扩展为详情格式（基础字段）
            analysis.update({
                "currentStatus": f"{analysis['domainName']}领域近期动态活跃",
                "mediumTermOutlook": "中期趋势需持续观察",
                "allKeyDrivers": [],
                "allKeyRisks": [],
                "aiInsight": "",
                "relatedDomains": [],
                # relatedNews 已经从V3服务返回，不需要覆盖
                "lastUpdated": analysis.get("lastUpdated", ""),
            })

            # 如果请求AI分析，则生成深度洞察
            if includeAI:
                logger.info(f"开始为知识图谱产业 {domain} 生成AI分析...")
                # 使用V2服务的AI生成能力
                v2_service = get_domain_trend_service(db)
                related_news = analysis.get('relatedNews', [])

                if related_news and v2_service.client:
                    # 使用实际的newsCount参数，而不是硬编码
                    ai_news_count = min(newsCount, len(related_news))
                    ai_insight = await v2_service.generate_ai_insight(
                        analysis['domainName'],
                        related_news[:ai_news_count]
                    )

                    if ai_insight:
                        drivers = ai_insight.get("keyDrivers", [])
                        risks = ai_insight.get("keyRisks", [])
                        analysis.update({
                            "currentStatus": ai_insight.get("currentStatus", analysis["currentStatus"]),
                            "shortTermOutlook": ai_insight.get("shortTermOutlook", analysis.get("shortTermOutlook", "")),
                            "mediumTermOutlook": ai_insight.get("mediumTermOutlook", analysis["mediumTermOutlook"]),
                            "keyDrivers": drivers[:2] if drivers else [],  # 摘要版本只取前2条
                            "keyRisks": risks[:2] if risks else [],  # 摘要版本只取前2条
                            "allKeyDrivers": drivers,
                            "allKeyRisks": risks,
                        })
                        logger.info(f"AI分析生成成功，驱动因素: {len(drivers)}, 风险点: {len(risks)}")
                    else:
                        logger.warning(f"AI分析生成失败，返回基础分析")
                else:
                    logger.warning(f"无法生成AI分析：新闻数={len(related_news)}, AI客户端={'可用' if v2_service.client else '不可用'}")

            return {
                "success": True,
                "data": analysis
            }
        else:
            logger.info(f"领域 {domain} 是传统领域，使用V2服务分析")
            # 获取趋势分析服务实例（V2服务用于传统domainIds领域）
            service = get_domain_trend_service(db)

            # 执行分析（根据includeAI参数决定是否调用AI）
            analysis = await service.analyze_domain_detailed(domain, newsCount, include_ai=includeAI)

            if not analysis:
                return {
                    "success": False,
                    "error": f"未能生成领域 {domain} 的分析结果，可能是领域不存在或无相关新闻",
                    "data": None
                }

            return {
                "success": True,
                "data": analysis
            }

    except Exception as e:
        logger.error(f"获取分析失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test")
async def test_trend_service():
    """
    测试趋势分析服务

    Returns:
        服务状态信息
    """
    try:
        service = get_domain_trend_service(db)

        # 检查数据服务
        news_list = await service._get_recent_news(10)
        domains = await service._get_active_domains()

        return {
            "success": True,
            "data": {
                "service_initialized": True,
                "ai_available": service.client is not None,
                "news_available": len(news_list) > 0,
                "news_count": len(news_list),
                "domains_count": len(domains),
                "domain_names": [d.get('name') for d in domains]
            }
        }

    except Exception as e:
        logger.error(f"测试失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "data": None
        }
