"""
Influencer AI Analysis Queue
Independent queue for processing influencer posts with AI analysis
Uses worker pool pattern with asyncio.Queue
"""

import asyncio
import logging
import time
from typing import List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


# Stub function for AI analysis - will be implemented in Task 4.3
async def analyze_influencer_post(post_id: str) -> dict:
    """
    Placeholder for AI analysis service
    Will be implemented in Task 4.3

    Args:
        post_id: The post ID to analyze

    Returns:
        Analysis results dictionary
    """
    logger.info(f"[Stub] Analyzing influencer post: {post_id}")
    await asyncio.sleep(0.1)  # Simulate API call
    return {
        "post_id": post_id,
        "analyzed_at": datetime.now().isoformat(),
        "status": "stub_analysis"
    }


class InfluencerAIQueue:
    """
    AI Analysis Queue for Influencer Posts

    Features:
    - Independent queue separate from news AI analysis
    - Worker pool pattern with configurable concurrency
    - Graceful start/stop with queue draining
    - Error handling to prevent queue crashes
    """

    def __init__(self, worker_count: int = 3):
        """
        Initialize the influencer AI queue

        Args:
            worker_count: Number of concurrent workers (default: 3)
        """
        self.worker_count = worker_count
        self._queue: asyncio.Queue = asyncio.Queue()
        self._workers: List[asyncio.Task] = []
        self._running: bool = False

        logger.info(f"InfluencerAIQueue initialized with {worker_count} workers")

    async def start(self):
        """
        Start the worker pool
        Creates and starts all worker tasks
        """
        if self._running:
            logger.warning("Queue is already running")
            return

        self._running = True

        # Create worker tasks
        for i in range(self.worker_count):
            worker_task = asyncio.create_task(
                self._worker(worker_id=i),
                name=f"influencer-ai-worker-{i}"
            )
            self._workers.append(worker_task)

        logger.info(f"Started {self.worker_count} influencer AI workers")

    async def stop(self):
        """
        Gracefully stop the worker pool
        Waits for queue to be empty, then cancels workers
        """
        if not self._running:
            logger.warning("Queue is not running")
            return

        logger.info("Stopping influencer AI queue...")

        # Wait for queue to be empty
        await self._queue.join()

        # Signal workers to stop
        self._running = False

        # Cancel all worker tasks
        for worker in self._workers:
            worker.cancel()

        # Wait for workers to finish
        await asyncio.gather(*self._workers, return_exceptions=True)

        # Clear workers list
        self._workers.clear()

        logger.info("Influencer AI queue stopped")

    async def publish(self, post_id: str):
        """
        Publish a single post_id to the queue

        Args:
            post_id: The post ID to analyze
        """
        await self._queue.put(post_id)
        queue_size = self._queue.qsize()
        logger.debug(f"Published post to queue: {post_id}, queue size: {queue_size}")

    async def publish_batch(self, post_ids: List[str]):
        """
        Publish multiple post_ids to the queue

        Args:
            post_ids: List of post IDs to analyze
        """
        for post_id in post_ids:
            await self._queue.put(post_id)

        queue_size = self._queue.qsize()
        logger.info(f"Published {len(post_ids)} posts to queue, queue size: {queue_size}")

    async def _worker(self, worker_id: int):
        """
        Worker coroutine that processes items from the queue

        Args:
            worker_id: Unique identifier for this worker
        """
        logger.info(f"Worker {worker_id} started")
        processed_count = 0
        error_count = 0

        while self._running:
            try:
                # Get item from queue with timeout to check _running flag
                try:
                    post_id = await asyncio.wait_for(
                        self._queue.get(),
                        timeout=1.0
                    )
                except asyncio.TimeoutError:
                    # No item available, continue loop to check _running
                    continue

                # Process the post
                process_start = time.time()
                try:
                    logger.info(f"Worker {worker_id} processing: {post_id}, queue size: {self._queue.qsize()}")
                    result = await analyze_influencer_post(post_id)
                    process_elapsed = time.time() - process_start
                    processed_count += 1

                    logger.info(
                        f"Worker {worker_id} completed: {post_id} in {process_elapsed:.2f}s, "
                        f"total processed: {processed_count}"
                    )

                except Exception as e:
                    # Log error but don't crash the worker
                    process_elapsed = time.time() - process_start
                    error_count += 1
                    logger.error(
                        f"Worker {worker_id} error processing {post_id} after {process_elapsed:.2f}s: {e}, "
                        f"total errors: {error_count}",
                        exc_info=True
                    )

                finally:
                    # Mark task as done
                    self._queue.task_done()

            except asyncio.CancelledError:
                # Worker is being cancelled, exit gracefully
                logger.info(
                    f"Worker {worker_id} cancelled, "
                    f"processed: {processed_count}, errors: {error_count}"
                )
                break
            except Exception as e:
                # Catch-all for unexpected errors
                logger.error(
                    f"Worker {worker_id} unexpected error: {e}",
                    exc_info=True
                )
                # Continue running despite the error
                await asyncio.sleep(0.1)

        logger.info(
            f"Worker {worker_id} stopped, "
            f"final stats - processed: {processed_count}, errors: {error_count}"
        )


# Singleton instance for global access
_queue_instance: Optional[InfluencerAIQueue] = None


def get_queue() -> InfluencerAIQueue:
    """
    Get the global queue instance
    Creates it if it doesn't exist

    Returns:
        The global InfluencerAIQueue instance
    """
    global _queue_instance
    if _queue_instance is None:
        _queue_instance = InfluencerAIQueue(worker_count=3)
    return _queue_instance
