"""
AI 分析服务 - 统一入口
提供事件分析、批量分析、投资理念提取等功能
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from datetime import datetime

router = APIRouter(prefix="/ai", tags=["ai"])

# 全局客户端变量
anthropic_client = None
_client_initialized = False

def get_anthropic_client():
    """
    延迟初始化 Anthropic 客户端
    在第一次调用时才读取环境变量并初始化
    """
    global anthropic_client, _client_initialized

    if _client_initialized:
        return anthropic_client

    _client_initialized = True

    # 读取环境变量
    api_key = os.getenv("ANTHROPIC_API_KEY")
    base_url = os.getenv("ANTHROPIC_BASE_URL")

    print(f"[AI] 初始化 Anthropic 客户端...")
    print(f"[AI] API Key: {'已设置' if api_key else '未设置'}")
    print(f"[AI] Base URL: {base_url}")

    if not api_key:
        print(f"[AI] ❌ API Key 未配置")
        return None

    try:
        from anthropic import Anthropic

        # 构建客户端参数
        client_kwargs = {"api_key": api_key}

        # 如果配置了自定义 base_url（第三方 API）
        if base_url:
            client_kwargs["base_url"] = base_url
            print(f"✓ 使用第三方 Anthropic API: {base_url}")

        anthropic_client = Anthropic(**client_kwargs)
        model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
        print(f"✓ Anthropic API 已配置，模型: {model}")

        return anthropic_client
    except ImportError:
        print("Warning: anthropic package not installed")
        return None
    except Exception as e:
        print(f"[AI] ❌ 初始化失败: {e}")
        return None


class EventAnalysisRequest(BaseModel):
    """事件分析请求"""
    title: str
    content: str
    source: str
    publishTime: str


class SentimentResult(BaseModel):
    """情感分析结果"""
    score: float  # -1 到 1
    confidence: float  # 0 到 1
    label: str  # very_bullish/bullish/neutral/bearish/very_bearish


class AffectedSector(BaseModel):
    """受影响板块"""
    sector: str
    direction: str  # positive/negative
    weight: float  # 0 到 1


class ImpactResult(BaseModel):
    """影响评估结果"""
    timeHorizon: str  # short/medium/long
    magnitude: int  # 1-5
    affectedSectors: List[AffectedSector]
    reasoning: str


class EntitiesResult(BaseModel):
    """实体识别结果"""
    companies: List[str]
    sectors: List[str]
    products: List[str]
    people: List[str]


class EventAnalysisResponse(BaseModel):
    """事件分析响应"""
    category: str
    sentiment: SentimentResult
    impact: ImpactResult
    entities: EntitiesResult
    summary: str


class BatchAnalysisRequest(BaseModel):
    """批量分析请求"""
    events: List[EventAnalysisRequest]


class InvestmentIdeasRequest(BaseModel):
    """投资理念提取请求"""
    content: str
    author: Optional[str] = None


@router.get("/health")
async def health_check():
    """
    AI 服务健康检查

    Returns:
        健康状态和配置信息
    """
    client = get_anthropic_client()
    api_key = os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

    return {
        "status": "healthy" if client else "unavailable",
        "api_key_configured": bool(api_key),
        "model": model,
        "base_url": os.getenv("ANTHROPIC_BASE_URL"),
        "timestamp": datetime.now().isoformat(),
    }


@router.post("/analyze", response_model=EventAnalysisResponse)
async def analyze_event(request: EventAnalysisRequest):
    """
    分析单篇新闻事件

    Args:
        request: 事件分析请求

    Returns:
        事件分析结果
    """
    client = get_anthropic_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable: ANTHROPIC_API_KEY not configured"
        )

    try:
        prompt = build_event_analysis_prompt(request)
        model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

        message = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
            system="""你是一位资深的金融分析师，专注于AI硬件产业链分析。
请分析以下新闻事件，并以JSON格式返回分析结果。

分析维度：
1. 事件分类 - 从以下22个类别中选择最匹配的一个：
   科技类: ai(人工智能), chip(芯片半导体), internet(互联网), product(产品发布), breakthrough(技术突破)
   财经类: earnings(财报业绩), merger(合作并购), capital(资本市场), macro(宏观经济)
   政策类: policy(政策法规), regulation(监管制裁), government(政府动态)
   社会类: event(社会事件), consume(消费生活)
   国际类: geopolitics(地缘政治), global_market(全球市场), trade(国际贸易)
   产业类: supply(供应链), capacity(产能扩张), competition(竞争格局), new_energy(新能源), medical(医药医疗)

