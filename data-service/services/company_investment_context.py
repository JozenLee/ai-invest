"""Build a report-ready company → ETF/index/peer mapping with provenance."""
import json
from typing import Any, Dict, List


def _json(value: Any, fallback: Any):
    if value is None or value == "":
        return fallback
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


def build_company_investment_context(
    graph_record: Dict[str, Any],
    holding_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    segment_etfs = _json(graph_record.get("segment_matched_etfs"), [])
    segment_indices = _json(graph_record.get("segment_matched_indices"), [])
    stored_etfs = _json(graph_record.get("representative_etfs_json"), [])
    stored_indices = _json(graph_record.get("representative_indices_json"), [])
    matched_by_code = {
        str(item.get("code") or item.get("ticker") or "").strip(): item
        for item in [*segment_etfs, *stored_etfs]
    }

    actual_by_code = {}
    for row in holding_rows:
        code = str(row.get("etfCode") or row.get("etf_code") or "").strip()
        if not code:
            continue
        previous = actual_by_code.get(code)
        if previous is None or float(row.get("weight") or 0) > float(previous.get("weight") or 0):
            actual_by_code[code] = row

    representative_etfs = []
    for code, item in matched_by_code.items():
        holding = actual_by_code.get(code)
        representative_etfs.append({
            "code": code,
            "name": item.get("name") or item.get("etfName") or (holding or {}).get("etfName") or code,
            "relevance": float(item.get("relevance") or 0),
            "reasoning": item.get("reasoning") or "产业环节语义映射",
            "holdingWeight": float(holding.get("weight") or 0) if holding else None,
            "reportPeriod": (holding or {}).get("updateDate") or item.get("report_period"),
            "source": (holding or {}).get("source") or item.get("source") or "segment_semantic_mapping",
            "holdingVerified": holding is not None or bool(item.get("holding_verified")),
        })
    representative_etfs.sort(key=lambda item: (
        not item["holdingVerified"],
        -(item["holdingWeight"] or 0),
        -item["relevance"],
        item["code"],
    ))

    index_by_code = {}
    for item in [*segment_indices, *stored_indices]:
        code = str(item.get("code") or item.get("indexCode") or "").strip()
        if not code:
            continue
        previous = index_by_code.get(code)
        if previous is None or float(item.get("relevance") or 0) > float(previous.get("relevance") or 0):
            index_by_code[code] = item
    representative_indices = [{
        "code": code,
        "name": item.get("name") or item.get("indexName") or code,
        "relevance": float(item.get("relevance") or 0),
        "reasoning": item.get("reasoning") or "企业所属产业环节的代表指数",
        "source": item.get("source") or "segment_semantic_mapping",
    } for code, item in index_by_code.items()]
    representative_indices.sort(key=lambda item: (-item["relevance"], item["code"]))

    peers = [peer for peer in graph_record.get("peers", []) if peer and peer.get("id") != graph_record.get("company_id")]
    peers.sort(key=lambda item: (-float(item.get("representativenessScore") or 0), item.get("name") or ""))
    confidence = float(graph_record.get("match_confidence") or 0.5)
    verified_count = sum(1 for item in representative_etfs if item["holdingVerified"])
    evidence_level = "holding_verified" if verified_count else "semantic_only"
    return {
        "company": {
            "id": graph_record.get("company_id"),
            "name": graph_record.get("company_name"),
            "ticker": graph_record.get("ticker"),
            "exchange": graph_record.get("exchange"),
            "matchSource": graph_record.get("match_source") or "web_search",
            "matchConfidence": confidence,
            "representativenessScore": float(graph_record.get("representativeness_score") or 0),
            "selectionReason": graph_record.get("selection_reason"),
            "valueSignals": _json(graph_record.get("value_signals_json"), {}),
        },
        "industry": {"id": graph_record.get("industry_id"), "name": graph_record.get("industry_name")},
        "stage": {"id": graph_record.get("stage_id"), "name": graph_record.get("stage_name")},
        "segment": {"id": graph_record.get("segment_id"), "code": graph_record.get("segment_code"), "name": graph_record.get("segment_name")},
        "representativeEtfs": representative_etfs,
        "representativeIndices": representative_indices,
        "peerCompanies": peers[:8],
        "evidence": {
            "level": evidence_level,
            "verifiedEtfCount": verified_count,
            "semanticEtfCount": len(representative_etfs) - verified_count,
            "graphRevisionId": graph_record.get("revision_id"),
        },
        "reportContext": {
            "role": "ETF底层企业研究样本，不构成个股推荐",
            "companyTicker": graph_record.get("ticker"),
            "segmentCode": graph_record.get("segment_code"),
            "verifiedEtfs": [item["code"] for item in representative_etfs if item["holdingVerified"]],
            "indices": [item["code"] for item in representative_indices],
            "selectionConfidence": confidence,
            "valueAssessmentBoundary": "价值评估由投资报告使用同期财务、估值与公告证据完成，图谱分数仅表示产业代表性",
        },
    }
