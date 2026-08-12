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


class ToggleRequest(BaseModel):
    """启用/禁用请求模型"""
    isActive: bool
    updateFrequency: int
    driverConfig: Dict[str, Any]


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
    立即触发数据源采集任务（等待采集完成但不等待AI分析）

    Args:
        request: 采集请求，包含数据源ID和配置

    Returns:
        采集完成后的结果统计（不包括AI分析结果）
    """
    try:
        logger.info(f"收到立即采集请求: source_id={request.source_id}")

        # 导入fetch_service
        from services.fetch_service import fetch_service
        import time

        start_time = time.time()

        # 等待采集任务完成（但AI分析是异步的，不会阻塞）
        result = await fetch_service.execute_fetch_task(
            source_id=request.source_id,
            source_config=request.source_config
        )

        duration_ms = int((time.time() - start_time) * 1000)

        logger.info(f"采集任务完成: source_id={request.source_id}, duration={duration_ms}ms")

        # 返回采集结果
        return FetchResponse(
            success=result.get('success', False),
            source_id=request.source_id,
            fetched_count=result.get('fetched_count'),
            processed_count=result.get('processed_count'),
            failed_count=result.get('failed_count'),
            stored_count=result.get('stored_count'),
            duration_ms=duration_ms,
            error=result.get('error')
        )

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

        datasource = db.get_datasource(source_id)
        if not datasource:
            raise HTTPException(
                status_code=404,
                detail=f"数据源不存在: {source_id}"
            )

        # 解析驱动配置
        import json
        driver_config = {}
        # 注意：数据库字段是 'config' 不是 'driverConfig'
        config_str = datasource.get('config', '{}')
        try:
            driver_config = json.loads(config_str) if config_str else {}
            # 添加必要的字段
            driver_config['driverType'] = datasource.get('driverType', 'api')
            driver_config['provider'] = datasource.get('provider', 'akshare')
        except json.JSONDecodeError as e:
            logger.warning(f"驱动配置解析失败: {e}")
            driver_config = {
                'driverType': datasource.get('driverType', 'api'),
                'provider': datasource.get('provider', 'akshare')
            }

        # 导入fetch_service
        from services.fetch_service import fetch_service
        import time

        start_time = time.time()

        # 等待采集任务完成
        result = await fetch_service.execute_fetch_task(
            source_id=source_id,
            source_config=driver_config
        )

        duration_ms = int((time.time() - start_time) * 1000)

        logger.info(f"数据源采集完成: source_id={source_id}, duration={duration_ms}ms")

        # 返回采集结果
        return FetchResponse(
            success=result.get('success', False),
            source_id=source_id,
            fetched_count=result.get('fetched_count'),
            processed_count=result.get('processed_count'),
            failed_count=result.get('failed_count'),
            stored_count=result.get('stored_count'),
            duration_ms=duration_ms,
            error=result.get('error')
        )

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

        datasource = db.get_datasource(source_id)
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


@router.post("/datasources/{source_id}/toggle")
async def toggle_datasource(source_id: str, request: ToggleRequest):
    """
    启用/禁用数据源并同步更新调度器

    Args:
        source_id: 数据源ID
        request: 切换请求（包含isActive状态、更新频率和驱动配置）

    Returns:
        更新结果
    """
    try:
        logger.info(f"收到数据源切换请求: source_id={source_id}, isActive={request.isActive}")

        from services.scheduler_service import scheduler_service

        if request.isActive:
            # 启用数据源 - 创建调度任务
            if request.updateFrequency > 0:
                success = await scheduler_service.enable_source_job(
                    source_id=source_id,
                    update_frequency=request.updateFrequency,
                    driver_config=request.driverConfig
                )

                if success:
                    logger.info(f"数据源已启用并创建调度任务: source_id={source_id}")
                    return {
                        "success": True,
                        "source_id": source_id,
                        "message": f"数据源已启用，执行频率: {request.updateFrequency}分钟"
                    }
                else:
                    raise HTTPException(
                        status_code=500,
                        detail="启用数据源失败：调度任务创建失败"
                    )
            else:
                # 启用但没有设置频率
                logger.info(f"数据源已启用（无调度任务）: source_id={source_id}")
                return {
                    "success": True,
                    "source_id": source_id,
                    "message": "数据源已启用（仅支持手动采集）"
                }
        else:
            # 禁用数据源 - 移除调度任务
            success = await scheduler_service.disable_source_job(source_id)
            logger.info(f"数据源已禁用并移除调度任务: source_id={source_id}")
            return {
                "success": True,
                "source_id": source_id,
                "message": "数据源已禁用"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"切换数据源失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"切换数据源失败: {str(e)}"
        )
