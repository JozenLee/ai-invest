"""Publish reviewed industry cognition to Neo4j and an immutable SQLite revision."""
from datetime import datetime, timezone
import hashlib
import json
import logging
import sqlite3
import uuid
from typing import Any, Dict, Optional, Set, Tuple

from db import db
from models.industry_models import ExplorationResult
from services.neo4j_service import Neo4jService

logger = logging.getLogger(__name__)


def _canonical_snapshot(result: ExplorationResult) -> Tuple[dict, str]:
    snapshot = result.model_dump(mode="json", by_alias=True)
    snapshot.pop("created_at", None)
    encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return snapshot, hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _record_revision(
    *, revision_id: str, industry_id: str, result: ExplorationResult,
    version: int, parent_revision_id: Optional[str], content_hash: str,
    snapshot: dict,
) -> None:
    evidence = [item.model_dump(mode="json") for item in result.structure.evidence]
    try:
        db.insert(
            """INSERT INTO graph_revisions
               (id, industryId, industryCode, industryName, version,
                parentRevisionId, contentHash, snapshotJson, evidenceJson,
                status, createdAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)""",
            (revision_id, industry_id, result.structure.industry.code,
             result.structure.industry.name, version, parent_revision_id,
             content_hash, json.dumps(snapshot, ensure_ascii=False),
             json.dumps(evidence, ensure_ascii=False),
             datetime.now(timezone.utc).isoformat()),
        )
    except sqlite3.OperationalError as error:
        logger.warning("图谱版本审计表不可用，请执行数据库迁移: %s", error)


def _record_legacy_baseline(industry_id: str, industry: Any, snapshot: dict) -> str:
    revision_id = f"legacy-{industry_id}"
    encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, default=str)
    content_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    db.insert(
        """INSERT OR IGNORE INTO graph_revisions
           (id, industryId, industryCode, industryName, version,
            parentRevisionId, contentHash, snapshotJson, evidenceJson,
            status, createdAt)
           VALUES (?, ?, ?, ?, 0, NULL, ?, ?, '[]', 'legacy', ?)""",
        (revision_id, industry_id, str(industry.get("code") or ""),
         str(industry.get("name") or industry_id), content_hash, encoded,
         datetime.now(timezone.utc).isoformat()),
    )
    return revision_id


