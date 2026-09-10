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
_daily_basic_lock = None
_daily_basic_loop = None


async def _market_daily_basic(provider, trade_date):
    """Fetch one market-wide snapshot once per process for constituent look-through valuation."""
    global _daily_basic_lock, _daily_basic_loop
    if trade_date in _daily_basic_cache:
        return _daily_basic_cache[trade_date]
    loop = asyncio.get_running_loop()
    if _daily_basic_loop is not loop:
        _daily_basic_lock, _daily_basic_loop = asyncio.Lock(), loop
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


def normalize_tencent_orderbook(text, code):
    symbol = ('sh' if code.startswith(('5', '6')) else 'sz') + code
    match = re.search(r'v_' + symbol + r'="([^"\n]*)"', text)
    fields = match.group(1).split('~') if match else []
    if len(fields) < 31 or fields[2] != code:
        raise ValueError('备用盘口证券代码不匹配或响应不完整')
    when = datetime.strptime(fields[30], '%Y%m%d%H%M%S').replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    result = normalize_orderbook({'f57': fields[2], 'f19': fields[9], 'f39': fields[19],
                                  'f86': when.timestamp()}, code)
    result['source'] = 'tencent/orderbook'
    return result


def fetch_orderbook(code):
    import requests
    if not re.fullmatch(r'\d{6}', code):
        raise ValueError('无效盘口证券代码')
    # Both feeds must supply their own instrument identity and quote timestamp.
    with requests.Session() as session:
        session.trust_env = False
        session.headers.update({'User-Agent': 'Mozilla/5.0'})
        try:
            response = session.get('https://push2.eastmoney.com/api/qt/stock/get',
                                   params={'secid': ('1.' if code.startswith(('5', '6')) else '0.') + code,
                                           'fltt': '2', 'invt': '2', 'fields': 'f19,f39,f57,f86'}, timeout=8)
            response.raise_for_status()
            return normalize_orderbook(response.json().get('data'), code)
        except (requests.RequestException, ValueError, TypeError, OverflowError):
            response = session.get('https://qt.gtimg.cn/',
                                   params={'q': ('sh' if code.startswith(('5', '6')) else 'sz') + code}, timeout=8)
            response.raise_for_status()
            return normalize_tencent_orderbook(response.content.decode('gb18030'), code)


async def collect_calendar(provider, start, end):
    """Use explicit states or the exchange's previous-trading-day links, never weekdays."""
    cursor, finish = datetime.strptime(start, '%Y%m%d'), datetime.strptime(end, '%Y%m%d')
    days = {}
    while cursor <= finish:
        last = min(cursor + timedelta(days=89), finish)
        for state in (0, 1):
            frame = await provider.request_dataframe(
                'trade_cal', exchange='SSE', is_open=str(state),
                start_date=(cursor-timedelta(days=14)).strftime('%Y%m%d'),
                end_date=(last+timedelta(days=14)).strftime('%Y%m%d'))
            for row in frame.to_dict('records'):
                day = str(row.get('cal_date') or '').replace('-', '')
                if not (cursor-timedelta(days=14)).strftime('%Y%m%d') <= day <= (last+timedelta(days=14)).strftime('%Y%m%d'):
                    continue
                if str(row.get('exchange') or 'SSE') != 'SSE':
                    continue
                value = str(row.get('is_open'))
                if value not in ('0', '1'):
                    raise ValueError('交易日历开闭市状态无效')
                if day in days and days[day]['is_open'] != int(value):
                    raise ValueError('交易日历同一日期开闭市状态冲突')
                days[day] = {**row, 'cal_date': day, 'is_open': int(value)}
        # Some gateways ignore is_open=0 but retain the authoritative predecessor.
        # Only dates strictly between consecutive trading dates are then closed.
        # Query overlap brackets range edges and never guesses an unbracketed day.
        for day, row in list(days.items()):
            previous = str(row.get('pretrade_date') or '').replace('-', '')
            if row['is_open'] != 1 or not re.fullmatch(r'\d{8}', previous):
                continue
            left, right = datetime.strptime(previous, '%Y%m%d'), datetime.strptime(day, '%Y%m%d')
            if not 0 < (right-left).days <= 31:
                continue
            for offset in range(1, (right-left).days):
                closed = (left+timedelta(days=offset)).strftime('%Y%m%d')
                if closed in days and days[closed]['is_open'] == 1:
                    raise ValueError('交易日历前序交易日与开市状态冲突')
                days.setdefault(closed, {'exchange': 'SSE', 'cal_date': closed, 'is_open': 0,
                                         'pretrade_date': previous, 'nexttrade_date': day,
                                         'state_basis': 'trade_cal.pretrade_date'})
        expected = {(cursor + timedelta(days=i)).strftime('%Y%m%d') for i in range((last-cursor).days+1)}
        if not expected.issubset(days):
            raise ValueError('交易日历缺少闭市日期或请求范围未完整返回，拒绝覆盖已有完整日历')
        cursor = last + timedelta(days=1)
    return {'version': 1, 'source': 'Tushare/trade_cal', 'data': [days[day] for day in sorted(days) if start <= day <= end]}


