# ETF数据路由
# 提供ETF行情、净值、份额等接口

import asyncio
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from services.akshare_client import client

router = APIRouter()

# MVP阶段的ETF池
ETF_POOL = {
    "510300": {"name": "沪深300ETF", "trackingIndex": "沪深300"},
    "159919": {"name": "沪深300ETF(易方达)", "trackingIndex": "沪深300"},
    "510500": {"name": "中证500ETF", "trackingIndex": "中证500"},
    "588000": {"name": "科创50ETF", "trackingIndex": "科创50"},
    "159915": {"name": "创业板ETF", "trackingIndex": "创业板指"},
    "512480": {"name": "半导体ETF", "trackingIndex": "中证全指半导体"},
    "159995": {"name": "芯片ETF", "trackingIndex": "国证芯片"},
    "515070": {"name": "AI ETF", "trackingIndex": "中证人工智能"},
    "515880": {"name": "通信ETF", "trackingIndex": "中证全指通信设备"},
    "159853": {"name": "光通信ETF", "trackingIndex": "中证光通信"},
    "159888": {"name": "算力ETF", "trackingIndex": "中证算力"},
}

@router.get("/list")
async def get_etf_list():
    """获取ETF列表"""
    try:
        etfs = []
        for ticker, info in ETF_POOL.items():
            etfs.append({
                "ticker": ticker,
                "name": info["name"],
                "trackingIndex": info["trackingIndex"],
            })

        return {
            "success": True,
            "data": etfs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _fetch_etf_realtime_akshare():
    """同步函数：从 AKShare 获取 ETF 实时行情"""
    try:
        symbols = list(ETF_POOL.keys())
        df = client.get_etf_realtime(symbols)

        if df.empty:
            return []

        etfs = []
        for _, row in df.iterrows():
            ticker = str(row.get("代码", ""))
            if ticker in ETF_POOL:
                etfs.append({
                    "ticker": ticker,
                    "name": ETF_POOL[ticker]["name"],
                    "price": float(row.get("最新价", 0)),
                    "changePct": float(row.get("涨跌幅", 0)),
                    "volume": float(row.get("成交额", 0)),
                    "source": "akshare"
                })
        return etfs
    except Exception as e:
        print(f"AKShare ETF 行情失败: {e}")
        return []

async def _fetch_etf_realtime_xueqiu():
    """异步函数：从雪球获取 ETF 实时行情"""
    try:
        from services.xueqiu_client import xueqiu_client
        xq_symbols = [f"SH{t}" if t.startswith("5") else f"SZ{t}" for t in ETF_POOL.keys()]
        data = await xueqiu_client.get_etf_realtime(xq_symbols)

        if not data:
            return []

        result = []
        for item in data:
            xq_sym = item.get("symbol", "")
            ticker = xq_sym[2:] if len(xq_sym) > 2 else ""
            if ticker in ETF_POOL:
                result.append({
                    "ticker": ticker,
                    "name": ETF_POOL[ticker]["name"],
                    "price": item.get("current", 0),
                    "changePct": item.get("percent", 0),
                    "volume": item.get("amount", 0),
                    "source": "xueqiu"
                })
        return result
    except Exception as e:
        print(f"雪球 ETF 行情失败: {e}")
        return []

@router.get("/realtime")
async def get_etf_realtime():
    """获取ETF实时行情（多源聚合）

    降级策略：
    1. AKShare fund_etf_spot_em（东方财富）- 线程池执行
    2. 雪球 API
    3. 返回空
    """
    try:
        # AKShare（线程池中执行阻塞调用）
        etfs = await asyncio.to_thread(_fetch_etf_realtime_akshare)
        if etfs:
            return {"success": True, "data": etfs}

        # 降级：雪球
        etfs = await _fetch_etf_realtime_xueqiu()
        if etfs:
            return {"success": True, "data": etfs}

        return {
            "success": False,
            "error": "无法获取ETF实时数据，所有数据源均不可用",
            "data": None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{ticker}")
async def get_etf_detail(ticker: str):
    """获取ETF详情"""
    try:
        if ticker not in ETF_POOL:
            raise HTTPException(status_code=404, detail=f"ETF {ticker} 不在监控池中")

        # 获取历史数据（线程池中执行）
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")

        df = await asyncio.to_thread(client.get_etf_daily, ticker, start_date, end_date)

        if df.empty:
            return {
                "success": False,
                "error": f"无法获取ETF {ticker} 的历史数据",
                "data": None
            }

        latest = df.iloc[-1]
        history = []
        for _, row in df.iterrows():
            history.append({
                "date": str(row.get("日期", "")),
                "open": float(row.get("开盘", 0)),
                "high": float(row.get("最高", 0)),
                "low": float(row.get("最低", 0)),
                "close": float(row.get("收盘", 0)),
                "volume": float(row.get("成交量", 0)),
            })

        return {
            "success": True,
            "data": {
                "ticker": ticker,
                "name": ETF_POOL[ticker]["name"],
                "trackingIndex": ETF_POOL[ticker]["trackingIndex"],
                "price": float(latest.get("收盘", 0)),
                "changePct": float(latest.get("涨跌幅", 0)),
                "nav": 0,
                "premium": 0,
                "history": history
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
