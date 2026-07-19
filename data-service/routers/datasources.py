"""
数据源管理路由
处理数据源的立即采集和调度配置
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


class ScheduleUpdateRequest(BaseModel):
    """调度更新请求模型"""
    updateFrequency: int  # 更新频率（分钟）
    driverConfig: Dict[str, Any]  # 驱动配置


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


@router.post("/datasources/{source_id}/fetch")
async def trigger_datasource_fetch(source_id: str):
    """
    立即触发指定数据源的采集任务

    Args:
        source_id: 数据源ID

    Returns:
        任务触发结果
    """
    try:
        logger.info(f"收到数据源采集请求: source_id={source_id}")

        # 从数据库获取数据源配置
        from db import db

        datasource = await db.get_datasource(source_id)
        if not datasource:
            raise HTTPException(
                status_code=404,
                detail=f"数据源不存在: {source_id}"
            )

        # 解析驱动配置
        import json
        driver_config = {}
        if datasource.get('driverConfig'):
            try:
                driver_config = json.loads(datasource['driverConfig'])
            except json.JSONDecodeError as e:
                logger.warning(f"驱动配置解析失败: {e}")

        # 导入fetch_service
        from services.fetch_service import fetch_service
        import asyncio

        # 在后台异步执行采集任务
        asyncio.create_task(
            fetch_service.execute_fetch_task(
                source_id=source_id,
                source_config=driver_config
            )
        )

        logger.info(f"数据源采集任务已触发: source_id={source_id}")

        return {
            "success": True,
            "source_id": source_id,
            "message": "采集任务已在后台启动"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"触发数据源采集失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"触发采集失败: {str(e)}"
        )


@router.patch("/datasources/{source_id}/schedule")
async def update_datasource_schedule(source_id: str, request: ScheduleUpdateRequest):
    """
    更新数据源的调度配置

    Args:
        source_id: 数据源ID
        request: 调度配置更新请求

    Returns:
        更新结果
    """
    try:
        logger.info(f"收到调度配置更新请求: source_id={source_id}, frequency={request.updateFrequency}")

        # 验证数据源是否存在
        from db import db

        datasource = await db.get_datasource(source_id)
        if not datasource:
            raise HTTPException(
                status_code=404,
                detail=f"数据源不存在: {source_id}"
            )

        # 检查数据源是否激活
        if not datasource.get('isActive'):
            logger.warning(f"数据源未激活，跳过调度配置: source_id={source_id}")
            return {
                "success": True,
                "source_id": source_id,
                "message": "数据源未激活，调度任务未更新"
            }

        # 更新调度器
        from services.scheduler_service import scheduler_service

        if request.updateFrequency > 0:
            # 启用或更新调度任务
            success = await scheduler_service.enable_source_job(
                source_id=source_id,
                update_frequency=request.updateFrequency,
                driver_config=request.driverConfig
            )

            if success:
                logger.info(f"调度任务已更新: source_id={source_id}, frequency={request.updateFrequency}")
                return {
                    "success": True,
                    "source_id": source_id,
                    "message": f"调度任务已更新，执行频率: {request.updateFrequency}分钟"
                }
            else:
                raise HTTPException(
                    status_code=500,
                    detail="调度任务更新失败"
                )
        else:
            # 禁用调度任务
            success = await scheduler_service.disable_source_job(source_id)
            logger.info(f"调度任务已禁用: source_id={source_id}")
            return {
                "success": True,
                "source_id": source_id,
                "message": "调度任务已禁用"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新调度配置失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"更新调度配置失败: {str(e)}"
        )
