# ETF数据提供者
# 提供ETF持仓明细和基本信息查询功能

import asyncio
import akshare as ak
import ast
import os
import re
from io import StringIO
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import logging

from db import db
from providers.tushare_provider import TushareProvider

logger = logging.getLogger(__name__)


class ETFProvider:
    """ETF数据提供者

    持仓来源按可信度处理：真实数据源（AKShare/Tushare）→ 已持久化ETF持仓表。
    不在本 provider 内生成模拟持仓，也不按产业规则推断企业。
    """

    def __init__(self):
        self._etf_cache = {}  # 缓存ETF列表数据
        self._tushare = TushareProvider()

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

        返回中 source、trade_date、weight_available 等字段用于数据溯源。
        没有真实持仓数据时返回空列表，不构造模拟企业。
        """
        started_at = asyncio.get_running_loop().time()
        logger.info("ETF持仓请求开始: code=%s", ticker)

        # ETF 持仓优先使用定期披露的基金持仓接口。该接口按报告期查询，
        # 不依赖交易日；交易所 PCF 仅作为显式可选降级，不作为默认来源。
        tushare_started_at = asyncio.get_running_loop().time()
        tushare_result = await self._get_tushare_holdings(ticker)
        logger.info(
            "ETF持仓数据源完成: code=%s source=tushare rows=%s duration_ms=%s",
            ticker,
            len(tushare_result),
            round((asyncio.get_running_loop().time() - tushare_started_at) * 1000),
        )
        if tushare_result:
            if len(tushare_result) < 10:
                fallback = await asyncio.to_thread(self._get_eastmoney_holdings_direct, ticker)
                tushare_result = self._merge_holdings(tushare_result, fallback)
            logger.info(
                "ETF持仓请求结束: code=%s status=success source=tushare rows=%s duration_ms=%s",
                ticker,
                len(tushare_result),
                round((asyncio.get_running_loop().time() - started_at) * 1000),
            )
            return tushare_result

        if os.getenv("ETF_HOLDINGS_ALLOW_PCF", "false").strip().lower() == "true":
            pcf_started_at = asyncio.get_running_loop().time()
            pcf_result = await self._get_tushare_pcf_holdings(ticker)
            logger.info(
                "ETF持仓数据源完成: code=%s source=tushare_pcf rows=%s duration_ms=%s",
                ticker,
                len(pcf_result),
                round((asyncio.get_running_loop().time() - pcf_started_at) * 1000),
            )
            if pcf_result:
                return pcf_result

        # Tushare 权限或接口暂不可用时，保留公开来源作为显式降级。
        direct_started_at = asyncio.get_running_loop().time()
        direct_result = await asyncio.to_thread(self._get_eastmoney_holdings_direct, ticker)
        logger.info(
            "ETF持仓数据源完成: code=%s source=eastmoney_public_direct rows=%s duration_ms=%s",
            ticker,
            len(direct_result),
            round((asyncio.get_running_loop().time() - direct_started_at) * 1000),
        )
        if direct_result:
            logger.info('ETF %s 持仓来源=eastmoney_public_direct, rows=%s', ticker, len(direct_result))
            logger.info(
                "ETF持仓请求结束: code=%s status=success source=eastmoney_public_direct rows=%s duration_ms=%s",
                ticker,
                len(direct_result),
                round((asyncio.get_running_loop().time() - started_at) * 1000),
            )
            return direct_result

        # 不同 AKShare 版本对基金持仓接口命名和参数略有差异，按能力探测，
        # 统一转换为下游需要的 stock_code / stock_name / weight 协议。
        if ak is not None:
            candidates = [
                ('fund_portfolio_hold_em', {'symbol': ticker, 'date': str(datetime.now().year)}),
                ('fund_portfolio_hold_em', {'symbol': ticker, 'date': str(datetime.now().year - 1)}),
                ('fund_portfolio_hold_em', {'symbol': ticker, 'date': str(datetime.now().year - 2)}),
                ('fund_etf_holdings_em', {'symbol': ticker}),
                ('fund_etf_holdings', {'symbol': ticker}),
            ]
            for function_name, kwargs in candidates:
                function = getattr(ak, function_name, None)
                if not function:
                    continue
                try:
                    source_started_at = asyncio.get_running_loop().time()
                    frame = await asyncio.to_thread(function, **kwargs)
                    result = self._normalize_frame(frame, function_name)
                    logger.info(
                        "ETF持仓数据源完成: code=%s source=%s rows=%s duration_ms=%s",
                        ticker,
                        function_name,
                        len(result),
                        round((asyncio.get_running_loop().time() - source_started_at) * 1000),
                    )
                    if result:
                        logger.info('ETF %s 持仓来源=%s, rows=%s', ticker, function_name, len(result))
                        logger.info(
                            "ETF持仓请求结束: code=%s status=success source=%s rows=%s duration_ms=%s",
                            ticker,
                            function_name,
                            len(result),
                            round((asyncio.get_running_loop().time() - started_at) * 1000),
                        )
                        return result
                except Exception as error:
                    logger.warning('ETF %s 持仓接口 %s 异常: %s', ticker, function_name, error)

        # 当前仓库中的 ETFHolding 曾由种子脚本生成模拟数据，不能默认视为真实持仓。
        # 只有运维明确把该表标记为正式导入数据后，才允许作为持久化来源。
        if os.getenv('ETF_HOLDINGS_DATABASE_TRUSTED', '').strip().lower() == 'true':
            database_result = await asyncio.to_thread(self._get_database_holdings, ticker)
            if database_result:
                logger.info('ETF %s 持仓来源=database_etf_holdings_trusted, rows=%s', ticker, len(database_result))
                return database_result
        else:
            logger.info('ETF %s 跳过本地ETFHolding：未配置可信数据标记', ticker)

        logger.warning(
            'ETF持仓请求结束: code=%s status=empty duration_ms=%s，真实数据源和已持久化持仓表均无有效数据',
            ticker,
            round((asyncio.get_running_loop().time() - started_at) * 1000),
        )
        return []

    @staticmethod
    def _merge_holdings(primary: List[Dict], fallback: List[Dict]) -> List[Dict]:
        """合并不同报告期/来源的持仓，按代码去重并保留权重较高的一条。"""
        merged: Dict[str, Dict] = {}
        for row in [*(primary or []), *(fallback or [])]:
            raw_code = str(row.get('stock_code') or row.get('stockCode') or '').strip()
            code = raw_code.split('.')[0].removeprefix('sh').removeprefix('sz')
            if not code:
                continue
            row = {**row, 'stock_code': code}
            current = merged.get(code)
            weight = float(row.get('weight') or 0)
            if current is None or weight > float(current.get('weight') or 0):
                merged[code] = row
        return sorted(merged.values(), key=lambda row: float(row.get('weight') or 0), reverse=True)

    @staticmethod
    def _get_eastmoney_holdings_direct(ticker: str) -> List[Dict]:
        """直连天天基金公开持仓页面，避免 AKShare 上游代理/解析问题。"""
        try:
            import pandas as pd
            import requests
            from bs4 import BeautifulSoup

            session = requests.Session()
            session.trust_env = False
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
                'Referer': f'https://fundf10.eastmoney.com/ccmx_{ticker}.html',
            })
            for year in [str(datetime.now().year), str(datetime.now().year - 1), str(datetime.now().year - 2)]:
                response = session.get(
                    'https://fundf10.eastmoney.com/FundArchivesDatas.aspx',
                    params={
                        'type': 'jjcc',
                        'code': ticker,
                        'topline': '10000',
                        'year': year,
                        'month': '',
                        'rt': str(datetime.now().timestamp()),
                    },
                    timeout=15,
                )
                response.raise_for_status()
                payload_text = response.text
                # 接口返回的是 JavaScript 对象而不是 JSON：
                # var apidata={ content:"<html>..." }。
                content_match = re.search(r'content\s*:\s*("(?:\\.|[^"\\])*")', payload_text, flags=re.S)
                if not content_match:
                    content_match = re.search(r"content\s*:\s*('(?:\\.|[^'\\])*')", payload_text, flags=re.S)
                if not content_match:
                    continue
                try:
                    content = str(ast.literal_eval(content_match.group(1)) or '')
                except (SyntaxError, ValueError):
                    continue
                if not content:
                    continue

                labels = [
                    item.get_text().split('\xa0\xa0', 1)[-1]
                    for item in BeautifulSoup(content, features='lxml').find_all('h4', class_='t')
                ]
                tables = pd.read_html(StringIO(content), converters={'股票代码': str})
                normalized_tables = []
                for index, table in enumerate(tables):
                    table = table.copy()
                    table = table.drop(columns=['相关资讯'], errors='ignore')
                    table = table.rename(columns={
                        '占净值 比例': '占净值比例',
                        '持股数（万股）': '持股数',
                        '持股数 （万股）': '持股数',
                        '持仓市值（万元）': '持仓市值',
                        '持仓市值 （万元）': '持仓市值',
                        '持仓市值（万元人民币）': '持仓市值',
                        '持仓市值 （万元人民币）': '持仓市值',
                    })
                    if '股票代码' not in table.columns:
                        continue
                    table['季度'] = labels[index] if index < len(labels) else year
                    normalized_tables.append(table)
                if not normalized_tables:
                    continue

                frame = pd.concat(normalized_tables, ignore_index=True)
                frame['占净值比例'] = pd.to_numeric(frame.get('占净值比例'), errors='coerce')
                frame['持股数'] = pd.to_numeric(frame.get('持股数'), errors='coerce')
                frame['持仓市值'] = pd.to_numeric(frame.get('持仓市值'), errors='coerce')
                result = ETFProvider._normalize_frame(frame, 'eastmoney_public_direct')
                if result:
                    return result
        except Exception as error:
            logger.debug('ETF %s 东方财富公开持仓直连失败: %s', ticker, error)
        return []

    @staticmethod
    def _normalize_frame(frame: Any, source: str) -> List[Dict]:
        if frame is None or getattr(frame, 'empty', True):
            return []
        columns = {str(column): column for column in frame.columns}
        code_column = next((columns[name] for name in ['股票代码', '证券代码', '持仓股票代码', '代码', 'stock_code', 'symbol', 'ts_code'] if name in columns), None)
        name_column = next((columns[name] for name in ['股票名称', '证券名称', '持仓股票名称', '名称', 'stock_name', 'name'] if name in columns), None)
        weight_column = next((columns[name] for name in ['占净值比例', '占净值比', '持仓占比', '占比', 'weight', 'stk_mkv_ratio'] if name in columns), None)
        quantity_column = next((columns[name] for name in ['持股数', '持股数量', 'quantity', 'qty'] if name in columns), None)
        market_value_column = next((columns[name] for name in ['持仓市值', '市值', 'market_value'] if name in columns), None)
        period_column = next((columns[name] for name in ['end_date', 'report_period', '季度', 'period', '报告期'] if name in columns), None)
        if code_column is None:
            return []
        result = []
        for _, row in frame.iterrows():
            code = str(row.get(code_column) or '').strip()
            if not code or code.lower() in {'nan', 'none'}:
                continue
            raw_weight = row.get(weight_column) if weight_column is not None else 0
            try:
                weight = float(str(raw_weight).replace('%', '').strip() or 0)
                if weight != weight:  # NaN
                    weight = 0.0
            except (TypeError, ValueError):
                weight = 0
            try:
                quantity = float(row.get(quantity_column)) if quantity_column is not None and row.get(quantity_column) is not None else None
                if quantity is not None and quantity != quantity:
                    quantity = None
            except (TypeError, ValueError):
                quantity = None
            try:
                market_value = float(row.get(market_value_column)) if market_value_column is not None and row.get(market_value_column) is not None else None
                if market_value is not None and market_value != market_value:
                    market_value = None
            except (TypeError, ValueError):
                market_value = None
            result.append({
                'stock_code': code.zfill(6) if code.isdigit() else code,
                'stock_name': str(row.get(name_column) or code).strip() if name_column is not None else code,
                'weight': weight,
                'weight_available': weight_column is not None and weight > 0,
                'quantity': quantity,
                'market_value': market_value,
                'report_period': str(row.get(period_column) or '') if period_column is not None else '',
                'ann_date': str(row.get('ann_date') or row.get('publish_date') or ''),
                'source': source,
            })
        return result

    @staticmethod
    def _get_database_holdings(ticker: str) -> List[Dict]:
        rows = db.execute(
            'SELECT stockCode, stockName, weight, shares, marketValue, updateDate FROM ETFHolding WHERE etfCode = ? ORDER BY weight DESC',
            (ticker,),
        )
        return [
            {
                'stock_code': str(row.get('stockCode') or '').zfill(6),
                'stock_name': str(row.get('stockName') or row.get('stockCode') or ''),
                'weight': float(row.get('weight') or 0),
                'shares': row.get('shares'),
                'market_value': row.get('marketValue'),
                'update_date': row.get('updateDate'),
                'source': 'database_etf_holdings',
            }
            for row in rows
            if row.get('stockCode')
        ]

    async def _get_tushare_holdings(self, ticker: str) -> List[Dict]:
        if not self._tushare.available:
            return []
        try:
            suffix = '.SH' if ticker.startswith(('5', '6')) else '.SZ'
            request_timeout = max(5, int(os.getenv("TUSHARE_HOLDINGS_TIMEOUT_SECONDS", "12")))
            periods = self._recent_report_periods(
                count=max(1, int(os.getenv("ETF_HOLDINGS_REPORT_PERIODS", "2")))
            )
            combined: List[Dict] = []
            for period in periods:
                started_at = asyncio.get_running_loop().time()
                try:
                    logger.info(
                        'ETF定期披露持仓请求: code=%s api=fund_portfolio ts_code=%s period=%s',
                        ticker, f'{ticker}{suffix}', period,
                    )
                    frame = await self._tushare.request_dataframe(
                        'fund_portfolio',
                        ts_code=f'{ticker}{suffix}',
                        period=period,
                        fields='ts_code,ann_date,end_date,symbol,mkv,amount,stk_mkv_ratio,stk_float_ratio',
                        _timeout_seconds=request_timeout,
                    )
                    # Some Promax deployments return multiple report periods
                    # even when ``period`` is supplied. Mixing them makes the
                    # summed weights exceed 100% and invalidates every holding
                    # gate, so enforce the requested identity locally.
                    if 'ts_code' in frame.columns:
                        frame = frame[frame['ts_code'].astype(str).str.upper() == f'{ticker}{suffix}'.upper()]
                    if 'end_date' in frame.columns:
                        frame = frame[frame['end_date'].astype(str).str.replace('-', '', regex=False) == period]
                    result = self._normalize_frame(frame, 'tushare_fund_portfolio')
                    logger.info(
                        'ETF定期披露持仓响应: code=%s period=%s rows=%s duration_ms=%s',
                        ticker,
                        period,
                        len(result),
                        round((asyncio.get_running_loop().time() - started_at) * 1000),
                    )
                    if result:
                        for item in result:
                            item['report_period'] = item.get('report_period') or period
                        combined = self._merge_holdings(combined, result)
                        if len(combined) >= 10:
                            return combined
                except Exception as error:
                    logger.warning(
                        'ETF定期披露持仓异常: code=%s period=%s duration_ms=%s error=%s',
                        ticker,
                        period,
                        round((asyncio.get_running_loop().time() - started_at) * 1000),
                        error,
                    )
            return combined
        except Exception as error:
            logger.warning('ETF %s Tushare持仓调用异常: %s', ticker, error)
            return []

    @staticmethod
    def _recent_report_periods(count: int = 2) -> List[str]:
        """返回最近已结束的季度报告期，避免用交易日驱动定期披露数据。"""
        today = datetime.now().date()
        quarter_ends = [(3, 31), (6, 30), (9, 30), (12, 31)]
        candidates = []
        for year in range(today.year, today.year - 4, -1):
            for month, day in reversed(quarter_ends):
                period = datetime(year, month, day).date()
                if period <= today:
                    candidates.append(period.strftime('%Y%m%d'))
        return candidates[:max(1, count)]

    async def _get_tushare_pcf_holdings(self, ticker: str) -> List[Dict]:
        """可选的交易所 PCF 降级，仅用于当前申赎篮子，不代表定期披露持仓。"""
        if not self._tushare.available:
            return []
        suffix = '.SH' if ticker.startswith(('5', '6')) else '.SZ'
        pcf_api = 'etf_sh_cons' if suffix == '.SH' else 'etf_sz_cons'
        request_timeout = max(5, int(os.getenv("TUSHARE_HOLDINGS_TIMEOUT_SECONDS", "12")))
        try:
            pcf_frame = await self._tushare.request_dataframe(
                pcf_api,
                ts_code=f'{ticker}{suffix}',
                trade_date=datetime.now().strftime('%Y%m%d'),
                _timeout_seconds=request_timeout,
            )
            return self._normalize_pcf_frame(pcf_frame, 'tushare_etf_pcf')
        except Exception as error:
            logger.warning('ETF %s PCF持仓降级调用异常: %s', ticker, error)
            return []

    @staticmethod
    def _normalize_pcf_frame(frame: Any, source: str) -> List[Dict]:
        """标准化交易所 PCF，过滤现金替代行和无实际数量的证券。"""
        if frame is None or getattr(frame, 'empty', True):
            return []
        columns = {str(column): column for column in frame.columns}
        code_column = next((columns[name] for name in ['con_code', '证券代码', '股票代码'] if name in columns), None)
        name_column = next((columns[name] for name in ['con_name', '证券名称', '股票名称'] if name in columns), None)
        qty_column = next((columns[name] for name in ['qty', '股票数量', '持股数'] if name in columns), None)
        date_column = next((columns[name] for name in ['trade_date', '交易日期'] if name in columns), None)
        period_column = next((columns[name] for name in ['季度', 'period', '报告期'] if name in columns), None)
        exchange_column = next((columns[name] for name in ['exchange', '挂牌市场'] if name in columns), None)
        if code_column is None or qty_column is None:
            return []

        result = []
        for _, row in frame.iterrows():
            raw_code = str(row.get(code_column) or '').strip()
            code = raw_code.split('.')[0].zfill(6) if raw_code.split('.')[0].isdigit() else raw_code
            try:
                quantity = float(row.get(qty_column) or 0)
            except (TypeError, ValueError):
                quantity = 0
            exchange = str(row.get(exchange_column) or '').strip().upper() if exchange_column is not None else ''
            # PCF 中的“申赎现金”等现金替代行不是企业，不进入企业分析。
            if not code.isdigit() or len(code) != 6 or quantity <= 0:
                continue
            result.append({
                'stock_code': code,
                'stock_name': str(row.get(name_column) or code).strip() if name_column is not None else code,
                'weight': 0.0,
                'weight_available': False,
                'weight_source': 'not_provided_by_exchange_pcf',
                'quantity': quantity,
                'trade_date': str(row.get(date_column) or '') if date_column is not None else '',
                'report_period': str(row.get(period_column) or '') if period_column is not None else '',
                'exchange': exchange,
                'market': 'hk' if exchange == 'HK' else 'cn' if exchange in {'SH', 'SZ'} else 'other',
                'source': source,
            })
        return result

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
