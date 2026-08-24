import os
import sys
import asyncio
import httpx
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.industry_company_analyzer import IndustryCompanyAnalyzer


def _report_args():
    return {
        "industry_name": "AI算力硬件",
        "industry_id": "industry-1",
        "nodes": [],
        "analyzed_companies": [],
        "top_companies": [],
        "coverage": {
            "graph_companies": 1,
            "analyzed_companies": 1,
            "companies_with_any_data": 1,
            "quote_coverage": 1,
            "financial_coverage": 1,
            "announcement_coverage": 0,
        },
    }


def test_ai_not_configured_fails_without_fallback_report():
    analyzer = IndustryCompanyAnalyzer()
    analyzer.anthropic = None

    try:
        asyncio.run(analyzer._generate_trend_report(**_report_args()))
    except Exception as error:
        assert error.stage == "ai_report"
        assert error.error_code == "AI_REPORT_NOT_CONFIGURED"
    else:
        raise AssertionError("未配置 AI 时必须失败")


def test_ai_empty_response_fails_without_fallback_report():
    analyzer = IndustryCompanyAnalyzer()
    analyzer.anthropic = SimpleNamespace(messages=SimpleNamespace(create=lambda **_: SimpleNamespace(content=[])))

    try:
        asyncio.run(analyzer._generate_trend_report(**_report_args()))
    except Exception as error:
        assert error.stage == "ai_report"
        assert error.error_code == "AI_REPORT_EMPTY"
    else:
        raise AssertionError("AI 空响应时必须失败")


def test_ai_success_returns_only_model_report():
    analyzer = IndustryCompanyAnalyzer()
    analyzer.anthropic = SimpleNamespace(
        messages=SimpleNamespace(
            create=lambda **_: SimpleNamespace(content=[SimpleNamespace(text="\n".join([
                "# AI真实报告", "x" * 600,
                "## 一、趋势判断", "趋势内容",
                "## 二、关注重点", "关注内容",
                "## 三、投资建议结论", "建议内容",
            ]))])
        )
    )

    report = asyncio.run(analyzer._generate_trend_report(**_report_args()))

    assert report.startswith("# AI真实报告")
    assert "规则" not in report


def test_legacy_report_is_rejected_by_new_protocol():
    analyzer = IndustryCompanyAnalyzer()
    analyzer.anthropic = SimpleNamespace(
        messages=SimpleNamespace(
            create=lambda **_: SimpleNamespace(content=[SimpleNamespace(text="\n".join([
                "# 旧版报告", "x" * 600,
                "## 一、核心结论", "## 二、重点企业观察",
                "## 三、财报与公告信号", "## 四、风险与后续跟踪",
            ]))])
        )
    )

    try:
        asyncio.run(analyzer._generate_trend_report(**_report_args()))
    except Exception as error:
        assert error.error_code == "AI_REPORT_INVALID"
    else:
        raise AssertionError("旧版章节格式必须被新协议拒绝")


def test_core_conclusion_excludes_segment_overview_section():
    report = "\n".join([
        "## 一、核心结论",
        "核心判断。",
        "\n**产业链结构性差异**：半导体设备平均上涨9%，数据中心平均下跌20%。",
        "## 二、重点企业观察",
        "重点企业。",
    ])

    result = IndustryCompanyAnalyzer._extract_core_conclusion(report)
    assert "核心判断。" in result
    assert "产业链结构性差异" not in result


def test_ai_report_quality_gate_rejects_short_generic_output():
    analyzer = IndustryCompanyAnalyzer()
    analyzer.anthropic = SimpleNamespace(
        messages=SimpleNamespace(
            create=lambda **_: SimpleNamespace(content=[SimpleNamespace(text="# 过短报告")])
        )
    )

    try:
        asyncio.run(analyzer._generate_trend_report(**_report_args()))
    except Exception as error:
        assert error.error_code == "AI_REPORT_INVALID"
    else:
        raise AssertionError("过短且缺少章节的 AI 报告必须被拒绝")


