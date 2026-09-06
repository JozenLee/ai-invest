from models.industry_models import ExplorationResult, IndustryStructure, SegmentDetail
from services.graph_quality import assess_graph_quality
from services.industry_explorer import IndustryExplorerService


def test_quality_gate_rejects_untraced_graph():
    result = ExplorationResult(
        structure=IndustryStructure(
            industry={"name": "测试产业", "code": "test"},
            structure=[{"stage": "上游", "stage_code": "upstream", "description": "", "segments": []}],
        ),
        details={},
    )
    quality = assess_graph_quality(result)
    assert quality["passed"] is False
    assert "产业环节少于6个" in quality["issues"]
    assert quality["metrics"]["relations"] == 0


def test_invalid_company_relation_does_not_discard_valid_companies():
    service = IndustryExplorerService.__new__(IndustryExplorerService)
    detail = service._parse_company_response(
        '{"companies":[{"name":"测试公司","ticker":"600000","exchange":"SH","country":"CN","market_position":"leader","evidence_urls":["https://example.com"]}],"relationships":[{"from":"测试公司","to":"另一公司","relationship":"控股"}]}',
        "distribution",
    )
    assert len(detail.companies) == 1
    assert detail.companies[0].segment_code == "distribution"
    assert detail.relationships == []
