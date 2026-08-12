# data-service/routers/impact.py
"""
影响因子计算相关API路由
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import logging

from services.neo4j_service import get_neo4j_service
from services.impact_calculator import get_impact_calculator
from db import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/impact", tags=["impact"])


class CalculateChainRequest(BaseModel):
    """计算影响链路请求"""
    industry_id: str
    segment_code: Optional[str] = None
    news_id: str


@router.post("/calculate-chain")
async def calculate_impact_chain(request: CalculateChainRequest):
    """
    计算新闻的影响链路和影响因子

    Args:
        request: 包含industry_id, segment_code, news_id

    Returns:
        影响链路数据和影响因子
    """
    neo4j_service = get_neo4j_service()
    calculator = get_impact_calculator(neo4j_service, db)

    try:
        # 1. 从数据库获取新闻数据
        news = await _get_news_data(request.news_id)

        if not news:
            raise HTTPException(status_code=404, detail="新闻不存在")

        # 2. 计算影响链路
        impact_chain = await calculator.calculate_chain_impacts(
            news=news,
            industry_code=request.industry_id,
            segment_code=request.segment_code
        )

        return {
            "success": True,
            "data": impact_chain
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"计算影响链路失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/news/{news_id}/factors")
async def get_news_impact_factors(
    news_id: str,
    industry_code: Optional[str] = Query(None),
    min_factor: float = Query(0.05, ge=0, le=1)
):
    """
    获取新闻的影响因子列表

    Args:
        news_id: 新闻ID
        industry_code: 产业代码（可选，过滤特定产业）
        min_factor: 最小影响因子阈值

    Returns:
        影响因子列表
    """
    try:
        # 从数据库查询
        query = """
        SELECT * FROM news_impact_factors
        WHERE newsId = ?
        AND impactFactor >= ?
        """
        params = [news_id, min_factor]

        if industry_code:
            query += " AND industryCode = ?"
            params.append(industry_code)

        query += " ORDER BY impactFactor DESC LIMIT 50"

        result = await db.execute_query(query, params)

        return {
            "success": True,
            "data": {
                "news_id": news_id,
                "factors": result,
                "count": len(result)
            }
        }

    except Exception as e:
        logger.error(f"获取影响因子失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/segment/{industry_code}/{segment_code}/news")
async def get_segment_impacted_news(
    industry_code: str,
    segment_code: str,
    min_factor: float = Query(0.1, ge=0, le=1),
    limit: int = Query(20, ge=1, le=100)
):
    """
    获取影响某个Segment的新闻列表

    Args:
        industry_code: 产业代码
        segment_code: Segment代码
        min_factor: 最小影响因子
        limit: 返回数量

    Returns:
        新闻列表（按影响因子降序）
    """
    try:
        query = """
        SELECT
            nif.*,
            na.title,
            na.publishTime,
            na.sentiment,
            na.source
        FROM news_impact_factors nif
        JOIN NewsArticle na ON nif.newsId = na.id
        WHERE nif.industryCode = ?
        AND nif.segmentCode = ?
        AND nif.impactFactor >= ?
        ORDER BY nif.impactFactor DESC, na.publishTime DESC
        LIMIT ?
        """

        result = await db.execute_query(
            query,
            [industry_code, segment_code, min_factor, limit]
        )

        return {
            "success": True,
            "data": {
                "industry_code": industry_code,
                "segment_code": segment_code,
                "news": result,
                "count": len(result)
            }
        }

    except Exception as e:
        logger.error(f"获取受影响新闻失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _get_news_data(news_id: str) -> Optional[Dict[str, Any]]:
    """
    从数据库获取新闻数据（包含matched_segments）

    Args:
        news_id: 新闻ID

    Returns:
        新闻数据字典
    """
    query = """
    SELECT
        na.*,
        GROUP_CONCAT(DISTINCT t.code) as tag_codes
    FROM NewsArticle na
    LEFT JOIN NewsArticleTag nat ON na.id = nat.newsId
    LEFT JOIN Tag t ON nat.tagId = t.id
    WHERE na.id = ?
    GROUP BY na.id
    """

    result = await db.execute_query(query, [news_id])

    if not result or len(result) == 0:
        return None

    news_data = result[0]

    # 解析tag_codes并通过Neo4j反查matched_segments
    tag_codes = news_data.get('tag_codes', '').split(',') if news_data.get('tag_codes') else []

    if tag_codes:
        neo4j_service = get_neo4j_service()
        segments = await neo4j_service.find_segments_by_tags(tag_codes)

        news_data['matched_segments'] = segments
    else:
        news_data['matched_segments'] = []

    return news_data
