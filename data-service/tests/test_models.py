# data-service/tests/test_models.py
"""Test data models implementation"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.coverage_models import CoverageAssessment, ExplorationContext
from models.review_models import ReviewFeedback, ReviewHistory
from models.industry_models import ExplorationTask, IndustryStructure, IndustryInfo
from datetime import datetime


def test_coverage_assessment():
    """测试覆盖度评估模型"""
    coverage = CoverageAssessment(
        is_adequate=True,
        score=0.85,
        dimensions={
            "quantity": 0.9,
            "quality": 0.8,
            "completeness": 1.0,
            "ai_judgment": 0.7
        },
        gaps=["缺少国际龙头企业"],
        suggestions=["补充搜索国际市场信息"]
    )

    assert coverage.is_adequate == True
    assert coverage.score == 0.85
    assert len(coverage.dimensions) == 4
    assert len(coverage.gaps) == 1
    assert len(coverage.suggestions) == 1

    print("✓ CoverageAssessment model test passed")


def test_exploration_context():
    """测试探索上下文模型"""
    context = ExplorationContext(
        iteration=2,
        previous_results=["第一轮搜索结果", "第二轮搜索结果"],
        identified_gaps=["缺少下游应用场景"],
        search_queries=["AI算力产业链", "GPU供应链"]
    )

    assert context.iteration == 2
    assert len(context.previous_results) == 2
    assert len(context.identified_gaps) == 1
    assert len(context.search_queries) == 2

    print("✓ ExplorationContext model test passed")


def test_review_feedback():
    """测试Review反馈模型"""
    feedback1 = ReviewFeedback(
        approved=True,
        comments="结构完整，可以继续"
    )

    assert feedback1.approved == True
    assert feedback1.comments == "结构完整，可以继续"
    assert feedback1.modified_data is None

    feedback2 = ReviewFeedback(
        approved=False,
        comments="需要补充下游环节",
        modified_data={"additional": "data"}
    )

    assert feedback2.approved == False
    assert feedback2.modified_data is not None

    print("✓ ReviewFeedback model test passed")


def test_review_history():
    """测试Review历史模型"""
    feedback = ReviewFeedback(approved=True, comments="通过")

    history = ReviewHistory(
        task_id="test-123",
        phase="structure",
        iteration=1,
        feedback=feedback,
        timestamp=datetime.now()
    )

    assert history.task_id == "test-123"
    assert history.phase == "structure"
    assert history.iteration == 1
    assert history.feedback.approved == True

    print("✓ ReviewHistory model test passed")


def test_exploration_task_extended():
    """测试扩展的ExplorationTask模型"""
    task = ExplorationTask(
        task_id="test-456",
        industry_name="AI算力硬件",
        status="structure_reviewing"
    )

    # 检查新增字段
    assert task.review_history == []
    assert task.coverage_assessment is None
    assert task.exploration_context is None
    assert task.structure_iterations == 0
    assert task.companies_iterations == 0

    # 添加coverage_assessment
    task.coverage_assessment = CoverageAssessment(
        is_adequate=True,
        score=0.8,
        dimensions={"quantity": 0.8},
        gaps=[],
        suggestions=[]
    )

    assert task.coverage_assessment.score == 0.8

    # 添加exploration_context
    task.exploration_context = ExplorationContext(
        iteration=1,
        previous_results=["初始结果"],
        identified_gaps=[],
        search_queries=["查询1"]
    )

    assert task.exploration_context.iteration == 1

    # 添加review_history
    feedback = ReviewFeedback(approved=False, comments="需要改进")
    history = ReviewHistory(
        task_id=task.task_id,
        phase="structure",
        iteration=1,
        feedback=feedback
    )
    task.review_history.append(history)
    task.structure_iterations += 1

    assert len(task.review_history) == 1
    assert task.structure_iterations == 1

    print("✓ Extended ExplorationTask model test passed")


def test_model_serialization():
    """测试模型序列化"""
    task = ExplorationTask(
        task_id="test-789",
        industry_name="半导体制造",
        status="exploring_structure"
    )

    task.exploration_context = ExplorationContext(
        iteration=1,
        previous_results=["结果1"],
        identified_gaps=["gap1"],
        search_queries=["query1"]
    )

    # 转换为字典
    task_dict = task.model_dump()

    assert task_dict["task_id"] == "test-789"
    assert task_dict["exploration_context"]["iteration"] == 1
    assert task_dict["structure_iterations"] == 0

    # 从字典创建
    task2 = ExplorationTask(**task_dict)
    assert task2.task_id == task.task_id
    assert task2.exploration_context.iteration == 1

    print("✓ Model serialization test passed")


if __name__ == "__main__":
    print("Running data models tests...\n")

    test_coverage_assessment()
    test_exploration_context()
    test_review_feedback()
    test_review_history()
    test_exploration_task_extended()
    test_model_serialization()

    print("\n✅ All model tests passed!")
