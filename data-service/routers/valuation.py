# ETF估值数据路由
# 使用AKShare获取ETF跟踪指数的PE/PB/股息率/历史百分位

import asyncio
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel


router = APIRouter()

# ETF -> 跟踪指数映射（Legulegu可查询的指数名称）
ETF_INDEX_MAP = {
    "510300": {"name": "沪深300ETF", "trackingIndex": "沪深300", "csindex": "000300"},
    "159919": {"name": "沪深300ETF(易方达)", "trackingIndex": "沪深300", "csindex": "000300"},
    "510500": {"name": "中证500ETF", "trackingIndex": "中证500", "csindex": "000905"},
    "588000": {"name": "科创50ETF", "trackingIndex": "科创50", "csindex": "000688"},
    "159915": {"name": "创业板ETF", "trackingIndex": "创业板50", "csindex": "399006"},
    "512480": {"name": "半导体ETF", "trackingIndex": None, "csindex": None},
    "159995": {"name": "芯片ETF", "trackingIndex": None, "csindex": None},
    "515070": {"name": "AI ETF", "trackingIndex": None, "csindex": None},
    "515880": {"name": "通信ETF", "trackingIndex": None, "csindex": None},
    "159853": {"name": "光通信ETF", "trackingIndex": None, "csindex": None},
    "159888": {"name": "算力ETF", "trackingIndex": None, "csindex": None},
}

# Legulegu支持的指数名称列表
LEGULEGU_SUPPORTED = {
    "上证50", "沪深300", "上证380", "创业板50", "中证500",
    "上证180", "深证红利", "深证100", "中证1000", "上证红利",
    "中证100", "中证800",
}


def _calc_percentile(values: list, current: float) -> float:
    """计算当前值在历史数据中的百分位"""
    if not values or current is None:
        return 50.0
    valid = [v for v in values if v is not None and not np.isnan(v) and v > 0]
    if not valid:
        return 50.0
    count_below = sum(1 for v in valid if v < current)
    return round(count_below / len(valid) * 100, 2)


def _determine_rating(pe_pct: float, pb_pct: float) -> str:
    """根据PE/PB百分位判定估值等级

    - 低估: PE百分位 < 30% 且 PB百分位 < 30%
    - 高估: PE百分位 > 70% 或 PB百分位 > 70%
    - 合理: 其他
    """
    if pe_pct < 30 and pb_pct < 30:
        return "undervalued"
    if pe_pct > 70 or pb_pct > 70:
        return "overvalued"
    return "fair"


def _fetch_pe_data(index_name: str):
    """同步函数：从Legulegu获取指数PE历史数据"""
    try:
        import akshare as ak
        df = ak.stock_index_pe_lg(symbol=index_name)
        if df.empty:
            return None
        # 滚动市盈率(TTM)列
        pe_col = "滚动市盈率"
        if pe_col not in df.columns:
            pe_col = "静态市盈率"
        latest = df.iloc[-1]
        pe_values = df[pe_col].dropna().tolist()
        return {
            "current": float(latest[pe_col]) if pe_col in latest.index else None,
            "percentile": _calc_percentile(pe_values, float(latest[pe_col])) if pe_col in latest.index else None,
            "median": float(df[pe_col].median()) if pe_col in df.columns else None,
            "min": float(df[pe_col].min()) if pe_col in df.columns else None,
            "max": float(df[pe_col].max()) if pe_col in df.columns else None,
            "historyYears": round(len(df) / 252, 1),  # 约252个交易日/年
            "dataPoints": len(pe_values),
            "date": str(latest.get("日期", "")),
        }
    except Exception as e:
        print(f"获取{index_name} PE数据失败: {e}")
        return None


def _fetch_pb_data(index_name: str):
    """同步函数：从Legulegu获取指数PB历史数据"""
    try:
        import akshare as ak
        df = ak.stock_index_pb_lg(symbol=index_name)
        if df.empty:
            return None
        pb_col = "市净率"
        latest = df.iloc[-1]
        pb_values = df[pb_col].dropna().tolist()
        return {
            "current": float(latest[pb_col]) if pb_col in latest.index else None,
            "percentile": _calc_percentile(pb_values, float(latest[pb_col])) if pb_col in latest.index else None,
            "median": float(df[pb_col].median()) if pb_col in df.columns else None,
            "min": float(df[pb_col].min()) if pb_col in df.columns else None,
            "max": float(df[pb_col].max()) if pb_col in df.columns else None,
            "dataPoints": len(pb_values),
            "date": str(latest.get("日期", "")),
        }
    except Exception as e:
        print(f"获取{index_name} PB数据失败: {e}")
        return None


def _fetch_dividend_data(csindex_code: str):
    """同步函数：从中证指数获取股息率数据"""
    try:
        import akshare as ak
        df = ak.stock_zh_index_value_csindex(symbol=csindex_code)
        if df.empty:
            return None
        # 股息率1列
        div_col = "股息率1"
        if div_col not in df.columns:
            div_col = "股息率2"
        if div_col not in df.columns:
            return None
        latest = df.iloc[-1]
        div_values = df[div_col].dropna().tolist()
        return {
            "current": float(latest[div_col]),
            "percentile": _calc_percentile(div_values, float(latest[div_col])),
            "dataPoints": len(div_values),
            "date": str(latest.get("日期", "")),
        }
    except Exception as e:
        print(f"获取{csindex_code} 股息率数据失败: {e}")
        return None


