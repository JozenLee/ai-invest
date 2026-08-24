# ETF数据路由
# 提供ETF行情、净值、份额等接口
# 通过统一数据服务入口获取数据

import asyncio
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta

from services.data_service import data_service
from providers.etf_provider import ETFProvider

router = APIRouter()
etf_provider = ETFProvider()


@router.get("/list")
async def get_etf_list(
    category: str = Query(default=None, description="ETF分类筛选，如：科技、医药"),
    limit: int = Query(default=100, ge=1, le=2000, description="返回数量限制")
):
    """获取ETF列表（从市场动态获取）

    不再使用硬编码的ETF池，而是从AKShare获取全市场ETF列表
    支持按分类筛选和数量限制
    """
    try:
        df = await data_service.get_etf_list()

        if df.empty:
            return {
                "success": False,
                "error": "无法获取ETF列表，所有数据源均不可用",
                "data": None,
            }

        # 按分类筛选
        if category:
            keywords = []
            if category == "科技":
                keywords = ['AI', '人工智能', '芯片', '半导体', '算力', '通信', '电子', '计算机', '科技', '光通信']
            elif category == "医药":
                keywords = ['医药', '医疗', '生物', '健康', '制药']
            elif category == "消费":
                keywords = ['消费', '食品', '饮料', '零售', '家电']
            elif category == "金融":
                keywords = ['金融', '银行', '证券', '保险']
            elif category == "能源":
                keywords = ['能源', '新能源', '光伏', '风电', '电力']

            if keywords:
                df = df[df['名称'].str.contains('|'.join(keywords), na=False)]

        # 限制返回数量
        df = df.head(limit)

        etfs = []
        for _, row in df.iterrows():
            etfs.append({
                "ticker": str(row.get("代码", "")).replace("sz", "").replace("sh", ""),
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", 0)),
                "changePct": float(row.get("涨跌幅", 0)),
                "volume": float(row.get("成交额", 0)),
            })

        return {
            "success": True,
            "data": etfs,
            "total": len(etfs),
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/by-domain/{domain_key}")
async def get_etf_list_by_domain(
    domain_key: str,
    limit: int = Query(default=100, ge=1, le=500, description="返回数量限制")
):
    """获取指定领域的ETF列表（AI智能分类）

    Args:
        domain_key: 领域标识，如 ai_computing, new_energy, semiconductor
        limit: 返回数量限制

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

        # 获取所有ETF
        df = await data_service.get_etf_list()
        if df.empty:
            return {
                "success": False,
                "error": "无法获取ETF列表",
                "data": None,
            }

        # 转换为字典列表（限制数量以节省AI成本）
        all_etfs = []
        for _, row in df.head(limit * 3).iterrows():  # 取3倍数量，分类后再限制
            all_etfs.append({
                "ticker": str(row.get("代码", "")).replace("sz", "").replace("sh", ""),
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", 0)),
                "changePct": float(row.get("涨跌幅", 0)),
                "volume": float(row.get("成交额", 0)),
            })

        # AI分类筛选
        classified_etfs = await market_classifier_service.classify_by_domain(
            all_etfs,
            domain_key,
            item_type="ETF"
        )

        # 限制返回数量
        classified_etfs = classified_etfs[:limit]

        return {
            "success": True,
            "data": {
                "domain": {
                    "key": domain_key,
                    "name": DOMAIN_CATEGORIES[domain_key]["name"],
                    "description": DOMAIN_CATEGORIES[domain_key]["description"],
                },
                "etfs": classified_etfs,
                "total": len(classified_etfs),
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime")
async def get_etf_realtime(
    tickers: str = Query(default=None, description="ETF代码列表，逗号分隔，如：515070,159995")
):
    """获取ETF实时行情

    通过统一数据服务获取，自动按配置的优先级降级：
    Tushare -> AKShare -> 雪球 -> 缓存
    """
    try:
        # 如果没有指定ticker，返回热门ETF
        if not tickers:
            # 获取前50个ETF作为默认
            df_all = await data_service.get_etf_list()
            if df_all.empty:
                return {
                    "success": False,
                    "error": "无法获取ETF数据",
                    "data": None,
                }
            symbols = df_all.head(50)["代码"].tolist()
        else:
            symbols = [t.strip() for t in tickers.split(",")]

        df = await data_service.get_etf_realtime(symbols)

        if df.empty:
            return {
                "success": False,
                "error": "无法获取ETF实时数据，所有数据源均不可用",
                "data": None,
            }

        etfs = []
        for _, row in df.iterrows():
            ticker = str(row.get("代码", "")).replace("sz", "").replace("sh", "")
            etfs.append({
                "ticker": ticker,
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", row.get("current", 0))),
                "changePct": float(row.get("涨跌幅", row.get("percent", 0))),
                "volume": float(row.get("成交额", row.get("amount", 0))),
                "source": "unified",
            })

        return {"success": True, "data": etfs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}")
async def get_etf_detail(ticker: str):
    """获取ETF详情"""
    try:
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

        # 尝试从ETF列表获取名称
        etf_name = ticker
        try:
            df_list = await data_service.get_etf_list()
            if not df_list.empty:
                matched = df_list[df_list["代码"].str.contains(ticker, na=False)]
                if not matched.empty:
                    etf_name = matched.iloc[0]["名称"]
        except:
            pass

        return {
            "success": True,
            "data": {
                "ticker": ticker,
                "name": etf_name,
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


@router.get("/{ticker}/holdings")
async def get_etf_holdings(ticker: str):
    """获取ETF持仓明细

    返回统一的 ETF 底层股票及占比协议。
    """
    try:
        holdings = await etf_provider.get_holdings(ticker)

        # 即使返回空列表，也是成功的（表示数据源不可用，而非错误）
        return {
            "success": True,
            "data": holdings,
            "message": "当前数据源未返回持仓明细" if not holdings else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/holdings/batch")
async def get_etf_holdings_batch(tickers: str = Query(..., description="逗号分隔的 ETF 代码")):
    """批量获取 ETF 持仓，供产业企业分析聚合使用。"""
    symbols = list(dict.fromkeys(item.strip() for item in tickers.split(',') if item.strip()))
    results = {}
    for ticker in symbols[:50]:
        results[ticker] = await etf_provider.get_holdings(ticker)
    return {"success": True, "data": results, "requested": symbols}


@router.get("/{ticker}/info")
async def get_etf_info(ticker: str):
    """获取ETF基本信息"""
    try:
        info = await etf_provider.get_etf_info(ticker)
        if not info:
            raise HTTPException(status_code=404, detail=f"未找到ETF {ticker} 的基本信息")
        return {"success": True, "data": info}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
