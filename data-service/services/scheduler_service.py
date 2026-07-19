"""
定时任务调度服务
使用APScheduler实现定时采集新闻和大V动态
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class SchedulerService:
    """定时任务调度服务"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.jobs: Dict[str, Any] = {}
        self.is_running = False

    async def start(self):
        """启动调度器"""
        if not self.is_running:
            self.scheduler.start()
            self.is_running = True
            logger.info('定时任务调度器已启动')

    async def stop(self):
        """停止调度器"""
        if self.is_running:
            self.scheduler.shutdown()
            self.is_running = False
            logger.info('定时任务调度器已停止')

    async def add_interval_job(
        self,
        job_id: str,
        func: Callable,
        minutes: int = 60,
        args: tuple = None,
        kwargs: dict = None,
        replace_existing: bool = True
    ) -> bool:
        """添加间隔执行的任务"""
        try:
            job = self.scheduler.add_job(
                func,
                trigger=IntervalTrigger(minutes=minutes),
                id=job_id,
                args=args or (),
                kwargs=kwargs or {},
                replace_existing=replace_existing,
                next_run_time=datetime.now()  # 立即执行一次
            )
            self.jobs[job_id] = {
                'id': job_id,
                'func': func.__name__ if hasattr(func, '__name__') else str(func),
                'interval': minutes,
                'next_run': job.next_run_time,
                'status': 'active'
            }
            logger.info(f'添加定时任务: {job_id}, 间隔: {minutes}分钟')
            return True
        except Exception as e:
            logger.error(f'添加定时任务失败: {e}')
            return False

    async def add_cron_job(
        self,
        job_id: str,
        func: Callable,
        hour: int = 0,
        minute: int = 0,
        args: tuple = None,
        kwargs: dict = None,
        replace_existing: bool = True
    ) -> bool:
        """添加Cron定时任务"""
        try:
            job = self.scheduler.add_job(
                func,
                trigger=CronTrigger(hour=hour, minute=minute),
                id=job_id,
                args=args or (),
                kwargs=kwargs or {},
                replace_existing=replace_existing
            )
            self.jobs[job_id] = {
                'id': job_id,
                'func': func.__name__ if hasattr(func, '__name__') else str(func),
                'cron': f'{hour}:{minute:02d}',
                'next_run': job.next_run_time,
                'status': 'active'
            }
            logger.info(f'添加Cron任务: {job_id}, 时间: {hour}:{minute:02d}')
            return True
        except Exception as e:
            logger.error(f'添加Cron任务失败: {e}')
            return False

    async def remove_job(self, job_id: str) -> bool:
        """移除定时任务"""
        try:
            if job_id in self.jobs:
                self.scheduler.remove_job(job_id)
                del self.jobs[job_id]
                logger.info(f'移除定时任务: {job_id}')
                return True
            return False
        except Exception as e:
            logger.error(f'移除定时任务失败: {e}')
            return False

    async def pause_job(self, job_id: str) -> bool:
        """暂停定时任务"""
        try:
            self.scheduler.pause_job(job_id)
            if job_id in self.jobs:
                self.jobs[job_id]['status'] = 'paused'
            logger.info(f'暂停定时任务: {job_id}')
            return True
        except Exception as e:
            logger.error(f'暂停定时任务失败: {e}')
            return False

    async def resume_job(self, job_id: str) -> bool:
        """恢复定时任务"""
        try:
            self.scheduler.resume_job(job_id)
            if job_id in self.jobs:
                self.jobs[job_id]['status'] = 'active'
            logger.info(f'恢复定时任务: {job_id}')
            return True
        except Exception as e:
            logger.error(f'恢复定时任务失败: {e}')
            return False

    async def run_job_now(self, job_id: str) -> bool:
        """立即执行任务"""
        try:
            job = self.scheduler.get_job(job_id)
            if job:
                job.modify(next_run_time=datetime.now())
                logger.info(f'立即执行任务: {job_id}')
                return True
            return False
        except Exception as e:
            logger.error(f'立即执行任务失败: {e}')
            return False

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """获取任务状态"""
        job = self.scheduler.get_job(job_id)
        if job:
            return {
                'id': job_id,
                'next_run': job.next_run_time,
                'pending': job.pending,
                **self.jobs.get(job_id, {})
            }
        return None

    def get_all_jobs(self) -> List[Dict]:
        """获取所有任务状态"""
        jobs = []
        for job in self.scheduler.get_jobs():
            job_info = {
                'id': job.id,
                'next_run': job.next_run_time,
                'pending': job.pending,
                **self.jobs.get(job.id, {})
            }
            jobs.append(job_info)
        return jobs

    async def clear_all_jobs(self):
        """清除所有任务"""
        self.scheduler.remove_all_jobs()
        self.jobs.clear()
        logger.info('清除所有定时任务')


# 全局调度器实例
scheduler_service = SchedulerService()
