# data-service/models/coverage_models.py
from pydantic import BaseModel, Field
from typing import List, Dict


class CoverageAssessment(BaseModel):
    """覆盖度评估结果"""
    is_adequate: bool = Field(..., description="是否达标")
    score: float = Field(..., ge=0.0, le=1.0, description="0-1综合得分")
    dimensions: Dict[str, float] = Field(
        default_factory=dict,
        description="各维度得分: quantity/quality/completeness/ai_judgment"
    )
    gaps: List[str] = Field(default_factory=list, description="发现的遗漏点")
    suggestions: List[str] = Field(default_factory=list, description="改进建议")


class ExplorationContext(BaseModel):
    """递归探索上下文"""
    iteration: int = Field(0, ge=0, description="第几轮迭代")
    previous_results: List[str] = Field(
        default_factory=list,
        description="之前的搜索结果摘要"
    )
    identified_gaps: List[str] = Field(
        default_factory=list,
        description="已识别的遗漏"
    )
    search_queries: List[str] = Field(
        default_factory=list,
        description="已执行的查询"
    )