def test_ai_timeout_returns_actionable_error():
    class TimeoutMessages:
        def create(self, **_):
            raise TimeoutError()

    analyzer = IndustryCompanyAnalyzer()
    analyzer.anthropic = SimpleNamespace(messages=TimeoutMessages())

    try:
        asyncio.run(analyzer._generate_trend_report(**_report_args()))
    except Exception as error:
        assert error.stage == "ai_report"
        assert "模型调用超时" in str(error)
        assert "360秒" in str(error)
    else:
        raise AssertionError("AI 超时时必须返回可定位错误")


def test_http_502_is_retryable():
    request = httpx.Request("POST", "https://example.com/v1/chat/completions")
    response = httpx.Response(502, request=request)
    error = httpx.HTTPStatusError("bad gateway", request=request, response=response)
    assert IndustryCompanyAnalyzer._is_retryable_ai_error(error) is True


def test_fallback_report_keeps_company_analysis_available_when_ai_report_fails():
    analyzer = IndustryCompanyAnalyzer()
    report = analyzer._build_fallback_trend_report(
        industry_name="AI算力硬件",
        top_companies=[{
            "name": "测试企业",
            "financial_metrics": {"revenue_growth": 12.3, "profit_growth": None, "operating_cash_flow": None},
            "price_metrics": {"price_change_pct": 4.2, "latest_change_pct": -1.1},
            "latest_announcement_samples": [{"date": "2026-08-20", "event_type": "订单/合同", "title": "签署订单", "direction": "positive"}],
        }],
        coverage={"quote_coverage": 100, "financial_coverage": 80, "announcement_coverage": 60},
        warning="AI报告生成失败：HTTPStatusError：502 Bad Gateway",
    )
    assert "## 一、趋势判断" in report
    assert "## 二、关注重点" in report
    assert "## 三、投资建议结论" in report
    assert "502 Bad Gateway" in report



def test_empty_provider_results_are_not_counted_as_coverage():
    analyzer = IndustryCompanyAnalyzer()
    companies = [
        {"name": "海外企业", "symbol": "NVDA", "market": "us"},
        {"name": "未上市企业", "symbol": "", "market": "cn"},
    ]
    analyzed = analyzer._analyze_companies([
        {
            **companies[0],
            "kline": [],
            "financial": [],
            "announcements": [],
            "fetch_errors": {},
        },
        {
            **companies[1],
            "kline": None,
            "financial": None,
            "announcements": None,
            "fetch_errors": {"symbol": "图谱企业缺少证券代码"},
        },
    ])

    coverage = analyzer._build_data_coverage(companies, analyzed, analyzed)

    assert coverage["companies_with_any_data"] == 0
    assert coverage["quote_coverage"] == 0
    assert coverage["financial_coverage"] == 0
    assert coverage["announcement_coverage"] == 0
    assert coverage["missing_symbol"] == 1
    assert coverage["quote_coverage_pct"] == 0


def test_report_candidates_require_financials_and_announcements_not_quotes():
    candidates = [
        {
            "name": "有财报公告但无行情",
            "symbol": "600001",
            "data_availability": {"financial": True, "announcements": True, "quote": False},
            "financial_samples": [{"报告期": "2026-06-30"}],
            "announcement_samples": [{"title": "重大订单", "date": "2026-08-20"}],
            "latest_announcement_samples": [{"title": "重大订单", "date": "2026-08-20"}],
            "fetch_errors": {"kline": "行情接口不可用"},
        },
        {
            "name": "只有财报",
            "symbol": "600002",
            "data_availability": {"financial": True, "announcements": False, "quote": True},
            "financial_samples": [{"报告期": "2026-06-30"}],
            "announcement_samples": [],
            "latest_announcement_samples": [],
            "fetch_errors": {},
        },
    ]

    result = IndustryCompanyAnalyzer._build_report_candidates(candidates)

    assert [item["name"] for item in result] == ["有财报公告但无行情"]


def test_evidence_candidates_accept_financial_or_announcement_and_keep_ai_order():
    result = IndustryCompanyAnalyzer._build_evidence_candidates([
        {"name": "排名3仅公告", "ai_selection_rank": 3, "data_availability": {"financial": False, "announcements": True}},
        {"name": "排名1仅财报", "ai_selection_rank": 1, "data_availability": {"financial": True, "announcements": False}},
        {"name": "排名2双证据", "ai_selection_rank": 2, "data_availability": {"financial": True, "announcements": True}},
        {"name": "排名4无证据", "ai_selection_rank": 4, "data_availability": {"financial": False, "announcements": False}},
    ])

    assert [item["name"] for item in result] == ["排名1仅财报", "排名2双证据", "排名3仅公告"]


