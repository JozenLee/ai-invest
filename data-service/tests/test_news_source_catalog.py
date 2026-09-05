from services.news_source_defaults import source_catalog, TUSHARE_CHANNELS, MAJOR_CHANNELS

def test_catalog_keeps_only_curated_sources_in_priority_order():
    rows=source_catalog()
    ids={row['id'] for row in rows}
    assert len(ids)==len(rows)
    assert {'ds_akshare_ai','ds_akshare_chip','newsnow-thepaper','tushare-news'} <= ids
    assert not {'ds_akshare_cailian','ds_akshare_caixin','ds_cls','ds_36kr','ds_xueqiu','newsnow-cls-hot','newsnow-wallstreetcn-hot','tushare-news-sina'} & ids
    assert len(rows) == 17
    priority = {'tushare': 0, 'newsnow': 1, 'akshare': 2}
    assert [priority[row['provider']] for row in rows] == sorted(priority[row['provider']] for row in rows)
    assert len(TUSHARE_CHANNELS)==9 and len(MAJOR_CHANNELS)==9
    assert len([row for row in rows if row['id'].startswith('tushare-major-')])==9
    assert {row['provider'] for row in rows} == set(priority)
