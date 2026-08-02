# data-service/models/industry_models.py
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime


class IndustryInfo(BaseModel):
    """产业基本信息"""
    name: str = Field(..., description="产业名称")
    code: str = Field(..., description="产业代码（英文）")
    description: Optional[str] = Field(None, description="产业描述")


class SegmentInfo(BaseModel):
    """环节信息"""
    name: str = Field(..., description="环节名称")
    code: str = Field(..., description="环节代码")
    description: str = Field(..., description="环节功能描述")
    key_categories: List[str] = Field(default_factory=list, description="核心类别")


class StageInfo(BaseModel):
    """阶段信息"""
    stage: str = Field(..., description="阶段名称（上游/中游/下游）")
    stage_code: str = Field(..., description="阶段代码")
    description: str = Field(..., description="阶段描述")
    segments: List[SegmentInfo] = Field(default_factory=list, description="环节列表")


class IndustryStructure(BaseModel):
    """产业链结构（第一轮探索结果）"""
    industry: IndustryInfo
    structure: List[StageInfo] = Field(default_factory=list, description="产业链阶段")


class CompanyInfo(BaseModel):
    """企业信息"""
    name: str = Field(..., description="企业中文名称")
    name_en: Optional[str] = Field(None, description="企业英文名称")
    ticker: Optional[str] = Field(None, description="股票代码")
    exchange: Optional[str] = Field(None, description="交易所")
    country: str = Field(..., description="国家")
    market_position: str = Field(..., description="市场地位: leader/major/emerging")
    key_products: List[str] = Field(default_factory=list, description="主要产品")
    description: Optional[str] = Field(None, description="企业描述")
    segment_code: Optional[str] = Field(None, description="所属环节代码")
    stage_code: Optional[str] = Field(None, description="所属阶段代码")


class RelationshipInfo(BaseModel):
    """关系信息"""
    model_config = ConfigDict(populate_by_name=True)

    type: str = Field(..., description="关系类型: SUPPLIES/COMPETES_WITH")
    from_company: str = Field(..., alias="from", description="源企业名称")
    to_company: str = Field(..., alias="to", description="目标企业名称")
    description: Optional[str] = Field(None, description="关系描述")
    confidence: float = Field(0.8, description="置信度 0-1")


class SegmentDetail(BaseModel):
    """环节详细信息（第二轮填充结果）"""
    companies: List[CompanyInfo] = Field(default_factory=list)
    relationships: List[RelationshipInfo] = Field(default_factory=list)


class ExplorationResult(BaseModel):
    """完整探索结果"""
    structure: IndustryStructure
    details: Dict[str, SegmentDetail] = Field(
        default_factory=dict,
        description="key=segment_code, value=SegmentDetail"
    )
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.now)


class ExplorationTask(BaseModel):
    """探索任务状态"""
    task_id: str
    industry_name: str
    status: str = Field(
        "pending",
        description="pending/exploring_structure/structure_ready/exploring_details/completed/failed"
    )
    progress: int = Field(0, ge=0, le=100)
    current_step: Optional[str] = None
    structure: Optional[IndustryStructure] = None
    result: Optional[ExplorationResult] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
