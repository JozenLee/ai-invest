"""
Stock Data Provider - 统一的股票数据提供者
支持国内外股票的财报、公告、K线、实时行情等数据获取
"""
from typing import Optional, List, Dict, Any
import logging
import os
import asyncio
from datetime import datetime, timedelta

import requests

try:
    import akshare as ak
except ImportError:
    ak = None

from providers.openbb_provider import OpenBBProvider
from providers.tushare_provider import TushareProvider


class StockProvider:
    """股票数据提供者"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.domestic_providers = ['tushare', 'eastmoney_direct', 'akshare']
        self.international_providers = ['openbb']
        self.openbb = OpenBBProvider()
        self.tushare = TushareProvider()
        self.timeout_seconds = max(1, int(os.getenv('STOCK_PROVIDER_TIMEOUT_SECONDS', '20')))

    def capabilities(self) -> Dict[str, Any]:
        return {
            'eastmoney_direct': {
                'available': True,
                'markets': ['cn'],
                'datasets': ['kline', 'announcements'],
            },
            'akshare': {
                'available': ak is not None,
                'markets': ['cn'],
                'datasets': ['info', 'kline', 'financial', 'announcements'],
            },
            'tushare': {
                'available': self.tushare.available,
                'markets': ['cn'] if self.tushare.available else [],
                'datasets': ['kline', 'financial', 'announcements'],
            },
            'openbb': {
                'available': self.openbb.available,
                'markets': ['us', 'hk'] if self.openbb.available else [],
                'datasets': ['info', 'kline', 'financial', 'announcements'],
            },
        }

    async def get_stock_info(self, symbol: str, market: str = 'cn') -> Optional[Dict[str, Any]]:
        """
        获取股票基本信息

        Args:
            symbol: 股票代码
            market: 市场类型 ('cn'=国内, 'us'=美股, 'hk'=港股等)

        Returns:
            股票基本信息字典
        """
        if market == 'cn':
            tushare_info = await self._get_tushare_stock_info(symbol)
            if tushare_info:
                return tushare_info
            if ak is not None:
                return await self._get_cn_stock_info(symbol.split('.')[0])
            return {}
        return await self.openbb.get_stock_info(symbol, market)

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
        if market == 'cn':
            # 优先使用 Tushare，失败时降级到 AKShare
            tushare_data = await self._get_tushare_financial_report(symbol, report_type)
            if tushare_data:
                return tushare_data
            # 降级到 AKShare
            return await self._get_akshare_financial_report(symbol, report_type)
        return await self.openbb.get_financial_report(symbol, report_type, market)

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
        if market == 'cn':
            # 优先使用AKShare获取公告，Tushare anns_d接口不稳定
            akshare_rows = await self._get_akshare_announcements(symbol, start_date, end_date)
            if akshare_rows:
                return akshare_rows
            # 降级到东方财富
            return await self._get_eastmoney_announcements(symbol, start_date, end_date)
        return await self.openbb.get_announcements(symbol, start_date, end_date, market)

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
        if market == 'cn':
            if not self.tushare.available:
                return await self._get_eastmoney_kline(symbol, period, start_date, end_date, adjust)
            try:
                frame = await self.tushare.get_stock_kline(
                    symbol,
                    period=period,
                    start_date=self._tushare_date(start_date),
                    end_date=self._tushare_date(end_date),
                )
                if frame is not None and not frame.empty:
                    return frame.to_dict('records')
            except Exception as error:
                self.logger.warning("Tushare行情失败，切换东方财富 %s: %s", symbol, error)
            return await self._get_eastmoney_kline(symbol, period, start_date, end_date, adjust)
        return await self.openbb.get_kline(symbol, start_date, end_date, market)

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
        if market == 'cn':
            if not self.tushare.available:
                return []
            frame = await self.tushare.get_stock_spot(symbols)
            return frame.to_dict('records') if frame is not None and not frame.empty else []
        return None

    async def _get_cn_stock_info(self, symbol: str) -> Dict[str, Any]:
        """获取国内股票基本信息"""
        try:
            # 从实时行情中获取基本信息
            df = ak.stock_individual_info_em(symbol=symbol)
            if df.empty:
                return {}
            # AKShare 返回的是"item/value"纵表，旧逻辑只取第一行，导致 PE/PB 等字段全部被丢弃。
            if {'item', 'value'}.issubset({str(column).lower() for column in df.columns}):
                columns = {str(column).lower(): column for column in df.columns}
                return {
                    str(row.get(columns['item'])): row.get(columns['value'])
                    for row in df.to_dict('records')
                    if row.get(columns['item']) not in (None, '')
                }
            return df.to_dict('records')[0]
        except Exception as e:
            self.logger.error(f"Error getting CN stock info: {e}")
            return {}

    @staticmethod
    def _tushare_date(value: Optional[str]) -> str:
        """把分析器使用的 ISO 日期转换为 Tushare 所需的 YYYYMMDD。"""
        return str(value or '').replace('-', '')

    async def _get_tushare_stock_info(self, symbol: str) -> Dict[str, Any]:
        """通过 Tushare stock_basic 获取个股基础信息。"""
        if not self.tushare.available:
            return {}
        try:
            ts_code = self.tushare._to_ts_code(
                symbol,
                default_market='SZ' if symbol.startswith(('0', '2', '3')) else 'SH',
            )
            df = await self.tushare.request_dataframe('stock_basic', ts_code=ts_code)
            return df.to_dict('records')[0] if df is not None and not df.empty else {}
        except Exception as error:
            self.logger.warning("Tushare基本信息失败 %s: %s", symbol, error)
            return {}

    async def _get_tushare_financial_report(self, symbol: str, report_type: str) -> List[Dict[str, Any]]:
        """通过 Tushare 三大报表接口获取并归一化企业财报。"""
        if not self.tushare.available:
            return []
        try:
            ts_code = self.tushare._to_ts_code(
                symbol,
                default_market='SZ' if symbol.startswith(('0', '2', '3')) else 'SH',
            )
            endpoint = {
                'balance': 'balancesheet',
                'income': 'income',
                'cashflow': 'cashflow',
            }.get(report_type)
            if not endpoint:
                raise ValueError(f"Unsupported report type: {report_type}")
            # Promax 按 `GET /{接口名}` + 参数调用。fina_indicator 是企业
            # 分析的主入口：即使 income 无权限或暂未返回，也能拿到报告期、
            # 现金流和盈利能力字段；income 成功时再合并收入与净利润。
            try:
                indicator = await self.tushare.request_dataframe('fina_indicator', ts_code=ts_code)
                if indicator is None or indicator.empty:
                    self.logger.info("Tushare fina_indicator返回空 %s", symbol)
                else:
                    self.logger.info("Tushare fina_indicator成功 %s: %d条", symbol, len(indicator))
            except Exception as error:
                self.logger.info("Tushare fina_indicator 获取失败 %s: %s", symbol, error)
                indicator = None
            try:
                statement = await self.tushare.request_dataframe(endpoint, ts_code=ts_code)
                if statement is None or statement.empty:
                    self.logger.info("Tushare %s返回空 %s", endpoint, symbol)
                else:
                    self.logger.info("Tushare %s成功 %s: %d条", endpoint, symbol, len(statement))
            except Exception as error:
                self.logger.info("Tushare %s 补充失败 %s: %s", endpoint, symbol, error)
                statement = None

            rows_by_period: Dict[str, Dict[str, Any]] = {}
            for frame in (indicator, statement):
                if frame is None or frame.empty:
                    continue
                for row in frame.to_dict('records'):
                    # Tushare的end_date格式为YYYYMMDD，需要转换为YYYY-MM-DD
                    period_raw = str(row.get('end_date') or row.get('ann_date') or '')
                    if period_raw and len(period_raw) == 8 and period_raw.isdigit():
                        # 格式化为 YYYY-MM-DD
                        period = f"{period_raw[:4]}-{period_raw[4:6]}-{period_raw[6:8]}"
                    else:
                        period = period_raw
                    key = period or f"row-{len(rows_by_period)}"
                    rows_by_period.setdefault(key, {}).update(row)
            return [self._normalize_financial_row(row) for row in rows_by_period.values()]
        except Exception as error:
            self.logger.warning("Tushare财报失败 %s: %s", symbol, error)
            return []

    async def _get_akshare_financial_report(
        self,
        symbol: str,
        report_type: str,
    ) -> List[Dict[str, Any]]:
        """通过 AKShare 获取 A 股财报数据。"""
        if ak is None:
            return []

        def load() -> List[Dict[str, Any]]:
            try:
                stock_code = symbol.split('.')[0]
                # AKShare 的 stock_financial_abstract 获取财务摘要
                df = ak.stock_financial_abstract(symbol=stock_code)
                if df is None or df.empty:
                    return []

                # 转换为统一格式
                normalized: List[Dict[str, Any]] = []
                for row in df.to_dict('records'):
                    # AKShare 返回的字段可能是中文
                    normalized_row = {
                        '报告期': str(row.get('报告期') or row.get('date') or ''),
                        '营业收入': self._to_number(row.get('营业收入') or row.get('revenue')),
                        '净利润': self._to_number(row.get('净利润') or row.get('net_profit')),
                        '报告类型': 'AKShare',
                        'source': 'akshare',
                    }
                    normalized.append(normalized_row)
                return normalized
            except Exception as error:
                self.logger.warning("AKShare财报获取失败 %s: %s", symbol, error)
                return []

        try:
            return await asyncio.to_thread(load)
        except Exception as error:
            self.logger.warning("AKShare财报获取失败 %s: %s", symbol, error)
            return []

    async def _get_akshare_announcements(
        self,
        symbol: str,
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        """通过 AKShare 获取 A 股公告数据。"""
        if ak is None:
            return []

        def load() -> List[Dict[str, Any]]:
            try:
                # AKShare 的 stock_notice_report 获取个股公告
                df = ak.stock_notice_report(symbol=symbol.split('.')[0])
                if df is None or df.empty:
                    return []

                normalized: List[Dict[str, Any]] = []
                for row in df.to_dict('records'):
                    date = str(row.get('公告日期') or row.get('date') or '')[:10]
                    if start_date and date and date < start_date:
                        continue
                    if end_date and date and date > end_date:
                        continue
                    title = row.get('公告标题') or row.get('title') or ''
                    if not title:
                        continue
                    normalized.append({
                        '公告标题': str(title),
                        '公告日期': date,
                        '网址': row.get('网址') or row.get('url') or '',
                        'title': str(title),
                        'date': date,
                        'url': row.get('网址') or row.get('url') or '',
                        'source': 'akshare',
                    })
                return normalized
            except Exception as error:
                # AKShare 可能没有该股票的数据，这不是错误
                return []

        try:
            return await asyncio.to_thread(load)
        except Exception as error:
            self.logger.warning("AKShare公告获取失败 %s: %s", symbol, error)
            return []

    async def _get_eastmoney_announcements(
        self,
        symbol: str,
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        """直接读取东方财富公告接口，绕过 AKShare 公告包装层。"""
        def load() -> List[Dict[str, Any]]:
            params = {
                'sr': '-1',
                'st': '公告日期',
                'page_size': '100',
                'page_index': '1',
                'ann_type': 'A',
                'client_source': 'web',
                'f_node': '0',
                'f_page': '0',
                'stock_list': symbol.split('.')[0],
            }
            response = requests.get(
                'https://np-anotice-stock.eastmoney.com/api/security/ann',
                params=params,
                headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com/'},
                timeout=self.timeout_seconds,
                proxies={'http': None, 'https': None},
            )
            response.raise_for_status()
            payload = response.json()
            rows = ((payload.get('data') or {}).get('list') or [])
            normalized: List[Dict[str, Any]] = []
            for row in rows:
                date = str(row.get('notice_date') or row.get('公告日期') or '')[:10]
                if start_date and date and date < start_date:
                    continue
                if end_date and date and date > end_date:
                    continue
                title = row.get('notice_title') or row.get('公告标题') or row.get('title')
                if not title:
                    continue
                normalized.append({
                    '公告标题': str(title),
                    '公告日期': date,
                    '网址': row.get('url') or row.get('art_url') or '',
                    'source': 'eastmoney_direct',
                })
            return normalized

        try:
            return await asyncio.to_thread(load)
        except Exception as error:
            self.logger.warning("东方财富公告失败 %s: %s", symbol, error)
            return []

    async def _get_eastmoney_kline(
        self,
        symbol: str,
        period: str,
        start_date: Optional[str],
        end_date: Optional[str],
        adjust: str,
    ) -> List[Dict[str, Any]]:
        """直接读取东方财富个股 K 线，作为企业行情的首选来源。"""
        if period not in {'daily', 'weekly', 'monthly'}:
            return []

        def load() -> List[Dict[str, Any]]:
            market_prefix = '1' if symbol.startswith(('5', '6', '688', '689')) else '0'
            period_code = {'daily': '101', 'weekly': '102', 'monthly': '103'}[period]
            adjust_code = {'': '0', 'qfq': '1', 'hfq': '2'}.get(adjust, '1')
            params = {
                'fields1': 'f1,f2,f3,f4,f5,f6',
                'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116',
                'ut': '7eea3edcaed734bea9cbfc24409ed989',
                'klt': period_code,
                'fqt': adjust_code,
                'secid': f'{market_prefix}.{symbol}',
                'beg': self._tushare_date(start_date) or '0',
                'end': self._tushare_date(end_date) or '20500101',
            }
            response = requests.get(
                'https://push2his.eastmoney.com/api/qt/stock/kline/get',
                params=params,
                headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/'},
                timeout=self.timeout_seconds,
                proxies={'http': None, 'https': None},
            )
            response.raise_for_status()
            payload = response.json()
            rows = ((payload.get('data') or {}).get('klines') or [])
            result: List[Dict[str, Any]] = []
            for row in rows:
                values = str(row).split(',')
                if len(values) < 7:
                    continue
                result.append({
                    '日期': values[0],
                    '开盘': self._to_number(values[1]),
                    '收盘': self._to_number(values[2]),
                    '最高': self._to_number(values[3]),
                    '最低': self._to_number(values[4]),
                    '成交量': self._to_number(values[5]),
                    '成交额': self._to_number(values[6]),
                    '涨跌幅': self._to_number(values[8]) if len(values) > 8 else None,
                    'source': 'eastmoney_direct',
                })
            return result

        try:
            return await asyncio.to_thread(load)
        except Exception as error:
            self.logger.info("东方财富行情不可用，继续回退 %s: %s", symbol, error)
            return []

    @staticmethod
    def _to_number(value: Any) -> Optional[float]:
        try:
            return float(value) if value not in (None, '', '-') else None
        except (TypeError, ValueError):
            return None

    async def _get_tushare_announcements(
        self,
        symbol: str,
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        """通过 Tushare anns_d 补充 A 股全量公告。"""
        if not self.tushare.available:
            return []
        try:
            ts_code = self.tushare._to_ts_code(
                symbol,
                default_market='SZ' if symbol.startswith(('0', '2', '3')) else 'SH',
            )
            params = {'ts_code': ts_code}
            if start_date:
                params['start_date'] = self._tushare_date(start_date)
            if end_date:
                params['end_date'] = self._tushare_date(end_date)
            try:
                frame = await self.tushare.request_dataframe('anns_d', **params)
            except Exception as e1:
                # 兼容只接受 ann_date 的旧 Promax 网关；范围查询优先，避免
                # 只查分析截止日而把整个窗口误判为"无公告"。
                self.logger.info("Tushare anns_d范围查询失败 %s: %s, 尝试单日查询", symbol, e1)
                try:
                    ann_date = self._latest_business_date(end_date)
                    frame = await self.tushare.request_dataframe('anns_d', ts_code=ts_code, ann_date=ann_date)
                except Exception as e2:
                    self.logger.warning("Tushare anns_d单日查询也失败 %s: %s", symbol, e2)
                    return []
            if frame is None or frame.empty:
                self.logger.info("Tushare anns_d返回空数据 %s", symbol)
                return []

            def format_date(value: Any) -> str:
                """将YYYYMMDD格式转换为YYYY-MM-DD"""
                val_str = str(value or '')
                if val_str and len(val_str) == 8 and val_str.isdigit():
                    return f"{val_str[:4]}-{val_str[4:6]}-{val_str[6:8]}"
                return val_str

            return [
                {
                    '公告标题': str(row.get('title') or ''),
                    '公告日期': format_date(row.get('ann_date') or row.get('pub_date') or ''),
                    '网址': str(row.get('url') or ''),
                    'title': str(row.get('title') or ''),
                    'date': format_date(row.get('ann_date') or row.get('pub_date') or ''),
                    'url': str(row.get('url') or ''),
                    'source': 'tushare_anns_d',
                }
                for row in frame.to_dict('records')
                if row.get('title')
            ]
        except Exception as error:
            self.logger.info("Tushare公告不可用 %s: %s", symbol, error)
            return []

    @staticmethod
    def _normalize_financial_row(row: Dict[str, Any]) -> Dict[str, Any]:
        """将 Tushare 原始字段补齐为综合分析器使用的中英文兼容字段。"""
        def format_date(value: Any) -> str:
            """将YYYYMMDD格式转换为YYYY-MM-DD"""
            val_str = str(value or '')
            if val_str and len(val_str) == 8 and val_str.isdigit():
                return f"{val_str[:4]}-{val_str[4:6]}-{val_str[6:8]}"
            return val_str

        normalized = dict(row)

        # 格式化日期字段
        for date_field in ['end_date', 'ann_date', 'f_ann_date', 'report_date']:
            if date_field in normalized:
                normalized[date_field] = format_date(normalized[date_field])

        aliases = {
            'end_date': '报告期',
            'ann_date': '报告日期',
            'total_revenue': '营业收入',
            'revenue': '营业收入',
            'n_income': '净利润',
            'n_income_attr_p': '归母净利润',
            'n_cashflow_act': '经营现金流',
            'grossprofit_margin': '毛利率',
            'netprofit_margin': '净利率',
        }
        for source, target in aliases.items():
            if source in row and target not in normalized:
                normalized[target] = format_date(row.get(source)) if source in ['end_date', 'ann_date'] else row.get(source)
        normalized.setdefault('报告类型', 'Tushare')
        return normalized

    @staticmethod
    def _latest_business_date(value: Optional[str]) -> str:
        """将周末分析截止日调整为最近一个工作日，供 anns_d 使用。"""
        raw = str(value or '').replace('-', '')
        try:
            current = datetime.strptime(raw, '%Y%m%d') if raw else datetime.now()
        except ValueError:
            current = datetime.now()
        while current.weekday() >= 5:
            current -= timedelta(days=1)
        return current.strftime('%Y%m%d')

    async def _get_us_stock_info(self, symbol: str) -> Dict[str, Any]:
        """获取美股基本信息"""
        return {}

    async def _get_hk_stock_info(self, symbol: str) -> Dict[str, Any]:
        """获取港股基本信息"""
        return {}
