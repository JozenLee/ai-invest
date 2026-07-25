"""
AI分析器测试
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from workers.ai_analyzer import AIAnalyzer
from models.article import RawArticle, AnalyzedArticle


@pytest.fixture
def sample_articles():
    """示例文章列表"""
    return [
        RawArticle(
            id=f"test_{i}",
            title=f"测试新闻{i}：AI芯片需求暴增",
            content="据财联社报道，AI芯片市场需求持续增长...",
            source="财联社",
            publishTime="2026-07-25 10:00:00"
        )
        for i in range(3)
    ]


@pytest.mark.asyncio
async def test_analyze_batch_success(sample_articles):
    """测试批量分析成功"""
    # Mock API密钥
    with patch.dict('os.environ', {'ANTHROPIC_API_KEY': 'test-key'}):
        analyzer = AIAnalyzer(concurrency=2)

    # Mock Claude API调用
    with patch.object(analyzer, '_call_claude_api', new=AsyncMock()) as mock_api:
        mock_api.return_value = {
            'category': 'tech',
            'category_confidence': 0.9,
            'sentiment': {'score': 0.8, 'label': 'bullish', 'confidence': 0.85},
            'impact': {'magnitude': 4},
            'keywords': ['AI', '芯片'],
            'entities': {'companies': ['英伟达']},
            'sectors': ['半导体']
        }

        results = await analyzer.analyze_batch(sample_articles)

        assert len(results) == 3
        assert all(r.aiProcessed for r in results)
        assert all(r.categoryId is not None for r in results)
        assert mock_api.call_count == 3


@pytest.mark.asyncio
async def test_analyze_single_timeout():
    """测试单条分析超时"""
    analyzer = AIAnalyzer(concurrency=1)
    article = RawArticle(
        id="test_1",
        title="测试",
        content="内容",
        source="财联社",
        publishTime="2026-07-25 10:00:00"
    )

    # Mock超时
    with patch.object(analyzer, '_call_claude_api', new=AsyncMock()) as mock_api:
        mock_api.side_effect = asyncio.TimeoutError()

        result = await analyzer._analyze_single(article)

        assert result.aiProcessed is False
        assert result.id == "test_1"


@pytest.mark.asyncio
async def test_analyze_single_error():
    """测试单条分析错误"""
    analyzer = AIAnalyzer(concurrency=1)
    article = RawArticle(
        id="test_1",
        title="测试",
        content="内容",
        source="财联社",
        publishTime="2026-07-25 10:00:00"
    )

    # Mock错误
    with patch.object(analyzer, '_call_claude_api', new=AsyncMock()) as mock_api:
        mock_api.side_effect = Exception("API错误")

        result = await analyzer._analyze_single(article)

        assert result.aiProcessed is False
        assert result.aiError is not None
        assert "API错误" in result.aiError


@pytest.mark.asyncio
async def test_concurrency_control():
    """测试并发控制"""
    analyzer = AIAnalyzer(concurrency=2)
    articles = [
        RawArticle(
            id=f"test_{i}",
            title=f"测试{i}",
            content="内容",
            source="财联社",
            publishTime="2026-07-25 10:00:00"
        )
        for i in range(5)
    ]

    active_count = 0
    max_active = 0

    async def mock_analyze_with_tracking(article):
        nonlocal active_count, max_active
        active_count += 1
        max_active = max(max_active, active_count)
        await asyncio.sleep(0.1)
        active_count -= 1
        return AnalyzedArticle(**article.dict(), aiProcessed=True)

    with patch.object(analyzer, '_analyze_single', new=mock_analyze_with_tracking):
        await analyzer.analyze_batch(articles)

    assert max_active <= 2  # 不超过并发限制


@pytest.mark.asyncio
async def test_map_category():
    """测试分类映射"""
    analyzer = AIAnalyzer()

    assert await analyzer._map_category('tech') == 'breakthrough'
    assert await analyzer._map_category('policy') == 'policy'
    assert await analyzer._map_category('unknown') == 'market'


@pytest.mark.asyncio
async def test_map_domains():
    """测试领域映射"""
    analyzer = AIAnalyzer()

    keywords = ['AI', '芯片', '算力']
    domains = await analyzer._map_domains(keywords)

    assert 'ai' in domains
    assert 'chip' in domains


@pytest.mark.asyncio
async def test_no_api_key():
    """测试没有API密钥的情况"""
    with patch.dict('os.environ', {}, clear=True):
        analyzer = AIAnalyzer()
        assert analyzer.claude_client is None

        articles = [
            RawArticle(
                id="test_1",
                title="测试",
                content="内容",
                source="财联社",
                publishTime="2026-07-25 10:00:00"
            )
        ]

        results = await analyzer.analyze_batch(articles)

        assert len(results) == 1
        assert results[0].aiProcessed is False
