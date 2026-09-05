"""Optional OpenBB adapter for international equity data.

OpenBB is intentionally imported lazily so the data service can run without
the optional dependency. The adapter only reports data when OpenBB returns
non-empty records.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional


class OpenBBProvider:
    name = "openbb"

    def __init__(self) -> None:
        self.logger = logging.getLogger(__name__)
        self.enabled = os.getenv("OPENBB_ENABLED", "true").lower() == "true"
        self._obb = None
        if not self.enabled:
            return
        try:
            from openbb import obb

            self._obb = obb
        except ImportError:
            self.logger.info("OpenBB 未安装，跳过可选国际数据源")
        except Exception as error:
            self.logger.warning("OpenBB 初始化失败，将禁用该可选数据源: %s", error)
            self._obb = None

    @property
    def available(self) -> bool:
        if not self.enabled:
            return False
        if self._obb is not None:
            return True
        import importlib.util
        return importlib.util.find_spec('yfinance') is not None

    @staticmethod
    def _records(result: Any) -> List[Dict[str, Any]]:
        if result is None:
            return []
        try:
            frame = result.to_df() if hasattr(result, "to_df") else result
            if hasattr(frame, "to_dict"):
                return frame.to_dict("records")
            if isinstance(frame, list):
                return [item for item in frame if isinstance(item, dict)]
        except Exception:
            return []
        return []

    async def get_stock_info(self, symbol: str, market: str) -> Optional[Dict[str, Any]]:
        if not self.available or market not in {"us", "hk"}:
            return None
        if self._obb is None:
            return await self._yfinance_info(symbol)

        def load() -> Optional[Dict[str, Any]]:
            result = self._obb.equity.profile(symbol=symbol, provider="yfinance")
            records = self._records(result)
            return records[0] if records else None

        try:
            return await asyncio.to_thread(load)
        except Exception as error:
            self.logger.warning("OpenBB基本信息失败，尝试直接 yfinance: %s", error)
            return await self._yfinance_info(symbol)

    async def get_kline(
        self,
        symbol: str,
        start_date: Optional[str],
        end_date: Optional[str],
        market: str,
    ) -> Optional[List[Dict[str, Any]]]:
        if not self.available or market not in {"us", "hk"}:
            return None
        if self._obb is None:
            return await self._yfinance_history(symbol, start_date, end_date)

        def load() -> List[Dict[str, Any]]:
            result = self._obb.equity.price.historical(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                provider="yfinance",
            )
            return self._records(result)

        try:
            records = await asyncio.to_thread(load)
            return records or None
        except Exception as error:
            self.logger.warning("OpenBB历史行情失败，尝试直接 yfinance: %s", error)
            return await self._yfinance_history(symbol, start_date, end_date)

    async def get_quote(self, symbol: str, market: str):
        if not self.available:
            return None
        def load():
            # get_info exposes the exchange's quote timestamp; do not label a
            # delayed or previous-close quote with the request time.
            import yfinance as yf
            row = yf.Ticker(symbol).get_info()
            timestamp = row.get('regularMarketTime')
            price = row.get('regularMarketPrice')
            if not timestamp or not price:
                return None
            date = datetime.fromtimestamp(timestamp, timezone.utc).astimezone(ZoneInfo('Asia/Hong_Kong' if market == 'hk' else 'America/New_York')).strftime('%Y-%m-%d')
            previous = row.get('regularMarketPreviousClose')
            return {'date': date, 'close': price, 'open': row.get('regularMarketOpen'), 'high': row.get('regularMarketDayHigh'), 'low': row.get('regularMarketDayLow'), 'volume': row.get('regularMarketVolume'), 'previousClose': previous, 'changePct': (price / previous - 1) * 100 if previous else None, 'currency': row.get('currency'), 'source': 'yfinance_quote'}
        try:
            return await asyncio.to_thread(load)
        except Exception as error:
            self.logger.info('国际最新行情暂不可用 %s: %s', symbol, type(error).__name__)
            return None

    async def get_financial_report(
        self,
        symbol: str,
        report_type: str,
        market: str,
    ) -> Optional[List[Dict[str, Any]]]:
        if not self.available or market not in {"us", "hk"}:
            return None
        if self._obb is None:
            return await self._yfinance_income(symbol, report_type)

        def load() -> List[Dict[str, Any]]:
            method = {'income': self._obb.equity.fundamental.income, 'balance': self._obb.equity.fundamental.balance, 'cashflow': self._obb.equity.fundamental.cash} .get(report_type, self._obb.equity.fundamental.income)
            result = method(
                symbol=symbol,
                provider="yfinance",
            )
            return self._records(result)

        try:
            records = await asyncio.to_thread(load)
            return records or None
        except Exception as error:
            self.logger.warning("OpenBB财报失败，尝试直接 yfinance: %s", error)
            return await self._yfinance_income(symbol, report_type)

    async def get_announcements(
        self,
        symbol: str,
        start_date: Optional[str],
        end_date: Optional[str],
        market: str,
    ) -> Optional[List[Dict[str, Any]]]:
        if not self.available or market not in {"us", "hk"}:
            return None
        if self._obb is None:
            return await self._yfinance_news(symbol, start_date, end_date)

        def load() -> List[Dict[str, Any]]:
            result = self._obb.news.company(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                limit=100,
                provider="yfinance",
            )
            records = self._records(result)
            normalized: List[Dict[str, Any]] = []
            for row in records:
                title = row.get('title') or row.get('headline') or row.get('name')
                if not title:
                    continue
                normalized.append({
                    'title': str(title),
                    'date': str(row.get('published') or row.get('date') or row.get('created') or ''),
                    'url': str(row.get('url') or row.get('link') or ''),
                    'source': 'openbb_yfinance_news',
                    'content': row.get('summary') or row.get('text') or row.get('content'),
                    'event_type': '公司新闻（非交易所公告）',
                })
            return normalized

        try:
            records = await asyncio.to_thread(load)
            if records:
                return records
            return await self._yfinance_news(symbol, start_date, end_date)
        except Exception as error:
            self.logger.warning("OpenBB公司新闻/公告失败 %s: %s", symbol, error)
            return await self._yfinance_news(symbol, start_date, end_date)

    async def _yfinance_news(
        self,
        symbol: str,
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> Optional[List[Dict[str, Any]]]:
        """OpenBB provider 失败时，直接读取 yfinance 的公司新闻。"""
        try:
            import yfinance as yf

            def load() -> List[Dict[str, Any]]:
                rows = yf.Ticker(symbol).news or []
                normalized: List[Dict[str, Any]] = []
                for row in rows:
                    content = row.get('content') or row
                    title = content.get('title') or row.get('title')
                    if not title:
                        continue
                    raw_date = content.get('pubDate') or row.get('providerPublishTime') or ''
                    if isinstance(raw_date, (int, float)):
                        date = datetime.fromtimestamp(raw_date).strftime('%Y-%m-%d')
                    else:
                        date = str(raw_date)[:10]
                    if start_date and date and date < start_date:
                        continue
                    if end_date and date and date > end_date:
                        continue
                    canonical = content.get('canonicalUrl') or {}
                    url = canonical.get('url') if isinstance(canonical, dict) else canonical
                    normalized.append({
                        'title': str(title),
                        'date': date,
                        'url': str(url or ''),
                        'source': 'yfinance_news',
                        'content': content.get('summary') or content.get('description'),
                        'event_type': '公司新闻（非交易所公告）',
                    })
                return normalized

            records = await asyncio.to_thread(load)
            return records or None
        except Exception as error:
            self.logger.warning("直接 yfinance 公司新闻失败 %s: %s", symbol, error)
            return None

    async def _yfinance_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        try:
            import yfinance as yf

            return await asyncio.to_thread(lambda: yf.Ticker(symbol).info or None)
        except Exception as error:
            self.logger.warning("直接 yfinance基本信息失败: %s", error)
            return None

    async def _yfinance_history(
        self,
        symbol: str,
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> Optional[List[Dict[str, Any]]]:
        try:
            import yfinance as yf

            def load() -> List[Dict[str, Any]]:
                frame = yf.Ticker(symbol).history(
                    start=start_date,
                    end=end_date,
                    auto_adjust=False,
                )
                if frame.empty:
                    return []
                frame = frame.reset_index()
                return frame.to_dict("records")

            records = await asyncio.to_thread(load)
            return records or None
        except Exception as error:
            self.logger.warning("直接 yfinance历史行情失败: %s", error)
            return None

    async def _yfinance_income(self, symbol: str, report_type: str = 'income') -> Optional[List[Dict[str, Any]]]:
        try:
            import yfinance as yf

            def load() -> List[Dict[str, Any]]:
                ticker = yf.Ticker(symbol)
                frame = {'income': lambda: ticker.quarterly_income_stmt, 'balance': lambda: ticker.quarterly_balance_sheet, 'cashflow': lambda: ticker.quarterly_cashflow}.get(report_type, lambda: ticker.quarterly_income_stmt)()
                if frame is None or frame.empty:
                    return []
                records: List[Dict[str, Any]] = []
                for period in frame.columns:
                    row = frame[period].to_dict()
                    records.append(
                        {
                            **row,
                            "period": str(period),
                            'source': 'yfinance',
                            'reportType': report_type,
                            "revenue": row.get("Total Revenue") or row.get("Operating Revenue"),
                            "net_income": row.get("Net Income") or row.get("Net Income Common Stockholders"),
                        }
                    )
                return records

            records = await asyncio.to_thread(load)
            return records or None
        except Exception as error:
            self.logger.warning("直接 yfinance财报失败: %s", error)
            return None
