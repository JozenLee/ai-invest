"""Public fund-code collection only. No account data, database writes or trades.

The existing ETF research collector generates SH/SZ identities; OTC share classes
instead use their exact six-digit code. Third-party disclosures never establish
formal ETF/index identity. JS literals are parsed as data and are never executed.
"""
import ast
import asyncio
import hashlib
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timezone, timedelta
from typing import Any

import requests
from bs4 import BeautifulSoup

CHINA = timezone(timedelta(hours=8))
_NAV_POOL = ThreadPoolExecutor(max_workers=3, thread_name_prefix='portfolio-nav')
_NAV_SLOTS = threading.BoundedSemaphore(3)


def _number(value):
    try:
        result = float(str(value).replace('%', '').strip())
        return result if result == result and abs(result) != float('inf') else None
    except (TypeError, ValueError):
        return None


def _literal(text, name):
    match = re.search(r'\bvar\s+' + re.escape(name) + r'\s*=\s*(.*?);', text, re.S)
    if not match:
        return None
    return json.loads(match.group(1))


def parse_fund_series(text: str, ticker: str, observed_at: str) -> dict:
    if _literal(text, 'fS_code') != ticker:
        raise ValueError('fund share-class identity mismatch')
    url = f'https://fund.eastmoney.com/pingzhongdata/{ticker}.js'
    nav, allocation = [], []
    for point in _literal(text, 'Data_netWorthTrend') or []:
        nav_value, timestamp = _number(point.get('y')), _number(point.get('x'))
        if nav_value is None or nav_value <= 0 or timestamp is None:
            continue
        date = datetime.fromtimestamp(timestamp / 1000, CHINA).date().isoformat()
        if date > datetime.fromisoformat(observed_at).astimezone(CHINA).date().isoformat():
            continue
        nav.append({'ts_code': ticker + '.OF', 'nav_date': date, 'unit_nav': nav_value,
                    'ann_date': None, 'observedAt': observed_at,
                    'source': 'eastmoney/Data_netWorthTrend', 'source_url': url,
                    'reported_return_pct': _number(point.get('equityReturn')),
                    'distribution_note': str(point.get('unitMoney') or '')})
    assets = _literal(text, 'Data_assetAllocation') or {}
    for series in assets.get('series', []):
        # "净资产" is an amount, not a weight; never manufacture the missing fund stake.
        name = str(series.get('name') or '')
        if '占净比' not in name:
            continue
        for date, weight in zip(assets.get('categories', []), series.get('data', [])):
            value = _number(weight)
            if value is not None and 0 <= value <= 100 and re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
                allocation.append({'asset': name.replace('占净比', ''), 'weightPct': value,
                                   'weightBasis': 'net-assets', 'report_period': date,
                                   'source': 'eastmoney/Data_assetAllocation', 'source_url': url,
                                   'ann_date': None, 'observedAt': observed_at})
    return {'name': _literal(text, 'fS_name'), 'nav': nav, 'assetAllocation': allocation}


def parse_fund_holdings(text: str, ticker: str, url: str, observed_at: str) -> list:
    match = re.search(r'content\s*:\s*("(?:\\.|[^"\\])*")', text, re.S)
    if not match:
        raise ValueError('unrecognized disclosure envelope')
    content = ast.literal_eval(match.group(1))
    soup = BeautifulSoup(content, 'html.parser')
    rows = []
    for box in soup.select('.boxitem'):
        title = box.find('h4')
        if not title:
            continue
        # Match linked fund identity as well as the report date; avoid cross-product data.
        link = title.find('a', href=True)
        if not link or f'/{ticker}.html' not in link['href']:
            continue
        match_date = re.search(r'截止至[：:]\s*(\d{4}-\d{2}-\d{2})', title.get_text(' ', strip=True))
        if not match_date:
            continue
        period = match_date.group(1)
        table = box.find('table')
        if not table:
            continue
        headers = [re.sub(r'\s+', '', cell.get_text()) for cell in table.select('thead th')]
        code_column = next((headers.index(x) for x in ['股票代码', '基金代码'] if x in headers), None)
        name_column = next((headers.index(x) for x in ['股票名称', '基金名称'] if x in headers), None)
        weight_column = next((i for i, h in enumerate(headers) if h == '占净值比例'), None)
        if code_column is None or name_column is None or weight_column is None:
            continue
        for tr in table.select('tbody tr'):
            cells = [cell.get_text('', strip=True) for cell in tr.find_all('td')]
            if len(cells) <= max(code_column, name_column, weight_column):
                continue
            security, weight = cells[code_column], _number(cells[weight_column])
            if not re.fullmatch(r'\d{5,6}', security) or weight is None or not 0 <= weight <= 100:
                continue
            rows.append({'stock_code': security, 'stock_name': cells[name_column], 'weight': weight,
                         'weightBasis': 'net-assets', 'kind': 'fund' if '基金代码' in headers else 'stock',
                         'report_period': period, 'ann_date': None, 'observedAt': observed_at,
                         'source': 'eastmoney/periodic-fund-holdings', 'source_url': url})
    return rows


