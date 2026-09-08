import pytest

from models.industry_models import SegmentInfo
from services.representative_company_resolver import RepresentativeCompanyResolver


class FakeETFProvider:
    async def _get_all_etf_data(self):
        return {
            "159001": {"名称": "芯片ETF"},
            "159002": {"名称": "半导体ETF"},
            "510300": {"名称": "沪深300ETF"},
        }

    async def get_holdings(self, code):
        return {
            "159001": [
                {"stock_code": "688001", "stock_name": "芯片公司", "weight": 8, "source": "test", "report_period": "2026Q2"},
                {"stock_code": "688002", "stock_name": "设备公司", "weight": 4, "source": "test", "report_period": "2026Q2"},
            ],
            "159002": [
                {"stock_code": "688001", "stock_name": "芯片公司", "weight": 7, "source": "test", "report_period": "2026Q2"},
            ],
        }.get(code, [])


@pytest.mark.asyncio
async def test_resolver_ranks_cross_etf_holding_first():
    resolver = RepresentativeCompanyResolver(FakeETFProvider())
    candidates = await resolver.resolve_candidates(
        "AI算力硬件",
        SegmentInfo(name="AI芯片", code="chip", description="计算芯片", key_categories=["半导体"]),
    )
    assert candidates[0]["ticker"] == "688001"
    assert len(candidates[0]["representative_etfs"]) == 2
    assert candidates[0]["match_source"] == "etf_holdings"


def test_resolver_can_fallback_without_model_output():
    detail = RepresentativeCompanyResolver.fallback_detail([{
        "ticker": "688001",
        "name": "芯片公司",
        "representative_etfs": [{
            "code": "159001", "name": "芯片ETF", "holding_weight": 8,
            "relevance": 0.9, "holding_verified": True,
        }],
        "match_confidence": 0.9,
        "representativeness_score": 0.8,
        "selection_reason": "持仓覆盖",
    }], "chip")
    assert detail.companies[0].ticker == "688001"
    assert detail.companies[0].representative_etfs[0].holding_verified is True
