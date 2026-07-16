# 资金流向路由
# 提供主力资金、北向资金、板块资金流向等接口

import asyncio
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from services.akshare_client import client

router = APIRouter()


def _calculate_sentiment(main_net: float, retail_net: float, northbound_net: float) -> int:
    """计算市场情绪指数 (0-100)

    Args:
        main_net: 主力净流入（亿元，正数为流入）
        retail_net: 散户净流入（亿元，正数为流入）
        northbound_net: 北向资金净流入（亿元，正数为流入）

    Returns:
        情绪指数，0-100，50为中性

    基于三个维度综合评分：
    1. 主力资金流向 (权重40%): 主力净流入为正 → 偏多
    2. 北向资金流向 (权重35%): 北向净流入为正 → 偏多
    3. 主力散户分歧 (权重25%): 主力与散户方向相反 → 市场分歧大

    评分规则：
    - 50 为中性
    - >60 偏乐观
    - >75 高度乐观
    - <40 偏悲观
    - <25 高度悲观
    """
    score = 50.0

    # 1. 主力资金流向评分 (±20分) — 所有参数均为亿元
    if main_net != 0:
        # 10亿以上为强信号
        if abs(main_net) >= 10:
            score += 20 if main_net > 0 else -20
        elif abs(main_net) >= 2:
            score += 10 if main_net > 0 else -10
        else:
            score += 5 if main_net > 0 else -5

    # 2. 北向资金流向评分 (±17.5分) — northbound_net 为亿元
    if northbound_net != 0:
        if abs(northbound_net) >= 50:
            score += 17.5 if northbound_net > 0 else -17.5
        elif abs(northbound_net) >= 10:
            score += 10 if northbound_net > 0 else -10
        else:
            score += 5 if northbound_net > 0 else -5

    # 3. 主力散户分歧评分 (±12.5分)
    if main_net != 0 and retail_net != 0:
        # 主力和散户方向相反 → 有分歧，跟随主力方向
        if (main_net > 0 and retail_net < 0) or (main_net < 0 and retail_net > 0):
            score += 12.5 if main_net > 0 else -12.5
        # 同方向 → 共振，加强信号
        elif (main_net > 0 and retail_net > 0) or (main_net < 0 and retail_net < 0):
            score += 5 if main_net > 0 else -5

    return max(0, min(100, int(round(score))))

