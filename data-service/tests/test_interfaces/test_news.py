# tests/test_interfaces/test_news.py
import pytest
import pandas as pd


class TestNews:
    """新闻数据接口测试"""

    @pytest.fixture
    def sample_news_df(self):
        return pd.DataFrame({
            "title": ["新闻1", "新闻2"],
            "content": ["内容1", "内容2"],
            "source": ["财联社", "财联社"],
            "publishTime": ["2026-07-18 10:00:00", "2026-07-18 11:00:00"],
        })

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_news_df):
        mock_akshare.get_news.return_value = sample_news_df

        result = await data_service.get_news("财联社", 50)

        assert not result.empty
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_not_implemented_fallback(self, data_service, mock_akshare, mock_tushare, sample_news_df):
        """AKShare 不支持，尝试下一个源"""
        mock_akshare.get_news.side_effect = NotImplementedError()
        # news 配置只有 akshare，所以会抛出异常
        with pytest.raises(Exception):
            await data_service.get_news("财联社", 50)