def _get(url: str, ticker: str) -> str:
    with requests.Session() as session:
        session.headers.update({'User-Agent': 'Mozilla/5.0', 'Referer': f'https://fundf10.eastmoney.com/ccmx_{ticker}.html'})
        response = session.get(url, timeout=(5, 15))
        response.raise_for_status()
        if len(response.content) > 5_000_000:
            raise ValueError('response too large')
        return response.text


def parse_target_fund_report(document: dict, ticker: str, observed_at: str) -> list:
    """Fail closed on changed layouts or multiple funds; never scan contract ratios.

    The issuer's report is mirrored by Eastmoney with its original PDF attached.
    Code comes from target-fund basic information, weight only from the actual
    period-end fund investment table. Currently supports the two reviewed feeders.
    """
    expected = {'017470': ('588200', ['嘉实', '芯片']),
                '024975': ('588710', ['华泰柏瑞', '半导体', '材料设备'])}.get(ticker)
    if not expected or ticker not in [s.get('stock') for s in document.get('security', [])]:
        return []
    title, text = str(document.get('notice_title') or ''), str(document.get('notice_content') or '')
    match = re.search(r'(20\d{2})年(?:中期报告|年度报告|第\s*([1-4])\s*季度报告)', title)
    if not match or '联接' not in title or '提示' in title or document.get('is_ai_summary') in (1, '1', True):
        return []
    year = match.group(1)
    end = {'1': '03-31', '2': '06-30', '3': '09-30', '4': '12-31'}.get(match.group(2))
    period = year + '-' + (end or ('06-30' if '中期报告' in title else '12-31'))
    published = str(document.get('notice_date') or '')[:10]
    today = datetime.fromisoformat(observed_at).astimezone(CHINA).date().isoformat()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', published) or period > published or published > today:
        return []
    basic = re.search(r'目标基金基本情况(.*?)(?:\n\s*2\.2\s|投资目标)', text, re.S)
    if not basic or not re.search(r'基金主代码\s+' + expected[0] + r'\b', basic.group(1)):
        return []
    # Ignore table of contents; actual section has table headers and exactly one numbered row.
    sections = re.findall(r'(?:\n|^)\s*(\d+\.\d+)\s+[^\n]*期末[^\n]*基金投资明细\s*\n(.*?)(?=\n\s*\d+\.\d+\s|\Z)', text, re.S)
    for section, table in reversed(sections):
        compact = re.sub(r'\s+', '', table)
        if not all(fragment in compact for fragment in expected[1]) or not all(h in compact for h in ['公允价值', '净值比', '序号', '基金名称']):
            continue
        numbered = re.findall(r'^\s*(\d+)\s+(.+)$', table, re.M)
        if len(numbered) != 1 or numbered[0][0] != '1':
            continue
        value = re.search(r'\s{2,}(\d{1,3}\.\d{2})\s*$', numbered[0][1])
        weight = _number(value.group(1)) if value else None
        if weight is None or not 0 < weight <= 100:
            continue
        # The original PDF and the precise section make the extracted fact independently auditable.
        name = re.search(r'基金名称\s+(.*?)\n\s*基金主代码', basic.group(1), re.S)
        if not name:
            return []
        return [{'stock_code': expected[0], 'stock_name': re.sub(r'\s+', '', name.group(1)), 'kind': 'fund',
                 'weight': weight, 'weightBasis': 'net-assets', 'report_period': period, 'ann_date': published,
                 'observedAt': observed_at, 'source': 'issuer-periodic-report/eastmoney-mirror',
                 'source_url': document.get('attach_url'), 'locator': section + ' 期末基金投资明细',
                 'announcement_id': document.get('art_code'),
                 'extracted_row': numbered[0][1].strip()}]
    return []