def test_ai_selects_six_report_companies_from_valid_candidate_pool():
    analyzer = IndustryCompanyAnalyzer()
    candidates = [
        {
            "name": f"企业{index}",
            "symbol": f"60000{index}",
            "market": "cn",
            "market_position": "leader",
            "data_availability": {"financial": True, "announcements": True},
            "financial_samples": [{"报告期": "2026-06-30", "净利润": index}],
            "announcement_samples": [{"title": f"企业{index}重大公告", "date": "2026-08-20"}],
            "financial_metrics": {"latest_period": "2026-06-30"},
            "node_refs": [],
        }
        for index in range(1, 7)
    ]
    analyzer.anthropic = SimpleNamespace(
        messages=SimpleNamespace(
            create=lambda **_: SimpleNamespace(content=[SimpleNamespace(text='{"selected": [' + ','.join(
                f'{{"candidate_id":"60000{index}:cn","rank":{index},"reason":"影响力和最新公告"}}'
                for index in range(1, 7)
            ) + ']}')])
        )
    )

    result = asyncio.run(analyzer._select_report_companies_with_ai("测试产业", candidates))

    assert len(result) == 6
    assert result[0]["symbol"] == "600001"
    assert result[0]["ai_selection_reason"] == "影响力和最新公告"


def test_ai_selects_graph_companies_before_data_fetch():
    analyzer = IndustryCompanyAnalyzer()
    companies = [
        {
            "name": f"图谱企业{index}",
            "symbol": f"60010{index}",
            "market": "cn",
            "market_position": "leader" if index == 1 else "major",
            "key_products": ["关键设备"],
            "node_refs": [{"stage_name": "供给端", "segment_name": "核心设备"}],
        }
        for index in range(1, 7)
    ]
    analyzer.anthropic = SimpleNamespace(
        messages=SimpleNamespace(
            create=lambda **_: SimpleNamespace(content=[SimpleNamespace(text='{"selected": [' + ','.join(
                f'{{"candidate_id":"60010{index}:cn","rank":{index},"reason":"位于核心环节"}}'
                for index in range(1, 7)
            ) + ']}')])
        )
    )

    result = asyncio.run(analyzer._select_graph_companies_with_ai("测试产业", companies))

    assert len(result) == 6
    assert result[0]["symbol"] == "600101"
    assert result[0]["ai_selection_rank"] == 1
    assert result[0]["ai_selection_reason"] == "位于核心环节"


def test_score_confidence_reflects_available_data_only():
    analyzer = IndustryCompanyAnalyzer()
    analyzed = analyzer._analyze_companies([
        {
            "name": "测试企业",
            "symbol": "000001",
            "market": "cn",
            "kline": [{"收盘": 10}, {"收盘": 11}],
            "financial": [],
            "announcements": [],
            "fetch_errors": {},
        }
    ])

    ranked = analyzer._identify_top_companies(analyzed)

    assert ranked[0]["composite_score"] == 30
    assert ranked[0]["score_confidence"] == 0.33


def test_representativeness_outranks_short_term_performance():
    analyzer = IndustryCompanyAnalyzer()
    analyzed = analyzer._analyze_companies([
        {
            "name": "行业龙头",
            "symbol": "LEADER",
            "market": "us",
            "market_position": "leader",
            "key_products": ["AI加速器", "GPU"],
            "node_refs": [{"segment_name": "AI芯片"}],
            "kline": [{"收盘": 10}, {"收盘": 10.5}],
            "financial": [],
            "announcements": [],
            "fetch_errors": {},
        },
        {
            "name": "边缘企业",
            "symbol": "RELATED",
            "market": "cn",
            "market_position": "related",
            "key_products": [],
            "node_refs": [{"segment_name": "网络设备"}],
            "kline": [{"收盘": 10}, {"收盘": 15}],
            "financial": [],
            "announcements": [],
            "fetch_errors": {},
        },
    ])

    ranked = analyzer._identify_top_companies(analyzed)

    assert ranked[0]["name"] == "行业龙头"
    assert ranked[0]["representativeness_score"] > ranked[1]["representativeness_score"]
