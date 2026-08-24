import asyncio
from unittest.mock import Mock, patch

import pandas as pd

from providers.tushare_provider import TushareProvider


def test_tushare_news_uses_promax_http_and_normalizes_rows(monkeypatch):
    monkeypatch.setenv("TUSHARE_API_URL", "https://promax.example/api")
    monkeypatch.setenv("TUSHARE_API_KEY", "test-key")

    response = Mock()
    response.json.return_value = {
        "code": "0",
        "data": {
            "fields": ["title", "content", "pub_time", "src", "url"],
            "rows": [["标题", "正文", "20260823093000", "cls", "https://example.com/news"]],
        },
    }
    response.raise_for_status.return_value = None

    with patch("providers.tushare_provider.requests.get", return_value=response) as request:
        frame = asyncio.run(TushareProvider().get_news(keyword="cls", limit=10))

    assert isinstance(frame, pd.DataFrame)
    assert frame.iloc[0]["新闻标题"] == "标题"
    assert frame.iloc[0]["新闻内容"] == "正文"
    assert frame.iloc[0]["新闻链接"] == "https://example.com/news"
    assert frame.iloc[0]["来源"] == "cls"

    request.assert_called_once()
    args, kwargs = request.call_args
    assert args[0] == "https://promax.example/api/news"
    assert kwargs["headers"] == {"X-API-Key": "test-key"}
    assert kwargs["params"]["src"] == "cls"
    assert "limit" not in kwargs["params"]


def test_tushare_major_news_uses_major_news_endpoint(monkeypatch):
    monkeypatch.setenv("TUSHARE_API_URL", "https://promax.example/api")
    monkeypatch.setenv("TUSHARE_API_KEY", "test-key")

    response = Mock()
    response.json.return_value = {"code": 0, "data": [{"title": "重大事件", "content": "正文"}]}
    response.raise_for_status.return_value = None

    with patch("providers.tushare_provider.requests.get", return_value=response) as request:
        frame = asyncio.run(TushareProvider().get_news(api="major_news", limit=5))

    assert frame.iloc[0]["新闻标题"] == "重大事件"
    assert request.call_args.args[0] == "https://promax.example/api/major_news"
