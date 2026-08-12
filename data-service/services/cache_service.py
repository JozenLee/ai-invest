"""
缓存服务
支持 Redis 和内存缓存（降级）
"""
from typing import Optional, Any
import json
import time
from functools import wraps
import os

# 尝试导入 Redis
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("Warning: redis-py not installed, using in-memory cache")


class CacheService:
    """缓存服务 - 支持 Redis 和内存缓存"""

    def __init__(self):
        self.redis_client = None
        self.memory_cache = {}  # 内存缓存降级
        self.cache_stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
        }

        # 尝试连接 Redis
        if REDIS_AVAILABLE:
            try:
                redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                self.redis_client.ping()
                print(f"✓ Redis 连接成功: {redis_url}")
            except Exception as e:
                print(f"⚠ Redis 连接失败，使用内存缓存: {e}")
                self.redis_client = None

    def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        try:
            if self.redis_client:
                # 使用 Redis
                value = self.redis_client.get(key)
                if value:
                    self.cache_stats["hits"] += 1
                    return json.loads(value)
                else:
                    self.cache_stats["misses"] += 1
                    return None
            else:
                # 使用内存缓存
                cache_entry = self.memory_cache.get(key)
                if cache_entry:
                    # 检查是否过期
                    if cache_entry["expires_at"] > time.time():
                        self.cache_stats["hits"] += 1
                        return cache_entry["value"]
                    else:
                        # 过期，删除
                        del self.memory_cache[key]

                self.cache_stats["misses"] += 1
                return None
        except Exception as e:
            print(f"缓存读取失败: {e}")
            return None

    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """设置缓存

        Args:
            key: 缓存键
            value: 缓存值
            ttl: 过期时间（秒），默认 5 分钟
        """
        try:
            self.cache_stats["sets"] += 1

            if self.redis_client:
                # 使用 Redis
                self.redis_client.setex(key, ttl, json.dumps(value))
                return True
            else:
                # 使用内存缓存
                self.memory_cache[key] = {
                    "value": value,
                    "expires_at": time.time() + ttl
                }

                # 清理过期缓存（简单策略）
                if len(self.memory_cache) > 1000:
                    self._cleanup_memory_cache()

                return True
        except Exception as e:
            print(f"缓存写入失败: {e}")
            return False

    def delete(self, key: str) -> bool:
        """删除缓存"""
        try:
            if self.redis_client:
                self.redis_client.delete(key)
            else:
                if key in self.memory_cache:
                    del self.memory_cache[key]
            return True
        except Exception as e:
            print(f"缓存删除失败: {e}")
            return False

    def clear(self, pattern: Optional[str] = None) -> int:
        """清空缓存

        Args:
            pattern: 键模式（支持通配符），None 表示清空所有

        Returns:
            删除的键数量
        """
        try:
            if self.redis_client:
                if pattern:
                    keys = self.redis_client.keys(pattern)
                    if keys:
                        return self.redis_client.delete(*keys)
                    return 0
                else:
                    return self.redis_client.flushdb()
            else:
                if pattern:
                    # 简单的通配符匹配
                    pattern = pattern.replace("*", "")
                    keys_to_delete = [k for k in self.memory_cache.keys() if pattern in k]
                    for key in keys_to_delete:
                        del self.memory_cache[key]
                    return len(keys_to_delete)
                else:
                    count = len(self.memory_cache)
                    self.memory_cache.clear()
                    return count
        except Exception as e:
            print(f"缓存清空失败: {e}")
            return 0

    def get_stats(self) -> dict:
        """获取缓存统计"""
        total_requests = self.cache_stats["hits"] + self.cache_stats["misses"]
        hit_rate = (
            self.cache_stats["hits"] / total_requests * 100
            if total_requests > 0
            else 0
        )

        return {
            "backend": "redis" if self.redis_client else "memory",
            "hits": self.cache_stats["hits"],
            "misses": self.cache_stats["misses"],
            "sets": self.cache_stats["sets"],
            "hit_rate": round(hit_rate, 2),
            "memory_cache_size": len(self.memory_cache) if not self.redis_client else None,
        }

    def _cleanup_memory_cache(self):
        """清理过期的内存缓存"""
        now = time.time()
        expired_keys = [
            key for key, entry in self.memory_cache.items()
            if entry["expires_at"] <= now
        ]
        for key in expired_keys:
            del self.memory_cache[key]

    # ==================== 知识图谱专用缓存方法 ====================

    def get_industries(self) -> Optional[Any]:
        """从缓存获取产业列表"""
        return self.get('cache:industries:list')

    def set_industries(self, industries: Any, ttl: int = 3600):
        """缓存产业列表（默认1小时）"""
        return self.set('cache:industries:list', industries, ttl)

    def get_segments(self, industry_code: str) -> Optional[Any]:
        """从缓存获取某个产业的Segment列表"""
        return self.get(f'cache:industry:{industry_code}:segments')

    def set_segments(self, industry_code: str, segments: Any, ttl: int = 3600):
        """缓存Segment列表（默认1小时）"""
        return self.set(f'cache:industry:{industry_code}:segments', segments, ttl)

    def get_classification_segments(self) -> Optional[Any]:
        """从缓存获取用于新闻分类的所有Segment列表"""
        return self.get('cache:classification:segments')

    def set_classification_segments(self, segments: Any, ttl: int = 3600):
        """缓存分类Segment列表（默认1小时）"""
        return self.set('cache:classification:segments', segments, ttl)

    def invalidate_industry(self, industry_code: str):
        """失效某个产业的所有缓存"""
        self.delete(f'cache:industry:{industry_code}:segments')
        self.delete('cache:industries:list')
        self.delete('cache:classification:segments')

    def invalidate_all_graph_cache(self):
        """清除所有图谱相关缓存"""
        return self.clear('cache:*')


# 全局缓存服务实例
cache_service = CacheService()


def cached(ttl: int = 300, key_prefix: str = ""):
    """
    缓存装饰器

    Args:
        ttl: 缓存过期时间（秒）
        key_prefix: 缓存键前缀

    Example:
        @cached(ttl=600, key_prefix="news")
        async def get_news(category: str):
            return fetch_news(category)
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 构建缓存键
            cache_key = f"{key_prefix}:{func.__name__}:{str(args)}:{str(kwargs)}"

            # 尝试从缓存获取
            cached_value = cache_service.get(cache_key)
            if cached_value is not None:
                return cached_value

            # 缓存未命中，执行函数
            result = await func(*args, **kwargs)

            # 存入缓存
            cache_service.set(cache_key, result, ttl)

            return result
        return wrapper
    return decorator
