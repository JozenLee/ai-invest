import asyncio

from services.cache_service import cache_service
from services.industry_market_analyzer import IndustryMarketAnalyzer
from services.neo4j_service import Neo4jService


def test_industry_aliases_include_frontend_domain_ids():
    aliases = Neo4jService._reference_aliases("dom_ai")
    assert "ai_hardware" in aliases
    assert "AI算力硬件" in aliases


def test_market_analysis_cache_coalesces_repeated_requests(monkeypatch):
    analyzer = object.__new__(IndustryMarketAnalyzer)
    analyzer.analysis_cache_ttl_seconds = 60
    analyzer.analysis_timeout_seconds = 5
    analyzer._analysis_locks = {}
    calls = {"count": 0}

    async def compute(*_args):
        calls["count"] += 1
        await asyncio.sleep(0)
        return {"success": True, "industry_id": "dom_ai", "etf_analysis": []}

    analyzer._compute_industry_market = compute
    cache_key = analyzer._analysis_cache_key("dom_ai", "AI算力", 90)
    cache_service.delete(cache_key)


def test_market_analysis_cache_separates_ai_and_data_modes():
    analyzer = object.__new__(IndustryMarketAnalyzer)

    ai_key = analyzer._analysis_cache_key("dom_ai", "AI算力", 90, True)
    data_key = analyzer._analysis_cache_key("dom_ai", "AI算力", 90, False)

    assert ai_key != data_key
    assert ai_key.endswith(":ai")
    assert data_key.endswith(":data")

    first = asyncio.run(analyzer.analyze_industry_market("dom_ai", "AI算力", 90))
    second = asyncio.run(analyzer.analyze_industry_market("dom_ai", "AI算力", 90))

    assert first["cache"]["hit"] is False
    assert second["cache"]["hit"] is True
    assert calls["count"] == 1
    cache_service.delete(cache_key)


def test_sector_flow_uses_data_service_without_http_self_call(monkeypatch):
    analyzer = object.__new__(IndustryMarketAnalyzer)

    class FakeDataService:
        async def get_sector_capital_flow(self, _indicator):
            return [
                {"sector": "半导体", "netFlow": 10},
                {"sector": "地产", "netFlow": -4},
            ]

    monkeypatch.setattr("services.industry_market_analyzer.data_service", FakeDataService())
    result = asyncio.run(analyzer._fetch_sector_capital_flow())

    assert result["source"] == "data_service"
    assert result["topInflowSectors"][0]["sector"] == "半导体"
    assert result["topOutflowSectors"][0]["sector"] == "地产"


def test_sector_flow_normalizes_provider_field_names_and_units(monkeypatch):
    analyzer = object.__new__(IndustryMarketAnalyzer)

    class FakeDataService:
        async def get_sector_capital_flow(self, _indicator):
            return [
                {"名称": "半导体", "今日主力净流入-净额": 250000000, "今日涨跌幅": 2.5},
                {"名称": "地产", "今日主力净流入-净额": -120000000, "今日涨跌幅": -1.2},
            ]

    monkeypatch.setattr("services.industry_market_analyzer.data_service", FakeDataService())
    result = asyncio.run(analyzer._fetch_sector_capital_flow())

    assert result["topInflowSectors"][0]["netFlow"] == 2.5
    assert result["topOutflowSectors"][0]["netFlow"] == -1.2
    assert result["topOutflowSectors"][0]["changePct"] == -1.2


def test_market_report_reconciliation_uses_structured_quality_and_flow():
    report = "\n".join([
        "## 一、数据质量评估",
        "数据质量：高（6只ETF，平均63天数据）",
        "板块资金流向数据缺失，无法判断资金轮动方向",
        "板块轮动：资金明显撤离AI算力硬件，向其他板块流动",
    ])
    result = IndustryMarketAnalyzer._reconcile_market_report(
        report,
        {"level": "中", "total_etfs": 12, "avg_data_points": 63, "abnormal_etfs": 6},
        {
            "topInflowSectors": [{"sector": "半导体", "netFlow": 2.5}],
            "topOutflowSectors": [{"sector": "地产", "netFlow": -1.2}],
        },
    )

    assert "数据质量：中（12只ETF，平均63天数据；其中6只存在异常收益、波动或回撤" in result
    assert "数据质量：高" not in result
    assert "板块资金流向快照已获取" in result
    assert "半导体 +2.50亿元" in result


def test_market_report_reconciliation_does_not_infer_missing_flow_direction():
    result = IndustryMarketAnalyzer._reconcile_market_report(
        "板块资金流向数据缺失，无法判断资金轮动方向\n板块轮动：资金明显撤离AI算力硬件，向其他板块流动",
        {"level": "中", "total_etfs": 12, "avg_data_points": 63, "abnormal_etfs": 6},
        None,
    )

    assert "板块资金流向未获取，本报告不据此判断具体资金轮动方向。" in result
    assert "资金明显撤离AI算力硬件" not in result


def test_analyzed_etf_preserves_provider_source():
    analyzer = object.__new__(IndustryMarketAnalyzer)
    rows = asyncio.run(analyzer._analyze_etfs([{
        "code": "159000",
        "source": "cache",
        "info": {"基金简称": "测试ETF"},
        "kline": [
            {"收盘": 1.0, "最高": 1.01, "最低": 0.99, "成交量": 100, "涨跌幅": 0},
            {"收盘": 1.1, "最高": 1.11, "最低": 1.09, "成交量": 120, "涨跌幅": 10},
        ],
        "holdings": [],
        "is_fallback": False,
        "history_quality": {"valid": True, "flags": []},
    }]))

    assert rows[0]["source"] == "cache"


