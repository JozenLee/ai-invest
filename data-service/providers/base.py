# 数据提供者抽象基类
# 所有数据源（AKShare、Tushare、雪球等）实现此接口

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import pandas as pd


class DataProvider(ABC):
    """数据提供者抽象基类

    每个数据源（AKShare、Tushare、雪球等）实现此类。
    方法签名统一返回类型，方便上层 Registry 做降级调度。
    """

    name: str  # 标识名，如 "akshare", "tushare", "xueqiu"

    # ==================== 指数数据 ====================

    @abstractmethod
    async def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照

        Returns:
            DataFrame with columns: 代码/名称/最新价/涨跌额/涨跌幅/成交量/成交额
        """
        ...

    @abstractmethod
    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取指数日K数据

        Args:
            code: 指数代码，如 "sh000001"
            start_date: 开始日期，格式 "20240101"
            end_date: 结束日期，格式 "20240401"
        """
        ...

    @abstractmethod
    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取指定指数实时行情

        Args:
            symbols: 指数代码列表，如 ["sh000001", "sz399001"]
        """
        ...

    # ==================== 个股数据 ====================

    @abstractmethod
    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        """获取个股实时行情快照

        Args:
            symbols: 股票代码列表，如 ["000001", "600519"]
        """
        ...

    @abstractmethod
    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str, adjust: str = "qfq") -> pd.DataFrame:
        """获取个股日K数据

        Args:
            ticker: 股票代码，如 "000001"
            start_date: 开始日期
            end_date: 结束日期
            adjust: 复权方式 qfq/hfq/空
        """
        ...

    # ==================== ETF 数据 ====================

    @abstractmethod
    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取ETF实时行情

        Args:
            symbols: ETF代码列表，如 ["510300", "159919"]
        """
        ...

    @abstractmethod
    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取ETF日K数据"""
        ...

    async def get_etf_nav(self, ticker: str) -> Dict:
        """获取ETF净值和份额（可选实现）"""
        raise NotImplementedError(f"{self.name} 不支持 ETF 净值数据")

    async def get_etf_scale(self, ticker: str) -> Optional[Dict[str, Any]]:
        """获取 ETF 最新份额和规模（可选实现）。"""
        raise NotImplementedError(f"{self.name} 不支持 ETF 规模数据")

    # ==================== 资金流向 ====================

    @abstractmethod
    async def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向

        Returns:
            {
                "主力净流入-净额": float,  # 元
                "主力净流入-净占比": float,
                "中单净流入-净额": float,
                "小单净流入-净额": float,
                "日期": str,
                "source": str,
            }
        """
        ...

    @abstractmethod
    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        """获取板块资金流向

        Args:
            indicator: 时间维度 "今日"/"3日"/"5日"/"10日"

        Returns:
            [{"名称": str, "今日涨跌幅": float, "今日主力净流入-净额": float, ...}]
        """
        ...

    @abstractmethod
    async def get_northbound_flow(self) -> Dict:
        """获取北向资金流向（单位：亿元）

        Returns:
            {
                "date": str,
                "value": float,  # 总净流入（亿元）
                "shConnect": float,  # 沪股通
                "szConnect": float,  # 深股通
                "source": str,
                "unit": "亿元",
            }
        """
        ...

    @abstractmethod
    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """获取北向资金历史数据（单位：亿元）

        Returns:
            [{"date": str, "value": float, "shConnect": float, "szConnect": float}]
        """
        ...

    @abstractmethod
    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        """获取个股资金流向"""
        ...

    @abstractmethod
    async def get_margin_data(self) -> Dict:
        """获取融资融券数据"""
        ...

    async def get_market_fund_flow_rank(self) -> Dict:
        """获取大盘资金流向排名（超大单/大单/中单/小单）"""
        raise NotImplementedError(f"{self.name} 不支持资金排名数据")

    async def get_market_sentiment(self) -> Dict:
        """获取市场情绪指标"""
        raise NotImplementedError(f"{self.name} 不支持市场情绪数据")

    async def get_lhb_data(self) -> List[Dict]:
        """获取龙虎榜数据（可选实现）"""
        raise NotImplementedError(f"{self.name} 不支持龙虎榜数据")

    async def get_lhb_detail(self, date: str) -> List[Dict]:
        """获取指定日期龙虎榜详细数据（可选实现）"""
        raise NotImplementedError(f"{self.name} 不支持龙虎榜详细数据")

    async def get_market_volume_amplification(self, lookback_days: int = 20) -> Dict:
        """获取大盘成交额相对近期均值的放大倍数（可选实现）。"""
        raise NotImplementedError(f"{self.name} 不支持大盘成交额放大分析")

    # ==================== 新闻 ====================

    async def get_news(self, keyword: str = "财联社", limit: int = 50, api: str = "stock_news_em") -> pd.DataFrame:
        """获取新闻资讯（可选实现）

        Args:
            keyword: 新闻来源关键词或搜索关键词
            limit: 返回条数
            api: API接口名称（用于支持多个新闻接口的Provider）
        """
        raise NotImplementedError(f"{self.name} 不支持新闻数据")
