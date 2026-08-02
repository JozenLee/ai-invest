# 统一数据服务入口
# 路由层的唯一数据依赖，内部通过 ProviderRegistry 调度数据源
# 支持按类别配置数据源优先级，自动降级

import os
from typing import Any, Dict, List, Optional

import pandas as pd

from providers.registry import ProviderRegistry, registry


class DataService:
    """统一数据服务入口

    使用方式：
        from services.data_service import data_service

        # 获取指数行情（自动按 akshare -> tushare -> xueqiu 降级）
        df = await data_service.get_index_spot()

        # 获取北向资金
        data = await data_service.get_northbound_flow()
    """

    def __init__(self, reg: Optional[ProviderRegistry] = None):
        self.registry = reg or registry
        self._initialized = False

    def initialize(self):
        """初始化所有数据源（在 FastAPI 启动时调用）"""
        if self._initialized:
            return

        # 注册东方财富直连API（最高优先级，绕过代理问题）
        from providers.eastmoney_direct_provider import EastmoneyDirectProvider
        self.registry.register(EastmoneyDirectProvider())

        # 注册 NewsNow（财经新闻聚合）
        from providers.newsnow_provider import NewsNowProvider
        self.registry.register(NewsNowProvider())

        # 注册 AKShare
        from providers.akshare_provider import AKShareProvider
        self.registry.register(AKShareProvider())

        # 注册 Tushare（如果有 token）
        from providers.tushare_provider import TushareProvider
        tushare = TushareProvider()
        if tushare.available:
            self.registry.register(tushare)
        else:
            print("[DataService] Tushare 未配置，跳过注册")

        # 注册雪球
        from providers.xueqiu_provider import XueqiuProvider
        self.registry.register(XueqiuProvider())

        # 注册新浪财经（备用数据源）
        from providers.sina_provider import SinaProvider
        self.registry.register(SinaProvider())

        self._initialized = True
        print(f"[DataService] 初始化完成，可用数据源: {self.registry.list_providers()}")

    # ==================== 指数数据 ====================

    async def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照"""
        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="market_overview",  # 修改为与文件缓存名称一致
            cache_ttl=30,
        )
        return self._ensure_dataframe(result)

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取指数日K数据"""
        cache_key = f"index_daily_{code}"
        result = await self.registry.fetch(
            category="index_daily",
            method="get_index_daily",
            cache_key=cache_key,
            cache_ttl=300,
            code=code, start_date=start_date, end_date=end_date,
        )
        return self._ensure_dataframe(result)

    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取指定指数实时行情"""
        result = await self.registry.fetch(
            category="index_realtime",
            method="get_index_realtime",
            symbols=symbols,
        )
        return self._ensure_dataframe(result)

    async def get_index_list(self) -> pd.DataFrame:
        """获取A股市场所有指数列表

        返回所有可用的市场指数，包括主要指数、行业指数、概念指数等
        """
        result = await self.registry.fetch(
            category="index_list",
            method="get_index_list",
            cache_key="index_list",
            cache_ttl=3600,  # 指数列表变化不频繁，缓存1小时
        )
        return self._ensure_dataframe(result)

    # ==================== 个股数据 ====================

    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        """获取个股实时行情快照"""
        result = await self.registry.fetch(
            category="stock_spot",
            method="get_stock_spot",
            symbols=symbols,
        )
        return self._ensure_dataframe(result)

    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str,
                               adjust: str = "qfq") -> pd.DataFrame:
        """获取个股日K数据"""
        result = await self.registry.fetch(
            category="stock_daily",
            method="get_stock_daily",
            ticker=ticker, start_date=start_date, end_date=end_date, adjust=adjust,
        )
        return self._ensure_dataframe(result)

    # ==================== ETF 数据 ====================

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取ETF实时行情"""
        result = await self.registry.fetch(
            category="etf_realtime",
            method="get_etf_realtime",
            symbols=symbols,
        )
        return self._ensure_dataframe(result)

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取ETF日K数据"""
        result = await self.registry.fetch(
            category="etf_daily",
            method="get_etf_daily",
            ticker=ticker, start_date=start_date, end_date=end_date,
        )
        return self._ensure_dataframe(result)

    async def get_etf_nav(self, ticker: str) -> Dict:
        """获取ETF净值和份额"""
        result = await self.registry.fetch(
            category="etf_nav",
            method="get_etf_nav",
            ticker=ticker,
        )
        return result if isinstance(result, dict) else {}

    async def get_etf_list(self) -> pd.DataFrame:
        """获取全市场ETF列表

        返回所有上市交易的ETF，包含代码、名称、最新价、涨跌幅等信息
        """
        result = await self.registry.fetch(
            category="etf_list",
            method="get_etf_list",
            cache_key="etf_list",
            cache_ttl=3600,  # ETF列表变化不频繁，缓存1小时
        )
        return self._ensure_dataframe(result)

    # ==================== 资金流向 ====================

    async def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向"""
        result = await self.registry.fetch(
            category="market_capital_flow",
            method="get_market_capital_flow",
            cache_key="market_capital_flow",
            cache_ttl=600,
        )
        return result if isinstance(result, dict) else {}

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        """获取板块资金流向"""
        cache_key = f"sector_capital_flow_{indicator}"
        result = await self.registry.fetch(
            category="sector_capital_flow",
            method="get_sector_capital_flow",
            cache_key=cache_key,
            cache_ttl=600,
            indicator=indicator,
        )
        return result if isinstance(result, list) else []

    async def get_northbound_flow(self) -> Dict:
        """获取北向资金流向"""
        result = await self.registry.fetch(
            category="northbound_flow",
            method="get_northbound_flow",
            cache_key="northbound_flow",
            cache_ttl=600,
        )
        return result if isinstance(result, dict) else {}

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """获取北向资金历史数据"""
        cache_key = f"northbound_history_{days}"
        result = await self.registry.fetch(
            category="northbound_history",
            method="get_northbound_flow_history",
            cache_key=cache_key,
            cache_ttl=600,
            days=days,
        )
        return result if isinstance(result, list) else []

    async def get_individual_capital_flow_rank(self, indicator: str = "今日") -> List[Dict]:
        """获取个股资金流向排名（用于分析连续流入趋势）"""
        cache_key = f"individual_capital_flow_{indicator}"
        result = await self.registry.fetch(
            category="individual_capital_flow",
            method="get_individual_capital_flow_rank",
            cache_key=cache_key,
            cache_ttl=600,
            indicator=indicator,
        )
        return result if isinstance(result, list) else []

    async def get_lhb_data(self) -> List[Dict]:
        """获取龙虎榜数据"""
        result = await self.registry.fetch(
            category="lhb_data",
            method="get_lhb_data",
            cache_key="lhb_data",
            cache_ttl=600,
        )
        return result if isinstance(result, list) else []

    async def get_lhb_detail(self, date: str) -> List[Dict]:
        """获取龙虎榜详细数据"""
        cache_key = f"lhb_detail_{date}"
        result = await self.registry.fetch(
            category="lhb_detail",
            method="get_lhb_detail",
            cache_key=cache_key,
            cache_ttl=3600,
            date=date,
        )
        return result if isinstance(result, list) else []

    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        """获取个股资金流向"""
        result = await self.registry.fetch(
            category="stock_capital_flow",
            method="get_stock_capital_flow",
            ticker=ticker,
        )
        return result if isinstance(result, dict) else {}

    async def get_margin_data(self) -> Dict:
        """获取融资融券数据"""
        result = await self.registry.fetch(
            category="margin_data",
            method="get_margin_data",
            cache_key="margin_data",
            cache_ttl=600,
        )
        return result if isinstance(result, dict) else {}

    async def get_market_fund_flow_rank(self) -> Dict:
        """获取大盘资金流向排名"""
        result = await self.registry.fetch(
            category="market_fund_flow_rank",
            method="get_market_fund_flow_rank",
            cache_key="market_fund_flow_rank",
            cache_ttl=600,
        )
        return result if isinstance(result, dict) else {}

    async def get_market_sentiment(self) -> Dict:
        """获取市场情绪指标"""
        result = await self.registry.fetch(
            category="market_sentiment",
            method="get_market_sentiment",
            cache_key="market_sentiment",
            cache_ttl=60,
        )
        return result if isinstance(result, dict) else {}

    # ==================== 新闻 ====================

    async def get_news(self, keyword: str = "财联社", limit: int = 50, api: str = "stock_news_em") -> pd.DataFrame:
        """获取新闻资讯"""
        result = await self.registry.fetch(
            category="news",
            method="get_news",
            keyword=keyword, limit=limit, api=api,
        )
        return self._ensure_dataframe(result)

    # ==================== 工具方法 ====================

    @staticmethod
    def _ensure_dataframe(result: Any) -> pd.DataFrame:
        """确保结果为 DataFrame 类型"""
        if isinstance(result, pd.DataFrame):
            return result
        if isinstance(result, list):
            return pd.DataFrame(result)
        return pd.DataFrame()


# 全局单例
data_service = DataService()