@router.get("/market")
async def get_market_capital_flow():
    """获取大盘资金流向"""
    try:
        data = await asyncio.to_thread(client.get_market_capital_flow)

        if not data:
            return {
                "success": False,
                "error": "无法获取大盘资金流向数据",
                "data": None
            }

        main_net = float(data.get("主力净流入-净额", 0))
        mid_net = float(data.get("中单净流入-净额", 0))
        small_net = float(data.get("小单净流入-净额", 0))
        retail_net = mid_net + small_net

        # 计算市场情绪（所有参数单位为亿元）
        sentiment = _calculate_sentiment(main_net / 1e8, retail_net / 1e8, 0)

        return {
            "success": True,
            "data": {
                "date": str(data.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                "market": {
                    "totalMainNet": round(main_net / 1e8, 2),
                    "retailNet": round(retail_net / 1e8, 2),
                    "sentiment": sentiment,
                    "turnoverRate": 0,
                },
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sector")
async def get_sector_capital_flow(indicator: str = Query(default="今日", pattern="^(今日|3日|5日|10日)$")):
    """获取板块资金流向排名"""
    try:
        data = await asyncio.to_thread(client.get_sector_capital_flow, indicator)

        if not data:
            return {
                "success": False,
                "error": "无法获取板块资金流向数据",
                "data": None
            }

        # 字段映射：优先使用指定indicator的字段，降级到今日字段
        net_key = f"{indicator}主力净流入-净额"
        pct_key = f"{indicator}涨跌幅"

        sectors = []
        for item in data[:20]:
            # 如果指定indicator的字段不存在，降级到今日字段
            net = float(item.get(net_key, item.get("今日主力净流入-净额", 0)))
            change_pct = float(item.get(pct_key, item.get("今日涨跌幅", 0)))
            sectors.append({
                "sector": item.get("名称", ""),
                "mainForceNet": round(net / 1e8, 2),
                "changePct": round(change_pct, 2),
                "trend": "inflow" if net > 0 else "outflow",
                "indicator": indicator,
            })

        return {
            "success": True,
            "data": sectors
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/northbound")
async def get_northbound_flow():
    """获取北向资金流向（单位：亿元）"""
    try:
        data = await asyncio.to_thread(client.get_northbound_flow)

        if not data:
            return {
                "success": False,
                "error": "无法获取北向资金数据",
                "data": None
            }

        # value 已经是亿元单位（在 akshare_client 中处理好了）
        # `date` 是数据的逻辑日期（交易日），`dataDate` 是数据生成/获取的时间戳
        return {
            "success": True,
            "data": {
                "date": str(data.get("date", datetime.now().strftime("%Y-%m-%d"))),
                "northboundNet": round(float(data.get("value", 0)), 2),
                "shConnect": round(float(data.get("shConnect", 0)), 2),
                "szConnect": round(float(data.get("szConnect", 0)), 2),
                "stale": data.get("stale", False),
                "dataDate": datetime.now().isoformat(),
                "source": data.get("source", "unknown"),
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/northbound/history")
async def get_northbound_history(days: int = Query(default=30, ge=1, le=90)):
    """获取北向资金历史数据（单位：亿元）"""
    try:
        data = await asyncio.to_thread(client.get_northbound_flow_history, days)

        if not data:
            return {"success": True, "data": []}

        history = []
        for item in data:
            history.append({
                "date": str(item.get("date", "")),
                "value": round(float(item.get("value", 0)), 2),
                "shConnect": round(float(item.get("shConnect", 0)), 2),
                "szConnect": round(float(item.get("szConnect", 0)), 2),
            })

        return {"success": True, "data": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/macro")
async def get_macro_capital_flow():
    """获取宏观资金流向概览（含北向资金和市场情绪）"""
    try:
        # 并行获取市场资金、板块资金和北向资金数据
        marketDataTask = asyncio.to_thread(client.get_market_capital_flow)
        sectorDataTask = asyncio.to_thread(client.get_sector_capital_flow, "今日")
        northboundTask = asyncio.to_thread(client.get_northbound_flow)
        market_data, sector_data, northbound_data = await asyncio.gather(
            marketDataTask, sectorDataTask, northboundTask
        )

        has_market = market_data and "主力净流入-净额" in market_data
        has_sectors = bool(sector_data)

        if not has_market and not has_sectors:
            return {
                "success": False,
                "error": "无法获取资金流向数据，所有数据源不可用",
                "data": None
            }

        if has_market:
            main_net = float(market_data.get("主力净流入-净额", 0))
            main_pct = float(market_data.get("主力净流入-净占比", 0))
            mid_net = float(market_data.get("中单净流入-净额", 0))
            small_net = float(market_data.get("小单净流入-净额", 0))
            retail_net = mid_net + small_net
            market_total = main_net + retail_net
            data_date = str(market_data.get("日期", datetime.now().strftime("%Y-%m-%d")))

            # 散户占比（与主力占比使用一致的计算方法）
            total_abs = abs(main_net) + abs(retail_net)
            retail_pct = round((retail_net / total_abs) * 100, 2) if total_abs > 0 else 0
        else:
            main_net = retail_net = market_total = 0
            main_pct = retail_pct = 0
            data_date = datetime.now().strftime("%Y-%m-%d")

        inflow_sectors = []
        outflow_sectors = []

        if has_sectors:
            for item in sector_data:
                net = float(item.get("今日主力净流入-净额", 0))
                sector_name = item.get("名称", "")
                change_pct = float(item.get("今日涨跌幅", 0))

                entry = {
                    "sector": sector_name,
                    "netFlow": round(net / 1e8, 2),
                    "changePct": round(change_pct, 2),
                }

                if net > 0:
                    inflow_sectors.append(entry)
                else:
                    outflow_sectors.append(entry)

            inflow_sectors.sort(key=lambda x: x["netFlow"], reverse=True)
            outflow_sectors.sort(key=lambda x: x["netFlow"])
            inflow_sectors = inflow_sectors[:10]
            outflow_sectors = outflow_sectors[:10]

        # 北向资金数据
        has_northbound = northbound_data and "value" in northbound_data
        northbound_net = round(float(northbound_data.get("value", 0)), 2) if has_northbound else 0
        sh_connect = round(float(northbound_data.get("shConnect", 0)), 2) if has_northbound else 0
        sz_connect = round(float(northbound_data.get("szConnect", 0)), 2) if has_northbound else 0
        northbound_stale = northbound_data.get("stale", False) if has_northbound else False
        northbound_date = str(northbound_data.get("date", "")) if has_northbound else ""

        # 市场情绪计算（基于主力资金流向和北向资金，所有参数单位为亿元）
        sentiment = _calculate_sentiment(main_net / 1e8, retail_net / 1e8, northbound_net)

        today = datetime.now().strftime("%Y-%m-%d")
        is_cached = data_date != today

        return {
            "success": True,
            "data": {
                "date": data_date,
                "market": {
                    "institutionalNet": round(main_net / 1e8, 2),
                    "institutionalPct": round(main_pct, 2),
                    "retailNet": round(retail_net / 1e8, 2),
                    "retailPct": round(retail_pct, 2),
                    "totalNet": round(market_total / 1e8, 2),
                    "sentiment": sentiment,
                },
                "northbound": {
                    "net": northbound_net,
                    "shConnect": sh_connect,
                    "szConnect": sz_connect,
                    "stale": northbound_stale,
                    "dataDate": northbound_date,
                },
                "topInflowSectors": inflow_sectors,
                "topOutflowSectors": outflow_sectors,
                "source": "akshare_cached" if is_cached else "akshare_realtime",
                "dataDate": data_date,
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/margin")
async def get_margin_data():
    """获取融资融券数据"""
    try:
        data = await asyncio.to_thread(client.get_margin_data)

        if not data:
            return {
                "success": False,
                "error": "无法获取融资融券数据",
                "data": None
            }

        return {
            "success": True,
            "data": {
                "date": data.get("date", ""),
                "marginBalance": round(data.get("rzye", 0) / 1e8, 2),  # 融资余额（亿元）
                "marginBuy": round(data.get("rzmre", 0) / 1e8, 2),  # 融资买入额（亿元）
                "shortBalance": round(data.get("rqye", 0) / 1e8, 2),  # 融券余额（亿元）
                "totalBalance": round(data.get("rzrqye", 0) / 1e8, 2),  # 融资融券余额（亿元）
                "source": data.get("source", "unknown"),
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fund-flow-rank")
async def get_fund_flow_rank():
    """获取大盘资金流向排名（超大单/大单/中单/小单）"""
    try:
        data = await asyncio.to_thread(client.get_market_fund_flow_rank)

        if not data:
            return {
                "success": False,
                "error": "无法获取资金流向排名数据",
                "data": None
            }

        return {
            "success": True,
            "data": {
                "date": data.get("date", ""),
                "orders": {
                    "superLarge": {
                        "net": round(data.get("superLargeNet", 0) / 1e8, 2),
                        "pct": round(data.get("superLargePct", 0), 2),
                    },
                    "large": {
                        "net": round(data.get("largeNet", 0) / 1e8, 2),
                        "pct": round(data.get("largePct", 0), 2),
                    },
                    "mid": {
                        "net": round(data.get("midNet", 0) / 1e8, 2),
                        "pct": round(data.get("midPct", 0), 2),
                    },
                    "small": {
                        "net": round(data.get("smallNet", 0) / 1e8, 2),
                        "pct": round(data.get("smallPct", 0), 2),
                    },
                },
                "mainNet": round(data.get("mainNet", 0) / 1e8, 2),
                "mainPct": round(data.get("mainPct", 0), 2),
                "source": data.get("source", "unknown"),
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sentiment")
async def get_market_sentiment():
    """获取市场情绪指标"""
    try:
        data = await asyncio.to_thread(client.get_market_sentiment)

        if not data:
            return {
                "success": False,
                "error": "无法获取市场情绪数据",
                "data": None
            }

        return {
            "success": True,
            "data": {
                "total": data.get("total", 0),
                "upCount": data.get("upCount", 0),
                "downCount": data.get("downCount", 0),
                "flatCount": data.get("flatCount", 0),
                "limitUp": data.get("limitUp", 0),
                "limitDown": data.get("limitDown", 0),
                "upRatio": data.get("upRatio", 50),
                "sentiment": data.get("sentiment", 50),
                "source": data.get("source", "unknown"),
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
