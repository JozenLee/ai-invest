# data-service/models/review_models.py
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class ReviewFeedback(BaseModel):
    """Review反馈"""
    approved: bool = Field(..., description="是否通过")
    comments: Optional[str] = Field(None, description="用户评论")
    modified_data: Optional[Dict[str, Any]] = Field(
        None,
        description="用户修改的数据"
    )


class ReviewHistory(BaseModel):
    """Review历史记录"""
    task_id: str = Field(..., description="任务ID")
    phase: str = Field(..., description="阶段: structure | companies")
    iteration: int = Field(..., ge=1, description="迭代次数")
    feedback: ReviewFeedback = Field(..., description="反馈内容")
    timestamp: datetime = Field(default_factory=datetime.now, description="时间戳")
