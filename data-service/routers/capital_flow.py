# 资金流向路由
# 提供主力资金、北向资金、板块资金流向等接口

import asyncio
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from services.akshare_client import client

router = APIRouter()

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

        return {
            "success": True,
            "data": {
                "date": str(data.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                "market": {
                    "totalMainNet": round(main_net / 1e8, 2),
                    "retailNet": round(retail_net / 1e8, 2),
                    "sentiment": 35,
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

        net_key = f"{indicator}主力净流入-净额"
        pct_key = f"{indicator}涨跌幅"

        sectors = []
        for item in data[:20]:
            net = float(item.get(net_key, 0))
            sectors.append({
                "sector": item.get("名称", ""),
                "mainForceNet": round(net / 1e8, 2),
                "changePct": round(float(item.get(pct_key, 0)), 2),
                "trend": "inflow" if net > 0 else "outflow",
            })

        return {
            "success": True,
            "data": sectors
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/northbound")
async def get_northbound_flow():
    """获取北向资金流向"""
    try:
        data = await asyncio.to_thread(client.get_northbound_flow)

        if not data:
            return {
                "success": False,
                "error": "无法获取北向资金数据",
                "data": None
            }

        return {
            "success": True,
            "data": {
                "date": str(data.get("date", datetime.now().strftime("%Y-%m-%d"))),
                "northboundNet": float(data.get("value", 0)) / 100000000,
                "shConnect": 0,
                "szConnect": 0,
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/northbound/history")
async def get_northbound_history(days: int = Query(default=30, ge=1, le=90)):
    """获取北向资金历史数据"""
    try:
        data = await asyncio.to_thread(client.get_northbound_flow_history, days)

        if not data:
            return {"success": True, "data": []}

        history = []
        for item in data:
            history.append({
                "date": str(item.get("date", "")),
                "value": float(item.get("value", 0)) / 100000000,
            })

        return {"success": True, "data": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/macro")
async def get_macro_capital_flow():
    """获取宏观资金流向概览"""
    try:
        # 并行获取市场资金和板块资金数据（原来串行，改为并行提速）
        marketDataTask = asyncio.to_thread(client.get_market_capital_flow)
        sectorDataTask = asyncio.to_thread(client.get_sector_capital_flow, "今日")
        market_data, sector_data = await asyncio.gather(marketDataTask, sectorDataTask)

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

        # retail_pct 已在上方 if/else 块中计算

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
