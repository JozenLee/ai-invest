# data-service/routers/industry_query.py
"""
Task 11: Neo4j查询API
提供产业图谱查询接口
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from services.neo4j_service import get_neo4j_service

router = APIRouter(prefix="/api/v1/industries", tags=["industries"])


@router.get("", response_model=List[Dict[str, Any]])
async def list_industries():
    """
    获取所有产业列表

    Returns:
        List[Dict]: 产业列表
            - id: 产业ID
            - code: 产业代码
            - name: 产业名称
            - description: 产业描述
    """
    neo4j_service = get_neo4j_service()
    try:
        industries = await neo4j_service.list_industries()
        return industries
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{industry_id}", response_model=Dict[str, Any])
async def get_industry(industry_id: str):
    """
    获取产业基本信息

    Args:
        industry_id: 产业ID

    Returns:
        Dict: 产业基本信息
            - id: 产业ID
            - code: 产业代码
            - name: 产业名称
            - description: 产业描述

    Raises:
        HTTPException: 404 - 产业不存在
    """
    neo4j_service = get_neo4j_service()
    try:
        industry = await neo4j_service.get_industry_basic(industry_id)
        if not industry:
            raise HTTPException(status_code=404, detail="产业不存在")
        return industry
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{industry_id}/graph", response_model=Dict[str, Any])
async def get_industry_graph(industry_id: str):
    """
    获取产业完整图谱（嵌套结构）

    Args:
        industry_id: 产业ID

    Returns:
        Dict: 嵌套图谱结构
            - industry: 产业基本信息
            - stages: 阶段列表
                - stage: 阶段信息
                - segments: 环节列表
                    - segment: 环节信息
                    - companies: 企业列表

    Raises:
        HTTPException: 404 - 产业不存在
    """
    neo4j_service = get_neo4j_service()
    try:
        graph = await neo4j_service.get_industry_full_graph(industry_id)
        if not graph:
            raise HTTPException(status_code=404, detail="产业不存在")
        return graph
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{industry_id}/swimlane", response_model=Dict[str, Any])
async def get_industry_swimlane(industry_id: str):
    """
    获取产业泳道图数据（扁平化结构）

    Args:
        industry_id: 产业ID

    Returns:
        Dict: 泳道数据结构
            - industry: 产业基本信息
            - lanes: 泳道字典 {stage_code: {stage: {}, segments: []}}
                - stage: 阶段信息
                - segments: 环节列表（包含企业统计）

    Raises:
        HTTPException: 404 - 产业不存在
    """
    neo4j_service = get_neo4j_service()
    try:
        swimlane = await neo4j_service.get_industry_swimlane_data(industry_id)
        if not swimlane:
            raise HTTPException(status_code=404, detail="产业不存在")
        return swimlane
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")
