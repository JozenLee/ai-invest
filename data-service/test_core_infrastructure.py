"""
测试核心基础设施组件
"""
import asyncio
import logging
from datetime import datetime

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def test_http_client():
    """测试 BaseHTTPClient"""
    from core import BaseHTTPClient

    logger.info("=== Testing BaseHTTPClient ===")

    # 创建客户端
    client = BaseHTTPClient(
        base_url="https://api.bilibili.com",
        timeout=5,
        max_retries=2
    )

    try:
        # 测试 GET 请求
        result = await client.get(
            "/x/space/acc/info",
            params={"mid": "1"}
        )

        if result:
            logger.info(f"HTTP request successful: {result.get('code')}")
        else:
            logger.warning("HTTP request failed")

    finally:
        await client.close()

    logger.info("BaseHTTPClient test completed\n")


async def test_rate_limiter():
    """测试 RateLimiter"""
    from core import RateLimiter, get_rate_limiter

    logger.info("=== Testing RateLimiter ===")

    # 创建限流器（每秒 2 个请求，容量 5）
    limiter = RateLimiter(rate=2.0, capacity=5, platform="test")

    # 快速获取多个令牌
    for i in range(3):
        success = await limiter.acquire(1)
        logger.info(f"Acquire token {i+1}: {success}, status: {limiter.get_status()}")

    # 使用全局注册表
    bilibili_limiter = await get_rate_limiter("bilibili", rate=1.0, capacity=10)
    await bilibili_limiter.acquire(1)
    logger.info(f"Bilibili limiter status: {bilibili_limiter.get_status()}")

    logger.info("RateLimiter test completed\n")


def test_user_agent():
    """测试 UserAgentPool"""
    from core import UserAgentPool, get_random_user_agent, get_chrome_user_agent

    logger.info("=== Testing UserAgentPool ===")

    pool = UserAgentPool()

    # 获取不同类型的 UA
    desktop_ua = pool.get_random_desktop()
    mobile_ua = pool.get_random_mobile()
    random_ua = pool.get_random()

    logger.info(f"Desktop UA: {desktop_ua[:50]}...")
    logger.info(f"Mobile UA: {mobile_ua[:50]}...")
    logger.info(f"Random UA: {random_ua[:50]}...")

    # 测试全局函数
    chrome_ua = get_chrome_user_agent()
    logger.info(f"Chrome UA: {chrome_ua[:50]}...")

    logger.info("UserAgentPool test completed\n")


def test_data_parser():
    """测试 DataParser"""
    from core import DataParser, parse_timestamp, clean_text, detect_media_type

    logger.info("=== Testing DataParser ===")

    # 测试时间戳解析
    timestamps = [
        1672531200,  # Unix 秒
        1672531200000,  # Unix 毫秒
        "2023-01-01 00:00:00",  # 字符串
        "2023-01-01T00:00:00",  # ISO 8601
    ]

    for ts in timestamps:
        parsed = parse_timestamp(ts)
        logger.info(f"Parse timestamp {ts} -> {parsed}")

    # 测试文本清理
    dirty_text = "<p>Hello   World!</p>  <script>alert('xss')</script>  "
    cleaned = clean_text(dirty_text)
    logger.info(f"Clean text: '{dirty_text}' -> '{cleaned}'")

    # 测试媒体类型检测
    urls = [
        "https://www.bilibili.com/video/BV123456",
        "https://example.com/image.jpg",
        "https://example.com/article/123",
        "https://example.com/file.mp3",
    ]

    for url in urls:
        media_type = detect_media_type("", url)
        logger.info(f"Detect media type: {url} -> {media_type}")

    # 测试 URL 提取
    text_with_urls = "Check out https://example.com and http://test.com/path"
    urls = DataParser.extract_urls(text_with_urls)
    logger.info(f"Extract URLs: {urls}")

    # 测试话题标签提取
    text_with_hashtags = "This is a #test post with #multiple #hashtags"
    hashtags = DataParser.extract_hashtags(text_with_hashtags)
    logger.info(f"Extract hashtags: {hashtags}")

    logger.info("DataParser test completed\n")


async def test_config_manager():
    """测试 PlatformConfigManager"""
    from core import PlatformConfigManager, get_config_manager

    logger.info("=== Testing PlatformConfigManager ===")

    # 创建管理器（不连接数据库，使用默认配置）
    manager = PlatformConfigManager()

    # 获取默认配置
    bilibili_config = await manager.get_config("bilibili")
    logger.info(f"Bilibili config: {bilibili_config}")

    # 检查缓存状态
    cache_status = manager.get_cache_status()
    logger.info(f"Cache status: {cache_status}")

    # 清除缓存
    await manager.clear_cache("bilibili")
    logger.info("Cache cleared")

    logger.info("PlatformConfigManager test completed\n")


async def main():
    """运行所有测试"""
    logger.info("Starting core infrastructure tests...\n")

    try:
        # 测试各个组件
        test_user_agent()
        test_data_parser()

        await test_rate_limiter()
        await test_config_manager()
        await test_http_client()

        logger.info("All tests completed successfully!")

    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)


if __name__ == "__main__":
    asyncio.run(main())
