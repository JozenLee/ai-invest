"""Deterministic publication gates for AI-generated industry graphs."""
from typing import Any, Dict

from models.industry_models import ExplorationResult


def assess_graph_quality(result: ExplorationResult) -> Dict[str, Any]:
    stages = result.structure.structure
    segments = [segment for stage in stages for segment in stage.segments]
    segment_codes = [segment.code for segment in segments]
    companies = [company for detail in result.details.values() for company in detail.companies]
    tickers = [str(company.ticker or "").strip() for company in companies if company.ticker]
    a_share = [ticker for ticker in tickers if ticker.isdigit() and len(ticker) == 6]
    relations = result.structure.relationships
    allowed_codes = set(segment_codes)
    invalid_relations = [
        relation for relation in relations
        if relation.from_segment not in allowed_codes or relation.to_segment not in allowed_codes
    ]
    evidenced_relations = [relation for relation in relations if relation.evidence_urls]
    evidenced_companies = [
        company for company in companies
        if company.evidence_urls
        or company.match_source == "etf_holdings"
        or any(item.holding_verified for item in company.representative_etfs)
    ]
    covered_segments = [
        segment.code for segment in segments
        if result.details.get(segment.code) and result.details[segment.code].companies
    ]
    relation_target = max(2, len(segments) // 3)
    metrics = {
        "stages": len(stages),
        "segments": len(segments),
        "unique_segment_codes": len(set(segment_codes)),
        "companies": len(companies),
        "segments_with_companies": len(covered_segments),
        "segment_company_coverage_pct": round(len(covered_segments) / len(segments) * 100, 1) if segments else 0,
        "unique_tickers": len(set(tickers)),
        "a_share_companies": len(set(a_share)),
        "relations": len(relations),
        "relation_target": relation_target,
        "evidenced_relations": len(evidenced_relations),
        "relation_evidence_pct": round(len(evidenced_relations) / len(relations) * 100, 1) if relations else 0,
        "evidenced_companies": len(evidenced_companies),
        "company_evidence_pct": round(len(evidenced_companies) / len(companies) * 100, 1) if companies else 0,
        "industry_sources": len(result.structure.evidence),
        "invalid_relations": len(invalid_relations),
    }
    issues = []
    if len(stages) < 3:
        issues.append("产业阶段少于3个")
    if len(segments) < 6:
        issues.append("产业环节少于6个")
    if len(set(segment_codes)) != len(segment_codes):
        issues.append("产业环节code重复")
    if len(companies) < max(12, len(segments) * 2):
        issues.append("企业覆盖不足")
    if segments and len(covered_segments) / len(segments) < 0.8:
        issues.append("有企业覆盖的环节低于80%")
    if len(set(a_share)) < 6:
        issues.append("A股企业覆盖少于6家")
    if len(relations) < relation_target:
        issues.append(f"传导关系少于{relation_target}条")
    if invalid_relations:
        issues.append("传导关系引用不存在的环节")
    if relations and len(evidenced_relations) / len(relations) < 0.5:
        issues.append("至少一半传导关系缺少可核验来源")
    if companies and len(evidenced_companies) / len(companies) < 0.3:
        issues.append("企业来源覆盖低于30%")
    if len(result.structure.evidence) < 2:
        issues.append("产业结构来源少于2条")
    score = max(0, 100 - len(issues) * 12)
    return {"passed": not issues, "score": score, "issues": issues, "metrics": metrics}
