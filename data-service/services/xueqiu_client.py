# 雪球数据客户端
# 通过雪球公开 API 获取行情数据（需要访问首页获取 cookie）
# 作为 AKShare 的补充数据源

import httpx
import time
import json
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# 雪球 API 基础配置
XUEQIU_BASE = "https://stock.xueqiu.com"
XUEQIU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://xueqiu.com/",
    "Origin": "https://xueqiu.com",
}


class XueqiuClient:
    """雪球数据客户端"""

    def __init__(self):
        self._memory_cache: Dict[str, Any] = {}
        self._memory_cache_ttl: Dict[str, datetime] = {}
        self._cookie_jar: Optional[httpx.Cookies] = None

    def _get_cache(self, key: str) -> Optional[Any]:
        if key in self._memory_cache:
            if datetime.now() < self._memory_cache_ttl.get(key, datetime.min):
                return self._memory_cache[key]
        return None

    def _set_cache(self, key: str, data: Any, ttl_seconds: int = 300):
        self._memory_cache[key] = data
        self._memory_cache_ttl[key] = datetime.now() + timedelta(seconds=ttl_seconds)

    async def _ensure_cookie(self) -> httpx.Cookies:
        """确保有有效的雪球 cookie"""
        if self._cookie_jar:
            return self._cookie_jar

        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                headers={"User-Agent": XUEQIU_HEADERS["User-Agent"]}
            ) as client:
                resp = await client.get("https://xueqiu.com/")
                self._cookie_jar = resp.cookies
                return self._cookie_jar
        except Exception as e:
            print(f"获取雪球cookie失败: {e}")
            return httpx.Cookies()

    async def get_index_realtime(self, symbols: List[str]) -> List[Dict]:
        """获取指数实时行情

        Args:
            symbols: 雪球格式的指数代码列表，如 ["SH000001", "SZ399001"]

        Returns:
            [{"symbol": "SH000001", "name": "上证指数", "current": 3200.0, "percent": 1.5, ...}]
        """
        cache_key = f"xueqiu_index_{','.join(symbols)}"
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        try:
            cookies = await self._ensure_cookie()
            params = {
                "code": ",".join(symbols),
                "_": str(int(time.time() * 1000))
            }

            async with httpx.AsyncClient(
                timeout=15,
                follow_redirects=True,
                headers=XUEQIU_HEADERS,
                cookies=cookies
            ) as client:
                resp = await client.get(
                    f"{XUEQIU_BASE}/v5/stock/batch/quote.json",
                    params=params
                )

            if resp.status_code == 200:
                data = resp.json()
                if data.get("error_code") != 0:
                    print(f"雪球API错误: {data.get('error_description', '未知错误')}")
                    # 清除 cookie，下次重新获取
                    self._cookie_jar = None
                    return []

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
                        "source": "xueqiu"
                    })
                if result:
                    self._set_cache(cache_key, result, ttl_seconds=60)
                return result
        except Exception as e:
            print(f"雪球指数行情失败: {e}")

        return []

    async def get_stock_realtime(self, symbols: List[str]) -> List[Dict]:
        """获取个股实时行情

        Args:
            symbols: 雪球格式的股票代码列表，如 ["SH600519", "SZ000001"]
        """
        cache_key = f"xueqiu_stock_{','.join(symbols)}"
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        try:
            cookies = await self._ensure_cookie()
            params = {
                "code": ",".join(symbols),
                "_": str(int(time.time() * 1000))
            }

            async with httpx.AsyncClient(
                timeout=15,
                follow_redirects=True,
                headers=XUEQIU_HEADERS,
                cookies=cookies
            ) as client:
                resp = await client.get(
                    f"{XUEQIU_BASE}/v5/stock/batch/quote.json",
                    params=params
                )

            if resp.status_code == 200:
                data = resp.json()
                if data.get("error_code") != 0:
                    self._cookie_jar = None
                    return []

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
                        "source": "xueqiu"
                    })
                if result:
                    self._set_cache(cache_key, result, ttl_seconds=60)
                return result
        except Exception as e:
            print(f"雪球个股行情失败: {e}")

        return []

    async def get_etf_realtime(self, symbols: List[str]) -> List[Dict]:
        """获取 ETF 实时行情（雪球 ETF 代码格式如 SH510300）"""
        return await self.get_stock_realtime(symbols)


# 全局单例
xueqiu_client = XueqiuClient()
