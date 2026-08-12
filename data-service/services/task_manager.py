# data-service/services/task_manager.py
from typing import Dict, Optional, Any
from datetime import datetime
from models.industry_models import ExplorationTask
from models.review_models import ReviewFeedback, ReviewHistory
from models.coverage_models import CoverageAssessment, ExplorationContext

class TaskManager:
    """后台任务管理器"""

    def __init__(self):
        self._tasks: Dict[str, ExplorationTask] = {}

    def create_task(self, task_id: str, industry_name: str) -> ExplorationTask:
        """创建新任务"""
        task = ExplorationTask(
            task_id=task_id,
            industry_name=industry_name,
            status="pending",
            progress=0
        )
        self._tasks[task_id] = task
        return task

    def get_task(self, task_id: str) -> Optional[ExplorationTask]:
        """获取任务"""
        return self._tasks.get(task_id)

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
        task = self._tasks.get(task_id)
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
        task = self._tasks.get(task_id)
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

    def delete_task(self, task_id: str) -> None:
        """删除任务"""
        self._tasks.pop(task_id, None)

# 全局实例
task_manager = TaskManager()
