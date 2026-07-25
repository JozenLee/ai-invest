"""
数据库写入器测试
"""

import pytest
import time
from unittest.mock import Mock, patch, MagicMock
from workers.db_writer import DatabaseWriter
from models.article import AnalyzedArticle


@pytest.fixture
def sample_analyzed_articles():
    """示例分析后文章"""
    return [
        AnalyzedArticle(
            id=f"test_{i}",
            title=f"测试新闻{i}",
            content="测试内容",
            source="财联社",
            publishTime="2026-07-25 10:00:00",
            categoryId="tech",
            sentiment=0.8,
            sentimentLabel="bullish",
            impact=4,
            aiProcessed=True
        )
        for i in range(5)
    ]


def test_enqueue(sample_analyzed_articles):
    """测试入队操作"""
    writer = DatabaseWriter(workers=1, batch_size=10)

    writer.enqueue(sample_analyzed_articles)

    assert writer.stats['total_enqueued'] == 5
    assert writer.queue.qsize() == 5

    writer.shutdown()


def test_batch_write_success(sample_analyzed_articles):
    """测试批量写入成功"""
    writer = DatabaseWriter(workers=1, batch_size=3)

    # Mock写入方法
    with patch.object(writer, '_write_to_database') as mock_write:
        writer.enqueue(sample_analyzed_articles)

        # 等待处理
        time.sleep(3)

        # 应该调用2次（3条 + 2条）
        assert mock_write.call_count >= 1
        assert writer.stats['total_saved'] > 0

    writer.shutdown()


def test_batch_write_retry(sample_analyzed_articles):
    """测试写入失败重试"""
    writer = DatabaseWriter(workers=1, batch_size=5, retry_limit=3)

    # Mock写入方法，前2次失败，第3次成功
    call_count = 0
    def mock_write_with_retry(articles):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise Exception("写入失败")

    with patch.object(writer, '_write_to_database', side_effect=mock_write_with_retry):
        writer.enqueue(sample_analyzed_articles)

        # 等待处理
        time.sleep(10)

        # 应该重试3次
        assert call_count == 3

    writer.shutdown()


def test_batch_write_complete_failure(sample_analyzed_articles):
    """测试写入完全失败"""
    writer = DatabaseWriter(workers=1, batch_size=5, retry_limit=2)

    # Mock写入方法，始终失败
    with patch.object(writer, '_write_to_database', side_effect=Exception("持续失败")):
        with patch.object(writer, '_log_failed_writes') as mock_log:
            writer.enqueue(sample_analyzed_articles)

            # 等待处理
            time.sleep(8)

            # 应该记录失败
            assert mock_log.called
            assert writer.stats['total_failed'] > 0

    writer.shutdown()


def test_get_stats(sample_analyzed_articles):
    """测试统计信息"""
    writer = DatabaseWriter(workers=1, batch_size=10)

    with patch.object(writer, '_write_to_database'):
        writer.enqueue(sample_analyzed_articles)

        time.sleep(3)

        stats = writer.get_stats()

        assert 'total_enqueued' in stats
        assert 'total_saved' in stats
        assert 'queue_size' in stats
        assert 'success_rate' in stats

    writer.shutdown()


def test_write_to_database_api_call(sample_analyzed_articles):
    """测试API调用格式"""
    writer = DatabaseWriter(workers=0, nextjs_url="http://test:3000")

    with patch('httpx.Client') as mock_client:
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_client.return_value.__enter__.return_value.post.return_value = mock_response

        writer._write_to_database(sample_analyzed_articles)

        # 验证API调用
        mock_client.return_value.__enter__.return_value.post.assert_called_once()
        call_args = mock_client.return_value.__enter__.return_value.post.call_args

        assert call_args[0][0] == "http://test:3000/api/events/batch-save"
        assert 'articles' in call_args[1]['json']
        assert len(call_args[1]['json']['articles']) == 5

    writer.shutdown()


def test_worker_thread_batch_accumulation():
    """测试工作线程批量累积"""
    writer = DatabaseWriter(workers=1, batch_size=3)

    articles = [
        AnalyzedArticle(
            id=f"test_{i}",
            title=f"测试{i}",
            content="内容",
            source="财联社",
            publishTime="2026-07-25 10:00:00",
            aiProcessed=True
        )
        for i in range(7)
    ]

    with patch.object(writer, '_write_to_database') as mock_write:
        writer.enqueue(articles)

        # 等待处理完成
        time.sleep(5)

        # 应该分2批写入（3条 + 3条 + 1条）
        assert mock_write.call_count >= 2

    writer.shutdown()
