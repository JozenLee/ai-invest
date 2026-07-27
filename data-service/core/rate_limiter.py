"""
RateLimiter - Token bucket algorithm implementation for API rate limiting.
"""
import asyncio
import time
import logging
from typing import Dict

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    令牌桶算法实现，用于 API 限流

    支持：
    - 按平台配置不同的限流参数
    - 异步 acquire() 方法
    - 动态调整速率
    """

    def __init__(self, rate: float, capacity: int, platform: str = "default"):
        """
        初始化限流器

        Args:
            rate: 令牌生成速率（每秒）
            capacity: 令牌桶容量（最大突发请求数）
            platform: 平台标识
        """
        self.rate = rate
        self.capacity = capacity
        self.platform = platform
        self.tokens = float(capacity)
        self.last_update = time.monotonic()
        self.lock = asyncio.Lock()

        logger.info(
            f"RateLimiter initialized for {platform}: "
            f"rate={rate}/s, capacity={capacity}"
        )

    def _add_tokens(self):
        """根据时间流逝添加令牌"""
        now = time.monotonic()
        elapsed = now - self.last_update

        # 计算应该添加的令牌数
        new_tokens = elapsed * self.rate
        self.tokens = min(self.capacity, self.tokens + new_tokens)
        self.last_update = now

    async def acquire(self, tokens: int = 1) -> bool:
        """
        获取令牌（异步）

        Args:
            tokens: 需要获取的令牌数量

        Returns:
            是否成功获取令牌
        """
        async with self.lock:
            self._add_tokens()

            if self.tokens >= tokens:
                self.tokens -= tokens
                logger.debug(
                    f"[{self.platform}] Acquired {tokens} token(s), "
                    f"remaining: {self.tokens:.2f}/{self.capacity}"
                )
                return True
            else:
                # 计算需要等待的时间
                deficit = tokens - self.tokens
                wait_time = deficit / self.rate

                logger.debug(
                    f"[{self.platform}] Insufficient tokens "
                    f"(need {tokens}, have {self.tokens:.2f}), "
                    f"waiting {wait_time:.2f}s"
                )

                await asyncio.sleep(wait_time)

                # 重新添加令牌并获取
                self._add_tokens()
                self.tokens -= tokens
                return True

    async def try_acquire(self, tokens: int = 1) -> bool:
        """
        尝试获取令牌（不等待）

        Args:
            tokens: 需要获取的令牌数量

        Returns:
            是否成功获取令牌
        """
        async with self.lock:
            self._add_tokens()

            if self.tokens >= tokens:
                self.tokens -= tokens
                logger.debug(
                    f"[{self.platform}] Try-acquired {tokens} token(s), "
                    f"remaining: {self.tokens:.2f}/{self.capacity}"
                )
                return True
            else:
                logger.debug(
                    f"[{self.platform}] Try-acquire failed "
                    f"(need {tokens}, have {self.tokens:.2f})"
                )
                return False

    def update_rate(self, new_rate: float):
        """
        动态更新令牌生成速率

        Args:
            new_rate: 新的速率（每秒）
        """
        old_rate = self.rate
        self.rate = new_rate
        logger.info(
            f"[{self.platform}] Rate updated: {old_rate}/s -> {new_rate}/s"
        )

    def get_status(self) -> Dict[str, float]:
        """
        获取限流器状态

        Returns:
            包含当前令牌数、速率等信息的字典
        """
        self._add_tokens()
        return {
            "platform": self.platform,
            "tokens": self.tokens,
            "capacity": self.capacity,
            "rate": self.rate,
            "utilization": (self.capacity - self.tokens) / self.capacity,
        }


class RateLimiterRegistry:
    """
    限流器注册表，管理多个平台的限流器
    """

    def __init__(self):
        self._limiters: Dict[str, RateLimiter] = {}
        self.lock = asyncio.Lock()

    async def get_limiter(
        self,
        platform: str,
        rate: float = 1.0,
        capacity: int = 10
    ) -> RateLimiter:
        """
        获取或创建平台限流器

        Args:
            platform: 平台标识
            rate: 令牌生成速率（每秒）
            capacity: 令牌桶容量

        Returns:
            限流器实例
        """
        async with self.lock:
            if platform not in self._limiters:
                self._limiters[platform] = RateLimiter(rate, capacity, platform)
                logger.info(f"Created rate limiter for platform: {platform}")
            return self._limiters[platform]

    async def acquire(self, platform: str, tokens: int = 1) -> bool:
        """
        从指定平台的限流器获取令牌

        Args:
            platform: 平台标识
            tokens: 需要的令牌数

        Returns:
            是否成功获取
        """
        limiter = await self.get_limiter(platform)
        return await limiter.acquire(tokens)

    def get_all_status(self) -> Dict[str, Dict[str, float]]:
        """
        获取所有限流器的状态

        Returns:
            平台 -> 状态字典
        """
        return {
            platform: limiter.get_status()
            for platform, limiter in self._limiters.items()
        }


# 全局限流器注册表实例
_registry = RateLimiterRegistry()


async def get_rate_limiter(
    platform: str,
    rate: float = 1.0,
    capacity: int = 10
) -> RateLimiter:
    """
    获取全局限流器实例

    Args:
        platform: 平台标识
        rate: 令牌生成速率（每秒）
        capacity: 令牌桶容量

    Returns:
        限流器实例
    """
    return await _registry.get_limiter(platform, rate, capacity)
