"""
数据模型测试
"""

import pytest
from datetime import datetime
from models.article import RawArticle, AnalyzedArticle, PipelineResult


def test_raw_article_creation():
    """测试原始文章模型创建"""
    article = RawArticle(
        id="test_1",
        title="测试标题",
        content="测试内容",
        source="财联社",
        url="https://example.com/news/1",
        publishTime="2026-07-25 10:00:00"
    )
    assert article.id == "test_1"
    assert article.title == "测试标题"
    assert article.source == "财联社"


def test_analyzed_article_creation():
    """测试分析后文章模型创建"""
    article = AnalyzedArticle(
        id="test_1",
        title="测试标题",
        content="测试内容",
        source="财联社",
        url="https://example.com/news/1",
        publishTime="2026-07-25 10:00:00",
        categoryId="policy",
        sentiment=0.8,
        sentimentLabel="bullish",
        impact=4,
        aiProcessed=True
    )
    assert article.categoryId == "policy"
    assert article.sentiment == 0.8
    assert article.aiProcessed is True


def test_analyzed_article_from_raw():
    """测试从原始文章创建分析文章"""
    raw = RawArticle(
        id="test_1",
        title="测试标题",
        content="测试内容",
        source="财联社",
        publishTime="2026-07-25 10:00:00"
    )

    analyzed = AnalyzedArticle(
        **raw.dict(),
        categoryId="tech",
        sentiment=0.5,
        aiProcessed=True
    )

    assert analyzed.id == raw.id
    assert analyzed.title == raw.title
    assert analyzed.categoryId == "tech"


def test_pipeline_result():
    """测试管道结果模型"""
    result = PipelineResult(
        fetched=50,
        analyzed=48,
        saved=48,
        failed=2,
        timestamp=datetime.now()
    )
    assert result.fetched == 50
    assert result.analyzed == 48
    assert result.saved == 48
    assert result.failed == 2
    assert isinstance(result.timestamp, datetime)


def test_pipeline_result_defaults():
    """测试管道结果默认值"""
    result = PipelineResult(
        fetched=10,
        analyzed=8
    )
    assert result.saved == 0
    assert result.failed == 0
    assert isinstance(result.timestamp, datetime)
