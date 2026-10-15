"""Backfill verified historical gaps into new raw payload versions; never rewrite reports."""
import argparse
import asyncio
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')
sys.path.insert(0, str(ROOT / 'data-service'))
from providers.tushare_provider import TushareProvider
from services.research_collection import repair_history_gaps, history_date

def clean_json(value):
    if isinstance(value, dict):
        return {key:clean_json(item) for key,item in value.items()}
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--codes', required=True)
    parser.add_argument('--cutoff', required=True)
    parser.add_argument('--max-requests', type=int, default=80)
    parser.add_argument('--fields', default='factors,indexDaily,daily')
    args = parser.parse_args()
    database = os.environ.get('DATABASE_URL', 'file:./prisma/dev.db').removeprefix('file:')
    database = str(ROOT / database) if not os.path.isabs(database) else database
    conn = sqlite3.connect(database, timeout=30)
    conn.row_factory = sqlite3.Row
    calendar = json.loads(conn.execute("SELECT payload FROM raw_payloads WHERE datasetKey='research_calendar' ORDER BY fetchedAt DESC LIMIT 1").fetchone()['payload'])['data']
    expected = sorted({history_date(row.get('cal_date') or row.get('date')) for row in calendar if str(row.get('is_open')) in ('1','1.0')
                       and history_date(row.get('cal_date') or row.get('date')) and history_date(row.get('cal_date') or row.get('date')) <= history_date(args.cutoff)})[-160:]
    provider = TushareProvider()
    for code in args.codes.split(','):
        if len(code) != 6 or not code.isdigit():
            raise ValueError('invalid ETF code')
        original = conn.execute("SELECT id,payload FROM raw_payloads WHERE datasetKey='etf_research' AND targetCode=? ORDER BY fetchedAt DESC LIMIT 1", (code,)).fetchone()
        if not original:
            raise ValueError('missing source bundle: ' + code)
        payload = json.loads(original['payload'])
        cached = {}
        histories = conn.execute("SELECT payload FROM raw_payloads WHERE datasetKey='etf_research' AND targetCode=? ORDER BY fetchedAt DESC LIMIT 20", (code,)).fetchall()
        for history in reversed(histories):
            prior = json.loads(history['payload']).get('data', {})
            for field in ('daily','factors','indexDaily'):
                merged = {history_date(row.get('trade_date') or row.get('date')):row for row in [*cached.get(field,[]),*prior.get(field,[])]}
                cached[field] = list(merged.values())
        audit = await repair_history_gaps(provider, payload['data'], code + ('.SH' if code.startswith(('5','6')) else '.SZ'), expected, cached=cached, max_requests=args.max_requests, fields=args.fields.split(','))
        payload['historyAudit'] = audit
        payload['repairParentId'] = original['id']
        for field, status in audit['fields'].items():
            payload.setdefault('fieldStatus', {})[field] = status
            if status['status'] == 'available':
                payload.setdefault('failures', {}).pop(field, None)
            else:
                payload.setdefault('failures', {})[field] = '历史日期仍有缺口，未插值'
        payload['quality'] = 'partial' if payload.get('failures') else 'available'
        encoded = json.dumps(clean_json(payload), ensure_ascii=False, allow_nan=False, default=str, separators=(',', ':'))
        with conn:
            conn.execute('INSERT INTO raw_payloads(id,datasetKey,targetCode,provider,payload,contentHash,fetchedAt) VALUES(?,?,?,?,?,?,?)',
                         (uuid.uuid4().hex, 'etf_research', code, 'Tushare/exact-date-history-repair', encoded, hashlib.sha256(encoded.encode()).hexdigest(), datetime.now(timezone.utc).isoformat()))
        print(json.dumps({'code': code, **audit}, ensure_ascii=False), flush=True)
    conn.close()

if __name__ == '__main__':
    asyncio.run(main())
