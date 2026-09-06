"""本地数据资产查询接口。"""

import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query

from db import db

router = APIRouter(prefix="/api/data/local", tags=["local-data"])


def _freshness(value, max_age_seconds: int = 900) -> str:
    if not value:
        return "unavailable"
    try:
        when = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return "fresh" if datetime.now(timezone.utc) - when <= timedelta(seconds=max_age_seconds) else "stale"
    except ValueError:
        return "stale"


@router.get("/etfs/{code}")
async def get_local_etf(code: str, days: int = Query(30, ge=1, le=3650)):
    code = code.strip().lower().removeprefix("sh").removeprefix("sz")
    history = db.execute(
        "SELECT ticker, name, date, open, high, low, close, volume, amount FROM ETFDaily WHERE ticker = ? AND date >= date('now', ?) ORDER BY date ASC",
        (code, f"-{days} days"),
    )
    holdings = db.execute(
        "SELECT etfCode, stockCode, stockName, weight, shares, marketValue, updateDate FROM ETFHolding WHERE etfCode = ? ORDER BY weight DESC",
        (code,),
    )
    subscription = db.execute(
        "SELECT i.name, s.enabled FROM data_subscriptions s JOIN instruments i ON i.id = s.instrumentId WHERE i.type = 'ETF' AND i.code = ? LIMIT 1",
        (code,),
    )
    latest = history[-1] if history else None
    return {
        "success": True,
        "data": {"ticker": code, "name": (subscription[0].get("name") if subscription else None) or (latest or {}).get("name") or code, "latest": latest, "history": history, "holdings": holdings},
        "meta": {"source": "local-database" if history or holdings else "unavailable", "fetchedAt": (latest or {}).get("date"), "freshness": _freshness((latest or {}).get("date")), "subscribed": bool(subscription and subscription[0].get("enabled"))},
    }


@router.get("/etfs/{code}/holdings")
async def get_local_etf_holdings(code: str):
    code = code.strip().lower().removeprefix("sh").removeprefix("sz")
    rows = db.execute("SELECT etfCode, stockCode, stockName, weight, shares, marketValue, updateDate FROM ETFHolding WHERE etfCode = ? ORDER BY weight DESC", (code,))
    latest = rows[0].get("updateDate") if rows else None
    return {"success": True, "data": rows, "meta": {"source": "local-database" if rows else "unavailable", "fetchedAt": latest, "freshness": _freshness(latest, 86400)}}


@router.get("/indices/{code}")
async def get_local_index(code: str, days: int = Query(30, ge=1, le=3650)):
    code = code.strip().lower()
    rows = db.execute(
        "SELECT code, name, date, open, high, low, close, volume, changePct FROM IndexDaily WHERE lower(code) = ? AND date >= date('now', ?) ORDER BY date ASC",
        (code, f"-{days} days"),
    )
    latest = rows[-1] if rows else None
    return {
        "success": True,
        "data": {"code": code, "latest": latest, "history": rows},
        "meta": {"source": "local-database" if rows else "unavailable", "fetchedAt": (latest or {}).get("date"), "freshness": _freshness((latest or {}).get("date"))},
    }


@router.get("/market-capital-flow")
async def get_local_market_capital_flow():
    rows = db.execute("SELECT * FROM MarketCapitalFlow ORDER BY date DESC LIMIT 30")
    latest = rows[0] if rows else None
    return {"success": True, "data": latest, "history": rows, "meta": {"source": "local-database" if rows else "unavailable", "fetchedAt": (latest or {}).get("date"), "freshness": _freshness((latest or {}).get("date"), 86400)}}


@router.get("/sector-capital-flow")
async def get_local_sector_capital_flow(days: int = Query(7, ge=1, le=90)):
    rows = db.execute("SELECT * FROM SectorCapitalFlow WHERE date >= date('now', ?) ORDER BY date DESC, mainForceNet DESC", (f"-{days} days",))
    latest_date = rows[0].get("date") if rows else None
    return {"success": True, "data": rows, "meta": {"source": "local-database" if rows else "unavailable", "fetchedAt": latest_date, "freshness": _freshness(latest_date, 86400)}}


@router.get("/news")
async def get_local_news(limit: int = Query(50, ge=1, le=200), keyword: str = Query("")):
    if keyword:
        rows = db.execute("SELECT id, title, content, summary, source, url, publishTime, category, sentiment, impact, sectors FROM NewsArticle WHERE title LIKE ? OR content LIKE ? ORDER BY publishTime DESC LIMIT ?", (f"%{keyword}%", f"%{keyword}%", limit))
    else:
        rows = db.execute("SELECT id, title, content, summary, source, url, publishTime, category, sentiment, impact, sectors FROM NewsArticle ORDER BY publishTime DESC LIMIT ?", (limit,))
    latest = rows[0] if rows else None
    return {"success": True, "data": rows, "meta": {"source": "local-database" if rows else "unavailable", "fetchedAt": (latest or {}).get("publishTime"), "freshness": _freshness((latest or {}).get("publishTime"), 3600)}}


@router.get("/subscriptions")
async def get_local_subscriptions():
    rows = db.execute("SELECT s.id, s.enabled, i.type, i.code, i.name FROM data_subscriptions s JOIN instruments i ON i.id = s.instrumentId ORDER BY s.updatedAt DESC")
    for row in rows:
        row["datasets"] = db.execute("SELECT datasetKey, enabled, status, nextRunAt, lastSuccessAt, lastError FROM subscription_datasets WHERE subscriptionId = ? ORDER BY datasetKey", (row["id"],))
    return {"success": True, "data": rows}

@router.post("/subscriptions/refresh-due")
async def refresh_due_subscriptions():
    """Start queued subscription datasets immediately after an explicit refresh."""
    from services.subscription_sync_service import subscription_sync_service
    asyncio.create_task(subscription_sync_service.run_due())
    return {"success": True}


@router.post("/subscriptions/{code}/refresh")
async def refresh_local_subscription(code: str):
    code = code.strip().lower().removeprefix("sh").removeprefix("sz")
    rows = db.execute("SELECT d.id, d.datasetKey, i.code FROM subscription_datasets d JOIN data_subscriptions s ON s.id = d.subscriptionId JOIN instruments i ON i.id = s.instrumentId WHERE s.enabled = 1 AND i.type = 'ETF' AND i.code = ? AND d.enabled = 1", (code,))
    if not rows:
        raise HTTPException(status_code=404, detail="未找到启用的 ETF 订阅")
    now = datetime.now(timezone.utc).isoformat()
    for row in rows:
        db.update("UPDATE subscription_datasets SET status='queued', nextRunAt=?, lastError=NULL, updatedAt=? WHERE id=?", (now, now, row["id"]))
    # Wake the worker immediately for manual/page-triggered refreshes; the scheduler
    # remains responsible for periodic due checks and retries.
    from services.subscription_sync_service import subscription_sync_service
    asyncio.create_task(subscription_sync_service.run_due())
    return {"success": True, "data": {"code": code, "queuedDatasets": len(rows)}}
