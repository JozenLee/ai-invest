# data-service/services/task_manager.py
from typing import Dict, Optional, Any
from datetime import datetime
import logging
import sqlite3
from models.industry_models import ExplorationTask
from models.review_models import ReviewFeedback, ReviewHistory
from models.coverage_models import CoverageAssessment, ExplorationContext
from db import db

logger = logging.getLogger(__name__)

class TaskManager:
    """后台任务管理器"""

    def __init__(self):
        self._tasks: Dict[str, ExplorationTask] = {}
        self._persistence_warning_emitted = False

    def _persist(self, task: ExplorationTask) -> None:
        """Persist the complete task payload while retaining the in-memory hot cache."""
        try:
            payload = task.model_dump_json()
            now = task.updated_at.isoformat()
            db.update(
                """
                INSERT INTO industry_graph_tasks
                    (taskId, industryId, industryName, status, progress, currentStep,
                     payload, error, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(taskId) DO UPDATE SET
                    industryId=excluded.industryId,
                    industryName=excluded.industryName,
                    status=excluded.status,
                    progress=excluded.progress,
                    currentStep=excluded.currentStep,
                    payload=excluded.payload,
                    error=excluded.error,
                    updatedAt=excluded.updatedAt
                """,
                (
                    task.task_id,
                    task.metadata.get("industry_id"),
                    task.industry_name,
                    task.status,
                    task.progress,
                    task.current_step,
                    payload,
                    task.error,
                    task.created_at.isoformat(),
                    now,
                ),
            )
        except sqlite3.OperationalError as error:
            # Keep the service compatible during rolling deploys, but make the
            # missing migration visible instead of silently pretending tasks are durable.
            if not self._persistence_warning_emitted:
                logger.warning("产业图谱任务持久化不可用，请执行数据库迁移: %s", error)
                self._persistence_warning_emitted = True

    def _load(self, task_id: str) -> Optional[ExplorationTask]:
        try:
            rows = db.execute(
                "SELECT payload FROM industry_graph_tasks WHERE taskId = ? LIMIT 1",
                (task_id,),
            )
        except sqlite3.OperationalError:
            return None
        if not rows:
            return None
        try:
            task = ExplorationTask.model_validate_json(rows[0]["payload"])
            self._tasks[task_id] = task
            return task
        except Exception as error:
            logger.error("恢复产业图谱任务失败 task_id=%s: %s", task_id, error)
            return None

    def create_task(self, task_id: str, industry_name: str) -> ExplorationTask:
        """创建新任务"""
        task = ExplorationTask(
            task_id=task_id,
            industry_name=industry_name,
            status="pending",
            progress=0
        )
        self._tasks[task_id] = task
        self._persist(task)
        return task

    def get_task(self, task_id: str) -> Optional[ExplorationTask]:
        """获取任务"""
        return self._tasks.get(task_id) or self._load(task_id)

    def save_task(self, task: ExplorationTask) -> None:
        """Persist metadata mutations made by route orchestration."""
        self._tasks[task.task_id] = task
        task.updated_at = datetime.now()
        self._persist(task)

    def update_task(
        self,
        task_id: str,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        current_step: Optional[str] = None,
        structure: Optional[Any] = None,
        result: Optional[Any] = None,
        error: Optional[str] = None,
        graph_stats: Optional[Dict[str, int]] = None,
        coverage_assessment: Optional[CoverageAssessment] = None,
        exploration_context: Optional[ExplorationContext] = None
    ) -> None:
        """更新任务状态"""
        task = self.get_task(task_id)
        if not task:
            return

        if status:
            task.status = status
        if progress is not None:
            task.progress = progress
        if current_step:
            task.current_step = current_step
        if structure:
            task.structure = structure
        if result:
            task.result = result
        if error:
            task.error = error
        if graph_stats:
            task.graph_stats = graph_stats
        if coverage_assessment:
            task.coverage_assessment = coverage_assessment
        if exploration_context:
            task.exploration_context = exploration_context

        task.updated_at = datetime.now()
        self._persist(task)

    def add_review_history(
        self,
        task_id: str,
        phase: str,
        feedback: ReviewFeedback
    ) -> None:
        """添加Review历史记录

        Args:
            task_id: 任务ID
            phase: 阶段 (structure | companies | unified)
            feedback: Review反馈
        """
        task = self.get_task(task_id)
        if not task:
            return

        # 增加迭代计数
        if phase == "structure":
            task.structure_iterations += 1
            iteration = task.structure_iterations
        elif phase == "companies":
            task.companies_iterations += 1
            iteration = task.companies_iterations
        elif phase == "unified":
            # 统一审核：同时增加两个计数
            task.structure_iterations += 1
            task.companies_iterations += 1
            iteration = task.structure_iterations  # 使用structure_iterations作为主迭代次数
        else:
            return

        # 记录历史
        history_entry = ReviewHistory(
            task_id=task_id,
            phase=phase,
            iteration=iteration,
            feedback=feedback,
            timestamp=datetime.now()
        )
        task.review_history.append(history_entry)
        task.updated_at = datetime.now()
        self._persist(task)

    def delete_task(self, task_id: str) -> None:
        """删除任务"""
        self._tasks.pop(task_id, None)
        try:
            db.update("DELETE FROM industry_graph_tasks WHERE taskId = ?", (task_id,))
        except sqlite3.OperationalError:
            pass

# 全局实例
task_manager = TaskManager()
