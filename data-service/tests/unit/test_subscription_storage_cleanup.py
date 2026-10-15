import json
from datetime import datetime, timedelta, timezone

import pytest

from db import Database
from workers.data_cleanup import cleanup_subscription_storage


@pytest.mark.asyncio
async def test_subscription_storage_cleanup_caps_raw_versions_and_preserves_report_snapshot(tmp_path):
    database = Database(str(tmp_path / 'cleanup.db'))
    conn = database.get_connection()
    conn.executescript("""
        CREATE TABLE raw_payloads (id TEXT PRIMARY KEY,datasetKey TEXT,targetCode TEXT,provider TEXT,payload TEXT NOT NULL,contentHash TEXT NOT NULL,fetchedAt TEXT NOT NULL);
        CREATE INDEX raw_payloads_datasetKey_targetCode_fetchedAt_idx ON raw_payloads(datasetKey,targetCode,fetchedAt);
        CREATE TABLE AIAnalysisReport (id TEXT PRIMARY KEY,type TEXT NOT NULL,dataJson TEXT);
        CREATE TABLE ETFDaily (id TEXT PRIMARY KEY,date TEXT,open REAL,high REAL,low REAL,close REAL);
        CREATE TABLE IndexDaily (id TEXT PRIMARY KEY,date TEXT,open REAL,high REAL,low REAL,close REAL);
        CREATE TABLE StockDaily (id TEXT PRIMARY KEY,date TEXT,open REAL,high REAL,low REAL,close REAL);
        CREATE TABLE SectorCapitalFlow (id TEXT PRIMARY KEY,date TEXT);
        CREATE TABLE stock_announcements (id TEXT PRIMARY KEY,publishDate TEXT,title TEXT);
        CREATE TABLE stock_financial_reports (id TEXT PRIMARY KEY,reportPeriod TEXT,metricsJson TEXT);
        CREATE TABLE data_fetch_runs (id TEXT PRIMARY KEY,status TEXT,startedAt TEXT);
    """)
    now = datetime.now(timezone.utc)
    raw = [
        (f'quote-{index}', 'etf_realtime', '159995', 'test', '{}', str(index), (now-timedelta(minutes=index)).isoformat())
        for index in range(4)
    ]
    raw += [
        ('snapshot-reported', 'research_snapshot', 'industry', 'test', '{}', 'reported', now.isoformat()),
        ('snapshot-orphan-new', 'research_snapshot', 'industry', 'test', '{}', 'orphan-new', (now-timedelta(hours=1)).isoformat()),
        ('snapshot-orphan-old', 'research_snapshot', 'industry', 'test', '{}', 'orphan-old', (now-timedelta(hours=2)).isoformat()),
        ('snapshot-orphan-old:evaluation', 'research_evaluation', 'industry', 'test', '{}', 'eval', (now-timedelta(hours=2)).isoformat()),
    ]
    conn.executemany('INSERT INTO raw_payloads VALUES (?,?,?,?,?,?,?)', raw)
    conn.execute('INSERT INTO AIAnalysisReport VALUES (?,?,?)', ('report', 'comprehensive', json.dumps({'researchEvaluation': {'snapshotId': 'snapshot-reported'}})))
    conn.execute("INSERT INTO ETFDaily VALUES ('bad','2026-09-01',0,1,1,1)")
    conn.commit()
    conn.close()

    config = {'storageRetention': {
        'rawPayloadDays': {'etf_realtime': 2},
        'rawPayloadMaxVersions': {'etf_realtime': 2},
        'fetchRunDays': 30, 'normalizedDailyDays': 800, 'announcementDays': 120,
        'financialDays': 800, 'unreferencedSnapshotDays': 7, 'researchSnapshotDays': 365,
    }}
    result = await cleanup_subscription_storage(database, config)

    assert result['raw_cap:etf_realtime'] == 2
    assert result['research_snapshot'] == 2
    assert result['research_evaluation'] == 1
    assert result['ETFDaily'] == 1
    remaining = database.execute('SELECT id FROM raw_payloads ORDER BY id')
    assert {row['id'] for row in remaining} == {'quote-0', 'quote-1', 'snapshot-reported'}


def test_cleanup_retains_current_unified_snapshot_even_after_a_newer_orphan(tmp_path):
    from workers.data_cleanup import _cleanup_research_snapshots
    database = Database(str(tmp_path / 'unified-cleanup.db'))
    conn = database.get_connection()
    conn.executescript("""
        CREATE TABLE raw_payloads (id TEXT PRIMARY KEY,datasetKey TEXT,targetCode TEXT,payload TEXT,fetchedAt TEXT);
        CREATE TABLE AIAnalysisReport (id TEXT PRIMARY KEY,type TEXT,dataJson TEXT);
    """)
    now = datetime.now(timezone.utc)
    conn.executemany('INSERT INTO raw_payloads VALUES (?,?,?,?,?)', [
        ('current', 'research_snapshot', 'ai', '{}', (now-timedelta(hours=1)).isoformat()),
        ('new-orphan', 'research_snapshot', 'ai', '{}', now.isoformat()),
        ('decision', 'unified_decision_version', 'ai', json.dumps({'generatedAt': now.isoformat(), 'snapshotId': 'current', 'allocation': {'id': 'allocation'}}), now.isoformat()),
    ])
    _cleanup_research_snapshots(conn, {})
    assert conn.execute("SELECT id FROM raw_payloads WHERE id='current'").fetchone()
    conn.close()
