# 宏观资金流向路由
# 提供大盘资金、板块轮动、机构资金等综合数据
# 通过统一数据服务入口获取数据

import asyncio
from fastapi import APIRouter, HTTPException
from datetime import datetime

from services.data_service import data_service

router = APIRouter()


@router.get("/overview")
async def get_macro_capital_flow():
    """获取宏观资金流向概览"""
    try:
        market_flow, northbound = await asyncio.gather(
            data_service.get_market_capital_flow(),
            data_service.get_northbound_flow(),
            return_exceptions=True,
        )

        if isinstance(market_flow, Exception) or not market_flow:
            return {
                "success": False,
                "error": "无法获取大盘资金流向数据",
                "data": None,
            }

        if isinstance(northbound, Exception):
            northbound = {}

        main_net = float(market_flow.get("主力净流入-净额", 0))
        mid_net = float(market_flow.get("中单净流入-净额", 0))
        small_net = float(market_flow.get("小单净流入-净额", 0))
        retail_net = mid_net + small_net

        northbound_net = 0
        if northbound and "value" in northbound:
            northbound_net = float(northbound.get("value", 0))

        return {
            "success": True,
            "data": {
                "date": str(market_flow.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                "market": {
                    "totalMainNet": round(main_net / 1e8, 2),
                    "retailNet": round(retail_net / 1e8, 2),
                },
                "institutional": {
                    "northboundNet": round(northbound_net, 2),
                },
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sector-ranking")
async def get_sector_ranking():
    """获取板块资金排名"""
    try:
        data = await data_service.get_sector_capital_flow("今日")

        if not data:
            return {
                "success": False,
                "error": "无法获取板块资金排名数据",
                "data": None,
            }

        net_key = "今日主力净流入-净额"
        pct_key = "今日涨跌幅"

        sectors = []
        for i, item in enumerate(data[:10], 1):
            net = float(item.get(net_key, 0))
            sectors.append({
                "rank": i,
                "sector": item.get("名称", ""),
                "mainForceNet": round(net / 1e8, 2),
                "changePct": round(float(item.get(pct_key, 0)), 2),
                "trend": "inflow" if net > 0 else "outflow",
            })

        return {"success": True, "data": sectors}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
