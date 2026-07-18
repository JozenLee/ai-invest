# 新闻采集路由
# 提供财经新闻、行业资讯等接口
# 通过统一数据服务入口获取数据

import logging
import re
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

import pandas as pd

from services.data_service import data_service

logger = logging.getLogger(__name__)

router = APIRouter()


def parse_relative_time(time_str: str) -> datetime:
    """解析相对时间字符串为datetime对象

    支持格式：
    - 标准日期: "2024-07-15 10:30:00", "2024-07-15"
    - 相对时间: "31天前", "2小时前", "5分钟前", "刚刚"
    """
    if not time_str or time_str == "None":
        return datetime.now()

    for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S"]:
        try:
            return datetime.strptime(str(time_str).strip(), fmt)
        except ValueError:
            continue

    time_str = str(time_str).strip()
    now = datetime.now()

    match = re.search(r"(\d+)\s*天前", time_str)
    if match:
        return now - timedelta(days=int(match.group(1)))

    match = re.search(r"(\d+)\s*小时前", time_str)
    if match:
        return now - timedelta(hours=int(match.group(1)))

    match = re.search(r"(\d+)\s*分钟前", time_str)
    if match:
        return now - timedelta(minutes=int(match.group(1)))

    match = re.search(r"(\d+)\s*秒前", time_str)
    if match:
        return now - timedelta(seconds=int(match.group(1)))

    match = re.search(r"昨天\s*(\d{1,2}):(\d{2})", time_str)
    if match:
        yesterday = now - timedelta(days=1)
        return yesterday.replace(hour=int(match.group(1)), minute=int(match.group(2)), second=0, microsecond=0)

    logger.warning("无法解析时间字符串, 回退到当前时间: %s", time_str)
    return now


class NewsArticle(BaseModel):
    id: str
    title: str
    content: str
    summary: Optional[str] = None
    source: str
    url: Optional[str] = None
    publishTime: str
    category: str
    sentiment: Optional[float] = None
    impact: Optional[int] = None
    entities: Optional[dict] = None
    sectors: Optional[List[str]] = None


# AI硬件相关关键词
AI_HARDWARE_KEYWORDS = [
    "GPU", "AI芯片", "算力", "服务器", "HBM", "存储芯片",
    "光模块", "光通信", "CPO", "液冷", "散热", "PCB",
    "半导体", "封测", "设备", "NVIDIA", "英伟达", "AMD",
    "华为昇腾", "寒武纪", "海光信息", "中际旭创", "新易盛",
    "浪潮信息", "中科曙光", "英维克", "长电科技", "北方华创",
    "数据中心", "云计算", "大模型", "人工智能", "算力租赁",
]


def prepare_news_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """解析相对时间，按发布时间倒序排列"""
    if df.empty or "发布时间" not in df.columns:
        return df

    df = df.copy()
    df["_parsed_time"] = df["发布时间"].apply(parse_relative_time)
    df["_publish_time_iso"] = df["_parsed_time"].apply(
        lambda t: t.isoformat() if isinstance(t, datetime) else parse_relative_time(str(t)).isoformat()
    )
    df = df.sort_values(by="_parsed_time", ascending=False)
    return df


def categorize_news(title: str) -> str:
    """根据标题分类新闻"""
    title_lower = title.lower()

    if any(kw in title_lower for kw in ["政策", "补贴", "规划", "意见"]):
        return "policy"
    elif any(kw in title_lower for kw in ["财报", "业绩", "营收", "利润"]):
        return "earnings"
    elif any(kw in title_lower for kw in ["发布", "新品", "产品", "推出"]):
        return "product"
    elif any(kw in title_lower for kw in ["合作", "并购", "收购", "战略"]):
        return "partnership"
    elif any(kw in title_lower for kw in ["供应", "产能", "出货", "订单"]):
        return "supply"
    elif any(kw in title_lower for kw in ["技术", "突破", "研发", "创新"]):
        return "tech"
    elif any(kw in title_lower for kw in ["制裁", "管制", "限制", "出口"]):
        return "regulation"
    else:
        return "market"


def extract_sectors(title: str) -> List[str]:
    """从标题提取相关板块"""
    sectors = []
    sector_keywords = {
        "半导体": ["半导体", "芯片", "GPU", "ASIC", "封测", "设备"],
        "光通信": ["光模块", "光通信", "CPO", "光芯片"],
        "服务器": ["服务器", "算力", "数据中心"],
        "存储": ["HBM", "存储", "内存"],
        "散热": ["液冷", "散热", "冷却"],
        "PCB": ["PCB", "基板", "载板"],
        "AI应用": ["大模型", "人工智能", "AI"],
    }

    for sector, keywords in sector_keywords.items():
        if any(kw in title for kw in keywords):
            sectors.append(sector)

    return sectors


