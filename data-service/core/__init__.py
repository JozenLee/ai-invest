"""
Core infrastructure layer for data-service.

提供统一的基础设施组件：
- BaseHTTPClient: HTTP 客户端（Session 管理、重试、日志）
- RateLimiter: 令牌桶限流器
- UserAgentPool: User-Agent 池
- DataParser: 数据解析工具（时间戳、文本清理、媒体类型检测）
- PlatformConfigManager: 平台配置管理器（带缓存）
"""

from .http_client import BaseHTTPClient
from .rate_limiter import RateLimiter, RateLimiterRegistry, get_rate_limiter
from .user_agent import (
    UserAgentPool,
    get_random_user_agent,
    get_desktop_user_agent,
    get_mobile_user_agent,
    get_chrome_user_agent,
)
from .parsers import (
    DataParser,
    parse_timestamp,
    clean_text,
    detect_media_type,
)
from .config_manager import (
    PlatformConfigManager,
    get_config_manager,
    get_platform_config,
)

__all__ = [
    # HTTP Client
    'BaseHTTPClient',

    # Rate Limiter
    'RateLimiter',
    'RateLimiterRegistry',
    'get_rate_limiter',

    # User Agent
    'UserAgentPool',
    'get_random_user_agent',
    'get_desktop_user_agent',
    'get_mobile_user_agent',
    'get_chrome_user_agent',

    # Data Parser
    'DataParser',
    'parse_timestamp',
    'clean_text',
    'detect_media_type',

    # Config Manager
    'PlatformConfigManager',
    'get_config_manager',
    'get_platform_config',
]
