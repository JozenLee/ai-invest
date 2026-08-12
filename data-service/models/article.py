"""
新闻文章数据模型
用于新闻处理管道的数据传递
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class RawArticle(BaseModel):
    """采集后的原始新闻数据"""
    id: str
    title: str
    content: str
    source: str
    url: Optional[str] = None
    publishTime: str

    class Config:
        json_schema_extra = {
            "example": {
                "id": "cls_123",
                "title": "AI芯片需求暴增",
                "content": "据财联社报道...",
                "source": "财联社",
                "url": "https://www.cls.cn/detail/123",
                "publishTime": "2026-07-25 10:00:00"
            }
        }


class AnalyzedArticle(BaseModel):
    """AI分析后的新闻数据（简化版 - 只保留前端需要的字段）"""
    # 继承原始字段
    id: str
    title: str
    content: str
    source: str
    url: Optional[str] = None
    publishTime: str

    # AI分析字段（简化 - 只保留前端UI需要的字段）
    segmentCodes: Optional[List[str]] = None  # 产业细分领域代码列表
    sentiment: Optional[float] = None  # 情绪分数 -1到1（-1利空, 0中性, 1利好）
    impact: Optional[int] = None  # 影响力等级 1-5

    # 处理状态
    aiProcessed: bool = False
    aiProcessedAt: Optional[datetime] = None
    aiError: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "id": "cls_123",
                "title": "AI芯片需求暴增",
                "content": "据财联社报道...",
                "source": "财联社",
                "segmentCodes": ["ai_chip_design", "ai_chip_manufacturing"],
                "sentiment": 0.8,
                "impact": 4,
                "aiProcessed": True
            }
        }


class PipelineResult(BaseModel):
    """管道执行结果"""
    fetched: int = Field(description="采集的新闻数量")
    analyzed: int = Field(description="成功分析的数量")
    saved: int = Field(default=0, description="成功保存的数量")
    failed: int = Field(default=0, description="失败的数量")
    timestamp: datetime = Field(default_factory=datetime.now)

    class Config:
        json_schema_extra = {
            "example": {
                "fetched": 50,
                "analyzed": 48,
                "saved": 48,
                "failed": 2,
                "timestamp": "2026-07-25T10:00:00"
            }
        }
