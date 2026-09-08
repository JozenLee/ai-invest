from fastapi import APIRouter, HTTPException, Query

from db import db
from services.company_investment_context import build_company_investment_context
from services.neo4j_service import get_neo4j_service


router = APIRouter(prefix="/api/v1/companies", tags=["company-investment-context"])


@router.get("/{company_id}/investment-context")
async def get_company_investment_context(company_id: str, industry_id: str = Query(default="")):
    neo4j = get_neo4j_service()
    resolved_industry_id = await neo4j.resolve_industry_id(industry_id) if industry_id else ""
    async with neo4j.session() as session:
        result = await session.run(
            """MATCH (industry:Industry)-[:HAS_STAGE]->(stage:Stage)-[:HAS_SEGMENT]->(segment:Segment)-[:INCLUDES]->(company:Company {id: $company_id})
               WHERE $industry_id = '' OR industry.id = $industry_id
               OPTIONAL MATCH (segment)-[:INCLUDES]->(peer:Company)
               RETURN company.id AS company_id, company.name AS company_name,
                      company.ticker AS ticker, company.exchange AS exchange,
                      company.match_source AS match_source,
                      company.match_confidence AS match_confidence,
                      company.representativeness_score AS representativeness_score,
                      company.selection_reason AS selection_reason,
                      company.value_signals_json AS value_signals_json,
                      company.representative_etfs_json AS representative_etfs_json,
                      company.representative_indices_json AS representative_indices_json,
                      industry.id AS industry_id, industry.name AS industry_name,
                      industry.revision_id AS revision_id,
                      stage.id AS stage_id, stage.name AS stage_name,
                      segment.id AS segment_id, segment.code AS segment_code,
                      segment.name AS segment_name,
                      segment.matched_etfs AS segment_matched_etfs,
                      segment.matched_indices AS segment_matched_indices,
                      collect(DISTINCT {id: peer.id, name: peer.name, ticker: peer.ticker,
                        marketPosition: peer.market_position,
                        representativenessScore: peer.representativeness_score}) AS peers
               LIMIT 1""",
            company_id=company_id,
            industry_id=resolved_industry_id or industry_id,
        )
        record = await result.single()
    if not record:
        raise HTTPException(status_code=404, detail="企业或产业映射不存在")
    payload = dict(record)
    ticker = str(payload.get("ticker") or "").strip()
    holdings = []
    if ticker:
        try:
            holdings = db.execute(
                """SELECT h.etfCode, h.stockCode, h.stockName, h.weight,
                          h.updateDate, 'local_etf_holding' AS source,
                          (SELECT d.name FROM ETFDaily d WHERE d.ticker = h.etfCode ORDER BY d.date DESC LIMIT 1) AS etfName
                   FROM ETFHolding h
                   WHERE h.stockCode = ?
                   ORDER BY h.weight DESC""",
                (ticker,),
            )
        except Exception:
            holdings = []
    return build_company_investment_context(payload, holdings)