def _target_fund_holdings(ticker: str, observed: str) -> dict:
    if ticker not in ('017470', '024975'):
        return {'holdings': [], 'sources': []}
    url = f'https://api.fund.eastmoney.com/f10/JJGG?fundcode={ticker}&pageIndex=1&pageSize=20&type=3'
    notices = json.loads(_get(url, ticker)).get('Data', [])
    candidates = [n for n in notices if n.get('FUNDCODE') == ticker and re.fullmatch(r'AN\d+', str(n.get('ID'))) and
                  re.search(r'20\d{2}年(?:中期报告|年度报告|第\s*[1-4]\s*季度报告)', str(n.get('TITLE'))) and '提示' not in n.get('TITLE', '')]
    candidates.sort(key=lambda n: n.get('PUBLISHDATE', ''), reverse=True)
    # Do not silently fall back to a superseded report when latest layout cannot be parsed.
    if not candidates:
        raise ValueError('no current periodic report')
    notice = candidates[0]
    detail_url = 'https://np-cnotice-fund.eastmoney.com/api/content/ann?client_source=web_fund&show_all=1&art_code=' + notice['ID']
    text = _get(detail_url, ticker)
    body = json.loads(text)
    document = body.get('data', {})
    if body.get('success') != 1 or document.get('art_code') != notice['ID']:
        raise ValueError('announcement identity mismatch')
    holdings = parse_target_fund_report(document, ticker, observed)
    if not holdings:
        raise ValueError('latest actual target fund weight unavailable or ambiguous')
    return {'holdings': holdings, 'sources': [{'url': detail_url, 'pdfUrl': document.get('attach_url'),
            'observedAt': observed, 'contentHash': hashlib.sha256(text.encode()).hexdigest(),
            'publishedAt': document.get('notice_date'), 'field': 'targetFundHoldings'}]}


def parse_tushare_nav(rows: list, ticker: str, observed: str) -> list:
    result = []
    today = datetime.fromisoformat(observed).astimezone(CHINA).date().isoformat()
    for row in rows:
        if row.get('ts_code') != ticker + '.OF':
            continue
        raw_date, raw_ann = str(row.get('nav_date') or ''), str(row.get('ann_date') or '')
        try:
            date = datetime.strptime(raw_date, '%Y%m%d').date().isoformat()
            published = datetime.strptime(raw_ann, '%Y%m%d').date().isoformat()
        except ValueError:
            continue
        nav, adjusted = _number(row.get('unit_nav')), _number(row.get('adj_nav'))
        if date > today or published > today or nav is None or nav <= 0:
            continue
        result.append({'ts_code': ticker + '.OF', 'nav_date': date, 'ann_date': published, 'unit_nav': nav,
                       'adj_nav': adjusted if adjusted is not None and adjusted > 0 else None,
                       'source': 'Tushare/fund_nav', 'source_url': 'https://tushare.pro/document/2?doc_id=119',
                       'observedAt': observed})
    return result


def _tushare_nav(ticker: str, observed: str) -> list:
    from providers.tushare_provider import TushareProvider
    async def fetch_nav():
        provider = TushareProvider()
        today = datetime.fromisoformat(observed).astimezone(CHINA)
        # Mirror ETF collection: broad history may be a stale/capped page.
        # Independently verify the recent business-date window and latest date.
        merged = {}
        for days in (730, 14):
            try:
                frame = await provider.request_dataframe('fund_nav', ts_code=ticker + '.OF',
                    start_date=(today - timedelta(days=days)).strftime('%Y%m%d'),
                    end_date=today.strftime('%Y%m%d'), _timeout_seconds=8)
                parsed = parse_tushare_nav(frame.to_dict('records'), ticker, observed)
                merged.update({row['nav_date']: row for row in parsed})
            except Exception:
                continue
        return [merged[date] for date in sorted(merged)]
    return asyncio.run(fetch_nav())