def _positive_factor(value):
    try:
        return math.isfinite(float(value)) and float(value) > 0
    except (ValueError, TypeError):
        return False


async def collect_research(provider, key, code, history_points=120, expected_session=None, as_of=None):
    today = as_of or datetime.now(ZoneInfo("Asia/Shanghai"))
    if today.tzinfo is None:
        today = today.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
    today = today.astimezone(ZoneInfo("Asia/Shanghai"))
    end = today.strftime('%Y%m%d')
    # The Promax table endpoint is capped. A very wide range can return the
    # oldest page and silently omit the current session. This window still
    # contains comfortably more than ``history_points`` CN trading sessions,
    # while staying below the usual 200-row response cap.
    start = (today - timedelta(days=history_points * 2 + 30)).strftime('%Y%m%d')
    if key == 'research_calendar':
        return await collect_calendar(provider, start, (today + timedelta(days=90)).strftime('%Y%m%d'))
    if key != 'etf_research' or not re.fullmatch(r'\d{6}', code):
        raise ValueError('无效研究数据集或ETF代码')
    ts_code = code + ('.SH' if code.startswith(('5', '6')) else '.SZ')
    data, failures, sources, field_status = {}, {}, {}, {}
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
    async def align_current(field, api, params):
        if not expected_session or field not in ('daily', 'factors', 'shares', 'indexDaily', 'indexValuation'):
            return
        expected = expected_session.replace('-', '')
        rows = data.get(field, [])
        if any(str(row.get('trade_date') or row.get('date') or '').replace('-', '') == expected for row in rows):
            return
        if field == 'factors':
            due = datetime.strptime(expected, '%Y%m%d').replace(tzinfo=ZoneInfo('Asia/Shanghai')) + timedelta(hours=17)
            if today < due and rows:
                field_status[field] = {'status': 'pending-publication', 'expectedDate': expected_session, 'availableDate': max((str(row.get('trade_date') or '') for row in rows), default=None), 'expectedAt': due.isoformat(), 'detail': '基金复权因子通常17:00后更新，保留历史因子但不代替当日因子'}
                return
        if field == 'shares':
            due = datetime.strptime(expected, '%Y%m%d').replace(tzinfo=ZoneInfo('Asia/Shanghai')) + timedelta(days=1, hours=8, minutes=30)
            if today < due:
                field_status[field] = {'status': 'pending-publication', 'expectedDate': expected_session, 'availableDate': max((str(row.get('trade_date') or '') for row in rows), default=None), 'expectedAt': due.isoformat(), 'detail': '份额分批发布，尚未到次日约08:30的常规更新时间'}
                return
        try:
            identity = params.get('ts_code')
            query = {name: value for name, value in params.items() if name not in ('start_date', 'end_date')}
            query['trade_date'] = expected
            frame = await provider.request_dataframe(api, **query)
            fresh = [row for row in frame.to_dict('records')
                     if str(row.get('trade_date') or row.get('date') or '').replace('-', '') == expected
                     and (not identity or str(row.get('ts_code') or identity).upper() == identity.upper())]
            if not fresh:
                raise ValueError('请求交易日未返回')
            data[field] = rows + fresh
            sources[field] = 'Tushare/' + api
            failures.pop(field, None)
        except Exception as error:
            if field == 'factors':
                # Narrow-date and market-date queries can bypass a stale wide
                # gateway page. Bounded attempts, exact security/date matching.
                for query in ({'ts_code': ts_code, 'start_date': expected, 'end_date': expected}, {'trade_date': expected}):
                    try:
                        frame = await provider.request_dataframe('fund_adj', **query)
                        fresh = [row for row in frame.to_dict('records')
                                 if str(row.get('ts_code') or '').upper() == ts_code
                                 and str(row.get('trade_date') or '').replace('-', '') == expected
                                 and _positive_factor(row.get('adj_factor'))]
                        if fresh:
                            data[field] = rows + fresh
                            sources[field] = 'Tushare/fund_adj'
                            failures.pop(field, None)
                            return
                    except Exception:
                        continue
            failures[field] = f'{api}: {expected_session}收盘数据待补齐（{type(error).__name__}），保留已取得历史记录'
            field_status[field] = {'status': 'failed', 'expectedDate': expected_session, 'availableDate': max((str(row.get('trade_date') or '') for row in rows), default=None), 'detail': failures[field]}

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
        await align_current(field, api, params)
    # A wide history response can be a capped/cached old page. Fetch the recent
    # window independently and merge by NAV business date, never by fetch time.
    nav_rows = data.get('nav', [])
    try:
        recent = await provider.request_dataframe('fund_nav', ts_code=ts_code,
            start_date=(today - timedelta(days=14)).strftime('%Y%m%d'), end_date=end)
        fresh = [row for row in recent.to_dict('records') if str(row.get('ts_code') or '').upper() == ts_code
                 and re.fullmatch(r'\d{8}', str(row.get('nav_date') or ''))
                 and (today - timedelta(days=14)).strftime('%Y%m%d') <= str(row['nav_date']) <= end]
        merged = {str(row.get('nav_date')): row for row in nav_rows}
        merged.update({str(row['nav_date']): row for row in fresh})
        data['nav'] = sorted(merged.values(), key=lambda row: str(row.get('nav_date') or ''), reverse=True)[:history_points + 40]
        if fresh:
            sources['nav'] = 'Tushare/fund_nav'
            failures.pop('nav', None)
    except Exception as error:
        failures['nav'] = f'fund_nav: 近期净值核对失败（{type(error).__name__}），保留历史记录'
    if expected_session:
        expected = expected_session.replace('-', '')
        latest_nav = max((str(row.get('nav_date') or '') for row in data.get('nav', [])), default='')
        if latest_nav < expected:
            try:
                exact = await provider.request_dataframe('fund_nav', ts_code=ts_code, nav_date=expected)
                fresh = [row for row in exact.to_dict('records') if str(row.get('ts_code') or '').upper() == ts_code
                         and str(row.get('nav_date') or '') == expected]
                if fresh:
                    data['nav'] = fresh + [row for row in data.get('nav', []) if str(row.get('nav_date')) != expected]
                    latest_nav = expected
                    sources['nav'] = 'Tushare/fund_nav'
                    failures.pop('nav', None)
            except Exception as error:
                failures['nav'] = f'fund_nav: 指定净值日期核对失败（{type(error).__name__}），保留历史记录'
        previous = max((str(row.get('trade_date') or '') for row in data.get('daily', [])
                        if str(row.get('trade_date') or '') < expected), default='')
        status = 'available' if latest_nav == expected else 'failed' if 'nav' in failures else 'stale' if not latest_nav or (previous and latest_nav < previous) or today.strftime('%Y%m%d') > expected else 'pending-publication'
        field_status['nav'] = {'status': status, 'expectedDate': expected_session, 'availableDate': latest_nav or None,
                               'detail': '净值已对齐' if status == 'available' else '尚无同日净值；历史值不替代当前折溢价'}
        if status == 'stale':
            failures['nav'] = 'fund_nav: 近期与指定日期核对后净值仍落后，需检查来源覆盖或缓存'
    index_code = data.get('info', [{}])[0].get('index_code') if data.get('info') else None
    if index_code and re.fullmatch(r'[A-Z0-9]{6}\.(SH|SZ|CSI)', str(index_code), re.IGNORECASE):
        await get('indexDaily', 'index_daily', ts_code=index_code, start_date=start, end_date=end)
        await align_current('indexDaily', 'index_daily', {'ts_code':index_code})
        await get('indexWeights', 'index_weight', index_code=index_code, start_date=start, end_date=end)
        await get('indexValuation', 'index_dailybasic', ts_code=index_code, start_date=start, end_date=end)
        await align_current('indexValuation', 'index_dailybasic', {'ts_code':index_code})
        if (not data.get('indexValuation') or 'indexValuation' in failures) and data.get('indexWeights') and data.get('indexDaily'):
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
        sources['orderbook'] = data['orderbook'][0]['source']
    except Exception as error:
        data['orderbook'] = []
        failures['orderbook'] = f'盘口数据: {type(error).__name__}，未取得带证券代码和源时间的有效买卖价'
    if not any(data.values()):
        raise ValueError('ETF研究接口全部不可用，请检查数据权限')
    return {'version': 1, 'source': 'Tushare/research-bundle', 'data': data,
            'sources': sources, 'fieldStatus': field_status, 'failures': failures, 'quality': 'partial' if failures else 'available',
            'units': {'daily.amount': '千元', 'shares.total_share': '万份', 'shares.total_size': '万元',
                      'nav.unit_nav': '元', 'nav.adj_nav': '复权净值', 'factors.adj_factor': 'ratio'},
            'limitations': ['历史持仓按披露期，不是实时持仓', '盘口源时间不等于采集时间，缺失不补0', '指数估值接口覆盖有限，失败不补零']}