@router.get("/etf")
async def get_etf_valuation(
    ticker: str = Query(..., description="ETF代码，如510300"),
):
    """获取单个ETF的估值数据

    返回PE/PB/股息率及各自的历史百分位，用于判断估值高低。
    """
    if ticker not in ETF_INDEX_MAP:
        raise HTTPException(
            status_code=404,
            detail=f"ETF {ticker} 不在监控池中"
        )

    info = ETF_INDEX_MAP[ticker]
    index_name = info["trackingIndex"]
    csindex_code = info.get("csindex")

    if not index_name or index_name not in LEGULEGU_SUPPORTED:
        # 无法获取估值数据的ETF，返回降级数据
        return {
            "success": True,
            "data": {
                "ticker": ticker,
                "name": info["name"],
                "trackingIndex": index_name or "未知",
                "pe": None,
                "pb": None,
                "dividendYield": None,
                "rating": "unknown",
                "message": "该ETF跟踪的行业指数暂无估值数据",
                "source": "unavailable",
            }
        }

    # 并行获取PE、PB、股息率数据
    pe_task = asyncio.to_thread(_fetch_pe_data, index_name)
    pb_task = asyncio.to_thread(_fetch_pb_data, index_name)
    div_task = asyncio.to_thread(_fetch_dividend_data, csindex_code) if csindex_code else None

    pe_data = await pe_task
    pb_data = await pb_task
    div_data = await div_task if div_task else None

    # 计算综合评级
    pe_pct = pe_data.get("percentile", 50) if pe_data else 50
    pb_pct = pb_data.get("percentile", 50) if pb_data else 50
    rating = _determine_rating(pe_pct, pb_pct)

    return {
        "success": True,
        "data": {
            "ticker": ticker,
            "name": info["name"],
            "trackingIndex": index_name,
            "pe": pe_data,
            "pb": pb_data,
            "dividendYield": div_data,
            "rating": rating,
            "source": "legulegu" if (pe_data or pb_data) else "csindex" if div_data else "unavailable",
        }
    }


@router.get("/batch")
async def get_batch_valuation(
    tickers: str = Query(..., description="ETF代码列表，逗号分隔，如510300,510500,588000"),
):
    """批量获取ETF估值数据

    传入逗号分隔的ETF代码列表，返回每个ETF的估值数据。
    """
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]

    if len(ticker_list) > 20:
        raise HTTPException(
            status_code=400,
            detail="单次最多查询20个ETF"
        )

    # 串行处理（避免并发限流），每个ETF复用单个接口的逻辑
    results = []
    for ticker in ticker_list:
        if ticker not in ETF_INDEX_MAP:
            results.append({
                "ticker": ticker,
                "success": False,
                "error": f"ETF {ticker} 不在监控池中",
            })
            continue

        info = ETF_INDEX_MAP[ticker]
        index_name = info["trackingIndex"]
        csindex_code = info.get("csindex")

        if not index_name or index_name not in LEGULEGU_SUPPORTED:
            results.append({
                "success": True,
                "data": {
                    "ticker": ticker,
                    "name": info["name"],
                    "trackingIndex": index_name or "未知",
                    "pe": None,
                    "pb": None,
                    "dividendYield": None,
                    "rating": "unknown",
                    "message": "该ETF跟踪的行业指数暂无估值数据",
                    "source": "unavailable",
                }
            })
            continue

        pe_data = await asyncio.to_thread(_fetch_pe_data, index_name)
        pb_data = await asyncio.to_thread(_fetch_pb_data, index_name)
        div_data = await asyncio.to_thread(_fetch_dividend_data, csindex_code) if csindex_code else None

        pe_pct = pe_data.get("percentile", 50) if pe_data else 50
        pb_pct = pb_data.get("percentile", 50) if pb_data else 50
        rating = _determine_rating(pe_pct, pb_pct)

        results.append({
            "success": True,
            "data": {
                "ticker": ticker,
                "name": info["name"],
                "trackingIndex": index_name,
                "pe": pe_data,
                "pb": pb_data,
                "dividendYield": div_data,
                "rating": rating,
                "source": "legulegu" if (pe_data or pb_data) else "csindex" if div_data else "unavailable",
            }
        })

    return {
        "success": True,
        "data": results,
        "count": len(results),
    }


@router.get("/pool")
async def get_valuation_pool():
    """获取所有可估值ETF的列表

    返回监控池中可以获取估值数据的ETF及其跟踪指数信息。
    """
    pool = []
    for ticker, info in ETF_INDEX_MAP.items():
        has_valuation = (
            info["trackingIndex"] is not None
            and info["trackingIndex"] in LEGULEGU_SUPPORTED
        )
        pool.append({
            "ticker": ticker,
            "name": info["name"],
            "trackingIndex": info["trackingIndex"] or "未知",
            "hasValuation": has_valuation,
        })

    return {
        "success": True,
        "data": pool,
    }
