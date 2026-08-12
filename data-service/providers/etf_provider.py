# ETF数据提供者
# 提供ETF持仓明细和基本信息查询功能

import asyncio
import akshare as ak
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class ETFProvider:
    """ETF数据提供者

    注意：AKShare API已更新，部分历史接口不再可用
    - 基本信息：使用 fund_etf_spot_em() 获取实时行情和基础数据
    - 持仓明细：当前AKShare未提供公开接口，返回空列表并记录警告
    """

    def __init__(self):
        self._etf_cache = {}  # 缓存ETF列表数据

    async def _get_all_etf_data(self) -> Dict[str, Dict]:
        """获取所有ETF的实时数据并缓存"""
        try:
            if self._etf_cache:
                return self._etf_cache

            logger.info("正在获取所有ETF实时数据...")
            df = await asyncio.to_thread(ak.fund_etf_spot_em)

            if df is None or df.empty:
                logger.warning("ETF实时数据为空")
                return {}

            # 转换为字典格式，以代码为键
            for _, row in df.iterrows():
                ticker = str(row.get('代码', ''))
                if ticker:
                    self._etf_cache[ticker] = row.to_dict()

            logger.info(f"成功缓存 {len(self._etf_cache)} 个ETF数据")
            return self._etf_cache

        except Exception as e:
            logger.error(f"获取ETF数据失败: {e}")
            return {}

    async def get_holdings(self, ticker: str) -> List[Dict]:
        """
        获取ETF持仓明细

        Args:
            ticker: ETF代码，如 "512480"

        Returns:
            持仓列表，包含股票代码、名称、持仓占比等信息

        注意：当前AKShare未提供ETF持仓明细的公开接口
        该功能需要：
        1. 东方财富等数据源提供付费API
        2. 或从基金公司官网爬取定期报告
        """
        logger.warning(f"ETF {ticker} 持仓明细功能暂不可用：AKShare未提供相关接口")
        logger.info("建议：使用东方财富付费API或爬取基金季报获取持仓数据")

        # 返回空列表，符合接口约定
        return []

    async def get_etf_holdings(self, ticker: str) -> List[Dict]:
        """获取ETF持仓明细的别名方法"""
        return await self.get_holdings(ticker)

    async def get_etf_info(self, ticker: str) -> Optional[Dict]:
        """
        获取ETF基本信息

        Args:
            ticker: ETF代码，如 "512480"

        Returns:
            ETF基本信息字典，包含代码、名称、类型、规模等
        """
        try:
            logger.info(f"正在获取ETF {ticker} 的基本信息...")

            # 从缓存或实时数据中获取
            etf_data = await self._get_all_etf_data()

            if ticker not in etf_data:
                logger.warning(f"ETF {ticker} 不在数据列表中")
                return None

            row = etf_data[ticker]

            # 构建返回结果
            result = {
                'ticker': ticker,
                'name': str(row.get('名称', '')),
                'latest_price': float(row.get('最新价', 0)),
                'change_pct': float(row.get('涨跌幅', 0)),
                'volume': float(row.get('成交量', 0)),
                'amount': float(row.get('成交额', 0)),
                'market_value': float(row.get('总市值', 0)),
                'shares': float(row.get('最新份额', 0)),
                'iopv': float(row.get('IOPV实时估值', 0)),
                'discount_rate': float(row.get('基金折价率', 0)),
                'data_date': str(row.get('数据日期', '')),
            }

            logger.info(f"成功获取ETF {ticker} 的基本信息: {result['name']}")
            return result

        except Exception as e:
            logger.error(f"获取ETF {ticker} 基本信息失败: {e}")
            return None
