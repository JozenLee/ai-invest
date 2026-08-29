import pandas as pd
import pytest

from providers.etf_provider import ETFProvider
from providers.stock_provider import StockProvider


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setenv("TUSHARE_API_URL", "https://promax.example/tushare/pro")
    monkeypatch.setenv("TUSHARE_API_KEY", "test-key")
    return StockProvider()


@pytest.mark.asyncio
async def test_financial_reports_use_tushare_statements(provider, monkeypatch):
    calls = []

    async def request_dataframe(api, **params):
        calls.append((api, params))
        if api == "fina_indicator":
            return pd.DataFrame([{
                "end_date": "20260630",
                "grossprofit_margin": 25,
                "netprofit_margin": 10,
                "n_cashflow_act": 30,
            }])
        return pd.DataFrame([{
            "end_date": "20260630",
            "ann_date": "20260820",
            "total_revenue": 100,
            "n_income": 20,
            "n_cashflow_act": 30,
        }])

    monkeypatch.setattr(provider.tushare, "request_dataframe", request_dataframe)

    income = await provider.get_financial_report("000001", "income", "cn")
    balance = await provider.get_financial_report("000001", "balance", "cn")
    cashflow = await provider.get_financial_report("000001", "cashflow", "cn")

    assert [call[0] for call in calls] == [
        "fina_indicator", "income",
        "fina_indicator", "balancesheet",
        "fina_indicator", "cashflow",
    ]
    assert income[0]["营业收入"] == 100
    assert income[0]["净利润"] == 20
    assert income[0]["毛利率"] == 25
    assert cashflow[0]["经营现金流"] == 30
    assert balance[0]["报告期"] == "20260630"


@pytest.mark.asyncio
async def test_announcements_use_tushare_anns_d(provider, monkeypatch):
    calls = []

    async def request_dataframe(api, **params):
        calls.append((api, params))
        return pd.DataFrame([{
            "title": "关于回购公司股份的公告",
            "ann_date": "20260820",
            "url": "https://example.com/announcement",
        }])

    monkeypatch.setattr(provider.tushare, "request_dataframe", request_dataframe)
    rows = await provider.get_announcements("000001", "2026-08-01", "2026-08-23", "cn")

    assert calls[0][0] == "anns_d"
    assert calls[0][1]["ts_code"] == "000001.SZ"
    assert calls[0][1]["start_date"] == "20260801"
    assert calls[0][1]["end_date"] == "20260823"
    assert rows[0]["公告标题"] == "关于回购公司股份的公告"
    assert rows[0]["source"] == "tushare_anns_d"


@pytest.mark.asyncio
async def test_kline_uses_tushare_period_endpoint(provider, monkeypatch):
    calls = []

    async def get_stock_kline(ticker, period, start_date, end_date):
        calls.append((ticker, period, start_date, end_date))
        return pd.DataFrame([{"date": "2026-08-20", "close": 10}])

    monkeypatch.setattr(provider.tushare, "get_stock_kline", get_stock_kline)
    rows = await provider.get_kline("000001", "weekly", "2026-08-01", "2026-08-23", "cn")

    assert calls == [("000001", "weekly", "20260801", "20260823")]
    assert rows[0]["close"] == 10


@pytest.mark.asyncio
async def test_etf_holdings_use_periodic_fund_portfolio_not_trade_dates(monkeypatch):
    monkeypatch.setenv("ETF_HOLDINGS_REPORT_PERIODS", "2")
    monkeypatch.setenv("TUSHARE_HOLDINGS_TIMEOUT_SECONDS", "8")
    provider = ETFProvider()
    provider._tushare._api_url = "https://tushare.example"
    provider._tushare._api_key = "test-key"
    calls = []
    periods = provider._recent_report_periods(2)

    async def request_dataframe(api, **params):
        calls.append((api, params))
        if params["period"] == periods[0]:
            return pd.DataFrame()
        return pd.DataFrame([{
            "ts_code": "159738.SZ",
            "股票代码": "000001",
            "股票名称": "测试企业",
            "占净值比例": 3.2,
            "报告期": periods[1],
        }])

    provider._tushare.request_dataframe = request_dataframe
    rows = await provider._get_tushare_holdings("159738")

    assert [call[0] for call in calls] == ["fund_portfolio", "fund_portfolio"]
    assert all("trade_date" not in params for _, params in calls)
    assert all(params["ts_code"] == "159738.SZ" for _, params in calls)
    assert all(params["_timeout_seconds"] == 8 for _, params in calls)
    assert rows[0]["source"] == "tushare_fund_portfolio"
    assert rows[0]["report_period"] == periods[1]


@pytest.mark.asyncio
async def test_etf_holdings_batch_is_concurrent_and_keeps_diagnostics(monkeypatch):
    monkeypatch.setenv("ETF_HOLDINGS_CONCURRENCY", "2")
    monkeypatch.setenv("ETF_HOLDINGS_REQUEST_TIMEOUT_SECONDS", "1")
    import routers.industry_analysis as industry_analysis

    fake_provider = type("FakeETFProvider", (), {})()

    async def get_holdings(code):
        if code == "bad":
            raise RuntimeError("provider unavailable")
        return [{"stock_code": code, "stock_name": "企业", "weight": 1}]

    fake_provider.get_holdings = get_holdings
    # The router imports the shared provider from routers.etf inside the function.
    import routers.etf as etf_router
    original_router_provider = etf_router.etf_provider
    etf_router.etf_provider = fake_provider
    try:
        results, diagnostics = await industry_analysis.get_etf_holdings_for_analysis(["a", "bad", "b"])
    finally:
        etf_router.etf_provider = original_router_provider

    assert set(results) == {"a", "bad", "b"}
    assert diagnostics["a"]["status"] == "success"
    assert diagnostics["bad"]["status"] == "error"
    assert diagnostics["bad"]["rows"] == 0
