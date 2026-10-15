"""Fetch exact ETF fees into new immutable bundles; never rewrite old reports."""
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

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--codes')
    args = parser.parse_args()
    database = os.environ.get('DATABASE_URL', 'file:./prisma/dev.db').removeprefix('file:')
    database = str(ROOT / database) if not os.path.isabs(database) else database
    conn = sqlite3.connect(database, timeout=30)
    try:
        if args.codes:
            codes = args.codes.split(',')
        else:
            row = conn.execute("SELECT dataJson FROM AIAnalysisReport WHERE type='comprehensive' ORDER BY createdAt DESC LIMIT 1").fetchone()
            codes = [item['ticker'] for item in json.loads(row[0])['researchEvaluation']['decisions']]
        if not codes or any(not code.isdigit() or len(code) != 6 for code in codes):
            raise ValueError('invalid ETF codes')
        provider = TushareProvider()
        failed = 0
        for code in dict.fromkeys(codes):
            ts_code = code + ('.SH' if code.startswith(('5', '6')) else '.SZ')
            try:
                frame = await provider.request_dataframe('fund_basic', ts_code=ts_code, market='E', fields='ts_code,m_fee,c_fee', _timeout_seconds=12, _busy_retries=0)
                rows = [row for row in frame.to_dict('records') if str(row.get('ts_code', '')).upper() == ts_code]
                if not rows or rows[0].get('m_fee') is None:
                    raise ValueError('missing fee')
                fee = float(rows[0]['m_fee'])
                if not math.isfinite(fee) or not 0 <= fee <= 10:
                    raise ValueError('invalid fee')
                row = {'ts_code':ts_code, 'm_fee':fee}
                custody = rows[0].get('c_fee')
                if custody is not None and math.isfinite(float(custody)):
                    row['c_fee'] = float(custody)
                payload = json.dumps({'version':1, 'source':'Tushare/research-bundle', 'data':{'fees':[row]}, 'sources':{'fees':'Tushare/fund_basic'}, 'failures':{}, 'quality':'partial'}, ensure_ascii=False, allow_nan=False)
                if args.write:
                    conn.execute('INSERT INTO raw_payloads (id,datasetKey,targetCode,provider,payload,contentHash,fetchedAt) VALUES (?,?,?,?,?,?,?)', (str(uuid.uuid4()), 'etf_research', code, 'tushare', payload, hashlib.sha256(payload.encode()).hexdigest(), datetime.now(timezone.utc).isoformat()))
                    conn.commit()
                print(json.dumps({'code':code,'feePct':fee,'saved':args.write}), flush=True)
            except Exception as error:
                failed += 1
                print(json.dumps({'code':code,'status':'unavailable','errorType':type(error).__name__}), flush=True)
        if failed:
            sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    asyncio.run(main())
