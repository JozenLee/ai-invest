"""Archive price-only research history. Never rewrite a historical decision or report."""
import argparse
import asyncio
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
import time
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')
sys.path.insert(0, str(ROOT / 'data-service'))
from providers.tushare_provider import TushareProvider


def day(value):
    value = str(value or '').replace('-', '')
    return f'{value[:4]}-{value[4:6]}-{value[6:8]}' if len(value) == 8 and value.isdigit() else None


def normalize(rows, end, start):
    result = {}
    for row in rows:
        date = day(row.get('trade_date'))
        if not date or not start <= date <= end:
            continue
        try:
            bar = dict(date=date, **{key: float(row[key]) for key in ['open', 'high', 'low', 'close']},
                       volume=float(row.get('vol', 0)) * 100, amount=float(row.get('amount', 0)) * 1000)
            if all(math.isfinite(bar[key]) and bar[key] > 0 for key in ['open', 'high', 'low', 'close']) and all(math.isfinite(bar[key]) and bar[key] >= 0 for key in ['volume', 'amount']) and bar['low'] <= min(bar['open'], bar['close']) <= max(bar['open'], bar['close']) <= bar['high']:
                result[date] = bar
        except (ValueError, TypeError, KeyError):
            continue
    return [result[key] for key in sorted(result)]


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--industry', required=True)
    parser.add_argument('--start', default='2023-01-01')
    parser.add_argument('--max-requests', type=int, default=120)
    parser.add_argument('--max-seconds', type=int, default=180)
    args = parser.parse_args()
    datetime.strptime(args.start, '%Y-%m-%d')
    if not 1 <= args.max_requests <= 500 or not 30 <= args.max_seconds <= 3600:
        raise ValueError('Invalid collection budget')
    deadline = time.monotonic() + args.max_seconds
    database = Path(os.getenv('DATABASE_URL', 'file:./prisma/dev.db').removeprefix('file:'))
    if not database.is_absolute():
        database = ROOT / database
    conn = sqlite3.connect(database, timeout=30)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT payload FROM raw_payloads WHERE datasetKey='research_snapshot' AND targetCode=? ORDER BY fetchedAt DESC LIMIT 1", (args.industry,)).fetchone()
    if not row:
        raise ValueError('No frozen research snapshot')
    snapshot = json.loads(row['payload'])
    end = max(bar['date'] for bar in snapshot['benchmarkBars'])
    provider = TushareProvider()
    requests_used = 0
    async def request(api, code):
        nonlocal requests_used
        cursor, finish = datetime.strptime(end, '%Y-%m-%d'), datetime.strptime(args.start, '%Y-%m-%d')
        rows = []
        while cursor >= finish:
            left = max(finish, cursor - timedelta(days=29))
            key = f'strategy-history-page:{api}:{code}:{left:%Y%m%d}:{cursor:%Y%m%d}'
            cached = conn.execute('SELECT payload FROM raw_payloads WHERE id=?', (key,)).fetchone()
            if cached:
                page = json.loads(cached['payload'])
            else:
                if requests_used >= args.max_requests or time.monotonic() >= deadline:
                    raise RuntimeError('Request budget exhausted; rerun resumes cached pages')
                requests_used += 1
                frame = await provider.request_dataframe(api, ts_code=code, start_date=left.strftime('%Y%m%d'), end_date=cursor.strftime('%Y%m%d'), _timeout_seconds=12, _busy_retries=2)
                page = json.loads(frame.to_json(orient='records'))
                encoded = json.dumps(page, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
                with conn:
                    conn.execute('INSERT OR IGNORE INTO raw_payloads(id,datasetKey,targetCode,provider,payload,contentHash,fetchedAt) VALUES(?,?,?,?,?,?,?)',
                                 (key, 'strategy_lab_history_page', code, 'Tushare/' + api, encoded, hashlib.sha256(encoded.encode()).hexdigest(), datetime.now(timezone.utc).isoformat()))
            rows.extend(row for row in page if row.get('ts_code') == code and day(row.get('trade_date')) and left.strftime('%Y-%m-%d') <= day(row.get('trade_date')) <= cursor.strftime('%Y-%m-%d'))
            cursor = left - timedelta(days=1)
        return rows

    benchmark = normalize(await request('index_daily', snapshot['profile']['benchmark']), end, args.start)
    if len(benchmark) < 62:
        raise ValueError('Benchmark history is insufficient')
    assets, exclusions = [], []
    for etf in snapshot['etfs']:
        ticker = etf['ticker']
        code = ticker + ('.SH' if ticker.startswith(('5', '6')) else '.SZ')
        try:
            bars = normalize(await request('fund_daily', code), end, args.start)
            factors = {day(row.get('trade_date')): float(row['adj_factor']) for row in await request('fund_adj', code)}
            if not bars or any(not math.isfinite(factors.get(b['date'], 0)) or factors.get(b['date'], 0) <= 0 for b in bars):
                raise ValueError('Incomplete adjustment factors')
            base = factors[bars[-1]['date']]
            adjusted = [{**b, **{key: b[key] * factors[b['date']] / base for key in ['open', 'high', 'low', 'close']}} for b in bars]
            if any(abs(b['close'] / adjusted[i-1]['close'] - 1) > .3 for i, b in enumerate(adjusted) if i):
                raise ValueError('Discontinuous adjusted price')
            if not etf['indexCode']:
                raise ValueError('Missing index mapping')
            assets.append(dict(ticker=ticker, indexCode=etf['indexCode'], bars=adjusted))
            print(json.dumps(dict(ticker=ticker, observations=len(bars), first=bars[0]['date'], last=bars[-1]['date']), ensure_ascii=False), flush=True)
        except Exception as error:
            exclusions.append(dict(ticker=ticker, reason=type(error).__name__ + ': 历史价格或复权采集不完整'))
            print(json.dumps(exclusions[-1], ensure_ascii=False), flush=True)
    payload = dict(snapshotId=snapshot['id'], asOf=snapshot['asOf'], benchmark=snapshot['profile']['benchmark'], benchmarkBars=benchmark,
                   assets=assets, exclusions=exclusions, limitations=['价格历史回灌：采用当前产品池与指数映射；不包含历史财务、新闻或AI判断。'])
    encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    with conn:
        conn.execute('INSERT OR IGNORE INTO raw_payloads(id,datasetKey,targetCode,provider,payload,contentHash,fetchedAt) VALUES(?,?,?,?,?,?,?)',
                     ('strategy-history:' + digest, 'strategy_lab_price_history', args.industry, 'Tushare/fund_daily+fund_adj+index_daily', encoded, digest, datetime.now(timezone.utc).isoformat()))
    conn.close()
    print(json.dumps(dict(status='archived', assets=len(assets), excluded=len(exclusions), benchmarkSessions=len(benchmark))))


if __name__ == '__main__':
    asyncio.run(main())
