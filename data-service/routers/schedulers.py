"""
调度器健康检查 API
提供调度器状态和活跃任务信息
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["schedulers"])


@router.get("/health")
async def get_scheduler_health():
    """
    获取调度器健康状态

    Returns:
        调度器运行状态和活跃任务列表
    """
    try:
        from services.scheduler_service import scheduler_service

        # 获取所有任务
        all_jobs = scheduler_service.get_all_jobs()

        # 统计任务状态
        active_jobs = [job for job in all_jobs if job.get('status') == 'active']
        paused_jobs = [job for job in all_jobs if job.get('status') == 'paused']

        # 格式化任务信息
        formatted_jobs = []
        for job in all_jobs:
            formatted_job = {
                'id': job.get('id'),
                'func': job.get('func'),
                'status': job.get('status', 'unknown'),
                'next_run': job.get('next_run').isoformat() if job.get('next_run') else None,
                'pending': job.get('pending', False)
            }

            # 添加间隔或cron信息
            if 'interval' in job:
                formatted_job['interval_minutes'] = job['interval']
            if 'cron' in job:
                formatted_job['cron'] = job['cron']

            formatted_jobs.append(formatted_job)

        return {
            "success": True,
            "data": {
                "is_running": scheduler_service.is_running,
                "total_jobs": len(all_jobs),
                "active_jobs": len(active_jobs),
                "paused_jobs": len(paused_jobs),
                "jobs": formatted_jobs,
                "timestamp": datetime.now().isoformat()
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "获取调度器状态失败",
                "message": str(e)
            }
        )


@router.post("/sync")
async def sync_scheduler_jobs():
    """
    手动同步数据库中的调度任务
    从数据库读取所有启用的SchedulerJob并注册到APScheduler

    Returns:
        同步结果统计
    """
    try:
        from services.scheduler_service import scheduler_service

        logger.info("开始手动同步调度任务...")

        # 调用同步方法
        stats = await scheduler_service.sync_schedulers_from_database()

        logger.info(f"调度任务同步完成: {stats}")

        return {
            "success": True,
            "data": {
                "stats": stats,
                "timestamp": datetime.now().isoformat()
            },
            "message": f"同步完成: 加载{stats['loaded']}个, 失败{stats['failed']}个, 跳过{stats['skipped']}个"
        }

    except Exception as e:
        logger.error(f"同步调度任务失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "同步调度任务失败",
                "message": str(e)
            }
        )
