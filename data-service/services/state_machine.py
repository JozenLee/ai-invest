# data-service/services/state_machine.py
from typing import Dict, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class IndustryGraphStateMachine:
    """产业图谱状态机"""

    TRANSITIONS: Dict[str, List[str]] = {
        "pending": ["exploring_structure", "failed"],
        "exploring_structure": ["structure_reviewing", "reviewing", "failed"],  # 新增reviewing
        "structure_reviewing": ["exploring_details", "structure_refining", "reviewing"],  # 兼容旧状态，新增reviewing
        "structure_refining": ["structure_reviewing", "reviewing", "failed"],  # 新增reviewing
        "exploring_details": ["companies_reviewing", "reviewing", "failed"],  # 新增reviewing
        "companies_reviewing": ["writing_to_graph", "companies_refining", "reviewing"],  # 新增reviewing
        "companies_refining": ["companies_reviewing", "reviewing", "failed"],  # 新增reviewing
        "reviewing": ["writing_to_graph", "refining"],  # 新增统一审核状态
        "refining": ["reviewing", "failed"],  # 新增统一优化状态
        "writing_to_graph": ["completed", "failed"],
        "completed": [],
        "failed": []
    }

    def can_transition(self, from_state: str, to_state: str) -> bool:
        """检查状态转换是否合法

        Args:
            from_state: 当前状态
            to_state: 目标状态

        Returns:
            bool: 是否允许转换
        """
        return to_state in self.TRANSITIONS.get(from_state, [])

    def validate_review_action(
        self,
        current_state: str,
        approved: bool
    ) -> str:
        """根据review结果决定下一个状态

        Args:
            current_state: 当前状态
            approved: 是否批准

        Returns:
            str: 下一个状态

        Raises:
            ValueError: 当前状态不支持review操作
        """
        # 统一审核状态
        if current_state == "reviewing":
            return "writing_to_graph" if approved else "refining"

        # 兼容旧的两阶段审核状态
        elif current_state == "structure_reviewing":
            return "exploring_details" if approved else "structure_refining"

        elif current_state == "companies_reviewing":
            return "writing_to_graph" if approved else "companies_refining"

        else:
            raise ValueError(f"无法在状态 {current_state} 执行review")

    def transition(
        self,
        task: 'ExplorationTask',
        to_state: str,
        **context
    ) -> 'ExplorationTask':
        """执行状态转换（带验证）

        Args:
            task: 探索任务
            to_state: 目标状态
            **context: 额外的上下文数据

        Returns:
            ExplorationTask: 更新后的任务

        Raises:
            ValueError: 非法状态转换
        """
        if not self.can_transition(task.status, to_state):
            raise ValueError(
                f"非法状态转换: {task.status} -> {to_state}"
            )

        # 记录状态变更
        logger.info(f"任务 {task.task_id} 状态转换: {task.status} -> {to_state}")

        # 更新状态
        task.status = to_state
        task.updated_at = datetime.now()

        # 根据状态设置progress和current_step
        task.progress = self._get_progress_for_state(to_state)
        task.current_step = self._get_step_description(to_state)

        # 应用额外的上下文数据
        for key, value in context.items():
            setattr(task, key, value)

        return task

    def _get_progress_for_state(self, state: str) -> int:
        """获取状态对应的进度

        Args:
            state: 状态名称

        Returns:
            int: 进度百分比 0-100
        """
        progress_map = {
            "pending": 0,
            "exploring_structure": 20,
            "structure_reviewing": 30,
            "structure_refining": 25,
            "exploring_details": 60,
            "companies_reviewing": 70,
            "companies_refining": 65,
            "reviewing": 70,  # 新增统一审核状态
            "refining": 65,  # 新增统一优化状态
            "writing_to_graph": 90,
            "completed": 100,
            "failed": 0
        }
        return progress_map.get(state, 0)

    def _get_step_description(self, state: str) -> str:
        """获取状态描述

        Args:
            state: 状态名称

        Returns:
            str: 人类可读的状态描述
        """
        descriptions = {
            "pending": "任务初始化",
            "exploring_structure": "AI正在深度探索产业链结构...",
            "structure_reviewing": "等待审核产业链结构",
            "structure_refining": "根据反馈优化结构...",
            "exploring_details": "AI正在并行填充企业信息...",
            "companies_reviewing": "等待审核企业信息",
            "companies_refining": "根据反馈补充企业信息...",
            "reviewing": "等待审核知识图谱",  # 新增统一审核状态
            "refining": "根据反馈优化知识图谱...",  # 新增统一优化状态
            "writing_to_graph": "正在写入图数据库...",
            "completed": "探索完成",
            "failed": "任务失败"
        }
        return descriptions.get(state, state)
