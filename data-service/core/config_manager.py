"""
PlatformConfigManager - Platform configuration management with caching.
"""
import asyncio
import logging
from typing import Dict, Optional, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class PlatformConfigManager:
    """
    平台配置管理器

    提供：
    - 从 PlatformConfig 表加载配置
    - 内存缓存（TTL 5分钟）
    - get_config(platform) 方法
    """

    def __init__(self, db_connection=None, cache_ttl: int = 300):
        """
        初始化配置管理器

        Args:
            db_connection: 数据库连接对象（可选，延迟注入）
            cache_ttl: 缓存过期时间（秒），默认 5 分钟
        """
        self.db = db_connection
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timestamps: Dict[str, datetime] = {}
        self.cache_ttl = timedelta(seconds=cache_ttl)
        self.lock = asyncio.Lock()

        logger.info(f"PlatformConfigManager initialized (cache_ttl={cache_ttl}s)")

    def set_db_connection(self, db_connection):
        """
        设置数据库连接（用于延迟注入）

        Args:
            db_connection: 数据库连接对象
        """
        self.db = db_connection

    async def get_config(self, platform: str, use_cache: bool = True) -> Optional[Dict[str, Any]]:
        """
        获取平台配置

        Args:
            platform: 平台标识（如 'bilibili', 'weibo'）
            use_cache: 是否使用缓存

        Returns:
            配置字典，不存在返回 None
        """
        # 检查缓存
        if use_cache and self._is_cache_valid(platform):
            logger.debug(f"Config cache hit for platform: {platform}")
            return self._cache[platform].copy()

        # 从数据库加载
        async with self.lock:
            # Double-check cache after acquiring lock
            if use_cache and self._is_cache_valid(platform):
                return self._cache[platform].copy()

            config = await self._load_from_db(platform)

            if config:
                # 更新缓存
                self._cache[platform] = config
                self._cache_timestamps[platform] = datetime.now()
                logger.info(f"Loaded config for platform: {platform}")
                return config.copy()
            else:
                logger.warning(f"No config found for platform: {platform}")
                return None

    async def get_all_configs(self, use_cache: bool = True) -> Dict[str, Dict[str, Any]]:
        """
        获取所有平台配置

        Args:
            use_cache: 是否使用缓存

        Returns:
            平台 -> 配置字典
        """
        configs = await self._load_all_from_db()

        # 更新缓存
        async with self.lock:
            for platform, config in configs.items():
                self._cache[platform] = config
                self._cache_timestamps[platform] = datetime.now()

        logger.info(f"Loaded {len(configs)} platform configs")
        return configs

    async def reload_config(self, platform: str) -> Optional[Dict[str, Any]]:
        """
        强制重新加载平台配置（忽略缓存）

        Args:
            platform: 平台标识

        Returns:
            配置字典
        """
        return await self.get_config(platform, use_cache=False)

    async def clear_cache(self, platform: Optional[str] = None):
        """
        清除缓存

        Args:
            platform: 平台标识，为 None 时清除所有缓存
        """
        async with self.lock:
            if platform:
                self._cache.pop(platform, None)
                self._cache_timestamps.pop(platform, None)
                logger.info(f"Cleared cache for platform: {platform}")
            else:
                self._cache.clear()
                self._cache_timestamps.clear()
                logger.info("Cleared all config cache")

    def _is_cache_valid(self, platform: str) -> bool:
        """
        检查缓存是否有效

        Args:
            platform: 平台标识

        Returns:
            缓存是否有效
        """
        if platform not in self._cache:
            return False

        timestamp = self._cache_timestamps.get(platform)
        if not timestamp:
            return False

        return datetime.now() - timestamp < self.cache_ttl

    async def _load_from_db(self, platform: str) -> Optional[Dict[str, Any]]:
        """
        从数据库加载单个平台配置

        Args:
            platform: 平台标识

        Returns:
            配置字典
        """
        if not self.db:
            logger.error("Database connection not set")
            return None

        try:
            # 使用 Prisma 或 SQLAlchemy 查询
            # 这里提供通用接口，具体实现根据项目数据库框架调整
            if hasattr(self.db, 'platformconfig'):
                # Prisma ORM
                config_record = await self.db.platformconfig.find_unique(
                    where={'platform': platform}
                )

                if config_record:
                    return {
                        'platform': config_record.platform,
                        'enabled': config_record.enabled,
                        'config': config_record.config or {},
                        'rate_limit': config_record.rate_limit,
                        'updated_at': config_record.updated_at,
                    }
            else:
                # 通用查询（需要根据实际情况调整）
                logger.warning("Using fallback DB query method")
                # 返回模拟配置
                return self._get_default_config(platform)

        except Exception as e:
            logger.error(f"Failed to load config from DB: {e}", exc_info=True)
            return None

        return None

    async def _load_all_from_db(self) -> Dict[str, Dict[str, Any]]:
        """
        从数据库加载所有平台配置

        Returns:
            平台 -> 配置字典
        """
        if not self.db:
            logger.error("Database connection not set")
            return {}

        try:
            if hasattr(self.db, 'platformconfig'):
                # Prisma ORM
                config_records = await self.db.platformconfig.find_many()

                configs = {}
                for record in config_records:
                    configs[record.platform] = {
                        'platform': record.platform,
                        'enabled': record.enabled,
                        'config': record.config or {},
                        'rate_limit': record.rate_limit,
                        'updated_at': record.updated_at,
                    }

                return configs
            else:
                logger.warning("Using fallback DB query method")
                return {}

        except Exception as e:
            logger.error(f"Failed to load configs from DB: {e}", exc_info=True)
            return {}

    def _get_default_config(self, platform: str) -> Dict[str, Any]:
        """
        获取默认配置（当数据库不可用时）

        Args:
            platform: 平台标识

        Returns:
            默认配置字典
        """
        defaults = {
            'bilibili': {
                'platform': 'bilibili',
                'enabled': True,
                'config': {
                    'base_url': 'https://api.bilibili.com',
                    'timeout': 10,
                    'max_retries': 3,
                },
                'rate_limit': {'rate': 1.0, 'capacity': 10},
                'updated_at': datetime.now(),
            },
            'weibo': {
                'platform': 'weibo',
                'enabled': True,
                'config': {
                    'base_url': 'https://api.weibo.com',
                    'timeout': 10,
                    'max_retries': 3,
                },
                'rate_limit': {'rate': 2.0, 'capacity': 20},
                'updated_at': datetime.now(),
            },
        }

        return defaults.get(platform, {
            'platform': platform,
            'enabled': True,
            'config': {},
            'rate_limit': {'rate': 1.0, 'capacity': 10},
            'updated_at': datetime.now(),
        })

    def get_cache_status(self) -> Dict[str, Any]:
        """
        获取缓存状态

        Returns:
            缓存统计信息
        """
        now = datetime.now()
        return {
            'total_cached': len(self._cache),
            'platforms': list(self._cache.keys()),
            'cache_ages': {
                platform: (now - timestamp).total_seconds()
                for platform, timestamp in self._cache_timestamps.items()
            },
            'cache_ttl': self.cache_ttl.total_seconds(),
        }


# 全局配置管理器实例
_manager: Optional[PlatformConfigManager] = None


def get_config_manager(db_connection=None) -> PlatformConfigManager:
    """
    获取全局配置管理器实例

    Args:
        db_connection: 数据库连接（首次调用时设置）

    Returns:
        配置管理器实例
    """
    global _manager
    if _manager is None:
        _manager = PlatformConfigManager(db_connection)
    elif db_connection and not _manager.db:
        _manager.set_db_connection(db_connection)
    return _manager


async def get_platform_config(platform: str) -> Optional[Dict[str, Any]]:
    """
    获取平台配置（全局函数）

    Args:
        platform: 平台标识

    Returns:
        配置字典
    """
    manager = get_config_manager()
    return await manager.get_config(platform)
