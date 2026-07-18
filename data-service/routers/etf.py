# ETF数据路由
# 提供ETF行情、净值、份额等接口
# 通过统一数据服务入口获取数据

import asyncio
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta

from services.data_service import data_service

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

        return {"success": True, "data": etfs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime")
async def get_etf_realtime():
    """获取ETF实时行情

    通过统一数据服务获取，自动按配置的优先级降级：
    AKShare -> 雪球 -> Tushare -> 缓存
    """
    try:
        symbols = list(ETF_POOL.keys())
        df = await data_service.get_etf_realtime(symbols)

        if df.empty:
            return {
                "success": False,
                "error": "无法获取ETF实时数据，所有数据源均不可用",
                "data": None,
            }

        etfs = []
        for _, row in df.iterrows():
            ticker = str(row.get("代码", ""))
            if ticker in ETF_POOL:
                etfs.append({
                    "ticker": ticker,
                    "name": ETF_POOL[ticker]["name"],
                    "price": float(row.get("最新价", row.get("current", 0))),
                    "changePct": float(row.get("涨跌幅", row.get("percent", 0))),
                    "volume": float(row.get("成交额", row.get("amount", 0))),
                    "source": "unified",
                })

        if not etfs:
            return {
                "success": False,
                "error": "无法解析ETF数据",
                "data": None,
            }

        return {"success": True, "data": etfs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}")
async def get_etf_detail(ticker: str):
    """获取ETF详情"""
    try:
        if ticker not in ETF_POOL:
            raise HTTPException(status_code=404, detail=f"ETF {ticker} 不在监控池中")

        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")

        df = await data_service.get_etf_daily(ticker, start_date, end_date)

        if df.empty:
            return {
                "success": False,
                "error": f"无法获取ETF {ticker} 的历史数据",
                "data": None,
            }

        latest = df.iloc[-1]
        history = []
        for _, row in df.iterrows():
            history.append({
                "date": str(row.get("日期", row.get("date", ""))),
                "open": float(row.get("开盘", row.get("open", 0))),
                "high": float(row.get("最高", row.get("high", 0))),
                "low": float(row.get("最低", row.get("low", 0))),
                "close": float(row.get("收盘", row.get("close", 0))),
                "volume": float(row.get("成交量", row.get("volume", row.get("vol", 0)))),
            })

        return {
            "success": True,
            "data": {
                "ticker": ticker,
                "name": ETF_POOL[ticker]["name"],
                "trackingIndex": ETF_POOL[ticker]["trackingIndex"],
                "price": float(latest.get("收盘", latest.get("close", 0))),
                "changePct": float(latest.get("涨跌幅", latest.get("pct_chg", 0))),
                "nav": 0,
                "premium": 0,
                "history": history,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
