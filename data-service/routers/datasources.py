"""
数据源管理路由
处理数据源的立即采集请求
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

router = APIRouter()


class FetchRequest(BaseModel):
    """采集请求模型"""
    source_id: str
    source_config: Dict[str, Any]


class FetchResponse(BaseModel):
    """采集响应模型"""
    success: bool
    source_id: str
    fetched_count: Optional[int] = None
    processed_count: Optional[int] = None
    failed_count: Optional[int] = None
    stored_count: Optional[int] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None


@router.post("/datasources/fetch")
async def trigger_fetch(request: FetchRequest):
    """
    立即触发数据源采集任务（异步执行）

    Args:
        request: 采集请求，包含数据源ID和配置

    Returns:
        立即返回任务已触发的响应，不等待任务完成
    """
    try:
        logger.info(f"收到立即采集请求: source_id={request.source_id}")

        # 导入fetch_service
        from services.fetch_service import fetch_service
        import asyncio

        # 在后台异步执行采集任务，不阻塞响应
        asyncio.create_task(
            fetch_service.execute_fetch_task(
                source_id=request.source_id,
                source_config=request.source_config
            )
        )

        logger.info(f"采集任务已触发: source_id={request.source_id}")

        # 立即返回成功响应
        return {
            "success": True,
            "source_id": request.source_id,
            "message": "采集任务已在后台启动，请稍后查看采集日志"
        }

    except Exception as e:
        logger.error(f"触发采集任务失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"触发采集任务失败: {str(e)}"
        )
