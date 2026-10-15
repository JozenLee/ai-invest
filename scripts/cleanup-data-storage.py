#!/usr/bin/env python3
"""Run the bounded SQLite retention policy on demand."""

import argparse
import asyncio
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'data-service'))

from db import db  # noqa: E402
from services.subscription_config import get_config  # noqa: E402
from workers.data_cleanup import cleanup_subscription_storage  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--vacuum', action='store_true', help='Rebuild the database file after cleanup; stop services first.')
    args = parser.parse_args()
    result = await cleanup_subscription_storage(db, get_config())
    if args.vacuum:
        conn = sqlite3.connect(db.db_path, timeout=60)
        try:
            conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            conn.execute('VACUUM')
        finally:
            conn.close()
    print(json.dumps({'deleted': sum(result.values()), 'details': result, 'vacuum': args.vacuum}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
