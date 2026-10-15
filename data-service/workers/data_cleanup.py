"""Bounded retention for influencer content and subscription research data."""

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List

from db import Database

logger = logging.getLogger(__name__)


def _chunks(values: List[str], size: int = 100) -> Iterable[List[str]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def _delete_ids(conn, table: str, ids: List[str]) -> int:
    deleted = 0
    for chunk in _chunks(ids):
        placeholders = ','.join('?' for _ in chunk)
        cursor = conn.execute(f'DELETE FROM {table} WHERE id IN ({placeholders})', chunk)
        deleted += max(0, cursor.rowcount)
        conn.commit()
    return deleted


def _table_exists(conn, table: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", (table,)).fetchone() is not None


def _cutoff(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))).isoformat()


def _parse_time(value: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return datetime.min.replace(tzinfo=timezone.utc)


def _cleanup_expired_posts_sync(database: Database) -> int:
    conn = database.get_connection()
    try:
        influencers = conn.execute('SELECT id,name,dataRetentionDays FROM Influencer').fetchall()
        deleted = 0
        for influencer in influencers:
            cursor = conn.execute(
                """DELETE FROM InfluencerPost
                    WHERE influencerId=?
                      AND publishTime < datetime('now', '-' || ? || ' days')""",
                (influencer['id'], int(influencer['dataRetentionDays'] or 30)),
            )
            deleted += max(0, cursor.rowcount)
        conn.commit()
        return deleted
    finally:
        conn.close()


async def cleanup_expired_posts(database: Database) -> int:
    """Clean influencer posts while supporting both production and async test DBs."""
    probe = database.get_connection()
    if hasattr(probe, '__aenter__'):
        try:
            async with probe as conn:
                cursor = await conn.execute('SELECT id,name,dataRetentionDays FROM Influencer')
                influencers = await cursor.fetchall()
            deleted = 0
            for influencer in influencers:
                async with database.get_connection() as conn:
                    cursor = await conn.execute(
                        """DELETE FROM InfluencerPost
                            WHERE influencerId=?
                              AND publishTime < datetime('now', '-' || ? || ' days')""",
                        (influencer['id'], int(influencer['dataRetentionDays'] or 30)),
                    )
                    deleted += max(0, cursor.rowcount)
            return deleted
        except Exception as error:
            logger.error('Influencer cleanup failed: %s', error, exc_info=True)
            return 0
    probe.close()
    try:
        return await asyncio.to_thread(_cleanup_expired_posts_sync, database)
    except Exception as error:
        logger.error('Influencer cleanup failed: %s', error, exc_info=True)
        return 0


def _delete_raw_before(conn, dataset_key: str, cutoff: str) -> int:
    deleted = 0
    while True:
        rows = conn.execute(
            "SELECT id FROM raw_payloads WHERE datasetKey=? AND fetchedAt<? ORDER BY fetchedAt LIMIT 100",
            (dataset_key, cutoff),
        ).fetchall()
        ids = [str(row['id']) for row in rows]
        if not ids:
            return deleted
        deleted += _delete_ids(conn, 'raw_payloads', ids)


def _cap_raw_versions(conn, dataset_key: str, max_versions: int) -> int:
    deleted = 0
    targets = conn.execute(
        'SELECT DISTINCT targetCode FROM raw_payloads WHERE datasetKey=?',
        (dataset_key,),
    ).fetchall()
    for target in targets:
        rows = conn.execute(
            """SELECT id FROM raw_payloads
                WHERE datasetKey=? AND targetCode=?
                ORDER BY fetchedAt DESC,id DESC LIMIT -1 OFFSET ?""",
            (dataset_key, target['targetCode'], max_versions),
        ).fetchall()
        deleted += _delete_ids(conn, 'raw_payloads', [str(row['id']) for row in rows])
    return deleted


def _cleanup_research_snapshots(conn, retention: Dict[str, Any]) -> Dict[str, int]:
    protected = {
        str(row['snapshotId']) for row in conn.execute(
            """SELECT DISTINCT json_extract(dataJson,'$.researchEvaluation.snapshotId') snapshotId
                 FROM AIAnalysisReport
                WHERE type='comprehensive' AND dataJson IS NOT NULL
                  AND json_valid(dataJson)=1"""
        ).fetchall() if row['snapshotId']
    }
    # Keep the current unified decision's full snapshot for daily execution.
    # Historical validation has its own compact, immutable market/input archive.
    live_snapshots = set()
    seen_industries = set()
    for decision in conn.execute(
        "SELECT targetCode,payload FROM raw_payloads WHERE datasetKey='unified_decision_version' "
        "AND json_valid(payload)=1 ORDER BY json_extract(payload,'$.generatedAt') DESC"
    ).fetchall():
        if decision['targetCode'] in seen_industries:
            continue
        value = json.loads(decision['payload'])
        if value.get('allocation') and value.get('snapshotId'):
            live_snapshots.add(value['snapshotId'])
            seen_industries.add(decision['targetCode'])
    rows = conn.execute(
        "SELECT id,targetCode,fetchedAt FROM raw_payloads WHERE datasetKey='research_snapshot' ORDER BY fetchedAt DESC"
    ).fetchall()
    now = datetime.now(timezone.utc)
    orphan_cutoff = now - timedelta(days=int(retention.get('unreferencedSnapshotDays', 7)))
    hard_cutoff = now - timedelta(days=int(retention.get('researchSnapshotDays', 365)))
    by_day: Dict[tuple, List[Any]] = defaultdict(list)
    for row in rows:
        by_day[(row['targetCode'], _parse_time(row['fetchedAt']).date().isoformat())].append(row)
    remove = set()
    # Reports already embed their structured evaluation and narrative. Retain
    # one full evidence snapshot per industry/day for audit and replay, rather
    # than duplicating the same 80–100 MB evidence body for every rerun.
    for group in by_day.values():
        for row in group[1:]:
            if row['id'] not in live_snapshots:
                remove.add(str(row['id']))
    for row in rows:
        observed = _parse_time(row['fetchedAt'])
        if row['id'] not in live_snapshots and (observed < hard_cutoff or (row['id'] not in protected and observed < orphan_cutoff)):
            remove.add(str(row['id']))
    snapshot_deleted = _delete_ids(conn, 'raw_payloads', sorted(remove))
    evaluation_deleted = _delete_ids(conn, 'raw_payloads', [f'{snapshot_id}:evaluation' for snapshot_id in remove])
    return {'research_snapshot': snapshot_deleted, 'research_evaluation': evaluation_deleted}


def _cleanup_subscription_storage_sync(database: Database, config: Dict[str, Any]) -> Dict[str, int]:
    retention = config.get('storageRetention', {})
    result: Dict[str, int] = {}
    conn = database.get_connection()
    try:
        conn.execute('PRAGMA foreign_keys=ON')
        for key, days in retention.get('rawPayloadDays', {}).items():
            result[f'raw_ttl:{key}'] = _delete_raw_before(conn, key, _cutoff(int(days)))
        for key, maximum in retention.get('rawPayloadMaxVersions', {}).items():
            result[f'raw_cap:{key}'] = _cap_raw_versions(conn, key, int(maximum))
        result.update(_cleanup_research_snapshots(conn, retention))

        invalid_raw = conn.execute(
            "SELECT id FROM raw_payloads WHERE payload IS NULL OR length(trim(payload))<2"
        ).fetchall()
        result['invalid_raw_payloads'] = _delete_ids(conn, 'raw_payloads', [str(row['id']) for row in invalid_raw])

        daily_cutoff = _cutoff(int(retention.get('normalizedDailyDays', 800)))[:10]
        for table in ('ETFDaily', 'IndexDaily', 'StockDaily'):
            cursor = conn.execute(
                f'DELETE FROM {table} WHERE date<? OR open<=0 OR high<=0 OR low<=0 OR close<=0',
                (daily_cutoff,),
            )
            result[table] = max(0, cursor.rowcount)
        cursor = conn.execute('DELETE FROM SectorCapitalFlow WHERE date<?', (daily_cutoff,))
        result['SectorCapitalFlow'] = max(0, cursor.rowcount)

        announcement_cutoff = _cutoff(int(retention.get('announcementDays', 120)))
        cursor = conn.execute(
            "DELETE FROM stock_announcements WHERE publishDate<? OR title IS NULL OR trim(title)=''",
            (announcement_cutoff,),
        )
        result['stock_announcements'] = max(0, cursor.rowcount)
        financial_cutoff = _cutoff(int(retention.get('financialDays', 800)))[:10]
        cursor = conn.execute(
            """DELETE FROM stock_financial_reports
                WHERE reportPeriod<? OR metricsJson IS NULL OR json_valid(metricsJson)=0""",
            (financial_cutoff,),
        )
        result['stock_financial_reports'] = max(0, cursor.rowcount)

        run_cutoff = _cutoff(int(retention.get('fetchRunDays', 30)))
        cursor = conn.execute(
            "DELETE FROM data_fetch_runs WHERE status NOT IN ('queued','running') AND startedAt<?",
            (run_cutoff,),
        )
        result['data_fetch_runs'] = max(0, cursor.rowcount)
        if _table_exists(conn, 'kg_news_links') and _table_exists(conn, 'kg_domains'):
            cursor = conn.execute(
                'DELETE FROM kg_news_links WHERE domainCode NOT IN (SELECT code FROM kg_domains)'
            )
            result['orphan_kg_news_links'] = max(0, cursor.rowcount)
        if _table_exists(conn, 'DataSourceLog') and _table_exists(conn, 'DataSource'):
            cursor = conn.execute(
                'DELETE FROM DataSourceLog WHERE sourceId NOT IN (SELECT id FROM DataSource)'
            )
            result['orphan_data_source_logs'] = max(0, cursor.rowcount)
        conn.commit()
        conn.execute('PRAGMA optimize')
        conn.execute('PRAGMA wal_checkpoint(PASSIVE)')
        return result
    finally:
        conn.close()


async def cleanup_subscription_storage(database: Database, config: Dict[str, Any]) -> Dict[str, int]:
    return await asyncio.to_thread(_cleanup_subscription_storage_sync, database, config)


async def run_cleanup_task():
    """Daily scheduled cleanup for every bounded local-data family."""
    from db import db
    from services.subscription_config import get_config

    logger.info('Running scheduled data cleanup task')
    posts = await cleanup_expired_posts(db)
    storage = await cleanup_subscription_storage(db, get_config())
    deleted = posts + sum(storage.values())
    logger.info('Cleanup completed: %s rows deleted (%s)', deleted, json.dumps(storage, ensure_ascii=False))
    return {'deleted': deleted, 'influencerPosts': posts, 'storage': storage}
