import pandas as pd
import pytest

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

    assert [call[0] for call in calls] == ["income", "fina_indicator", "balancesheet", "cashflow"]
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
    assert calls[0][1]["ann_date"] == "20260821"
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
