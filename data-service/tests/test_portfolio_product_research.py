import json
from services.portfolio_product_research import parse_fund_series, parse_fund_holdings, parse_target_fund_report, parse_tushare_nav, merge_fund_nav
from routers.fund import _target_etf_candidate


def test_nav_identity_dates_and_allocation_denominator():
    text = 'var fS_code="026633";var fS_name="test";var Data_netWorthTrend=' + json.dumps([
        {'x': 1788969600000, 'y': 1.47, 'unitMoney': '分红备注', 'equityReturn': 0.2},
    ]) + ';var Data_assetAllocation=' + json.dumps({'categories': ['2026-06-30'], 'series': [
        {'name': '股票占净比', 'data': [91]}, {'name': '净资产', 'data': [8]},
    ]}) + ';'
    result = parse_fund_series(text, '026633', '2026-09-11T01:00:00+00:00')
    assert result['nav'][0]['nav_date'] == '2026-09-10'
    assert result['nav'][0]['ann_date'] is None
    assert 'adj_nav' not in result['nav'][0]
    assert result['nav'][0]['distribution_note'] == '分红备注'
    assert len(result['assetAllocation']) == 1
    assert result['assetAllocation'][0]['weightBasis'] == 'net-assets'
    try:
        parse_fund_series(text, '026632', '2026-09-11T01:00:00+00:00')
        assert False
    except ValueError:
        pass


def test_holdings_does_not_convert_disclosure_period_to_publication_date():
    content = '''<div class="boxitem"><h4><a href="http://fund.eastmoney.com/017470.html">基金</a>
    截止至：<font>2026-06-30</font></h4><table><thead><tr><th>基金代码</th><th>基金名称</th><th>占净值<br/>比例</th></tr></thead>
    <tbody><tr><td>588200</td><td>目标ETF</td><td>94.00%</td></tr></tbody></table></div>'''
    payload = 'var apidata={content:' + json.dumps(content) + '};'
    result = parse_fund_holdings(payload, '017470', 'https://example.test', '2026-09-11T01:00:00+00:00')
    assert result[0]['kind'] == 'fund'
    assert result[0]['weight'] == 94
    assert result[0]['report_period'] == '2026-06-30'
    assert result[0]['ann_date'] is None
    assert parse_fund_holdings(payload, '024975', '', '') == []


def report_document():
    return {'security': [{'stock': '024975'}], 'notice_title': '华泰柏瑞联接基金2026年中期报告',
            'notice_date': '2026-08-29 00:00:00', 'art_code': 'AN202608291828684912',
            'attach_url': 'https://pdf.dfcfw.com/pdf/H2_AN202608291828684912_1.pdf',
            'notice_content': '''2.1.1 目标基金基本情况
基金名称 华泰柏瑞上证科创板半导体材料设备主题交易型开放式指数证券投资基金
基金主代码 588710
2.2 基金产品说明
投资范围 目标ETF不少于90%，业绩比较基准95%
7.10 期末按公允价值占基金资产净值比例大小排序的前十名基金投资明细
序号 基金名称 公允价值 占基金资产净值比例（%）
  华泰柏瑞 上证科创板半导体
  1      材料设备    指数型    989,245,8      94.02
    主题交易型开放式基金    29.77
7.11 本基金投资股指期货的投资政策
无
'''}


def test_target_report_weight_is_actual_table_not_contract_or_market_value():
    doc = report_document()
    row = parse_target_fund_report(doc, '024975', '2026-09-11T01:00:00+00:00')[0]
    assert row['weight'] == 94.02
    assert row['stock_code'] == '588710'
    assert row['kind'] == 'fund'
    assert row['report_period'] == '2026-06-30'
    assert row['ann_date'] == '2026-08-29'
    assert row['locator'].startswith('7.10')
    assert row['source_url'] == doc['attach_url']
    assert parse_target_fund_report(doc, '017470', '2026-09-11T01:00:00+00:00') == []
    assert parse_target_fund_report(doc, '024975', '2026-08-01T01:00:00+00:00') == []
    doc['notice_content'] = doc['notice_content'].replace('7.11', '  2      another fund      5.00\n7.11')
    assert parse_target_fund_report(doc, '024975', '2026-09-11T01:00:00+00:00') == []


def test_report_contract_only_or_ai_summary_is_not_a_holding():
    doc = report_document()
    doc['is_ai_summary'] = 1
    assert parse_target_fund_report(doc, '024975', '2026-09-11T01:00:00+00:00') == []
    doc.pop('is_ai_summary')
    doc['notice_content'] = doc['notice_content'].split('7.10')[0]
    assert parse_target_fund_report(doc, '024975', '2026-09-11T01:00:00+00:00') == []


