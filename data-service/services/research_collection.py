"""Versioned research inputs. Failed optional endpoints stay explicit, never zero-filled.

Tushare contracts: fund_adj (199), etf_basic (385), etf_share_size (408),
fund_nav (119), index_weight (96). No provider token or gateway URL is persisted.
"""
import asyncio
import re
import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

_daily_basic_cache = {}
_daily_basic_lock = asyncio.Lock()


async def _market_daily_basic(provider, trade_date):
    """Fetch one market-wide snapshot once per process for constituent look-through valuation."""
    if trade_date in _daily_basic_cache:
        return _daily_basic_cache[trade_date]
    async with _daily_basic_lock:
        if trade_date not in _daily_basic_cache:
            frame = await provider.request_dataframe(
                'daily_basic', trade_date=trade_date,
                fields='ts_code,trade_date,pe_ttm,pb,total_mv,circ_mv')
            _daily_basic_cache[trade_date] = frame.to_dict('records')
    return _daily_basic_cache[trade_date]


async def _constituent_valuation(provider, weights, trade_date):
    latest_weight_date = max((str(row.get('trade_date') or '') for row in weights), default='')
    selected = [row for row in weights if str(row.get('trade_date') or '') == latest_weight_date]
    market = {str(row.get('ts_code') or '').upper(): row for row in await _market_daily_basic(provider, trade_date)}
    total_weight = sum(float(row.get('weight') or 0) for row in selected if float(row.get('weight') or 0) > 0)
    if total_weight <= 0:
        raise ValueError('指数成分权重为空')
    result = {'trade_date': trade_date, 'weight_date': latest_weight_date, 'source': 'Tushare/index_weight+daily_basic'}
    for field in ('pe_ttm', 'pb'):
        usable = [(float(row.get('weight') or 0), float(market.get(str(row.get('con_code') or '').upper(), {}).get(field) or 0)) for row in selected]
        usable = [(weight, value) for weight, value in usable if weight > 0 and value > 0 and math.isfinite(value)]
        known_weight = sum(weight for weight, _ in usable)
        if known_weight / total_weight < 0.7:
            continue
        result[field] = known_weight / sum(weight / value for weight, value in usable)
        result[field + '_coverage_pct'] = known_weight / total_weight * 100
    if not any(field in result for field in ('pe_ttm', 'pb')):
        raise ValueError('成分估值覆盖不足70%')
    return result


