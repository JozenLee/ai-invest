# tests/conftest.py
import pytest
import pandas as pd
from unittest.mock import AsyncMock, MagicMock
from providers.registry import ProviderRegistry, CategoryConfig
from services.data_service import DataService


@pytest.fixture
def mock_akshare():
    """Mock AKShare provider"""
    return AsyncMock()


@pytest.fixture
def mock_tushare():
    """Mock Tushare provider"""
    return AsyncMock()


@pytest.fixture
def mock_xueqiu():
    """Mock Xueqiu provider"""
    return AsyncMock()


@pytest.fixture
def registry(mock_akshare, mock_tushare, mock_xueqiu):
    """创建配置好的 ProviderRegistry"""
    reg = ProviderRegistry()
    reg._providers = {
        "akshare": mock_akshare,
        "tushare": mock_tushare,
        "xueqiu": mock_xueqiu,
    }
    return reg


@pytest.fixture
def data_service(registry):
    """创建配置好的 DataService"""
    return DataService(reg=registry)


@pytest.fixture
def sample_index_df():
    """示例指数数据 DataFrame"""
    return pd.DataFrame({
        "代码": ["000001", "399001", "399006", "000688", "000300"],
        "名称": ["上证指数", "深证成指", "创业板指", "科创50", "沪深300"],
        "最新价": [3000.0, 10000.0, 2000.0, 1000.0, 4000.0],
        "涨跌额": [10.0, 50.0, 20.0, 5.0, 15.0],
        "涨跌幅": [0.33, 0.50, 1.00, 0.50, 0.38],
        "成交量": [1000000, 2000000, 500000, 300000, 800000],
        "成交额": [3000000000, 20000000000, 1000000000, 300000000, 3200000000],
    })


@pytest.fixture
def sample_northbound_dict():
    """示例北向资金数据"""
    return {
        "date": "2026-07-18",
        "value": 50.5,
        "shConnect": 30.2,
        "szConnect": 20.3,
        "source": "akshare",
        "unit": "亿元",
    }
