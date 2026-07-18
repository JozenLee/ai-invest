# 新浪财经数据提供者
# 作为 AKShare (东方财富) 的备用数据源
# 目前仅支持板块资金流向（行业分类）

import asyncio
from datetime import datetime
from typing import Any, Dict, List

import pandas as pd
import requests

from providers.base import DataProvider


class SinaProvider(DataProvider):
    """新浪财经数据提供者（备用数据源）"""

    name = "sina"

    BASE_URL = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    TIMEOUT = 10

    @staticmethod
    async def _call(func, *args, **kwargs) -> Any:
        """在线程池中调用同步函数"""
        return await asyncio.to_thread(func, *args, **kwargs)

    def _fetch_sector_flow(self, ascending: bool = False, num: int = 100) -> List[Dict]:
        """获取行业板块资金流向（同步）

        使用 fenlei=0 获取行业板块（而非概念板块）
        """
        sort_order = 1 if ascending else 0
        url = (
            f"{self.BASE_URL}/MoneyFlow.ssl_bkzj_bk"
            f"?page=1&num={num}&sort=netamount&asc={sort_order}&fenlei=0"
        )
        r = requests.get(url, headers=self.HEADERS, timeout=self.TIMEOUT, verify=False)
        r.raise_for_status()
        data = r.json()

        # fenlei=0 返回行业板块，category 格式为 "new_xxx"
        # 过滤掉非行业数据
        industries = [d for d in data if d.get("category", "").startswith("new_")]
        return industries

    # ==================== 指数数据（不支持）====================

    async def get_index_spot(self) -> pd.DataFrame:
        raise NotImplementedError("sina 不支持指数实时行情")

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError("sina 不支持指数日K数据")

    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError("sina 不支持指定指数实时行情")

    # ==================== 个股数据（不支持）====================

    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError("sina 不支持个股实时行情")

    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str, adjust: str = "qfq") -> pd.DataFrame:
        raise NotImplementedError("sina 不支持个股日K数据")

    # ==================== ETF 数据（不支持）====================

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError("sina 不支持 ETF 实时行情")

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError("sina 不支持 ETF 日K数据")

    # ==================== 资金流向 ====================

    async def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向（通过行业汇总估算）"""
        data = await self._call(self._fetch_sector_flow, ascending=False, num=100)
        if not data:
            raise Exception("新浪行业资金流向数据为空")

        total_net = sum(float(d.get("netamount", 0)) for d in data)
        total_in = sum(float(d.get("inamount", 0)) for d in data)
        total_out = sum(float(d.get("outamount", 0)) for d in data)

        main_net = total_net
        if total_in > 0:
            retail_ratio = min(0.4, max(0.2, 1 - (total_net / total_in)))
        else:
            retail_ratio = 0.3
        retail_net = -main_net * retail_ratio

        return {
            "主力净流入-净额": main_net,
            "主力净流入-净占比": round(total_net / (total_in + total_out) * 100, 2) if (total_in + total_out) > 0 else 0,
            "中单净流入-净额": retail_net * 0.6,
            "小单净流入-净额": retail_net * 0.4,
            "日期": datetime.now().strftime("%Y-%m-%d"),
            "source": "sina_industry",
            "dataQuality": "estimated",
        }

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        """获取板块资金流向（行业分类）

        返回所有行业板块数据，按净额降序排序
        单位：今日主力净流入-净额 为 元（与 AKShare 一致）
        """
        data = await self._call(self._fetch_sector_flow, ascending=False, num=100)
        if not data:
            raise Exception("新浪行业资金流向数据为空")

        result = []
        for item in data:
            # 新浪 netamount 单位为元，直接使用
            net_amount = float(item.get("netamount", 0))
            changeratio = float(item.get("avg_changeratio", 0)) * 100
            result.append({
                "名称": item.get("name", ""),
                "今日涨跌幅": round(changeratio, 2),
                "今日主力净流入-净额": net_amount,
                # 保留原始数据供调试
                "_source": "sina",
                "_inamount": float(item.get("inamount", 0)),
                "_outamount": float(item.get("outamount", 0)),
            })

        # 按净额降序排序，确保top10选择正确
        result.sort(key=lambda x: x.get("今日主力净流入-净额", 0), reverse=True)
        return result

    async def get_northbound_flow(self) -> Dict:
        """北向资金（新浪不支持，抛出异常让 registry 降级）"""
        raise NotImplementedError("sina 不支持北向资金数据")

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """北向资金历史（新浪不支持）"""
        raise NotImplementedError("sina 不支持北向资金历史数据")

    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        """个股资金流向（新浪不支持）"""
        raise NotImplementedError("sina 不支持个股资金流向")

    async def get_margin_data(self) -> Dict:
        """融资融券数据（新浪不支持）"""
        raise NotImplementedError("sina 不支持融资融券数据")

    async def get_market_fund_flow_rank(self) -> Dict:
        """大盘资金流向排名（新浪不支持）"""
        raise NotImplementedError("sina 不支持资金排名数据")