def normalize_orderbook(data, code):
    """Eastmoney f19/f39 (bid1/ask1), f86 source timestamp; never use fetch time as quote time."""
    if not isinstance(data, dict) or str(data.get('f57')) != code:
        raise ValueError('盘口证券代码不匹配')
    bid, ask, stamp = (float(data.get(key)) for key in ('f19', 'f39', 'f86'))
    if not all(math.isfinite(v) for v in (bid, ask, stamp)) or not 0 < bid <= ask or stamp <= 0:
        raise ValueError('盘口价格或时间无效')
    when = datetime.fromtimestamp(stamp, timezone.utc)
    if when > datetime.now(timezone.utc):
        raise ValueError('盘口时间在未来')
    return {'code': code, 'bid': bid, 'ask': ask, 'date': when.astimezone(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d'),
            'publishedAt': when.isoformat(), 'spreadBps': (ask - bid) / ((ask + bid) / 2) * 10000, 'source': 'eastmoney/orderbook'}


def fetch_orderbook(code):
    import requests
    # Match the data service's direct-public-feed transport, retaining TLS verification.
    with requests.Session() as session:
        session.trust_env = False
        response = session.get('https://push2.eastmoney.com/api/qt/stock/get',
                               params={'secid': ('1.' if code.startswith(('5', '6')) else '0.') + code,
                                       'fltt': '2', 'invt': '2', 'fields': 'f19,f39,f57,f86'}, timeout=12)
    response.raise_for_status()
    return normalize_orderbook(response.json().get('data'), code)


async def collect_research(provider, key, code, history_points=120):
    today = datetime.now()
    end = today.strftime('%Y%m%d')
    # The Promax table endpoint is capped. A very wide range can return the
    # oldest page and silently omit the current session. This window still
    # contains comfortably more than ``history_points`` CN trading sessions,
    # while staying below the usual 200-row response cap.
    start = (today - timedelta(days=history_points * 2 + 30)).strftime('%Y%m%d')
    if key == 'research_calendar':
        frame = await provider.request_dataframe('trade_cal', exchange='SSE', start_date=start,
                                                 end_date=(today + timedelta(days=90)).strftime('%Y%m%d'))
        rows = frame.to_dict('records')
        if not rows:
            raise ValueError('交易日历为空，不能用周一至周五推断交易日')
        dates = {str(row.get('cal_date') or '') for row in rows}
        ordered = sorted(date for date in dates if re.fullmatch(r'\d{8}', date))
        if not ordered:
            raise ValueError('交易日历缺少有效日期')
        first, last = datetime.strptime(ordered[0], '%Y%m%d'), datetime.strptime(ordered[-1], '%Y%m%d')
        expected = {(first + timedelta(days=offset)).strftime('%Y%m%d') for offset in range((last-first).days+1)}
        if not expected.issubset(dates):
            raise ValueError('交易日历缺少闭市日期，拒绝覆盖已有完整日历')
        return {'version': 1, 'source': 'Tushare/trade_cal', 'data': rows}
    if key != 'etf_research' or not re.fullmatch(r'\d{6}', code):
        raise ValueError('无效研究数据集或ETF代码')
    ts_code = code + ('.SH' if code.startswith(('5', '6')) else '.SZ')
    data, failures, sources = {}, {}, {}
    async def get(field, api, **params):
        try:
            frame = await provider.request_dataframe(api, **params)
            identity = params.get('ts_code') or params.get('index_code')
            identity_column = 'ts_code' if params.get('ts_code') else 'index_code'
            if identity and identity_column in frame.columns:
                frame = frame[frame[identity_column].astype(str).str.upper() == str(identity).upper()]
            date_column = next((column for column in ('trade_date', 'nav_date', 'ann_date') if column in frame.columns), None)
            if date_column:
                frame = frame.sort_values(date_column, ascending=False)
            limits = {'shares': 2, 'daily': history_points + 40, 'factors': history_points + 40,
                      'nav': history_points + 40, 'indexDaily': history_points + 40,
                      'indexWeights': 500, 'indexValuation': history_points + 40}
            if field in limits:
                frame = frame.head(limits[field])
            records = frame.to_dict('records')
            if not records:
                raise ValueError('接口没有返回可用记录')
            data[field] = records
            sources[field] = 'Tushare/' + api
        except Exception as error:
            # Upstream exceptions may embed credential-bearing request URLs.
            status = getattr(getattr(error, 'response', None), 'status_code', None)
            failures[field] = f'{api}: {type(error).__name__}' + (f' HTTP {status}' if status else '') + '，请检查接口权限、可用日期与覆盖'
            data[field] = []
    # Bounded serial reads: existing subscription worker limits dataset concurrency.
    for field, api, params in [
        ('info', 'etf_basic', {'ts_code': ts_code}),
        ('daily', 'fund_daily', {'ts_code': ts_code, 'start_date': start, 'end_date': end}),
        ('factors', 'fund_adj', {'ts_code': ts_code, 'start_date': start, 'end_date': end}),
        ('shares', 'etf_share_size', {'ts_code': ts_code, 'start_date': start, 'end_date': end,
                                    'fields': 'ts_code,trade_date,total_share,total_size,nav,close'}),
        ('nav', 'fund_nav', {'ts_code': ts_code, 'start_date': start, 'end_date': end}),
    ]:
        await get(field, api, **params)
    index_code = data.get('info', [{}])[0].get('index_code') if data.get('info') else None
    if index_code and re.fullmatch(r'[A-Z0-9]{6}\.(SH|SZ|CSI)', str(index_code), re.IGNORECASE):
        await get('indexDaily', 'index_daily', ts_code=index_code, start_date=start, end_date=end)
        await get('indexWeights', 'index_weight', index_code=index_code, start_date=start, end_date=end)
        await get('indexValuation', 'index_dailybasic', ts_code=index_code, start_date=start, end_date=end)
        if not data.get('indexValuation') and data.get('indexWeights') and data.get('indexDaily'):
            try:
                trade_date = max(str(row.get('trade_date') or '') for row in data['indexDaily'])
                data['indexValuation'] = [await _constituent_valuation(provider, data['indexWeights'], trade_date)]
                sources['indexValuation'] = 'Tushare/index_weight+daily_basic'
                failures.pop('indexValuation', None)
            except Exception as error:
                failures['indexValuation'] = f'指数及成分穿透估值均不可用: {type(error).__name__}，请检查daily_basic权限与成分覆盖'
    else:
        failures['indexDaily'] = '正式跟踪指数映射缺失；不从ETF名称猜测'
    try:
        data['orderbook'] = [await asyncio.to_thread(fetch_orderbook, code)]
        sources['orderbook'] = 'eastmoney/orderbook'
    except Exception as error:
        data['orderbook'] = []
        failures['orderbook'] = f'盘口数据: {type(error).__name__}，未取得带证券代码和源时间的有效买卖价'
    if not any(data.values()):
        raise ValueError('ETF研究接口全部不可用，请检查数据权限')
    return {'version': 1, 'source': 'Tushare/research-bundle', 'data': data,
            'sources': sources, 'failures': failures, 'quality': 'partial' if failures else 'available',
            'units': {'daily.amount': '千元', 'shares.total_share': '万份', 'shares.total_size': '万元',
                      'nav.unit_nav': '元', 'nav.adj_nav': '复权净值', 'factors.adj_factor': 'ratio'},
            'limitations': ['历史持仓按披露期，不是实时持仓', '盘口源时间不等于采集时间，缺失不补0', '指数估值接口覆盖有限，失败不补零']}
