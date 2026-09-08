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


@pytest.mark.asyncio
async def test_current_disclosure_is_not_mixed_with_older_public_holdings(monkeypatch):
    provider = ETFProvider()
    current = [
        {'stock_code': '600001', 'stock_name': '当期企业', 'weight': 8.0,
         'report_period': '20260630', 'ann_date': '20260721', 'source': 'tushare_fund_portfolio'}
    ]
    provider._get_tushare_holdings = AsyncMock(return_value=current)
    fallback = Mock(return_value=[
        {'stock_code': '600002', 'stock_name': '旧期企业', 'weight': 20.0,
         'report_period': '20260331', 'source': 'eastmoney_public_direct'}
    ])
    monkeypatch.setattr(provider, '_get_eastmoney_holdings_direct', fallback)

    result = await provider.get_holdings('159995')

    assert result == current
    fallback.assert_not_called()


def test_public_holdings_keep_percent_and_latest_period(monkeypatch):
    import requests
    import json
    html = ''.join(
        f'<h4 class="t">2026年股票投资明细 截止至：{period}</h4>'
        '<table><tr><th>股票代码</th><th>股票名称</th><th>占净值 比例</th>'
        '<th>持股数（万股）</th><th>持仓市值（万元）</th></tr>'
        f'<tr><td>000001</td><td>测试企业</td><td>{weight}%</td><td>100</td><td>200</td></tr></table>'
        for period, weight in [('2026-06-30', 9.25), ('2026-03-31', 15)]
    )
    response = Mock(text='var apidata={content:' + json.dumps(html, ensure_ascii=False) + '};')
    monkeypatch.setattr(requests.Session, 'get', Mock(return_value=response))
    rows = ETFProvider._get_eastmoney_holdings_direct('159995')
    assert len(rows) == 1
    assert rows[0]['weight'] == 9.25
    assert rows[0]['weight_available'] is True
    assert rows[0]['report_period'] == '20260630'
    assert rows[0]['ann_date'] == ''  # The period is not a publication date.


def test_public_missing_weight_stays_unavailable():
    rows = ETFProvider._normalize_frame(pd.DataFrame([{
        '股票代码': '000001', '占净值比例': '--', '季度': '截止至：2026-02-30',
    }]), 'eastmoney_public_direct')
    assert rows[0]['weight_available'] is False
    assert rows[0]['report_period'] == ''
