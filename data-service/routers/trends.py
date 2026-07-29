"""
趋势分析路由
提供领域趋势的轻量级摘要和完整AI分析
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from services.trend_analysis_service_v2 import get_trend_analysis_service
from db import db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/summary")
async def get_all_domains_summary(
    newsCount: int = Query(default=50, ge=10, le=200, description="分析的新闻数量")
):
    """
    获取所有领域的轻量级摘要（不调用AI）

    Args:
        newsCount: 分析的新闻数量（默认50条）

    Returns:
        所有领域的趋势摘要列表
    """
    try:
        logger.info(f"开始轻量级分析，新闻数量: {newsCount}")

        # 获取趋势分析服务实例
        service = get_trend_analysis_service(db)

        # 执行轻量级分析
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
        domain: 领域代码（如：semiconductor, ai, battery）
        newsCount: 分析的新闻数量（默认50条）
        includeAI: 是否包含AI深度分析（默认False，按需生成）

    Returns:
        单领域的详细分析结果
    """
    try:
        logger.info(f"开始分析，领域: {domain}, 新闻数量: {newsCount}, AI分析: {includeAI}")

        # 获取趋势分析服务实例
        service = get_trend_analysis_service(db)

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
        service = TrendAnalysisService(data_service, db)

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