2. 情感分析（-1到1的分数，以及置信度）
3. 影响评估（时间跨度、影响力度1-5、受影响板块及方向）
4. 实体识别（公司、板块、产品、人物）
5. 一句话摘要

请确保返回有效的JSON格式。"""
        )

        # 解析响应
        content = message.content[0]
        if content.type == 'text':
            import json
            import re

            # 提取 JSON
            json_match = re.search(r'\{[\s\S]*\}', content.text)
            if json_match:
                result = json.loads(json_match.group(0))
                return EventAnalysisResponse(**result)

        raise ValueError("Failed to parse AI response")

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {str(e)}"
        )


@router.post("/analyze-batch")
async def analyze_batch(request: BatchAnalysisRequest):
    """
    批量分析多篇新闻事件

    Args:
        request: 批量分析请求

    Returns:
        批量分析结果
    """
    client = get_anthropic_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable: ANTHROPIC_API_KEY not configured"
        )

    results = []
    errors = []

    for idx, event in enumerate(request.events):
        try:
            result = await analyze_event(event)
            results.append({
                "index": idx,
                "success": True,
                "data": result.dict(),
            })
        except Exception as e:
            errors.append({
                "index": idx,
                "success": False,
                "error": str(e),
            })

    return {
        "success": True,
        "total": len(request.events),
        "succeeded": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    }


@router.post("/investment-ideas")
async def extract_investment_ideas(request: InvestmentIdeasRequest):
    """
    从大V内容中提取投资理念

    Args:
        request: 投资理念提取请求

    Returns:
        提取的投资理念
    """
    client = get_anthropic_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable: ANTHROPIC_API_KEY not configured"
        )

    try:
        prompt = f"""请从以下内容中提取投资理念和观点：

{f'作者：{request.author}' if request.author else ''}
内容：{request.content}

请以JSON格式返回，包含以下字段：
{{
  "mainThesis": "核心投资观点",
  "keyPoints": ["关键要点1", "关键要点2", ...],
  "sectors": ["相关板块1", "相关板块2", ...],
  "timeHorizon": "投资周期(short/medium/long)",
  "riskLevel": "风险等级(low/medium/high)",
  "actionable": "是否可执行(true/false)",
  "confidence": "置信度(0-1)"
}}"""

        model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

        message = client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            system="你是一位专业的投资分析师，擅长提取和总结投资理念。"
        )

        # 解析响应
        content = message.content[0]
        if content.type == 'text':
            import json
            import re

            json_match = re.search(r'\{[\s\S]*\}', content.text)
            if json_match:
                result = json.loads(json_match.group(0))
                return {
                    "success": True,
                    "data": result,
                }

        raise ValueError("Failed to parse AI response")

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Investment ideas extraction failed: {str(e)}"
        )


def build_event_analysis_prompt(request: EventAnalysisRequest) -> str:
    """构建事件分析 Prompt"""
    return f"""请分析以下新闻事件：

标题：{request.title}
内容：{request.content}
来源：{request.source}
发布时间：{request.publishTime}

请以JSON格式返回分析结果，包含以下字段：
{{
  "category": "事件分类（从22个类别中选择：ai/chip/internet/product/breakthrough/earnings/merger/capital/macro/policy/regulation/government/event/consume/geopolitics/global_market/trade/supply/capacity/competition/new_energy/medical）",
  "sentiment": {{
    "score": 情感分数(-1到1),
    "confidence": 置信度(0到1),
    "label": "情感标签(very_bullish/bullish/neutral/bearish/very_bearish)"
  }},
  "impact": {{
    "timeHorizon": "影响时间跨度(short/medium/long)",
    "magnitude": 影响力度(1-5),
    "affectedSectors": [
      {{
        "sector": "板块名称",
        "direction": "影响方向(positive/negative)",
        "weight": 影响权重(0-1)
      }}
    ],
    "reasoning": "推理过程"
  }},
  "entities": {{
    "companies": ["公司列表"],
    "sectors": ["板块列表"],
    "products": ["产品列表"],
    "people": ["人物列表"]
  }},
  "summary": "一句话摘要"
}}"""
