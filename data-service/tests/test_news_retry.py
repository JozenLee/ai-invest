from unittest.mock import AsyncMock
import pandas as pd
import pytest
import requests
from providers.tushare_provider import TushareProvider

@pytest.mark.asyncio
async def test_news_retries_transient_503(monkeypatch):
    provider = TushareProvider.__new__(TushareProvider)
    monkeypatch.setattr(provider, '_check_available', lambda: None)
    response = requests.Response()
    response.status_code = 503
    provider._call_api = AsyncMock(side_effect=[requests.HTTPError(response=response), pd.DataFrame([{'title':'新闻','content':'内容','datetime':'2026-09-04'}])])
    monkeypatch.setattr('providers.tushare_provider.asyncio.sleep', AsyncMock())
    result = await provider.get_news('cls')
    assert len(result) == 1 and provider._call_api.await_count == 2

@pytest.mark.asyncio
async def test_news_does_not_retry_invalid_credentials(monkeypatch):
    provider = TushareProvider.__new__(TushareProvider)
    monkeypatch.setattr(provider, '_check_available', lambda: None)
    response = requests.Response()
    response.status_code = 401
    provider._call_api = AsyncMock(side_effect=requests.HTTPError(response=response))
    with pytest.raises(requests.HTTPError):
        await provider.get_news('cls')
    assert provider._call_api.await_count == 1

@pytest.mark.asyncio
async def test_same_media_fallback_after_transient_retries(monkeypatch):
    provider = TushareProvider.__new__(TushareProvider)
    monkeypatch.setattr(provider, '_check_available', lambda: None)
    response = requests.Response()
    response.status_code = 503
    failure = requests.HTTPError(response=response)
    provider._call_api = AsyncMock(side_effect=[failure, failure, failure, pd.DataFrame([{'title':'同花顺原文','content':'正文','pub_time':'2026-09-04'}])])
    monkeypatch.setattr('providers.tushare_provider.asyncio.sleep', AsyncMock())
    result = await provider.get_news('10jqka')
    assert len(result) == 1
    assert provider._call_api.await_args.args == ('major_news',)
    assert provider._call_api.await_args.kwargs['src'] == '同花顺'
