from services.company_investment_context import build_company_investment_context


def test_company_context_prioritizes_verified_holdings():
    result = build_company_investment_context({
        "company_id": "company_688001", "company_name": "芯片公司", "ticker": "688001",
        "industry_id": "ai", "industry_name": "AI硬件", "segment_id": "chip", "segment_code": "chip", "segment_name": "芯片",
        "segment_matched_etfs": '[{"code":"159001","name":"芯片ETF","relevance":0.9},{"code":"159002","name":"科技ETF","relevance":0.7}]',
        "segment_matched_indices": '[{"code":"930001","name":"芯片指数","relevance":0.8}]',
        "match_confidence": 0.88, "representativeness_score": 0.81,
        "peers": [{"id": "company_688002", "name": "同业公司", "ticker": "688002", "representativenessScore": 0.7}],
    }, [{"etfCode": "159001", "weight": 8.5, "source": "test", "updateDate": "2026-06-30"}])
    assert result["representativeEtfs"][0]["code"] == "159001"
    assert result["representativeEtfs"][0]["holdingVerified"] is True
    assert result["evidence"]["level"] == "holding_verified"
    assert result["representativeIndices"][0]["code"] == "930001"
    assert result["peerCompanies"][0]["ticker"] == "688002"
