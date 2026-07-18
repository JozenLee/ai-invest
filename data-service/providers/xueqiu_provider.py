# 雪球数据提供者
# 通过雪球公开 API 获取行情数据
# 作为 AKShare 的补充数据源，主要用于实时行情

import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
import pandas as pd

from providers.base import DataProvider

# 雪球 API 配置
XUEQIU_BASE = "https://stock.xueqiu.com"
XUEQIU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://xueqiu.com/",
    "Origin": "https://xueqiu.com",
}


class XueqiuProvider(DataProvider):
    """雪球数据提供者

    通过雪球公开 API 获取实时行情数据。
    仅支持实时行情查询，不支持历史数据和资金流向。
    """

    name = "xueqiu"

    def __init__(self):
        self._cookie_jar: Optional[httpx.Cookies] = None

    async def _ensure_cookie(self) -> httpx.Cookies:
        """确保有有效的雪球 cookie"""
        if self._cookie_jar:
            return self._cookie_jar

        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                headers={"User-Agent": XUEQIU_HEADERS["User-Agent"]},
            ) as client:
                resp = await client.get("https://xueqiu.com/")
                self._cookie_jar = resp.cookies
                return self._cookie_jar
        except Exception as e:
            print(f"[Xueqiu] 获取 cookie 失败: {e}")
            return httpx.Cookies()

    async def _fetch_quote(self, symbols: List[str]) -> List[Dict]:
        """获取行情数据（底层方法）"""
        cookies = await self._ensure_cookie()
        params = {
            "code": ",".join(symbols),
            "_": str(int(time.time() * 1000)),
        }

        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers=XUEQIU_HEADERS,
            cookies=cookies,
        ) as client:
            resp = await client.get(f"{XUEQIU_BASE}/v5/stock/batch/quote.json", params=params)

        if resp.status_code != 200:
            raise Exception(f"雪球 API HTTP 错误: {resp.status_code}")

        data = resp.json()
        if data.get("error_code") != 0:
            self._cookie_jar = None  # 清除 cookie，下次重新获取
            raise Exception(f"雪球 API 错误: {data.get('error_description', '未知错误')}")

        items = data.get("data", {}).get("items", [])
        result = []
        for item in items:
            quote = item.get("quote", {})
            result.append({
                "symbol": quote.get("symbol", ""),
                "name": quote.get("name", ""),
                "current": float(quote.get("current", 0)),
                "percent": float(quote.get("percent", 0)),
                "chg": float(quote.get("chg", 0)),
                "volume": float(quote.get("volume", 0)),
                "amount": float(quote.get("amount", 0)),
                "high": float(quote.get("high", 0)),
                "low": float(quote.get("low", 0)),
                "open": float(quote.get("open", 0)),
                "last_close": float(quote.get("last_close", 0)),
                "source": "xueqiu",
            })
        return result

    # ==================== 指数数据 ====================

    async def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照"""
        symbols = ["SH000001", "SZ399001", "SZ399006", "SH000688", "SH000300"]
        data = await self._fetch_quote(symbols)

        records = []
        for item in data:
            # 将雪球格式转换为统一格式
            xq_sym = item["symbol"]
            if xq_sym.startswith("SH"):
                ak_code = f"sh{xq_sym[2:]}"
            else:
                ak_code = f"sz{xq_sym[2:]}"

            records.append({
                "代码": ak_code,
                "名称": item["name"],
                "最新价": item["current"],
                "涨跌额": item["chg"],
                "涨跌幅": item["percent"],
                "成交量": item["volume"],
                "成交额": item["amount"],
            })

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """雪球不支持历史日K数据"""
        raise NotImplementedError("雪球不支持指数历史日K数据")

    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取指定指数实时行情

        Args:
            symbols: AKShare 格式代码列表，如 ["sh000001", "sz399001"]
        """
        # 转换为雪球格式
        xq_symbols = []
        for s in symbols:
            if s.startswith("sh"):
                xq_symbols.append(f"SH{s[2:]}")
            elif s.startswith("sz"):
                xq_symbols.append(f"SZ{s[2:]}")
            else:
                xq_symbols.append(s)

        data = await self._fetch_quote(xq_symbols)

        records = []
        for item in data:
            xq_sym = item["symbol"]
            if xq_sym.startswith("SH"):
                ak_code = f"sh{xq_sym[2:]}"
            else:
                ak_code = f"sz{xq_sym[2:]}"

            records.append({
                "代码": ak_code,
                "名称": item["name"],
                "最新价": item["current"],
                "涨跌额": item["chg"],
                "涨跌幅": item["percent"],
                "成交量": item["volume"],
                "成交额": item["amount"],
            })

        return pd.DataFrame(records) if records else pd.DataFrame()

    # ==================== 个股数据 ====================

    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        """获取个股实时行情快照

        Args:
            symbols: 股票代码列表，如 ["000001", "600519"]
        """
        # 转换为雪球格式
        xq_symbols = []
        for s in symbols:
            if s.startswith(("6", "5")):
                xq_symbols.append(f"SH{s}")
            else:
                xq_symbols.append(f"SZ{s}")

        data = await self._fetch_quote(xq_symbols)

        records = []
        for item in data:
            xq_sym = item["symbol"]
            records.append({
                "代码": xq_sym[2:],  # 去掉 SH/SZ 前缀
                "名称": item["name"],
                "最新价": item["current"],
                "涨跌额": item["chg"],
                "涨跌幅": item["percent"],
                "成交量": item["volume"],
                "成交额": item["amount"],
            })

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str,
                               adjust: str = "qfq") -> pd.DataFrame:
        """雪球不支持历史日K数据"""
        raise NotImplementedError("雪球不支持个股历史日K数据")

    # ==================== ETF 数据 ====================

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取ETF实时行情

        Args:
            symbols: ETF代码列表，如 ["510300", "159919"]
        """
        # 转换为雪球格式
        xq_symbols = []
        for s in symbols:
            if s.startswith("5"):
                xq_symbols.append(f"SH{s}")
            else:
                xq_symbols.append(f"SZ{s}")

        data = await self._fetch_quote(xq_symbols)

        records = []
        for item in data:
            xq_sym = item["symbol"]
            records.append({
                "代码": xq_sym[2:],
                "名称": item["name"],
                "最新价": item["current"],
                "涨跌幅": item["percent"],
                "成交量": item["volume"],
                "成交额": item["amount"],
            })

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """雪球不支持历史日K数据"""
        raise NotImplementedError("雪球不支持 ETF 历史日K数据")

    # ==================== 资金流向（不支持） ====================

    async def get_market_capital_flow(self) -> Dict:
        raise NotImplementedError("雪球不支持大盘资金流向数据")

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        raise NotImplementedError("雪球不支持板块资金流向数据")

    async def get_northbound_flow(self) -> Dict:
        raise NotImplementedError("雪球不支持北向资金数据")

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        raise NotImplementedError("雪球不支持北向资金历史数据")

    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        raise NotImplementedError("雪球不支持个股资金流向数据")

    async def get_margin_data(self) -> Dict:
        raise NotImplementedError("雪球不支持融资融券数据")
