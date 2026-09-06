#!/usr/bin/env python3
"""Regenerate existing industries with quality gates and preserve canonical IDs."""
import argparse
import asyncio
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid

import aiohttp
from dotenv import load_dotenv

DATA_SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = DATA_SERVICE_DIR.parent
sys.path.insert(0, str(DATA_SERVICE_DIR))
load_dotenv(PROJECT_DIR / ".env")

from db import db  # noqa: E402
from services.graph_quality import assess_graph_quality  # noqa: E402
from services.graph_writer import write_graph_to_neo4j  # noqa: E402
from services.industry_explorer import get_explorer_service  # noqa: E402
from services.neo4j_service import get_neo4j_service  # noqa: E402
from models.industry_models import CompanyInfo, ExplorationResult, SegmentDetail  # noqa: E402


def emit(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def persist_audit(payload: dict) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    db.insert(
        """INSERT INTO raw_payloads
           (id, datasetKey, targetCode, provider, payload, contentHash, fetchedAt)
           VALUES (?, 'graph_regeneration_run', 'all', 'versioned-graph-regenerator', ?, ?, ?)""",
        (str(uuid.uuid4()), encoded, digest, datetime.now(timezone.utc).isoformat()),
    )


def persist_industry_result(result: dict) -> None:
    persist_audit({"type": "industry_result", "recordedAt": datetime.now(timezone.utc).isoformat(), "result": result})


def persist_candidate(industry_id: str, result, quality: dict) -> None:
    payload = {"recordedAt": datetime.now(timezone.utc).isoformat(), "quality": quality, "candidate": result.model_dump(mode="json", by_alias=True)}
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    db.insert(
        """INSERT INTO raw_payloads
           (id, datasetKey, targetCode, provider, payload, contentHash, fetchedAt)
           VALUES (?, 'graph_regeneration_candidate', ?, 'versioned-graph-regenerator', ?, ?, ?)""",
        (str(uuid.uuid4()), industry_id, encoded, hashlib.sha256(encoded.encode("utf-8")).hexdigest(), datetime.now(timezone.utc).isoformat()),
    )


def load_legacy_snapshot(industry_id: str):
    rows = db.execute(
        "SELECT snapshotJson FROM graph_revisions WHERE industryId = ? ORDER BY version ASC LIMIT 1",
        (industry_id,),
    )
    return json.loads(rows[0]["snapshotJson"]) if rows else None


def load_latest_candidate(industry_id: str):
    rows = db.execute(
        "SELECT payload FROM raw_payloads WHERE datasetKey = 'graph_regeneration_candidate' AND targetCode = ? ORDER BY fetchedAt DESC LIMIT 1",
        (industry_id,),
    )
    if not rows:
        return None
    payload = json.loads(rows[0]["payload"])
    return ExplorationResult.model_validate(payload["candidate"])


def backfill_empty_segments(result, legacy_graph) -> list:
    if not legacy_graph:
        return []
    legacy_segments = [segment for stage in legacy_graph.get("stages", []) for segment in stage.get("segments", [])]
    backfilled = []
    legacy_stages = {str(stage.get("code") or ""): stage for stage in legacy_graph.get("stages", [])}
    for stage in result.structure.structure:
        for segment_index, segment in enumerate(stage.segments):
            detail = result.details.get(segment.code)
            if detail and detail.companies:
                continue
            ranked = sorted(
                legacy_segments,
                key=lambda old: max(
                    1.0 if old.get("code") == segment.code else 0.0,
                    SequenceMatcher(None, str(old.get("name") or ""), segment.name).ratio(),
                ),
                reverse=True,
            )
            if not ranked:
                continue
            match = ranked[0]
            score = max(1.0 if match.get("code") == segment.code else 0.0, SequenceMatcher(None, str(match.get("name") or ""), segment.name).ratio())
            match_mode = "code_or_name"
            if score < 0.55:
                same_stage = legacy_stages.get(stage.stage_code) or {}
                same_stage_segments = same_stage.get("segments", [])
                if segment_index >= len(same_stage_segments):
                    continue
                match = same_stage_segments[segment_index]
                score = SequenceMatcher(None, str(match.get("name") or ""), segment.name).ratio()
                match_mode = "stage_position"
            companies = []
            for company in match.get("companies", []):
                if not company.get("name"):
                    continue
                companies.append(CompanyInfo(
                    name=company["name"], name_en=company.get("name_en"),
                    ticker=company.get("ticker"), exchange=company.get("exchange"),
                    country=company.get("country") or "CN",
                    market_position=company.get("market_position") or "major",
                    key_products=company.get("key_products") or [],
                    description=company.get("description"), segment_code=segment.code,
                    stage_code=stage.stage_code, evidence_urls=[],
                ))
            if companies:
                result.details[segment.code] = SegmentDetail(companies=companies, relationships=[])
                backfilled.append({"segment": segment.code, "legacySegment": match.get("code"), "similarity": round(score, 3), "matchMode": match_mode, "companies": len(companies)})
    return backfilled


def apply_curated_supplements(result) -> list:
    path = DATA_SERVICE_DIR / "config" / "graph_supplements.json"
    if not path.exists():
        return []
    supplements = json.loads(path.read_text()).get(result.structure.industry.code, {})
    applied = []
    for segment_code, rows in supplements.items():
        current = result.details.get(segment_code)
        if current and current.companies:
            continue
        companies = [CompanyInfo(**row, segment_code=segment_code) for row in rows]
        if companies:
            result.details[segment_code] = SegmentDetail(companies=companies, relationships=[])
            applied.append({"segment": segment_code, "companies": len(companies), "source": "curated_evidence"})
    return applied


async def post_json(session: aiohttp.ClientSession, url: str, body=None) -> dict:
    async with session.post(url, json=body) as response:
        text = await response.text()
        if response.status >= 400:
            raise RuntimeError(f"POST {url} -> HTTP {response.status}: {text[:300]}")
        return json.loads(text)


async def regenerate_one(industry: dict, attempts: int, publish: bool) -> dict:
    explorer = get_explorer_service()
    neo4j = get_neo4j_service()
    description = str(industry.get("description") or "").strip()
    if "解析失败" in description:
        description = ""
    legacy_graph = load_legacy_snapshot(industry["id"])
    if not legacy_graph and int(industry.get("version") or 0) == 0:
        legacy_graph = await neo4j.get_industry_full_graph(industry["id"])
    best = None
    attempt_errors = []
    for attempt in range(1, attempts + 1):
        emit("candidate_started", industryId=industry["id"], name=industry["name"], attempt=attempt)
        try:
            structure = await explorer.explore_structure(industry["name"], description or None)
            result = await explorer.fill_companies(structure)
            legacy_backfill = backfill_empty_segments(result, legacy_graph)
            quality = assess_graph_quality(result)
            result.metadata.update({"regenerated": True, "quality": quality, "attempt": attempt, "legacy_backfill": legacy_backfill})
            persist_candidate(industry["id"], result, quality)
            emit("candidate_assessed", industryId=industry["id"], name=industry["name"], quality=quality)
            if best is None or quality["score"] > best[1]["score"]:
                best = (result, quality)
            if quality["passed"]:
                break
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            attempt_errors.append(message)
            emit("candidate_failed", industryId=industry["id"], name=industry["name"], attempt=attempt, error=message)
    if best is None:
        raise RuntimeError("；".join(attempt_errors) or "没有生成候选图谱")
    result, quality = best
    if not quality["passed"]:
        return {"industryId": industry["id"], "name": industry["name"], "status": "quality_failed", "quality": quality}
    publication = None
    if publish:
        publication = await write_graph_to_neo4j(result, neo4j, industry["id"])
        emit("industry_published", industryId=industry["id"], name=industry["name"], publication=publication)
    return {"industryId": industry["id"], "name": industry["name"], "status": "published" if publish else "validated", "quality": quality, "publication": publication}


async def resume_one(industry: dict, publish: bool) -> dict:
    result = load_latest_candidate(industry["id"])
    if not result:
        return {"industryId": industry["id"], "name": industry["name"], "status": "candidate_missing"}
    quality = assess_graph_quality(result)
    if not quality["passed"]:
        return {"industryId": industry["id"], "name": industry["name"], "status": "quality_failed", "quality": quality}
    publication = await write_graph_to_neo4j(result, get_neo4j_service(), industry["id"]) if publish else None
    emit("industry_published_from_candidate", industryId=industry["id"], name=industry["name"], publication=publication)
    return {"industryId": industry["id"], "name": industry["name"], "status": "published" if publish else "validated", "quality": quality, "publication": publication, "resumed": True}


async def repair_one(industry: dict, publish: bool) -> dict:
    result = load_latest_candidate(industry["id"])
    if not result:
        return {"industryId": industry["id"], "name": industry["name"], "status": "candidate_missing"}
    explorer = get_explorer_service()
    repaired = []
    for stage in result.structure.structure:
        for segment in stage.segments:
            current = result.details.get(segment.code)
            if current and current.companies:
                continue
            for attempt in range(1, 4):
                try:
                    detail = await explorer._fill_segment(industry["name"], stage.stage, segment)
                    if detail.companies:
                        result.details[segment.code] = detail
                        repaired.append({"segment": segment.code, "companies": len(detail.companies), "attempt": attempt})
                        break
                except Exception as error:
                    emit("segment_repair_failed", industryId=industry["id"], segment=segment.code, attempt=attempt, error=str(error))
    legacy_graph = load_legacy_snapshot(industry["id"])
    legacy_repairs = backfill_empty_segments(result, legacy_graph)
    repaired.extend(legacy_repairs)
    repaired.extend(apply_curated_supplements(result))
    quality = assess_graph_quality(result)
    result.metadata.update({"quality": quality, "targeted_repairs": repaired})
    persist_candidate(industry["id"], result, quality)
    if not quality["passed"]:
        return {"industryId": industry["id"], "name": industry["name"], "status": "quality_failed", "quality": quality, "repairs": repaired}
    publication = await write_graph_to_neo4j(result, get_neo4j_service(), industry["id"]) if publish else None
    emit("industry_published_after_repair", industryId=industry["id"], name=industry["name"], repairs=repaired, publication=publication)
    return {"industryId": industry["id"], "name": industry["name"], "status": "published" if publish else "validated", "quality": quality, "publication": publication, "repairs": repaired}


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true", help="publish candidates that pass all gates")
    parser.add_argument("--attempts", type=int, default=2)
    parser.add_argument("--industry-id", action="append", default=[])
    parser.add_argument("--skip-match", action="store_true")
    parser.add_argument("--skip-projection", action="store_true")
    parser.add_argument("--resume-candidate", action="store_true")
    parser.add_argument("--repair-candidate", action="store_true")
    args = parser.parse_args()
    neo4j = get_neo4j_service()
    started_at = datetime.now(timezone.utc).isoformat()
    industries = await neo4j.list_industries()
    if args.industry_id:
        selected = set(args.industry_id)
        industries = [industry for industry in industries if industry["id"] in selected]
    results = []
    try:
        for industry in industries:
            try:
                if args.repair_candidate:
                    outcome = await repair_one(industry, args.publish)
                elif args.resume_candidate:
                    outcome = await resume_one(industry, args.publish)
                else:
                    outcome = await regenerate_one(industry, max(1, args.attempts), args.publish)
            except Exception as error:
                outcome = {"industryId": industry["id"], "name": industry["name"], "status": "failed", "error": f"{type(error).__name__}: {error}"}
                emit("industry_failed", **outcome)
            results.append(outcome)
            persist_industry_result(outcome)

        app_url = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")
        if args.publish:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=600)) as session:
                if not args.skip_match:
                    for outcome in results:
                        if outcome["status"] != "published":
                            continue
                        try:
                            match = await post_json(session, f"{app_url}/api/graph/match-etf-index", {"scope": "industry", "targetId": outcome["industryId"], "options": {"matchETF": True, "matchIndex": True, "topN": 5, "minRelevance": 0.6, "forceRefresh": False}})
                            outcome["matching"] = match.get("data")
                            emit("industry_matched", industryId=outcome["industryId"], matching=outcome["matching"])
                        except Exception as error:
                            outcome["matchingError"] = str(error)
                if not args.skip_projection:
                    projection = await post_json(session, f"{app_url}/api/graph/projection/refresh")
                    emit("projection_refreshed", projection=projection)
    finally:
        await neo4j.close()

    audit = {"startedAt": started_at, "completedAt": datetime.now(timezone.utc).isoformat(), "publish": args.publish, "results": results}
    persist_audit(audit)
    emit("run_completed", results=results)
    return 0 if results and all(result["status"] in {"published", "validated"} for result in results) else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
