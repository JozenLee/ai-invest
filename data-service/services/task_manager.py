# data-service/services/task_manager.py
from typing import Dict, Optional, Any
from models.industry_models import ExplorationTask

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
        graph_stats: Optional[Dict[str, int]] = None
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
            # 将graph_stats存储到task的metadata中
            task.metadata['graph_stats'] = graph_stats

    def delete_task(self, task_id: str) -> None:
        """删除任务"""
        self._tasks.pop(task_id, None)

# 全局实例
task_manager = TaskManager()
