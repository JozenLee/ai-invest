"""
Fallback Data Provider - 备用数据提供者
当主数据源失败时，使用实时数据构造分析所需的数据结构
"""
from typing import Optional, List, Dict, Any
import logging
import akshare as ak


class FallbackProvider:
    """备用数据提供者 - 使用实时数据"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._etf_cache = None  # 缓存所有ETF数据
        self._stock_cache = None  # 缓存所有股票数据

    async def _get_all_etf_cache(self) -> Dict[str, Any]:
        """获取并缓存所有ETF数据"""
        if self._etf_cache is not None:
            return self._etf_cache

        try:
            self.logger.info("Loading ETF spot data cache...")
            df = ak.fund_etf_spot_em()
            self._etf_cache = {}

            for _, row in df.iterrows():
                code = str(row.get('代码', ''))
                if code:
                    self._etf_cache[code] = row.to_dict()

            self.logger.info(f"Cached {len(self._etf_cache)} ETFs")
            return self._etf_cache
        except Exception as e:
            self.logger.error(f"Error loading ETF cache: {e}")
            return {}

    async def _get_all_stock_cache(self) -> Dict[str, Any]:
        """获取并缓存所有股票/指数数据"""
        if self._stock_cache is not None:
            return self._stock_cache

        try:
            self.logger.info("Loading stock/index spot data cache...")
            df = ak.stock_zh_a_spot_em()
            self._stock_cache = {}

            for _, row in df.iterrows():
                code = str(row.get('代码', ''))
                if code:
                    self._stock_cache[code] = row.to_dict()

            self.logger.info(f"Cached {len(self._stock_cache)} stocks/indices")
            return self._stock_cache
        except Exception as e:
            self.logger.error(f"Error loading stock cache: {e}")
            return {}

    async def get_etf_spot_data(self, code: str) -> Optional[Dict[str, Any]]:
        """
        获取ETF实时数据并转换为类K线格式

        Args:
            code: ETF代码

        Returns:
            包含实时数据的字典，模拟K线格式
        """
        try:
            etf_cache = await self._get_all_etf_cache()

            if code not in etf_cache:
                self.logger.warning(f"ETF {code} not found in cache")
                return None

            row = etf_cache[code]

            # 构造类K线数据（单日数据点）
            kline_data = {
                "日期": str(row.get("数据日期", "")).split()[0],
                "开盘": float(row.get("开盘价", 0)),
                "收盘": float(row.get("最新价", 0)),
                "最高": float(row.get("最高价", 0)),
                "最低": float(row.get("最低价", 0)),
                "成交量": float(row.get("成交量", 0)),
                "成交额": float(row.get("成交额", 0)),
                "振幅": float(row.get("振幅", 0)),
                "涨跌幅": float(row.get("涨跌幅", 0)),
                "涨跌额": float(row.get("涨跌额", 0)),
                "换手率": float(row.get("换手率", 0)),
            }

            # ETF基本信息
            info = {
                "基金简称": str(row.get("名称", "")),
                "基金代码": code,
                "最新份额": float(row.get("最新份额", 0)),
                "流通市值": float(row.get("流通市值", 0)),
                "总市值": float(row.get("总市值", 0)),
            }

            return {
                "code": code,
                "info": info,
                "kline": [kline_data],  # 单日数据作为列表
                "spot_data": row,  # 完整实时数据
                "is_fallback": True,  # 标记为备用数据
            }

        except Exception as e:
            self.logger.error(f"Error getting ETF spot data for {code}: {e}")
            return None

    async def get_index_spot_data(self, code: str) -> Optional[Dict[str, Any]]:
        """
        获取指数实时数据

        Args:
            code: 指数代码

        Returns:
            包含实时数据的字典
        """
        try:
            # 使用股票实时行情缓存获取指数数据（指数也在这个接口中）
            stock_cache = await self._get_all_stock_cache()

            if code not in stock_cache:
                self.logger.warning(f"Index {code} not found in cache")
                return None

            row = stock_cache[code]

            # 构造类K线数据
            kline_data = {
                "日期": str(row.get("最新交易日", "")).split()[0] if "最新交易日" in row else "",
                "开盘": float(row.get("今开", 0)),
                "收盘": float(row.get("最新价", 0)),
                "最高": float(row.get("最高", 0)),
                "最低": float(row.get("最低", 0)),
                "成交量": float(row.get("成交量", 0)),
                "成交额": float(row.get("成交额", 0)),
                "涨跌幅": float(row.get("涨跌幅", 0)),
                "涨跌额": float(row.get("涨跌额", 0)),
            }

            return {
                "code": code,
                "kline": [kline_data],  # 单日数据作为列表
                "spot_data": row,
                "is_fallback": True,
            }

        except Exception as e:
            self.logger.error(f"Error getting index spot data for {code}: {e}")
            return None

    async def get_multiple_etf_spot_data(
        self, codes: List[str]
    ) -> List[Dict[str, Any]]:
        """
        批量获取ETF实时数据

        Args:
            codes: ETF代码列表

        Returns:
            ETF数据列表
        """
        results = []
        for code in codes:
            data = await self.get_etf_spot_data(code)
            if data:
                results.append(data)
        return results
