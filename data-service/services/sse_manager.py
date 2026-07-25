"""
SSE推送管理器
管理客户端连接和事件推送
"""

import asyncio
import logging
import json
from datetime import datetime
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class SSEManager:
    """SSE推送管理器"""

    def __init__(self):
        """初始化SSE管理器"""
        self.clients: List[asyncio.Queue] = []
        self.event_history: List[Dict[str, Any]] = []
        self.max_history = 100  # 保留最近100个事件

        logger.info("SSE管理器初始化完成")

    def add_client(self, client_queue: asyncio.Queue):
        """
        添加客户端连接

        Args:
            client_queue: 客户端事件队列
        """
        self.clients.append(client_queue)
        logger.info(f"新客户端连接，当前连接数: {len(self.clients)}")

    def remove_client(self, client_queue: asyncio.Queue):
        """
        移除客户端连接

        Args:
            client_queue: 客户端事件队列
        """
        if client_queue in self.clients:
            self.clients.remove(client_queue)
            logger.info(f"客户端断开，当前连接数: {len(self.clients)}")

    async def notify_update(self, count: int, event_type: str = "news_updated"):
        """
        通知所有客户端数据更新

        Args:
            count: 更新的数据条数
            event_type: 事件类型
        """
        event = {
            "type": event_type,
            "count": count,
            "timestamp": datetime.now().isoformat()
        }

        # 保存到历史记录
        self.event_history.append(event)
        if len(self.event_history) > self.max_history:
            self.event_history.pop(0)

        # 推送给所有连接的客户端
        if self.clients:
            logger.info(f"推送事件到 {len(self.clients)} 个客户端: {event}")

            disconnected_clients = []

            for client_queue in self.clients:
                try:
                    await asyncio.wait_for(
                        client_queue.put(event),
                        timeout=1.0
                    )
                except asyncio.TimeoutError:
                    logger.warning("客户端队列已满，跳过")
                except Exception as e:
                    logger.error(f"推送事件失败: {e}")
                    disconnected_clients.append(client_queue)

            # 移除断开的客户端
            for client in disconnected_clients:
                self.remove_client(client)
        else:
            logger.debug("没有活跃的客户端连接")

    async def notify_batch_completed(
        self,
        fetched: int,
        analyzed: int,
        saved: int,
        failed: int
    ):
        """
        通知批处理完成

        Args:
            fetched: 采集数量
            analyzed: 分析数量
            saved: 保存数量
            failed: 失败数量
        """
        event = {
            "type": "batch_completed",
            "fetched": fetched,
            "analyzed": analyzed,
            "saved": saved,
            "failed": failed,
            "timestamp": datetime.now().isoformat()
        }

        # 保存到历史记录
        self.event_history.append(event)
        if len(self.event_history) > self.max_history:
            self.event_history.pop(0)

        # 推送给所有客户端
        if self.clients:
            logger.info(f"推送批处理完成事件到 {len(self.clients)} 个客户端")

            for client_queue in self.clients:
                try:
                    await asyncio.wait_for(
                        client_queue.put(event),
                        timeout=1.0
                    )
                except Exception as e:
                    logger.error(f"推送批处理事件失败: {e}")

    async def send_heartbeat(self):
        """发送心跳事件"""
        event = {
            "type": "heartbeat",
            "timestamp": datetime.now().isoformat(),
            "clients": len(self.clients)
        }

        if self.clients:
            for client_queue in self.clients:
                try:
                    await asyncio.wait_for(
                        client_queue.put(event),
                        timeout=0.5
                    )
                except Exception:
                    pass  # 心跳失败静默处理

    def get_stats(self) -> Dict[str, Any]:
        """
        获取统计信息

        Returns:
            统计数据字典
        """
        return {
            "active_clients": len(self.clients),
            "total_events": len(self.event_history),
            "latest_events": self.event_history[-10:] if self.event_history else []
        }

    def get_recent_events(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        获取最近的事件

        Args:
            limit: 返回数量限制

        Returns:
            最近的事件列表
        """
        return self.event_history[-limit:] if self.event_history else []


# 全局SSE管理器实例
sse_manager = SSEManager()