def _build_news_item(row: dict, idx: int, prefix: str = "cls") -> dict:
    """构建新闻条目"""
    title = str(row.get("新闻标题", ""))
    return {
        "id": f"{prefix}_{idx}",
        "title": title,
        "content": str(row.get("新闻内容", "")),
        "summary": title[:100] + "..." if len(title) > 100 else title,
        "source": "财联社",
        "url": str(row.get("新闻链接", "")),
        "publishTime": row.get("_publish_time_iso", "") or datetime.now().isoformat(),
        "category": categorize_news(title),
        "sentiment": None,
        "impact": None,
        "entities": None,
        "sectors": extract_sectors(title),
        "isAiRelated": any(kw in title for kw in AI_HARDWARE_KEYWORDS),
    }


@router.get("/feed")
async def get_news_feed(
    category: Optional[str] = Query(default=None, description="新闻分类"),
    limit: int = Query(default=20, ge=1, le=100, description="返回数量"),
    offset: int = Query(default=0, ge=0, description="偏移量"),
):
    """获取新闻资讯流（按发布时间倒序）"""
    try:
        news_list = []

        try:
            df = await data_service.get_news(keyword="财联社", limit=200)
            if not df.empty:
                df = prepare_news_dataframe(df)

                for idx, (_, row) in enumerate(df.iterrows()):
                    news_list.append(_build_news_item(row.to_dict(), idx))
        except Exception as e:
            print(f"获取财联社新闻失败: {e}")

        if not news_list:
            return {
                "success": False,
                "error": "无法获取新闻数据，数据源未返回有效数据",
                "data": None,
            }

        if category:
            news_list = [n for n in news_list if n.get("category") == category]

        return {
            "success": True,
            "data": {
                "total": len(news_list),
                "items": news_list[offset:offset + limit],
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ai-hardware")
async def get_ai_hardware_news(limit: int = Query(default=20, ge=1, le=50)):
    """获取AI硬件相关新闻"""
    try:
        news_list = []

        try:
            df = await data_service.get_news(keyword="财联社", limit=200)
            if not df.empty:
                df = prepare_news_dataframe(df)

                for idx, (_, row) in enumerate(df.iterrows()):
                    title = str(row.get("新闻标题", ""))
                    if any(kw in title for kw in AI_HARDWARE_KEYWORDS):
                        news_list.append(_build_news_item(row.to_dict(), idx, prefix="ai"))
                        if len(news_list) >= limit:
                            break
        except Exception as e:
            print(f"获取AI硬件新闻失败: {e}")

        if not news_list:
            return {
                "success": False,
                "error": "无法获取AI硬件新闻数据",
                "data": None,
            }

        return {
            "success": True,
            "data": {
                "total": len(news_list),
                "items": news_list,
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trends/{sector}")
async def get_sector_trends(
    sector: str,
    days: int = Query(default=7, ge=1, le=30),
):
    """获取领域趋势"""
    try:
        news_list = []
        try:
            df = await data_service.get_news(keyword="财联社", limit=200)
            if not df.empty:
                df = prepare_news_dataframe(df)

                for idx, (_, row) in enumerate(df.iterrows()):
                    title = str(row.get("新闻标题", ""))
                    if any(kw in title for kw in AI_HARDWARE_KEYWORDS):
                        item = _build_news_item(row.to_dict(), idx, prefix="trend")
                        news_list.append(item)
        except Exception as e:
            print(f"获取新闻失败: {e}")

        if not news_list:
            return {
                "success": False,
                "error": "无法获取新闻数据来分析趋势",
                "data": None,
            }

        sector_news = [n for n in news_list if sector in str(n.get("sectors", []))]

        total_events = len(sector_news)
        sentiment_dist = {
            "bullish": len([n for n in sector_news if (n.get("sentiment") or 0) > 0.2]),
            "neutral": len([n for n in sector_news if abs(n.get("sentiment") or 0) <= 0.2]),
            "bearish": len([n for n in sector_news if (n.get("sentiment") or 0) < -0.2]),
        }

        return {
            "success": True,
            "data": {
                "sector": sector,
                "period": f"近{days}天",
                "eventSummary": {
                    "totalEvents": total_events,
                    "sentimentDistribution": sentiment_dist,
                },
                "trendAssessment": {
                    "currentStatus": f"{sector}板块当前数据",
                    "shortTermOutlook": f"基于{total_events}条相关新闻分析",
                    "mediumTermOutlook": f"需持续关注{sector}板块动态",
                    "keyDrivers": [],
                    "keyRisks": [],
                    "confidenceLevel": 0.5 if total_events > 0 else 0,
                },
                "topEvents": sector_news[:5],
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
