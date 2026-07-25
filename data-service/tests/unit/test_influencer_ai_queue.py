"""
Test suite for InfluencerAIQueue
Tests queue start/stop, publish operations, and worker processing
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from workers.influencer_ai_queue import InfluencerAIQueue


class TestInfluencerAIQueue:
    """Test cases for InfluencerAIQueue"""

    @pytest.mark.asyncio
    async def test_queue_start_stop(self):
        """Test queue can start and stop gracefully"""
        queue = InfluencerAIQueue(worker_count=3)

        # Start the queue
        await queue.start()

        # Verify workers are running
        assert queue._running is True
        assert len(queue._workers) == 3

        # Stop the queue
        await queue.stop()

        # Verify workers are stopped
        assert queue._running is False
        assert len(queue._workers) == 0

    @pytest.mark.asyncio
    async def test_publish_single(self):
        """Test publishing a single post_id to the queue"""
        queue = InfluencerAIQueue(worker_count=2)
        await queue.start()

        # Publish a single post_id
        await queue.publish("weibo_12345")

        # Verify the queue has the item
        assert queue._queue.qsize() == 1

        await queue.stop()

    @pytest.mark.asyncio
    async def test_publish_batch(self):
        """Test publishing multiple post_ids to the queue"""
        queue = InfluencerAIQueue(worker_count=2)
        await queue.start()

        # Publish a batch of post_ids
        post_ids = ["weibo_1", "bilibili_2", "weibo_3", "bilibili_4"]
        await queue.publish_batch(post_ids)

        # Verify all items are in the queue
        assert queue._queue.qsize() == 4

        await queue.stop()

    @pytest.mark.asyncio
    async def test_worker_processing(self):
        """Test worker processes items from queue with stubbed AI service"""
        # Mock the AI analysis service
        mock_analyze = AsyncMock(return_value={
            "post_id": "weibo_123",
            "summary": "Test summary",
            "sentiment": {"score": 0.8, "label": "bullish"},
            "keywords": ["AI", "芯片"],
            "analyzed_at": datetime.now().isoformat()
        })

        with patch('workers.influencer_ai_queue.analyze_influencer_post', mock_analyze):
            queue = InfluencerAIQueue(worker_count=2)
            await queue.start()

            # Publish test items
            await queue.publish("weibo_123")
            await queue.publish("bilibili_456")

            # Wait for processing (small delay)
            await asyncio.sleep(0.5)

            # Verify AI analysis was called
            assert mock_analyze.call_count >= 1

            await queue.stop()

    @pytest.mark.asyncio
    async def test_worker_error_handling(self):
        """Test that worker errors don't crash the entire queue"""
        # Mock AI service that raises an error
        mock_analyze = AsyncMock(side_effect=Exception("API Error"))

        with patch('workers.influencer_ai_queue.analyze_influencer_post', mock_analyze):
            queue = InfluencerAIQueue(worker_count=2)
            await queue.start()

            # Publish an item that will fail
            await queue.publish("weibo_error")

            # Wait for processing
            await asyncio.sleep(0.5)

            # Queue should still be running despite the error
            assert queue._running is True

            await queue.stop()

    @pytest.mark.asyncio
    async def test_graceful_shutdown_waits_for_queue(self):
        """Test that stop() waits for queue to be empty"""
        # Mock slow processing
        async def slow_analyze(post_id):
            await asyncio.sleep(0.3)
            return {"post_id": post_id, "analyzed": True}

        mock_analyze = AsyncMock(side_effect=slow_analyze)

        with patch('workers.influencer_ai_queue.analyze_influencer_post', mock_analyze):
            queue = InfluencerAIQueue(worker_count=1)
            await queue.start()

            # Publish multiple items
            await queue.publish_batch(["post_1", "post_2", "post_3"])

            # Stop should wait for all items to be processed
            await queue.stop()

            # All items should have been processed
            assert mock_analyze.call_count == 3
            assert queue._queue.qsize() == 0

    @pytest.mark.asyncio
    async def test_multiple_workers_concurrent_processing(self):
        """Test that multiple workers process items concurrently"""
        processed_items = []

        async def track_analyze(post_id):
            await asyncio.sleep(0.1)
            processed_items.append(post_id)
            return {"post_id": post_id}

        mock_analyze = AsyncMock(side_effect=track_analyze)

        with patch('workers.influencer_ai_queue.analyze_influencer_post', mock_analyze):
            queue = InfluencerAIQueue(worker_count=3)
            await queue.start()

            # Publish 6 items
            await queue.publish_batch([f"post_{i}" for i in range(6)])

            # Wait for all to process
            await asyncio.sleep(0.5)

            # All 6 should be processed
            assert len(processed_items) == 6

            await queue.stop()
