from datetime import datetime
import pytest
from providers.tushare_provider import TushareProvider

def test_rt_k_fields_retain_ohlc_and_calculate_change_from_previous_close():
    quote = TushareProvider._normalize_quote({'close': 11, 'pre_close': 10, 'open': 10.2, 'high': 11.1, 'low': 10, 'vol': 100}, '159306', True)
    assert quote['日期'] == datetime.now().strftime('%Y-%m-%d')
    assert quote['涨跌幅'] == pytest.approx(10)
    assert quote['昨收'] == 10
    assert quote['开盘'] == 10.2
    assert quote['source'] == 'tushare_rt_k'

def test_daily_snapshot_never_uses_fetch_date_and_missing_change_stays_unknown():
    quote = TushareProvider._normalize_quote({'close': 10, 'trade_date': '20260903'}, '159306', False)
    assert quote['日期'] == '20260903'
    assert quote['涨跌幅'] is None
    with pytest.raises(ValueError):
        TushareProvider._normalize_quote({'close': 10}, '159306', False)
