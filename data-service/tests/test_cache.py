# tests/test_cache.py
import pytest
import time
from providers.registry import CacheManager


class TestCacheManager:
    """CacheManager 测试"""

    @pytest.fixture
    def cache(self):
        return CacheManager()

    def test_memory_cache_set_get(self, cache):
        """内存缓存写入和读取"""
        cache.set_memory("key1", {"data": "value1"}, ttl_seconds=60)
        result = cache.get_memory("key1")
        assert result == {"data": "value1"}

    def test_memory_cache_expired(self, cache):
        """内存缓存过期后返回 None"""
        cache.set_memory("key1", {"data": "value1"}, ttl_seconds=0)
        time.sleep(0.1)
        result = cache.get_memory("key1")
        assert result is None

    def test_memory_cache_miss(self, cache):
        """内存缓存未命中返回 None"""
        result = cache.get_memory("nonexistent")
        assert result is None

    def test_file_cache_set_get(self, cache):
        """文件缓存写入和读取"""
        cache.set_file("key2", {"data": "value2"})
        result = cache.get_file("key2")
        assert result == {"data": "value2"}

    def test_file_cache_miss(self, cache):
        """文件缓存未命中返回 None"""
        result = cache.get_file("nonexistent")
        assert result is None

    def test_invalidate(self, cache):
        """清除缓存"""
        cache.set_memory("key3", {"data": "value3"}, ttl_seconds=60)
        cache.invalidate("key3")
        assert cache.get_memory("key3") is None

    def test_set_both_memory_and_file(self, cache):
        """set 方法同时写入内存和文件"""
        cache.set("key4", {"data": "value4"}, memory_ttl=60)
        assert cache.get_memory("key4") == {"data": "value4"}
        assert cache.get_file("key4") == {"data": "value4"}
