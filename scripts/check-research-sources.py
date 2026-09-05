"""Check a bounded research input sample; --store explicitly persists raw evidence.

Uses only the root .env. Does not enable schedules, call AI, or place orders.
"""
import argparse
import asyncio
import hashlib
import json
import logging
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'data-service'))
load_dotenv(root / '.env')
logging.disable(logging.CRITICAL)


async def main():
    from providers.tushare_provider import TushareProvider
    from services.research_collection import collect_research
    parser = argparse.ArgumentParser()
    parser.add_argument('--etf', default='159995')
    parser.add_argument('--store', action='store_true')
    args = parser.parse_args()
    provider = TushareProvider()
    results = []
    for key, code in [('research_calendar', 'sh000001'), ('etf_research', args.etf)]:
        try:
            result = await asyncio.wait_for(collect_research(provider, key, code), timeout=180)
            # Use the collector's clean JSON contract; never print private gateway URLs.
            from services.subscription_sync_service import _clean_json
            result = _clean_json(result)
            if args.store:
                from db import db
                payload = json.dumps(result, ensure_ascii=False, allow_nan=False)
                db.insert('INSERT INTO raw_payloads (id,datasetKey,targetCode,provider,payload,contentHash,fetchedAt) VALUES (?,?,?,?,?,?,?)',
                          (uuid.uuid4().hex, key, code, result['source'], payload, hashlib.sha256(payload.encode()).hexdigest(), datetime.now(timezone.utc).isoformat()))
            results.append({'dataset': key, 'status': result.get('quality', 'available'),
                            'records': len(result['data']) if isinstance(result['data'], list) else {k: len(v) for k, v in result['data'].items()},
                            'failures': result.get('failures', {}), 'stored': args.store})
        except Exception as error:
            results.append({'dataset': key, 'status': 'failed', 'errorType': type(error).__name__, 'stored': False})
    print(json.dumps(results, ensure_ascii=False))
    if any(r['status'] == 'failed' for r in results):
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
