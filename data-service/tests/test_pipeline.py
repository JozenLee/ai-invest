"""
新闻处理管道测试
"""

import pytest
import asyncio
import pandas as pd
from unittest.mock import Mock, patch, AsyncMock
from services.news_pipeline import NewsPipeline
from models.article import RawArticle, AnalyzedArticle, PipelineResult


@pytest.fixture
def mock_provider():
    """Mock数据提供者"""
    provider = Mock()
    provider.get_news = AsyncMock()
    return provider


@pytest.fixture
def mock_analyzer():
    """Mock AI分析器"""
    analyzer = Mock()
    analyzer.analyze_batch = AsyncMock()
    return analyzer


@pytest.fixture
def mock_writer():
    """Mock数据库写入器"""
    writer = Mock()
    writer.enqueue = Mock()
    writer.get_stats = Mock(return_value={
        'total_enqueued': 10,
        'total_saved': 10,
        'total_failed': 0,
        'success_rate': 1.0
    })
    writer.shutdown = Mock()
    return writer


@pytest.mark.asyncio
async def test_pipeline_run_success(mock_provider, mock_analyzer, mock_writer):
    """测试管道成功执行"""
    # 准备mock数据
    mock_df = pd.DataFrame({
        '新闻标题': ['测试新闻1', '测试新闻2'],
        '新闻内容': ['内容1', '内容2'],
        '来源': ['财联社', '财联社'],
        '新闻链接': ['http://test1.com', 'http://test2.com'],
        '发布时间': ['2026-07-25 10:00:00', '2026-07-25 10:01:00']
    })
    mock_provider.get_news.return_value = mock_df

    # Mock分析结果
    mock_analyzer.analyze_batch.return_value = [
        AnalyzedArticle(
            id="test_1",
            title="测试新闻1",
            content="内容1",
            source="财联社",
            publishTime="2026-07-25 10:00:00",
            aiProcessed=True
        ),
        AnalyzedArticle(
            id="test_2",
            title="测试新闻2",
            content="内容2",
            source="财联社",
            publishTime="2026-07-25 10:01:00",
            aiProcessed=True
        )
    ]

    # 创建管道
    pipeline = NewsPipeline(
        provider=mock_provider,
        analyzer=mock_analyzer,
        writer=mock_writer
    )

    # 执行管道
    result = await pipeline.run(platform_id="test-platform", limit=10)

    # 验证结果
    assert isinstance(result, PipelineResult)
    assert result.fetched == 2
    assert result.analyzed == 2

    # 验证调用链
    mock_provider.get_news.assert_called_once()
    mock_analyzer.analyze_batch.assert_called_once()
    mock_writer.enqueue.assert_called_once()


@pytest.mark.asyncio
async def test_pipeline_empty_data(mock_provider, mock_analyzer, mock_writer):
    """测试采集到空数据"""
    # 返回空DataFrame
    mock_provider.get_news.return_value = pd.DataFrame()

    pipeline = NewsPipeline(
        provider=mock_provider,
        analyzer=mock_analyzer,
        writer=mock_writer
    )

    result = await pipeline.run()

    assert result.fetched == 0
    assert result.analyzed == 0
    mock_analyzer.analyze_batch.assert_not_called()
    mock_writer.enqueue.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_from_sources():
    """测试数据采集"""
    mock_provider = Mock()
    mock_df = pd.DataFrame({
        '新闻标题': ['测试新闻'],
        '新闻内容': ['测试内容'],
        '来源': ['财联社'],
        '新闻链接': ['http://test.com'],
        '发布时间': ['2026-07-25 10:00:00']
    })
    mock_provider.get_news = AsyncMock(return_value=mock_df)

    pipeline = NewsPipeline(provider=mock_provider)

    articles = await pipeline.fetch_from_sources(platform_id="test", limit=10)

    assert len(articles) == 1
    assert isinstance(articles[0], RawArticle)
    assert articles[0].title == "测试新闻"
    assert articles[0].content == "测试内容"


@pytest.mark.asyncio
async def test_pipeline_partial_failure(mock_provider, mock_analyzer, mock_writer):
    """测试部分分析失败"""
    # 准备3条新闻
    mock_df = pd.DataFrame({
        '新闻标题': ['新闻1', '新闻2', '新闻3'],
        '新闻内容': ['内容1', '内容2', '内容3'],
        '来源': ['财联社'] * 3,
        '新闻链接': ['http://test.com'] * 3,
        '发布时间': ['2026-07-25 10:00:00'] * 3
    })
    mock_provider.get_news.return_value = mock_df

    # 只成功分析2条
    mock_analyzer.analyze_batch.return_value = [
        AnalyzedArticle(
            id="test_1",
            title="新闻1",
            content="内容1",
            source="财联社",
            publishTime="2026-07-25 10:00:00",
            aiProcessed=True
        ),
        AnalyzedArticle(
            id="test_2",
            title="新闻2",
            content="内容2",
            source="财联社",
            publishTime="2026-07-25 10:00:00",
            aiProcessed=True
        )
    ]

    pipeline = NewsPipeline(
        provider=mock_provider,
        analyzer=mock_analyzer,
        writer=mock_writer
    )

    result = await pipeline.run()

    assert result.fetched == 3
    assert result.analyzed == 2
    assert result.failed == 1


@pytest.mark.asyncio
async def test_get_stats(mock_provider, mock_analyzer, mock_writer):
    """测试获取统计信息"""
    pipeline = NewsPipeline(
        provider=mock_provider,
        analyzer=mock_analyzer,
        writer=mock_writer
    )

    stats = await pipeline.get_stats()

    assert 'writer' in stats
    assert 'sse' in stats
    assert 'timestamp' in stats


def test_pipeline_shutdown(mock_provider, mock_analyzer, mock_writer):
    """测试管道关闭"""
    pipeline = NewsPipeline(
        provider=mock_provider,
        analyzer=mock_analyzer,
        writer=mock_writer
    )

    pipeline.shutdown()

    mock_writer.shutdown.assert_called_once()


@pytest.mark.asyncio
async def test_pipeline_exception_handling(mock_provider, mock_analyzer, mock_writer):
    """测试异常处理"""
    # Mock提供者抛出异常
    mock_provider.get_news.side_effect = Exception("采集失败")

    pipeline = NewsPipeline(
        provider=mock_provider,
        analyzer=mock_analyzer,
        writer=mock_writer
    )

    # 应该优雅处理异常，返回空结果
    result = await pipeline.run()

    assert result.fetched == 0
    assert result.analyzed == 0
    mock_analyzer.analyze_batch.assert_not_called()
