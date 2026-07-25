"""
SSE管理器测试
"""

import pytest
import asyncio
from services.sse_manager import SSEManager


@pytest.mark.asyncio
async def test_add_remove_client():
    """测试添加和移除客户端"""
    manager = SSEManager()

    queue1 = asyncio.Queue()
    queue2 = asyncio.Queue()

    manager.add_client(queue1)
    assert len(manager.clients) == 1

    manager.add_client(queue2)
    assert len(manager.clients) == 2

    manager.remove_client(queue1)
    assert len(manager.clients) == 1

    manager.remove_client(queue2)
    assert len(manager.clients) == 0


@pytest.mark.asyncio
async def test_notify_update():
    """测试更新通知"""
    manager = SSEManager()

    queue = asyncio.Queue()
    manager.add_client(queue)

    await manager.notify_update(10, "news_updated")

    # 验证事件被推送
    event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event['type'] == "news_updated"
    assert event['count'] == 10
    assert 'timestamp' in event


@pytest.mark.asyncio
async def test_notify_multiple_clients():
    """测试通知多个客户端"""
    manager = SSEManager()

    queue1 = asyncio.Queue()
    queue2 = asyncio.Queue()
    queue3 = asyncio.Queue()

    manager.add_client(queue1)
    manager.add_client(queue2)
    manager.add_client(queue3)

    await manager.notify_update(5, "test_event")

    # 验证所有客户端都收到事件
    event1 = await asyncio.wait_for(queue1.get(), timeout=1.0)
    event2 = await asyncio.wait_for(queue2.get(), timeout=1.0)
    event3 = await asyncio.wait_for(queue3.get(), timeout=1.0)

    assert event1['type'] == "test_event"
    assert event2['type'] == "test_event"
    assert event3['type'] == "test_event"


@pytest.mark.asyncio
async def test_notify_batch_completed():
    """测试批处理完成通知"""
    manager = SSEManager()

    queue = asyncio.Queue()
    manager.add_client(queue)

    await manager.notify_batch_completed(
        fetched=50,
        analyzed=48,
        saved=48,
        failed=2
    )

    event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event['type'] == "batch_completed"
    assert event['fetched'] == 50
    assert event['analyzed'] == 48
    assert event['saved'] == 48
    assert event['failed'] == 2


@pytest.mark.asyncio
async def test_event_history():
    """测试事件历史记录"""
    manager = SSEManager()

    # 发送多个事件
    for i in range(5):
        await manager.notify_update(i, f"event_{i}")

    # 验证历史记录
    assert len(manager.event_history) == 5

    recent = manager.get_recent_events(3)
    assert len(recent) == 3
    assert recent[-1]['count'] == 4


@pytest.mark.asyncio
async def test_event_history_limit():
    """测试事件历史记录限制"""
    manager = SSEManager()
    manager.max_history = 10

    # 发送超过限制的事件
    for i in range(15):
        await manager.notify_update(i)

    # 验证历史记录不超过限制
    assert len(manager.event_history) <= 10

    # 验证保留的是最新的事件
    assert manager.event_history[-1]['count'] == 14


@pytest.mark.asyncio
async def test_send_heartbeat():
    """测试心跳发送"""
    manager = SSEManager()

    queue = asyncio.Queue()
    manager.add_client(queue)

    await manager.send_heartbeat()

    event = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert event['type'] == "heartbeat"
    assert event['clients'] == 1
    assert 'timestamp' in event


@pytest.mark.asyncio
async def test_get_stats():
    """测试统计信息"""
    manager = SSEManager()

    queue1 = asyncio.Queue()
    queue2 = asyncio.Queue()

    manager.add_client(queue1)
    manager.add_client(queue2)

    await manager.notify_update(10)
    await manager.notify_update(20)

    stats = manager.get_stats()

    assert stats['active_clients'] == 2
    assert stats['total_events'] == 2
    assert len(stats['latest_events']) == 2


@pytest.mark.asyncio
async def test_no_clients():
    """测试没有客户端时的通知"""
    manager = SSEManager()

    # 不应该抛出异常
    await manager.notify_update(10)
    await manager.notify_batch_completed(50, 48, 48, 2)
    await manager.send_heartbeat()

    # 事件应该被记录
    assert len(manager.event_history) == 2


@pytest.mark.asyncio
async def test_client_timeout():
    """测试客户端队列超时"""
    manager = SSEManager()

    # 创建一个已满的队列
    queue = asyncio.Queue(maxsize=1)
    await queue.put("dummy")  # 填满队列

    manager.add_client(queue)

    # 通知应该超时但不崩溃
    await manager.notify_update(10)

    # 客户端应该仍在列表中
    assert len(manager.clients) == 1
