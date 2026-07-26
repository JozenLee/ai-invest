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
    """AI分析后的新闻数据"""
    # 继承原始字段
    id: str
    title: str
    content: str
    source: str
    url: Optional[str] = None
    publishTime: str

    # AI生成字段
    summary: Optional[str] = None  # AI生成的摘要

    # AI分析字段
    categoryId: Optional[str] = None
    categoryConfidence: Optional[float] = 0.0
    domainId: Optional[str] = None
    domainIds: Optional[List[str]] = None
    sentiment: Optional[float] = None
    sentimentLabel: Optional[str] = None  # bullish/neutral/bearish
    sentimentConfidence: Optional[float] = 0.0
    impact: Optional[int] = None  # 1-5
    keywords: Optional[str] = None  # JSON string
    entities: Optional[str] = None  # JSON string
    sectors: Optional[str] = None  # JSON string

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
                "summary": "英伟达Q4财报超预期，AI芯片需求持续强劲，数据中心业务增长200%",
                "source": "财联社",
                "categoryId": "tech",
                "sentiment": 0.8,
                "sentimentLabel": "bullish",
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
