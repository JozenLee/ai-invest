"""Market-aware adapters, preserving source units and dates for HK/US equities."""
import asyncio
from datetime import datetime, timedelta

from providers.stock_symbols import provider_symbol
from services.subscription_config import market_open


def normalize_bar(row, source, market):
    aliases = {'date': ['date', 'Date', 'trade_date', '日期'], 'open': ['open', 'Open', '开盘'], 'high': ['high', 'High', '最高'], 'low': ['low', 'Low', '最低'], 'close': ['close', 'Close', '收盘'], 'volume': ['volume', 'Volume', 'vol', '成交量'], 'amount': ['amount', '成交额']}
    result = {key: next((row[name] for name in names if name in row and row[name] is not None), None) for key, names in aliases.items()}
    value = str(result['date'] or '')[:10]
    if len(value) == 8 and value.isdigit():
        value = f'{value[:4]}-{value[4:6]}-{value[6:8]}'
    result.update(date=value, source=source, market=market.upper(), currency='HKD' if market == 'hk' else 'USD')
    result['previousClose'] = row.get('pre_close') or row.get('previousClose')
    result['changePct'] = row.get('pct_chg') if row.get('pct_chg') is not None else row.get('changePct')
    return result


class InternationalStockProvider:
    def __init__(self, tushare, openbb, akshare, logger):
        self.tushare, self.openbb, self.ak, self.logger = tushare, openbb, akshare, logger

    async def kline(self, symbol, market, start, end):
        if market == 'hk' and not str(symbol).lower().endswith('.hk'):
            symbol = f'{symbol}.hk'
        candidates = []
        if self.tushare.available:
            try:
                frame = await asyncio.wait_for(self.tushare.request_dataframe('hk_daily' if market == 'hk' else 'us_daily', ts_code=provider_symbol(symbol, 'tushare'), start_date=start.replace('-', ''), end_date=end.replace('-', '')), 15)
                candidates = [normalize_bar(row, 'tushare', market) for row in frame.to_dict('records')]
                # Some gateways ignore a range and return a single observation.
                minimum = 1 if (datetime.strptime(end, '%Y-%m-%d') - datetime.strptime(start, '%Y-%m-%d')).days <= 14 else 120
                if len(candidates) >= minimum:
                    return candidates
            except Exception as error:
                self.logger.info('国际日线 Tushare 不可用 %s: %s', symbol, type(error).__name__)
        if market == 'hk' and self.ak is not None:
            try:
                frame = await asyncio.wait_for(asyncio.to_thread(self.ak.stock_hk_hist, symbol=provider_symbol(symbol, 'akshare'), period='daily', start_date=start.replace('-', ''), end_date=end.replace('-', ''), adjust=''), 25)
                rows = [normalize_bar(row, 'akshare_eastmoney', market) for row in frame.to_dict('records')]
                if len(rows) > len(candidates):
                    candidates = rows
                if len(candidates) >= 60:
                    return candidates
            except Exception as error:
                self.logger.info('港股东财日线不可用 %s: %s', symbol, type(error).__name__)
        try:
            # Yahoo's end date is exclusive.
            inclusive_end = (datetime.strptime(end, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
            rows = await self.openbb.get_kline(provider_symbol(symbol), start, inclusive_end, market)
            normalized = [normalize_bar(row, 'openbb_yfinance', market) for row in (rows or [])]
            return normalized if len(normalized) > len(candidates) else candidates
        except Exception:
            return candidates

    async def financial(self, symbol, market, report_type):
        if market == 'hk' and not str(symbol).lower().endswith('.hk'):
            symbol = f'{symbol}.hk'
        if market == 'hk' and self.ak is not None:
            try:
                name = {'income': '利润表', 'balance': '资产负债表', 'cashflow': '现金流量表'}[report_type]
                frame = await asyncio.wait_for(asyncio.to_thread(self.ak.stock_financial_hk_report_em, stock=provider_symbol(symbol, 'akshare'), symbol=name, indicator='报告期'), 25)
                by_period = {}
                for row in frame.to_dict('records'):
                    period = str(row.get('REPORT_DATE') or row.get('STD_REPORT_DATE') or '')[:10]
                    if not period:
                        continue
                    result = by_period.setdefault(period, {'报告期': period, 'reportType': report_type, 'source': 'akshare_eastmoney_hk', 'currency': row.get('CURRENCY') or '来源未标注'})
                    result[str(row.get('STD_ITEM_NAME') or row.get('STD_ITEM_CODE'))] = row.get('AMOUNT')
                if by_period:
                    return list(by_period.values())
            except Exception as error:
                self.logger.info('港股财报不可用 %s/%s: %s', symbol, report_type, type(error).__name__)
        rows = await self.openbb.get_financial_report(provider_symbol(symbol), report_type, market)
        return [{**row, '报告期': str(row.get('period') or row.get('period_ending') or row.get('date') or '')[:10], 'reportType': report_type, 'source': row.get('source') or 'openbb_yfinance'} for row in (rows or [])]

    async def quote(self, symbol, market):
        if market_open(market):
            try:
                quote = await asyncio.wait_for(self.openbb.get_quote(provider_symbol(symbol), market), 15)
                if quote:
                    return [{**quote, '代码': symbol, 'market': market.upper()}]
            except Exception:
                pass
        # A short daily request supplies the current/most recent trading candle;
        # do not stamp a closed-market quote with today's date.
        end = datetime.now().strftime('%Y-%m-%d')
        start = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')
        rows = await self.kline(symbol, market, start, end)
        rows = sorted(rows, key=lambda row: row['date'])
        if not rows:
            return []
        latest = rows[-1]
        previous = latest.get('previousClose') or (rows[-2].get('close') if len(rows) > 1 else None)
        return [{**latest, '代码': symbol, 'previousClose': previous, 'changePct': (latest['close'] / previous - 1) * 100 if previous else None, 'quoteKind': '最近交易行情'}]
