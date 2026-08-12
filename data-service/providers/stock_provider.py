"""
Stock Data Provider - 统一的股票数据提供者
支持国内外股票的财报、公告、K线、实时行情等数据获取
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging
import akshare as ak


class StockProvider:
    """股票数据提供者"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.domestic_providers = ['akshare', 'tushare']  # 国内股票数据源
        self.international_providers = ['yfinance']  # 国外股票数据源

    async def get_stock_info(self, symbol: str, market: str = 'cn') -> Optional[Dict[str, Any]]:
        """
        获取股票基本信息

        Args:
            symbol: 股票代码
            market: 市场类型 ('cn'=国内, 'us'=美股, 'hk'=港股等)

        Returns:
            股票基本信息字典
        """
        try:
            if market == 'cn':
                return await self._get_cn_stock_info(symbol)
            elif market == 'us':
                return await self._get_us_stock_info(symbol)
            elif market == 'hk':
                return await self._get_hk_stock_info(symbol)
            else:
                raise ValueError(f"Unsupported market: {market}")
        except Exception as e:
            self.logger.error(f"Error getting stock info for {symbol}: {e}")
            return None

    async def get_financial_report(
        self,
        symbol: str,
        report_type: str = 'balance',
        market: str = 'cn'
    ) -> Optional[List[Dict[str, Any]]]:
        """
        获取财报数据

        Args:
            symbol: 股票代码
            report_type: 报表类型 ('balance'=资产负债表, 'income'=利润表, 'cashflow'=现金流量表)
            market: 市场类型

        Returns:
            财报数据列表
        """
        try:
            if market == 'cn':
                if report_type == 'balance':
                    df = ak.stock_financial_report_sina(stock=symbol, symbol="资产负债表")
                elif report_type == 'income':
                    df = ak.stock_financial_report_sina(stock=symbol, symbol="利润表")
                elif report_type == 'cashflow':
                    df = ak.stock_financial_report_sina(stock=symbol, symbol="现金流量表")
                else:
                    raise ValueError(f"Unsupported report type: {report_type}")

                return df.to_dict('records') if not df.empty else []
            else:
                # TODO: 实现其他市场的财报数据获取
                return []
        except Exception as e:
            self.logger.error(f"Error getting financial report for {symbol}: {e}")
            return None

    async def get_announcements(
        self,
        symbol: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        market: str = 'cn'
    ) -> Optional[List[Dict[str, Any]]]:
        """
        获取公司公告

        Args:
            symbol: 股票代码
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
            market: 市场类型

        Returns:
            公告列表
        """
        try:
            if market == 'cn':
                # 使用东方财富的公告数据
                df = ak.stock_notice_report(symbol=symbol)

                # 日期过滤
                if start_date:
                    df = df[df['公告日期'] >= start_date]
                if end_date:
                    df = df[df['公告日期'] <= end_date]

                return df.to_dict('records') if not df.empty else []
            else:
                # TODO: 实现其他市场的公告数据获取
                return []
        except Exception as e:
            self.logger.error(f"Error getting announcements for {symbol}: {e}")
            return None

    async def get_kline(
        self,
        symbol: str,
        period: str = 'daily',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        market: str = 'cn',
        adjust: str = 'qfq'
    ) -> Optional[List[Dict[str, Any]]]:
        """
        获取K线数据

        Args:
            symbol: 股票代码
            period: 周期 ('daily'=日K, 'weekly'=周K, 'monthly'=月K, 'minute'=分钟级)
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
            market: 市场类型
            adjust: 复权类型 ('qfq'=前复权, 'hfq'=后复权, ''=不复权)

        Returns:
            K线数据列表
        """
        try:
            if market == 'cn':
                if period == 'daily':
                    df = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start_date,
                                           end_date=end_date, adjust=adjust)
                elif period == 'weekly':
                    df = ak.stock_zh_a_hist(symbol=symbol, period="weekly", start_date=start_date,
                                           end_date=end_date, adjust=adjust)
                elif period == 'monthly':
                    df = ak.stock_zh_a_hist(symbol=symbol, period="monthly", start_date=start_date,
                                           end_date=end_date, adjust=adjust)
                else:
                    raise ValueError(f"Unsupported period: {period}")

                return df.to_dict('records') if not df.empty else []
            else:
                # TODO: 实现其他市场的K线数据获取
                return []
        except Exception as e:
            self.logger.error(f"Error getting kline for {symbol}: {e}")
            return None

    async def get_realtime_quote(
        self,
        symbols: List[str],
        market: str = 'cn'
    ) -> Optional[List[Dict[str, Any]]]:
        """
        获取实时行情

        Args:
            symbols: 股票代码列表
            market: 市场类型

        Returns:
            实时行情列表
        """
        try:
            if market == 'cn':
                # 获取实时行情
                df = ak.stock_zh_a_spot_em()

                # 过滤指定股票
                if symbols:
                    df = df[df['代码'].isin(symbols)]

                return df.to_dict('records') if not df.empty else []
            else:
                # TODO: 实现其他市场的实时行情获取
                return []
        except Exception as e:
            self.logger.error(f"Error getting realtime quote: {e}")
            return None

    async def _get_cn_stock_info(self, symbol: str) -> Dict[str, Any]:
        """获取国内股票基本信息"""
        try:
            # 从实时行情中获取基本信息
            df = ak.stock_individual_info_em(symbol=symbol)
            return df.to_dict('records')[0] if not df.empty else {}
        except Exception as e:
            self.logger.error(f"Error getting CN stock info: {e}")
            return {}

    async def _get_us_stock_info(self, symbol: str) -> Dict[str, Any]:
        """获取美股基本信息"""
        # TODO: 使用yfinance或其他数据源实现
        return {}

    async def _get_hk_stock_info(self, symbol: str) -> Dict[str, Any]:
        """获取港股基本信息"""
        # TODO: 使用akshare港股接口实现
        return {}
