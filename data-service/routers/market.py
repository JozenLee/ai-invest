# 市场数据路由
# 提供指数行情、个股数据等接口
# 通过统一数据服务入口获取数据，支持多源自动降级

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta

from services.data_service import data_service

router = APIRouter()


@router.get("/overview")
async def get_market_overview():
    """获取市场概览（主要指数行情）

    通过统一数据服务获取，自动按配置的优先级降级：
    AKShare -> Tushare -> 雪球 -> 缓存
    """
    try:
        df = await data_service.get_index_spot()

        if df.empty:
            return {
                "success": False,
                "error": "无法获取指数数据，所有数据源均不可用",
                "data": None,
            }

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
            # 兼容 ak 格式（纯数字）和 tushare 格式（sh/sz 前缀）
            pure_code = code.replace("sh", "").replace("sz", "")
            if pure_code in index_map:
                info = index_map[pure_code]
                indices.append({
                    "code": info["code"],
                    "name": info["name"],
                    "price": round(float(row.get("最新价", 0)), 2),
                    "change": round(float(row.get("涨跌额", 0)), 2),
                    "changePct": round(float(row.get("涨跌幅", 0)), 2),
                    "volume": float(row.get("成交量", 0)),
                    "amount": float(row.get("成交额", 0)),
                    "source": "unified",
                })

        if not indices:
            return {
                "success": False,
                "error": "无法解析指数数据",
                "data": None,
            }

        return {
            "success": True,
            "data": {
                "indices": indices,
                "source": "unified",
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stock/{ticker}")
async def get_stock_quote(ticker: str):
    """获取个股行情"""
    try:
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")

        df = await data_service.get_stock_daily(ticker, start_date, end_date)

        if df.empty:
            raise HTTPException(status_code=404, detail=f"未找到股票 {ticker} 的数据")

        latest = df.iloc[-1]

        return {
            "success": True,
            "data": {
                "ticker": ticker,
                "date": str(latest.get("日期", latest.get("date", ""))),
                "open": float(latest.get("开盘", latest.get("open", 0))),
                "high": float(latest.get("最高", latest.get("high", 0))),
                "low": float(latest.get("最低", latest.get("low", 0))),
                "close": float(latest.get("收盘", latest.get("close", 0))),
                "volume": float(latest.get("成交量", latest.get("volume", 0))),
                "amount": float(latest.get("成交额", latest.get("amount", 0))),
                "changePct": float(latest.get("涨跌幅", latest.get("pct_chg", 0))),
            },
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

        df = await data_service.get_index_daily(code, start_date, end_date)

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
                "volume": float(row.get("volume", row.get("vol", 0))),
            })

        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