def merge_fund_nav(public_rows: list, adjusted_rows: list, ticker: str) -> tuple:
    """Join exact share/date only. Explicit adj_nav travels with its own unit_nav.
    A disagreeing unit NAV is preserved as a conflict, never used to derive a factor.
    """
    by_date = {n['nav_date']: dict(n) for n in public_rows if n.get('ts_code') == ticker + '.OF'}
    conflicts = []
    adjusted_by_date = {}
    for row in adjusted_rows:
        if row.get('ts_code') != ticker + '.OF' or row.get('source') != 'Tushare/fund_nav':
            continue
        date = row.get('nav_date')
        if not isinstance(date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
            continue
        prior = adjusted_by_date.get(date)
        if prior and (prior.get('unit_nav') != row.get('unit_nav') or prior.get('adj_nav') != row.get('adj_nav')):
            conflicts.append(date)
        adjusted_by_date[date] = row
    for date, row in adjusted_by_date.items():
        prior = by_date.get(date)
        nav = _number(row.get('unit_nav'))
        # Public NAV is published to four decimals; tolerate only half that rounding unit.
        if nav is None or nav <= 0 or (prior and abs(prior['unit_nav'] - nav) > 0.00005 + 1e-10):
            conflicts.append(date)
        if date in conflicts:
            kept = dict(prior or row)
            kept['adj_nav'] = None
            kept['nav_source_conflict'] = True
            kept['conflicting_nav_observation'] = row
            by_date[date] = kept
        else:
            by_date[date] = dict(row)
            if prior:
                by_date[date]['corroborating_nav_observation'] = prior
    return [by_date[d] for d in sorted(by_date)], sorted(set(conflicts))


def collect_portfolio_product(ticker: str) -> dict[str, Any]:
    if not re.fullmatch(r'\d{6}', ticker):
        raise ValueError('six-digit public fund code required')
    observed = datetime.now(timezone.utc).isoformat()
    urls = {
        'series': f'https://fund.eastmoney.com/pingzhongdata/{ticker}.js',
        'holdings': f'https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={ticker}&topline=10000&year=&month=&rt={datetime.now().timestamp()}',
    }
    data = {'ticker': ticker, 'nav': [], 'holdings': [], 'assetAllocation': []}
    failures, sources = {}, []
    nav_future = None
    # Subscription dispatch can briefly run four fund bundles while the upstream
    # adjusted-NAV pool intentionally allows three. Wait for a slot instead of
    # turning normal local concurrency into a false data-quality failure.
    if _NAV_SLOTS.acquire(timeout=45):
        nav_future = _NAV_POOL.submit(_tushare_nav, ticker, observed)
        nav_future.add_done_callback(lambda _: _NAV_SLOTS.release())
    else:
        failures['adjustedNav'] = '复权净值采集繁忙，请稍后刷新'
    deadline = time.monotonic() + 30
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {key: pool.submit(_get, url, ticker) for key, url in urls.items()}
        target_future = pool.submit(_target_fund_holdings, ticker, observed)
        for key, future in futures.items():
            try:
                text = future.result()
                if key == 'series':
                    data.update(parse_fund_series(text, ticker, observed))
                else:
                    data['holdings'] = parse_fund_holdings(text, ticker, urls[key], observed)
                sources.append({'url': urls[key], 'observedAt': observed, 'contentHash': hashlib.sha256(text.encode()).hexdigest(), 'field': key})
            except Exception as exc:
                # Do not expose proxy URLs, credentials or upstream response bodies.
                failures[key] = type(exc).__name__
        try:
            target = target_future.result()
            data['holdings'].extend(target['holdings'])
            sources.extend(target['sources'])
        except Exception as exc:
            failures['targetFundHoldings'] = type(exc).__name__
    if nav_future:
        done, _ = wait([nav_future], timeout=max(0, deadline - time.monotonic()))
        if done:
            try:
                nav_rows = nav_future.result()
                data['nav'], data['navConflicts'] = merge_fund_nav(data['nav'], nav_rows, ticker)
                if data['navConflicts']:
                    failures['navConflict'] = '同日单位净值存在冲突：' + ','.join(data['navConflicts'])
                if not any(n.get('adj_nav') for n in nav_rows):
                    failures['adjustedNav'] = '数据源未返回明确的复权净值'
            except Exception as exc:
                failures['adjustedNav'] = type(exc).__name__
        else:
            nav_future.cancel()
            failures['adjustedNav'] = '复权净值采集超时，已保留普通净值'
    # The historical seed registry in TS supplies reviewed official identity links.
    # New products require a fund_identity official structured claim, not an EM name inference.
    for key in ('nav', 'holdings', 'assetAllocation'):
        if not data[key]:
            failures.setdefault(key, '未取得可用披露数据，请刷新或核验基金定期报告')
    recent_adjusted = []
    lagging_observations = 0
    started_adjusted = False
    for n in reversed(data['nav']):
        if not n.get('adj_nav'):
            if not started_adjusted:
                lagging_observations += 1
                continue
            break
        started_adjusted = True
        recent_adjusted.append(n)
    data['adjustedNavCoverage'] = {'observations': len(recent_adjusted), 'fullHistoryObservations': len(data['nav']),
                                  'start': recent_adjusted[-1]['nav_date'] if recent_adjusted else None,
                                  'end': recent_adjusted[0]['nav_date'] if recent_adjusted else None,
                                  'laggingObservations': lagging_observations,
                                  'basis': 'contiguous explicit adj_nav ending at its latest published date; newer unit NAV is retained but never assigned an inferred factor'}
    if recent_adjusted and lagging_observations:
        failures['adjustedNavLag'] = f'复权净值比普通净值少{lagging_observations}个观测日，历史风险截至{recent_adjusted[0]["nav_date"]}'
    return {'success': any(data[k] for k in ('nav', 'holdings', 'assetAllocation')), 'data': data,
            'observedAt': observed, 'sources': sources, 'failures': failures,
            'gaps': ['产品类型和目标基金关系需以发行人或交易所正式资料核验',
                     '数据页未提供准确发布时间，以本次采集时间作为可用起点',
                     *(['缺少连续显式复权数据，暂不能完整计算历史风险'] if not recent_adjusted else []),
                     '申赎费用、实际持有批次和销售渠道到账规则需单独核验']}

