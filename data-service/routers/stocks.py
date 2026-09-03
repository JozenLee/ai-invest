"""
Stocks API Router - 股票数据API路由
提供股票基本信息、财报、公告、K线、实时行情等接口
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import asyncio
from datetime import datetime, timedelta
from providers.stock_provider import StockProvider
from db import db

router = APIRouter(prefix="/stocks", tags=["stocks"])
stock_provider = StockProvider()


def _normalized_cn_symbol(symbol: str) -> str:
    value = symbol.strip().lower()
    if value.startswith(('sh', 'sz')):
        value = value[2:]
    if value.endswith(('.sh', '.sz')):
        value = value[:-3]
    return value


@router.get("/batch/info")
async def get_batch_stock_info(
    symbols: str = Query(..., description="股票代码列表，逗号分隔"),
    market: str = Query(default="cn", description="市场类型")
):
    """批量获取股票基本信息。"""
    try:
        symbol_list = [s.strip() for s in symbols.split(',') if s.strip()]
        if market == "cn" and stock_provider.tushare.available:
            frame = await stock_provider.tushare.request_dataframe("stock_basic")
            requested = {item.upper() for item in symbol_list}
            results = []
            for row in frame.to_dict("records") if frame is not None else []:
                ts_code = str(row.get("ts_code") or "").upper()
                if ts_code in requested and row.get("name"):
                    results.append({"symbol": ts_code, "info": row})
            if results:
                return {"success": True, "data": results, "count": len(results)}
        semaphore = asyncio.Semaphore(4)

        async def fetch(symbol: str):
            async with semaphore:
                data = await stock_provider.get_stock_info(symbol, market)
                return {"symbol": symbol, "info": data} if data else None

        results = [item for item in await asyncio.gather(*(fetch(symbol) for symbol in symbol_list)) if item]
        return {"success": True, "data": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{symbol}/info")
async def get_stock_info(
    symbol: str,
    market: str = Query(default="cn", description="市场类型 (cn/us/hk)")
):
    """
    获取股票基本信息

    - **symbol**: 股票代码
    - **market**: 市场类型 (cn=国内, us=美股, hk=港股)
    """
    try:
        data = await stock_provider.get_stock_info(symbol, market)
        if data is None:
            raise HTTPException(status_code=404, detail="Stock not found")
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/financial")
async def get_financial_report(
    symbol: str,
    report_type: str = Query(default="balance", description="报表类型 (balance/income/cashflow)"),
    market: str = Query(default="cn", description="市场类型")
):
    """
    获取财报数据

    - **symbol**: 股票代码
    - **report_type**: 报表类型
      - balance: 资产负债表
      - income: 利润表
      - cashflow: 现金流量表
    - **market**: 市场类型
    """
    try:
        lookup_symbol = _normalized_cn_symbol(symbol) if market == 'cn' else symbol
        local = db.execute("SELECT reportPeriod, publishDate, metricsJson, source FROM stock_financial_reports WHERE stockCode = ? AND reportType = ? ORDER BY reportPeriod DESC", (lookup_symbol, report_type)) if market == 'cn' else []
        data = [dict(row, **(__import__('json').loads(row['metricsJson']) if row.get('metricsJson') else {})) for row in local] if local else await stock_provider.get_financial_report(symbol, report_type, market)
        if data is None:
            raise HTTPException(status_code=404, detail="Financial report not found")
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/announcements")
async def get_announcements(
    symbol: str,
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    market: str = Query(default="cn", description="市场类型")
):
    """
    获取公司公告

    - **symbol**: 股票代码
    - **start_date**: 开始日期
    - **end_date**: 结束日期
    - **market**: 市场类型
    """
    try:
        lookup_symbol = _normalized_cn_symbol(symbol) if market == 'cn' else symbol
        local = db.execute("SELECT announcementId, title, eventType, publishDate, url, content, source FROM stock_announcements WHERE stockCode = ? ORDER BY publishDate DESC LIMIT 100", (lookup_symbol,)) if market == 'cn' else []
        data = local if local else await stock_provider.get_announcements(symbol, start_date, end_date, market)
        if data is None:
            raise HTTPException(status_code=404, detail="Announcements not found")
        return {"success": True, "data": data, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/kline")
async def get_kline(
    symbol: str,
    period: str = Query(default="daily", description="周期 (daily/weekly/monthly)"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    market: str = Query(default="cn", description="市场类型"),
    adjust: str = Query(default="qfq", description="复权类型 (qfq/hfq/空)")
):
    """
    获取K线数据

    - **symbol**: 股票代码
    - **period**: 周期
      - daily: 日K
      - weekly: 周K
      - monthly: 月K
    - **start_date**: 开始日期
    - **end_date**: 结束日期
    - **market**: 市场类型
    - **adjust**: 复权类型 (qfq=前复权, hfq=后复权, 空=不复权)
    """
    try:
        # 默认获取最近1年数据
        if not start_date:
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")

        data = await stock_provider.get_kline(symbol, period, start_date, end_date, market, adjust)
        if data is None:
            raise HTTPException(status_code=404, detail="K-line data not found")
        return {"success": True, "data": data, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime")
async def get_realtime_quote(
    symbols: str = Query(..., description="股票代码列表，逗号分隔"),
    market: str = Query(default="cn", description="市场类型")
):
    """
    获取实时行情

    - **symbols**: 股票代码列表，逗号分隔 (例如: "000001,000002,000003")
    - **market**: 市场类型
    """
    try:
        symbol_list = [s.strip() for s in symbols.split(',')]
        data = await stock_provider.get_realtime_quote(symbol_list, market)
        if data is None:
            raise HTTPException(status_code=404, detail="Realtime quote not found")
        return {"success": True, "data": data, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