async def write_graph_to_neo4j(
    result: ExplorationResult,
    neo4j_service: Neo4jService,
    industry_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Publish one reviewed revision, then remove stale nodes in its industry scope."""
    stats: Dict[str, Any] = {"industries": 0, "stages": 0, "segments": 0,
                             "companies": 0, "relationships": 0}
    industry = result.structure.industry
    industry_id = industry_id or f"industry_{industry.code}"
    previous = await neo4j_service.get_industry_basic(industry_id)
    version = int((previous or {}).get("version") or 0) + 1
    parent_revision_id = (previous or {}).get("revision_id")
    if previous and not parent_revision_id and version == 1:
        legacy_snapshot = await neo4j_service.get_industry_full_graph(industry_id)
        if legacy_snapshot:
            parent_revision_id = _record_legacy_baseline(industry_id, previous, legacy_snapshot)
    revision_id = str(uuid.uuid4())
    snapshot, content_hash = _canonical_snapshot(result)
    source_urls = list(dict.fromkeys(item.url for item in result.structure.evidence if item.url))

    await neo4j_service.create_industry(
        industry_id=industry_id, code=industry.code, name=industry.name,
        description=industry.description, revision_id=revision_id,
        version=version, content_hash=content_hash, source_urls=source_urls,
    )
    stats["industries"] += 1

    stage_order_map = {"upstream": 1, "midstream": 2, "downstream": 3}
    company_name_to_id: Dict[str, str] = {}
    segment_code_to_id: Dict[str, str] = {}
    expected_stage_ids: Set[str] = set()
    expected_segment_ids: Set[str] = set()
    expected_company_ids: Set[str] = set()
    expected_segment_relation_keys: Set[str] = set()

    for stage in result.structure.structure:
        stage_id = f"stage_{industry.code}_{stage.stage_code}"
        expected_stage_ids.add(stage_id)
        stage_order = stage_order_map.get(stage.stage_code, 999)
        await neo4j_service.create_node(stage_id, "Stage", {
            "code": stage.stage_code, "name": stage.stage,
            "description": stage.description, "order": stage_order,
            "revision_id": revision_id, "source_urls": source_urls,
        })
        stats["stages"] += 1
        await neo4j_service.create_relationship(
            industry_id, stage_id, "HAS_STAGE",
            {"order": stage_order, "revision_id": revision_id})
        stats["relationships"] += 1

        for seg_index, segment in enumerate(stage.segments):
            segment_id = f"segment_{industry.code}_{segment.code}"
            segment_code_to_id[segment.code] = segment_id
            expected_segment_ids.add(segment_id)
            segment_order = segment.order if segment.order is not None else seg_index
            await neo4j_service.create_node(segment_id, "Segment", {
                "code": segment.code, "name": segment.name,
                "description": segment.description,
                "key_categories": segment.key_categories,
                "news_keywords": segment.news_keywords,
                "tag_codes": segment.tag_codes, "order": segment_order,
                "revision_id": revision_id, "source_urls": source_urls,
            })
            stats["segments"] += 1
            await neo4j_service.create_relationship(
                stage_id, segment_id, "HAS_SEGMENT", {"revision_id": revision_id})
            stats["relationships"] += 1

            detail = result.details.get(segment.code)
            if not detail:
                continue
            for company in detail.companies:
                company_id = (f"company_{company.ticker}" if company.ticker
                              else f"company_{company.name.replace(' ', '_')}")
                expected_company_ids.add(company_id)
                await neo4j_service.create_node(company_id, "Company", {
                    "name": company.name, "name_en": company.name_en,
                    "ticker": company.ticker, "exchange": company.exchange,
                    "country": company.country,
                    "market_position": company.market_position,
                    "key_products": company.key_products,
                    "description": company.description,
                    "source_urls": company.evidence_urls,
                    "last_verified_revision_id": revision_id,
                })
                stats["companies"] += 1
                company_name_to_id[company.name] = company_id
                if company.name_en:
                    company_name_to_id[company.name_en] = company_id
                await neo4j_service.create_relationship(
                    segment_id, company_id, "INCLUDES",
                    {"revision_id": revision_id,
                     "source_urls": company.evidence_urls})
                stats["relationships"] += 1

            for relationship in detail.relationships:
                from_id = company_name_to_id.get(relationship.from_company)
                to_id = company_name_to_id.get(relationship.to_company)
                if from_id and to_id:
                    await neo4j_service.create_relationship(
                        from_id, to_id, relationship.type,
                        {"confidence": relationship.confidence,
                         "description": relationship.description,
                         "source_urls": relationship.evidence_urls,
                         "revision_id": revision_id})
                    stats["relationships"] += 1

    for relationship in result.structure.relationships:
        from_id = segment_code_to_id.get(relationship.from_segment)
        to_id = segment_code_to_id.get(relationship.to_segment)
        if not from_id or not to_id:
            logger.warning("跳过引用不存在环节的关系: %s -> %s",
                           relationship.from_segment, relationship.to_segment)
            continue
        await neo4j_service.create_relationship(from_id, to_id, relationship.type, {
            "direction": relationship.direction, "weight": relationship.weight,
            "confidence": relationship.confidence, "lag": relationship.lag,
            "description": relationship.description,
            "source_urls": relationship.evidence_urls,
            "revision_id": revision_id,
        })
        expected_segment_relation_keys.add(
            f"{from_id}|{relationship.type}|{to_id}"
        )
        stats["relationships"] += 1

    await neo4j_service.reconcile_industry_scope(
        industry_id, expected_stage_ids, expected_segment_ids, expected_company_ids,
        expected_segment_relation_keys)
    _record_revision(
        revision_id=revision_id, industry_id=industry_id, result=result,
        version=version, parent_revision_id=parent_revision_id,
        content_hash=content_hash, snapshot=snapshot)
    stats.update({"revision_id": revision_id, "version": version,
                  "content_hash": content_hash,
                  "evidence_count": len(source_urls)})
    return stats
