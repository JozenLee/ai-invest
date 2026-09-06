from unittest.mock import AsyncMock, Mock

import pandas as pd
import pytest

from providers.etf_provider import ETFProvider


@pytest.mark.asyncio
async def test_tushare_holdings_filters_ignored_period_response(monkeypatch):
    provider = ETFProvider()
    rows = [
        {'ts_code': '159546.SZ', 'ann_date': '20260721', 'end_date': '20260630',
         'symbol': f'6000{index:02}.SH', 'stk_mkv_ratio': 6.0}
        for index in range(10)
    ] + [
        {'ts_code': '159546.SZ', 'ann_date': '20210401', 'end_date': '20201231',
         'symbol': '600999.SH', 'stk_mkv_ratio': 99.0}
    ]
    request = AsyncMock(return_value=pd.DataFrame(rows))
    provider._tushare = Mock(available=True, request_dataframe=request)
    monkeypatch.setattr(provider, '_recent_report_periods', lambda count=2: ['20260630'])

    result = await provider._get_tushare_holdings('159546')

    assert len(result) == 10
    assert {row['report_period'] for row in result} == {'20260630'}
    assert {row['ann_date'] for row in result} == {'20260721'}
    assert all(row['stock_code'] != '600999' for row in result)
    assert request.await_args.kwargs['period'] == '20260630'
    assert 'ann_date' in request.await_args.kwargs['fields']
