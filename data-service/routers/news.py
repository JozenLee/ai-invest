# 新闻采集路由
# 提供财经新闻、行业资讯等接口
# 通过统一数据服务入口获取数据

import logging
import re
import json
import asyncio
from fastapi import APIRouter, HTTPException, Query, Request
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import pandas as pd

from services.data_service import data_service
from services.news_pipeline import NewsPipeline
from services.sse_manager import sse_manager
from db import db

logger = logging.getLogger(__name__)

router = APIRouter()

# 全局管道实例
pipeline_instance = None


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


def _local_news_items(limit: int = 200, keyword: Optional[str] = None) -> List[dict]:
    if keyword:
        rows = db.execute("SELECT id, title, content, summary, source, url, publishTime, category, sentiment, impact, sectors FROM NewsArticle WHERE title LIKE ? OR content LIKE ? ORDER BY publishTime DESC LIMIT ?", (f"%{keyword}%", f"%{keyword}%", limit))
    else:
        rows = db.execute("SELECT id, title, content, summary, source, url, publishTime, category, sentiment, impact, sectors FROM NewsArticle ORDER BY publishTime DESC LIMIT ?", (limit,))
    result = []
    for row in rows:
        item = dict(row)
        if isinstance(item.get("sectors"), str):
            try:
                item["sectors"] = json.loads(item["sectors"])
            except json.JSONDecodeError:
                item["sectors"] = []
        result.append(item)
    return result


@router.get("/feed")
async def get_news_feed(
    category: Optional[str] = Query(default=None, description="新闻分类"),
    categoryId: Optional[str] = Query(default=None, description="分类ID"),
    domainId: Optional[str] = Query(default=None, description="领域ID"),
    keyword: Optional[str] = Query(default=None, description="关键词搜索"),
    sentiment: Optional[str] = Query(default=None, description="情感筛选: bullish/neutral/bearish"),
    sortBy: Optional[str] = Query(default="publishTime", description="排序方式: publishTime/sentiment/impact"),
    limit: int = Query(default=20, ge=1, le=100, description="返回数量"),
    offset: int = Query(default=0, ge=0, description="偏移量"),
):
    """获取新闻资讯流（按发布时间倒序）"""
    try:
        news_list = []

        news_list = _local_news_items(min(500, limit + offset), keyword)

        if not news_list:
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

        # 分类筛选
        if category:
            news_list = [n for n in news_list if n.get("category") == category]

        # 分类ID筛选（前端传递的是categoryId）
        if categoryId:
            news_list = [n for n in news_list if n.get("categoryId") == categoryId]

        # 领域筛选
        if domainId:
            news_list = [n for n in news_list if n.get("domainId") == domainId]

        # 关键词筛选
        if keyword:
            keyword_lower = keyword.lower()
            news_list = [
                n for n in news_list
                if keyword_lower in n.get("title", "").lower()
                or keyword_lower in n.get("content", "").lower()
                or keyword_lower in n.get("summary", "").lower()
            ]

        # 情感筛选
        if sentiment:
            if sentiment == "bullish":
                news_list = [n for n in news_list if n.get("sentiment") and n.get("sentiment") > 0.2]
            elif sentiment == "bearish":
                news_list = [n for n in news_list if n.get("sentiment") and n.get("sentiment") < -0.2]
            elif sentiment == "neutral":
                news_list = [n for n in news_list if n.get("sentiment") is None or abs(n.get("sentiment", 0)) <= 0.2]

        # 排序
        if sortBy == "sentiment":
            # 按情感值降序排序（利好在前）
            news_list.sort(key=lambda x: x.get("sentiment") or 0, reverse=True)
        elif sortBy == "impact":
            # 按影响力降序排序
            news_list.sort(key=lambda x: x.get("impact") or 0, reverse=True)
        # publishTime 已经在 prepare_news_dataframe 中按时间倒序排列

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
        news_list = [item for item in _local_news_items(500) if any(kw in str(item.get("title", "")) for kw in AI_HARDWARE_KEYWORDS)][:limit]

        if not news_list:
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
        news_list = [item for item in _local_news_items(500) if any(kw in str(item.get("title", "")) for kw in AI_HARDWARE_KEYWORDS)]
        if not news_list:
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


@router.post("/refresh")
async def refresh_news_feed(
    platform_id: str = Query(default="cls-hot", description="平台ID"),
    limit: int = Query(default=50, ge=1, le=100, description="采集数量")
):
    """
    触发新闻采集与AI分析
    
    执行完整的管道流程：采集 -> AI分析 -> 存储 -> SSE推送
    """
    global pipeline_instance
    
    try:
        # 初始化管道（如果尚未初始化）
        if pipeline_instance is None:
            pipeline_instance = NewsPipeline()
        
        # 执行管道
        result = await pipeline_instance.run(platform_id=platform_id, limit=limit)
        
        return {
            "success": True,
            "data": {
                "fetched": result.fetched,
                "analyzed": result.analyzed,
                "saved": result.saved,
                "failed": result.failed,
                "timestamp": result.timestamp.isoformat()
            }
        }
    
    except Exception as e:
        logger.error(f"刷新新闻失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream")
async def stream_updates(request: Request):
    """
    SSE流端点
    
    客户端连接后接收实时新闻更新事件
    """
    async def event_generator():
        # 创建客户端队列
        client_queue = asyncio.Queue()
        sse_manager.add_client(client_queue)
        
        try:
            # 发送初始连接事件
            yield {
                "event": "connected",
                "data": json.dumps({
                    "type": "connected",
                    "timestamp": datetime.now().isoformat(),
                    "message": "SSE连接已建立"
                })
            }
            
            # 持续监听事件
            while True:
                # 检查客户端是否断开
                if await request.is_disconnected():
                    logger.info("客户端断开连接")
                    break
                
                try:
                    # 等待事件（带超时）
                    event = await asyncio.wait_for(
                        client_queue.get(),
                        timeout=30.0
                    )
                    
                    # 发送事件
                    yield {
                        "event": event.get("type", "message"),
                        "data": json.dumps(event)
                    }
                    
                except asyncio.TimeoutError:
                    # 发送心跳
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({
                            "type": "heartbeat",
                            "timestamp": datetime.now().isoformat()
                        })
                    }
                    
        finally:
            # 移除客户端
            sse_manager.remove_client(client_queue)
    
    return EventSourceResponse(event_generator())


@router.get("/pipeline/stats")
async def get_pipeline_stats():
    """获取管道统计信息"""
    global pipeline_instance
    
    if pipeline_instance is None:
        return {
            "success": True,
            "data": {
                "initialized": False,
                "message": "管道尚未初始化"
            }
        }
    
    try:
        stats = await pipeline_instance.get_stats()
        
        return {
            "success": True,
            "data": {
                "initialized": True,
                **stats
            }
        }
    
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
