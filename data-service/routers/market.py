# 市场数据路由
# 提供指数行情、个股数据等接口
# 通过统一数据服务入口获取数据，支持多源自动降级

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta

from services.data_service import data_service
from utils.trading_hours import get_market_status
from db import db

router = APIRouter()


@router.get("/overview")
async def get_market_overview(refresh: bool = Query(default=False)):
    """获取市场概览（主要指数行情）

    通过统一数据服务获取，自动按配置的优先级降级：
    Tushare -> AKShare -> 雪球 -> 缓存
    """
    try:
        if not refresh:
            local_rows = db.execute("SELECT code, name, date, open, high, low, close, volume, changePct FROM IndexDaily WHERE date = (SELECT MAX(date) FROM IndexDaily) ORDER BY code")
            if local_rows:
                index_map = {
                    "000001": ("sh000001", "上证指数"), "399001": ("sz399001", "深证成指"),
                    "399006": ("sz399006", "创业板指"), "000688": ("sh000688", "科创50"),
                    "000300": ("sh000300", "沪深300"),
                }
                indices = []
                for row in local_rows:
                    pure = str(row.get("code", "")).replace("sh", "").replace("sz", "")
                    if pure not in index_map:
                        continue
                    code, name = index_map[pure]
                    indices.append({"code": code, "name": name, "price": float(row.get("close") or 0), "change": 0, "changePct": float(row.get("changePct") or 0), "volume": float(row.get("volume") or 0), "amount": 0, "source": "local-database"})
                if indices:
                    fetched_at = str(local_rows[0].get("date"))
                    return {"success": True, "data": {"indices": indices, "source": "local-database", "timestamp": datetime.now().isoformat(), "meta": {**get_market_status(), "isRealtime": False, "dataDate": fetched_at, "freshness": "fresh" if fetched_at == datetime.now().strftime("%Y-%m-%d") else "stale"}}}
        df = await data_service.get_index_spot(force_refresh=refresh)
        market_status = get_market_status()

        if df.empty:
            return {
                "success": False,
                "error": "无法获取指数数据，所有数据源均不可用",
                "data": None,
                "meta": market_status,
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
                "meta": market_status,
            }

        # 判断数据新鲜度
        actual_source = data_service.registry.get_last_source("index_spot")
        data_dates = [
            str(row.get("数据日期", ""))
            for _, row in df.iterrows()
            if str(row.get("数据日期", ""))
        ]
        data_date = data_dates[0] if data_dates else market_status["lastTradingDate"]
        normalized_data_date = data_date.replace("/", "-")[:10]
        today = datetime.now().strftime("%Y-%m-%d")
        if market_status["isRealtime"] and normalized_data_date not in {today, today.replace("-", "")}:
            return {
                "success": False,
                "error": "实时指数数据源返回过期快照",
                "data": None,
                "meta": {**market_status, "isRealtime": False, "dataDate": data_date,
                          "staleReason": "stale_source_data"},
            }
        # 实时状态必须同时满足：当前处于交易时段，且本次请求命中了实时源。
        # 缓存数据只能在非交易时段作为最近收盘数据返回。
        is_realtime = market_status["isRealtime"] and actual_source not in {"缓存", "不可用"}
        is_stale = not is_realtime

        return {
            "success": True,
            "data": {
                "indices": indices,
                "source": actual_source,
                "timestamp": datetime.now().isoformat(),
                "meta": {
                    **market_status,
                    "isRealtime": is_realtime,
                    "dataDate": data_date,
                    "staleReason": (
                        "market_closed" if not market_status["isRealtime"]
                        else "cached_or_realtime_source_unavailable" if is_stale
                        else None
                    ),
                },
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

        local_rows = db.execute(
            "SELECT ticker, date, open, high, low, close, volume, amount FROM StockDaily WHERE ticker = ? AND date >= date('now', '-30 days') ORDER BY date DESC LIMIT 1",
            (ticker,),
        )
        if local_rows:
            row = local_rows[0]
            return {"success": True, "data": {"ticker": ticker, "date": str(row.get("date", "")), "open": float(row.get("open") or 0), "high": float(row.get("high") or 0), "low": float(row.get("low") or 0), "close": float(row.get("close") or 0), "volume": float(row.get("volume") or 0), "amount": float(row.get("amount") or 0), "changePct": 0}, "meta": {"source": "local-database", "freshness": "fresh"}}

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
        local_rows = db.execute("SELECT code, date, open, high, low, close, volume, changePct FROM IndexDaily WHERE lower(code) = lower(?) AND date >= date('now', ?) ORDER BY date ASC", (code, f"-{days} days"))
        if local_rows:
            return {"success": True, "data": [{"date": str(row.get("date")), "open": float(row.get("open") or 0), "high": float(row.get("high") or 0), "low": float(row.get("low") or 0), "close": float(row.get("close") or 0), "volume": float(row.get("volume") or 0), "changePct": float(row.get("changePct") or 0)} for row in local_rows], "meta": {"source": "local-database", "fetchedAt": str(local_rows[-1].get("date")), "freshness": "fresh"}}
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


@router.get("/indices")
async def get_index_list():
    """获取A股市场所有指数列表

    返回所有可用的市场指数，包括主要指数、行业指数、概念指数等
    """
    try:
        df = await data_service.get_index_list()

        if df.empty:
            return {
                "success": False,
                "error": "无法获取指数列表，所有数据源均不可用",
                "data": None,
            }

        indices = []
        for _, row in df.iterrows():
            indices.append({
                "code": str(row.get("代码", "")),
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", 0)),
                "change": float(row.get("涨跌额", 0)),
                "changePct": float(row.get("涨跌幅", 0)),
                "volume": float(row.get("成交量", 0)),
                "amount": float(row.get("成交额", 0)),
            })

        return {
            "success": True,
            "data": {
                "indices": indices,
                "total": len(indices),
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/indices/by-domain/{domain_key}")
async def get_indices_by_domain(domain_key: str):
    """获取指定领域的指数列表（AI智能分类）

    Args:
        domain_key: 领域标识，如 ai_computing, new_energy, semiconductor

    支持的领域：
    - ai_computing: AI算力
    - semiconductor: 半导体芯片
    - communication: 通信设备
    - new_energy: 新能源
    - new_energy_vehicle: 新能源汽车
    - consumption: 消费
    - healthcare: 医药医疗
    - finance: 金融
    - real_estate: 地产建筑
    - electronics: 消费电子
    - media: 传媒互联网
    - industrial: 工业制造
    - military: 国防军工
    - biotechnology: 生物科技
    """
    try:
        from services.market_classifier_service import market_classifier_service, DOMAIN_CATEGORIES

        # 验证领域
        if domain_key not in DOMAIN_CATEGORIES:
            return {
                "success": False,
                "error": f"未知的领域: {domain_key}",
                "available_domains": market_classifier_service.get_available_domains(),
            }

        # 获取所有指数
        df = await data_service.get_index_list()
        if df.empty:
            return {
                "success": False,
                "error": "无法获取指数列表",
                "data": None,
            }

        # 转换为字典列表
        all_indices = []
        for _, row in df.iterrows():
            all_indices.append({
                "code": str(row.get("代码", "")),
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", 0)),
                "change": float(row.get("涨跌额", 0)),
                "changePct": float(row.get("涨跌幅", 0)),
                "volume": float(row.get("成交量", 0)),
                "amount": float(row.get("成交额", 0)),
            })

        # AI分类筛选
        classified_indices = await market_classifier_service.classify_by_domain(
            all_indices,
            domain_key,
            item_type="指数"
        )

        return {
            "success": True,
            "data": {
                "domain": {
                    "key": domain_key,
                    "name": DOMAIN_CATEGORIES[domain_key]["name"],
                    "description": DOMAIN_CATEGORIES[domain_key]["description"],
                },
                "indices": classified_indices,
                "total": len(classified_indices),
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
