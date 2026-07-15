# 市场数据路由
# 提供指数行情、个股数据等接口
# 多源聚合：AKShare（东方财富）→ 雪球 → 缓存

import asyncio
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from services.akshare_client import client

router = APIRouter()

class IndexQuote(BaseModel):
    code: str
    name: str
    price: float
    change: float
    change_pct: float
    volume: float
    amount: float

class StockQuote(BaseModel):
    ticker: str
    name: str
    price: float
    change: float
    change_pct: float
    volume: float
    amount: float
    high: float
    low: float
    open: float

def _fetch_akshare_index_spot():
    """同步函数：从 AKShare 获取指数实时行情"""
    try:
        df = client.get_index_spot()
        if df.empty:
            return []

        index_map = {
            "000001": {"code": "sh000001", "name": "上证指数"},
            "399001": {"code": "sz399001", "name": "深证成指"},
            "399006": {"code": "sz399006", "name": "创业板指"},
            "000688": {"code": "sh000688", "name": "科创50"},
            "000300": {"code": "sh000300", "name": "沪深300"},
        }

        indices = []
        for _, row in df.iterrows():
            code = str(row.get("代码", ""))
            if code in index_map:
                info = index_map[code]
                indices.append({
                    "code": info["code"],
                    "name": info["name"],
                    "price": round(float(row.get("最新价", 0)), 2),
                    "change": round(float(row.get("涨跌额", 0)), 2),
                    "changePct": round(float(row.get("涨跌幅", 0)), 2),
                    "volume": float(row.get("成交量", 0)),
                    "amount": float(row.get("成交额", 0)),
                    "source": "akshare"
                })
        return indices
    except Exception as e:
        print(f"AKShare 指数行情失败: {e}")
        return []

def _fetch_akshare_index_daily():
    """同步函数：从 AKShare 获取指数历史数据（降级方案）"""
    try:
        import akshare as ak
        index_configs = [
            {"symbol": "sh000001", "name": "上证指数"},
            {"symbol": "sz399001", "name": "深证成指"},
            {"symbol": "sz399006", "name": "创业板指"},
            {"symbol": "sh000688", "name": "科创50"},
            {"symbol": "sh000300", "name": "沪深300"},
        ]

        indices = []
        for config in index_configs:
            try:
                df = ak.stock_zh_index_daily(symbol=config["symbol"])
                if not df.empty:
                    latest = df.iloc[-1]
                    prev = df.iloc[-2] if len(df) > 1 else latest
                    close = float(latest.get("close", 0))
                    prev_close = float(prev.get("close", close))
                    change = close - prev_close
                    change_pct = (change / prev_close * 100) if prev_close > 0 else 0

                    indices.append({
                        "code": config["symbol"],
                        "name": config["name"],
                        "price": round(close, 2),
                        "change": round(change, 2),
                        "changePct": round(change_pct, 2),
                        "volume": float(latest.get("volume", 0)),
                        "source": "akshare_daily"
                    })
            except Exception as e:
                print(f"获取{config['name']}失败: {e}")
                continue
        return indices
    except Exception as e:
        print(f"AKShare 历史数据降级失败: {e}")
        return []

async def _try_xueqiu_indices():
    """异步函数：从雪球获取指数行情"""
    try:
        from services.xueqiu_client import xueqiu_client
        symbols = ["SH000001", "SZ399001", "SZ399006", "SH000688", "SH000300"]
        data = await xueqiu_client.get_index_realtime(symbols)

        if not data:
            return []

        result = []
        for item in data:
            xq_sym = item.get("symbol", "")
            # 转换雪球代码为内部代码
            code_map = {
                "SH000001": "sh000001", "SZ399001": "sz399001",
                "SZ399006": "sz399006", "SH000688": "sh000688",
                "SH000300": "sh000300"
            }
            name_map = {
                "SH000001": "上证指数", "SZ399001": "深证成指",
                "SZ399006": "创业板指", "SH000688": "科创50",
                "SH000300": "沪深300"
            }
            if xq_sym in code_map:
                result.append({
                    "code": code_map[xq_sym],
                    "name": item.get("name", name_map.get(xq_sym, "")),
                    "price": round(item.get("current", 0), 2),
                    "change": round(item.get("chg", 0), 2),
                    "changePct": round(item.get("percent", 0), 2),
                    "volume": item.get("volume", 0),
                    "amount": item.get("amount", 0),
                    "source": "xueqiu"
                })
        return result
    except Exception as e:
        print(f"雪球指数行情失败: {e}")
        return []

@router.get("/overview")
async def get_market_overview():
    """获取市场概览（主要指数行情）

    多源聚合：
    1. AKShare 实时行情（东方财富 stock_zh_index_spot_em）- 在线程池中执行
    2. 雪球 API（备选）
    3. AKShare 历史数据（最后降级）
    """
    try:
        # 在线程池中执行阻塞的 AKShare 调用
        indices = await asyncio.to_thread(_fetch_akshare_index_spot)

        if indices and len(indices) >= 3:
            return {
                "success": True,
                "data": {
                    "indices": indices,
                    "source": "akshare",
                    "timestamp": datetime.now().isoformat()
                }
            }

        # 降级：尝试雪球
        xq_indices = await _try_xueqiu_indices()
        if xq_indices and len(xq_indices) >= 3:
            return {
                "success": True,
                "data": {
                    "indices": xq_indices,
                    "source": "xueqiu",
                    "timestamp": datetime.now().isoformat()
                }
            }

        # 最终降级：AKShare 历史数据
        daily_indices = await asyncio.to_thread(_fetch_akshare_index_daily)
        if daily_indices:
            return {
                "success": True,
                "data": {
                    "indices": daily_indices,
                    "source": "akshare_daily",
                    "timestamp": datetime.now().isoformat()
                }
            }

        return {
            "success": False,
            "error": "无法获取指数数据，所有数据源均不可用",
            "data": None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stock/{ticker}")
async def get_stock_quote(ticker: str):
    """获取个股行情"""
    try:
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")

        df = await asyncio.to_thread(client.get_stock_daily, ticker, start_date, end_date)

        if df.empty:
            raise HTTPException(status_code=404, detail=f"未找到股票 {ticker} 的数据")

        latest = df.iloc[-1]

        return {
            "success": True,
            "data": {
                "ticker": ticker,
                "date": str(latest.get("日期", "")),
                "open": float(latest.get("开盘", 0)),
                "high": float(latest.get("最高", 0)),
                "low": float(latest.get("最低", 0)),
                "close": float(latest.get("收盘", 0)),
                "volume": float(latest.get("成交量", 0)),
                "amount": float(latest.get("成交额", 0)),
                "changePct": float(latest.get("涨跌幅", 0)),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/index/{code}")
async def get_index_data(code: str, days: int = Query(default=30, ge=1, le=365)):
    """获取指数历史数据"""
    try:
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")

        df = await asyncio.to_thread(client.get_index_daily, code, start_date, end_date)

        if df.empty:
            raise HTTPException(status_code=404, detail=f"未找到指数 {code} 的数据")

        data = []
        for _, row in df.iterrows():
            data.append({
                "date": str(row.get("date", "")),
                "open": float(row.get("open", 0)),
                "high": float(row.get("high", 0)),
                "low": float(row.get("low", 0)),
                "close": float(row.get("close", 0)),
                "volume": float(row.get("volume", 0)),
            })

        return {
            "success": True,
            "data": data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