def test_graph_etf_selection_keeps_one_primary_and_one_diversifier_per_node():
    selected = IndustryMarketAnalyzer._select_graph_etfs([
        {
            "node": "AI芯片",
            "candidates": [
                {"code": "A", "name": "半导体ETF", "relevance": 0.95},
                {"code": "B", "name": "芯片ETF", "relevance": 0.90},
                {"code": "C", "name": "人工智能ETF", "relevance": 0.50},
            ],
        },
        {
            "node": "数据中心",
            "candidates": [
                {"code": "D", "name": "数据中心ETF", "relevance": 0.92},
            ],
        },
    ], {"A", "B", "D"})

    assert [item["code"] for item in selected] == ["A", "B", "D"]
    assert selected[0]["selection_reason"] == "节点代表性最高"
    assert selected[1]["selection_reason"] == "补充差异化覆盖"


def test_graph_etf_ranking_uses_all_candidates_and_selects_representative_rows(monkeypatch):
    ranked = IndustryMarketAnalyzer._rank_graph_etfs(
        [{
            "node": "AI芯片",
            "candidates": [
                {"code": "A", "name": "大规模高活跃ETF", "relevance": 0.6},
                {"code": "B", "name": "小规模低活跃ETF", "relevance": 0.95},
                {"code": "C", "name": "中规模ETF", "relevance": 0.7},
            ],
        }, {
            "node": "半导体设备",
            "candidates": [
                {"code": "A", "name": "大规模高活跃ETF", "relevance": 0.6},
                {"code": "B", "name": "小规模低活跃ETF", "relevance": 0.95},
                {"code": "C", "name": "中规模ETF", "relevance": 0.7},
            ],
        }],
        [
            {"code": "A", "market_value": 1000, "amount": 100, "price_change_pct": 12, "volatility": 20, "max_drawdown": 10, "ma20": 2, "ma60": 1, "macd_macd": 1, "is_fallback": False},
            {"code": "B", "market_value": 100, "amount": 10, "price_change_pct": 20, "volatility": 60, "max_drawdown": 50, "ma20": 1, "ma60": 2, "macd_macd": -1, "is_fallback": False},
            {"code": "C", "market_value": 500, "amount": 50, "price_change_pct": 5, "volatility": 30, "max_drawdown": 20, "ma20": 2, "ma60": 1, "macd_macd": 1, "is_fallback": False},
        ],
    )

    assert [row["code"] for row in ranked] == ["A", "C", "B", "A", "C", "B"]
    assert [row["code"] for row in ranked if row["selected"]] == ["A", "C", "A", "C"]
    assert {row["node"] for row in ranked if row["selected"]} == {"AI芯片", "半导体设备"}
    assert ranked[0]["representativeness_score"] > ranked[2]["representativeness_score"]


def test_tushare_field_normalization_preserves_volume_and_amount():
    record = {
        "date": "20260821",
        "open": 1.0,
        "high": 1.1,
        "low": 0.9,
        "close": 1.05,
        "vol": 123456,
        "amount": 789012.5,
        "pct_chg": 1.2,
    }

    normalized = IndustryMarketAnalyzer._normalize_etf_kline_record(record, 0, [record])

    assert normalized["成交量"] == 123456
    assert normalized["成交额"] == 789012.5
    assert normalized["涨跌幅"] == 1.2


def test_graph_selection_ranks_only_valid_history_rows():
    analyzer = object.__new__(IndustryMarketAnalyzer)
    rows = analyzer._filter_valid_data([
        {"code": "A", "name": "有效ETF", "data_points": 63, "is_fallback": False},
        {"code": "B", "name": "单日降级ETF", "data_points": 1, "is_fallback": True},
    ])

    ranked = IndustryMarketAnalyzer._rank_graph_etfs([{
        "node": "半导体",
        "candidates": [
            {"code": "A", "name": "有效ETF", "relevance": 0.9},
            {"code": "B", "name": "单日降级ETF", "relevance": 1.0},
        ],
    }], rows)

    assert [row["code"] for row in ranked] == ["A"]
    assert ranked[0]["selected"] is True


def test_graph_selection_uses_volume_when_amount_is_missing():
    ranked = IndustryMarketAnalyzer._rank_graph_etfs([{
        "node": "云计算",
        "candidates": [
            {"code": "A", "name": "高成交量ETF", "relevance": 0.8},
            {"code": "B", "name": "低成交量ETF", "relevance": 0.8},
        ],
    }], [
        {"code": "A", "market_value": 100, "volume": 1000, "amount": None, "price_change_pct": 0, "volatility": 10, "max_drawdown": 5, "ma20": 2, "ma60": 2, "macd_macd": 1, "is_fallback": False},
        {"code": "B", "market_value": 100, "volume": 10, "amount": None, "price_change_pct": 0, "volatility": 10, "max_drawdown": 5, "ma20": 2, "ma60": 2, "macd_macd": 1, "is_fallback": False},
    ])

    assert ranked[0]["code"] == "A"