def test_tushare_adj_nav_is_explicit_and_share_class_exact():
    rows = [
        {'ts_code': '017470.OF', 'nav_date': '20260910', 'ann_date': '20260911', 'unit_nav': 2, 'adj_nav': 2.5},
        {'ts_code': '017470.OF', 'nav_date': '20260909', 'ann_date': '20260910', 'unit_nav': 2, 'accum_nav': 9},
        {'ts_code': '017469.OF', 'nav_date': '20260910', 'ann_date': '20260911', 'unit_nav': 2, 'adj_nav': 99},
        {'ts_code': '017470.OF', 'nav_date': '20260912', 'ann_date': '20260912', 'unit_nav': 2, 'adj_nav': 99},
    ]
    result = parse_tushare_nav(rows, '017470', '2026-09-11T01:00:00+00:00')
    assert len(result) == 2
    assert result[0]['adj_nav'] == 2.5
    assert result[1]['adj_nav'] is None
    assert result[0]['source'] == 'Tushare/fund_nav'


def test_nav_merge_preserves_audit_and_rejects_same_date_price_conflict():
    em = [{'ts_code': '017470.OF', 'nav_date': '2026-09-09', 'unit_nav': 1, 'source': 'eastmoney'},
          {'ts_code': '017470.OF', 'nav_date': '2026-09-10', 'unit_nav': 1.1, 'source': 'eastmoney'}]
    ts = [{'ts_code': '017470.OF', 'nav_date': '2026-09-09', 'unit_nav': 1, 'adj_nav': 2, 'source': 'Tushare/fund_nav'},
          {'ts_code': '017470.OF', 'nav_date': '2026-09-10', 'unit_nav': 1.2, 'adj_nav': 3, 'source': 'Tushare/fund_nav'},
          {'ts_code': '017469.OF', 'nav_date': '2026-09-11', 'unit_nav': 1, 'adj_nav': 2, 'source': 'Tushare/fund_nav'}]
    result, conflicts = merge_fund_nav(em, ts, '017470')
    assert conflicts == ['2026-09-10']
    assert result[0]['adj_nav'] == 2
    assert result[0]['corroborating_nav_observation'] == em[0]
    assert result[1]['unit_nav'] == 1.1
    assert result[1]['adj_nav'] is None
    assert len(result) == 2


def test_recent_nav_window_repairs_stale_history(monkeypatch):
    from services.portfolio_product_research import _tushare_nav
    from providers.tushare_provider import TushareProvider
    import pandas as pd
    calls = []

    async def request(self, api, **params):
        calls.append(params)
        date = '20260910' if params['start_date'] == '20260828' else '20250102'
        return pd.DataFrame([{'ts_code': '017470.OF', 'nav_date': date,
                              'ann_date': date, 'unit_nav': 2, 'adj_nav': 2.5}])

    monkeypatch.setattr(TushareProvider, '__init__', lambda self: None)
    monkeypatch.setattr(TushareProvider, 'request_dataframe', request)
    result = _tushare_nav('017470', '2026-09-11T01:00:00+00:00')
    assert len(calls) == 2
    assert result[-1]['nav_date'] == '2026-09-10'
    assert result[-1]['adj_nav'] == 2.5
    assert result[0]['nav_date'] == '2025-01-02'


def test_feeder_identity_matches_same_manager_unique_theme_etf():
    catalog = [
        {'code': '159530', 'name': '机器人ETF易方达'},
        {'code': '159559', 'name': '机器人ETF景顺'},
        {'code': '516080', 'name': '创新药ETF易方达'},
        {'code': '159369', 'name': '创业板50ETF易方达'},
        {'code': '588080', 'name': '科创50ETF易方达'},
        {'code': '561560', 'name': '电力ETF华泰柏瑞'},
        {'code': '159934', 'name': '黄金ETF易方达'},
    ]
    robot = _target_etf_candidate('易方达国证机器人产业交易型开放式指数证券投资基金发起式联接基金', '易方达基金管理有限公司', catalog)
    drug = _target_etf_candidate('易方达中证创新药产业交易型开放式指数证券投资基金发起式联接基金', '易方达基金管理有限公司', catalog)
    assert robot == {'code': '159530', 'name': '机器人ETF易方达'}
    assert drug == {'code': '516080', 'name': '创新药ETF易方达'}
    science = _target_etf_candidate('易方达上证科创板50成份交易型开放式指数证券投资基金联接基金', '易方达基金管理有限公司', catalog)
    power = _target_etf_candidate('华泰柏瑞中证全指电力公用事业交易型开放式指数证券投资基金发起式联接基金', '华泰柏瑞基金管理有限公司', catalog)
    assert science == {'code': '588080', 'name': '科创50ETF易方达'}
    assert power == {'code': '561560', 'name': '电力ETF华泰柏瑞'}
    gold = _target_etf_candidate('易方达黄金交易型开放式证券投资基金联接基金', '易方达基金管理有限公司', catalog)
    assert gold == {'code': '159934', 'name': '黄金ETF易方达'}
