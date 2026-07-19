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

    async def sync_datasource_jobs(self, datasources: list) -> Dict[str, Any]:
        """
        同步数据源调度任务
        根据数据源配置自动创建、更新或删除调度任务

        Args:
            datasources: 数据源列表，每个包含 id, isActive, updateFrequency, driverConfig

        Returns:
            同步结果统计
        """
        stats = {
            'added': 0,
            'updated': 0,
            'removed': 0,
            'skipped': 0
        }

        try:
            # 获取当前所有数据源相关的任务ID
            existing_job_ids = {
                job_id for job_id in self.jobs.keys()
                if job_id.startswith('datasource_')
            }

            active_job_ids = set()

            for datasource in datasources:
                source_id = datasource.get('id')
                is_active = datasource.get('isActive', False)
                update_frequency = datasource.get('updateFrequency')

                job_id = f'datasource_{source_id}'
                active_job_ids.add(job_id)

                if not is_active:
                    # 如果数据源未激活，移除对应任务
                    if job_id in self.jobs:
                        await self.remove_job(job_id)
                        stats['removed'] += 1
                    else:
                        stats['skipped'] += 1
                    continue

                # 如果数据源已激活，创建或更新调度任务
                if update_frequency and update_frequency > 0:
                    # 准备任务函数
                    from services.fetch_service import fetch_service

                    async def fetch_task(sid=source_id, config=datasource.get('driverConfig', {})):
                        """数据源采集任务"""
                        try:
                            logger.info(f"执行定时采集: source_id={sid}")
                            await fetch_service.execute_fetch_task(sid, config)
                        except Exception as e:
                            logger.error(f"定时采集失败: source_id={sid}, error={e}")

                    # 检查任务是否已存在
                    if job_id in self.jobs:
                        # 更新现有任务
                        await self.update_job_schedule(job_id, update_frequency)
                        stats['updated'] += 1
                    else:
                        # 添加新任务
                        success = await self.add_interval_job(
                            job_id=job_id,
                            func=fetch_task,
                            minutes=update_frequency,
                            replace_existing=True
                        )
                        if success:
                            stats['added'] += 1
                        else:
                            stats['skipped'] += 1
                else:
                    stats['skipped'] += 1

            # 移除不再存在的数据源任务
            jobs_to_remove = existing_job_ids - active_job_ids
            for job_id in jobs_to_remove:
                await self.remove_job(job_id)
                stats['removed'] += 1

            logger.info(f'数据源任务同步完成: {stats}')
            return stats

        except Exception as e:
            logger.error(f'数据源任务同步失败: {e}')
            raise e

    async def update_job_schedule(self, job_id: str, minutes: int) -> bool:
        """
        更新任务的调度频率

        Args:
            job_id: 任务ID
            minutes: 新的执行间隔（分钟）

        Returns:
            是否成功
        """
        try:
            job = self.scheduler.get_job(job_id)
            if not job:
                logger.warning(f'任务不存在: {job_id}')
                return False

            # 更新触发器
            job.reschedule(trigger=IntervalTrigger(minutes=minutes))

            # 更新任务信息
            if job_id in self.jobs:
                self.jobs[job_id]['interval'] = minutes
                self.jobs[job_id]['next_run'] = job.next_run_time

            logger.info(f'更新任务调度: {job_id}, 新间隔: {minutes}分钟')
            return True

        except Exception as e:
            logger.error(f'更新任务调度失败: {e}')
            return False

    async def enable_source_job(self, source_id: str, update_frequency: int, driver_config: Dict) -> bool:
        """
        启用数据源调度任务

        Args:
            source_id: 数据源ID
            update_frequency: 更新频率（分钟）
            driver_config: 驱动配置

        Returns:
            是否成功
        """
        try:
            job_id = f'datasource_{source_id}'

            # 准备任务函数
            from services.fetch_service import fetch_service

            async def fetch_task():
                """数据源采集任务"""
                try:
                    logger.info(f"执行定时采集: source_id={source_id}")
                    await fetch_service.execute_fetch_task(source_id, driver_config)
                except Exception as e:
                    logger.error(f"定时采集失败: source_id={source_id}, error={e}")

            # 添加或替换任务
            success = await self.add_interval_job(
                job_id=job_id,
                func=fetch_task,
                minutes=update_frequency,
                replace_existing=True
            )

            if success:
                logger.info(f'启用数据源任务: {source_id}, 频率: {update_frequency}分钟')

            return success

        except Exception as e:
            logger.error(f'启用数据源任务失败: {e}')
            return False

    async def disable_source_job(self, source_id: str) -> bool:
        """
        禁用数据源调度任务

        Args:
            source_id: 数据源ID

        Returns:
            是否成功
        """
        try:
            job_id = f'datasource_{source_id}'
            success = await self.remove_job(job_id)

            if success:
                logger.info(f'禁用数据源任务: {source_id}')
            else:
                logger.warning(f'数据源任务不存在或已禁用: {source_id}')

            return success

        except Exception as e:
            logger.error(f'禁用数据源任务失败: {e}')
            return False


# 全局调度器实例
scheduler_service = SchedulerService()
