#!/usr/bin/env python3
"""
测试 Bilibili 大V数据获取
测试账号：二狗学长好 (UID: 72844725)
"""
import sys
import asyncio
import logging
sys.path.insert(0, 'data-service')

from providers.bilibili_provider import BilibiliAPIProvider
from db import db

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_bilibili_api():
    """测试 Bilibili API 直接调用"""
    logger.info("=" * 60)
    logger.info("测试 1: Bilibili API 直接调用")
    logger.info("=" * 60)

    # 初始化provider（增加重试延迟）
    provider = BilibiliAPIProvider(config={
        'retry_delay': 3,  # 3秒重试延迟
        'max_retries': 3
    })

    account_id = '72844725'

    # 测试用户信息
    logger.info(f"\n获取用户信息: {account_id}")
    user_info = await provider.fetch_user_info(account_id)

    if user_info:
        logger.info(f"✓ 用户名: {user_info.get('name')}")
        logger.info(f"✓ 粉丝数: {user_info.get('followers_count')}")
        logger.info(f"✓ 认证状态: {'已认证' if user_info.get('verified') else '未认证'}")
        logger.info(f"✓ 简介: {user_info.get('description', '')[:50]}...")
    else:
        logger.error("✗ 未能获取用户信息（可能被反爬虫拦截）")
        return False

    # 等待一下避免请求过快
    logger.info("\n等待 3 秒后获取动态...")
    await asyncio.sleep(3)

    # 测试用户动态
    logger.info(f"\n获取用户动态: {account_id}")
    posts = await provider.fetch_user_posts(account_id, limit=5)

    if posts:
        logger.info(f"✓ 成功获取 {len(posts)} 条动态")
        for i, post in enumerate(posts, 1):
            content = post.get('content', '')[:50]
            publish_time = post.get('publish_time')
            likes = post.get('likes', 0)
            logger.info(f"  {i}. {content}... (👍 {likes}, 发布于: {publish_time})")
    else:
        logger.warning("✗ 未能获取动态数据（可能被反爬虫拦截或该用户无动态）")

    return bool(user_info)


async def test_database_operations():
    """测试数据库操作"""
    logger.info("\n" + "=" * 60)
    logger.info("测试 2: 数据库操作")
    logger.info("=" * 60)

    account_id = '72844725'

    # 检查是否已存在
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT * FROM Influencer WHERE accountId = ?",
            (account_id,)
        )
        existing = await cursor.fetchone()

    if existing:
        logger.info(f"\n✓ 数据库中已存在该大V")
        logger.info(f"  ID: {existing['id']}")
        logger.info(f"  名称: {existing['name']}")
        logger.info(f"  平台: {existing['platform']}")
        logger.info(f"  最后采集: {existing['lastFetchAt']}")
        logger.info(f"  采集状态: {existing['lastFetchStatus']}")

        influencer_id = existing['id']
    else:
        logger.info(f"\n创建大V记录: {account_id}")
        influencer_id = f"inf_bilibili_{account_id}"

        async with db.get_connection() as conn:
            from datetime import datetime
            created_at = datetime.now().isoformat()

            await conn.execute("""
                INSERT INTO Influencer (
                    id, name, platform, accountId, driverType,
                    fetchInterval, priority, isActive,
                    profileUrl, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                influencer_id,
                '二狗学长好',
                'bilibili',
                account_id,
                'api',
                60,  # 60分钟采集间隔
                'medium',
                1,  # isActive
                f'https://space.bilibili.com/{account_id}',
                created_at,
                created_at
            ))

        logger.info(f"✓ 已创建大V记录: {influencer_id}")

    # 检查动态数据
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT COUNT(*) as count FROM InfluencerPost WHERE influencerId = ?",
            (influencer_id,)
        )
        row = await cursor.fetchone()
        post_count = row['count'] if row else 0

    logger.info(f"\n✓ 数据库中该大V的动态数量: {post_count}")

    return influencer_id


async def test_fetch_service():
    """测试采集服务"""
    logger.info("\n" + "=" * 60)
    logger.info("测试 3: 采集服务")
    logger.info("=" * 60)

    from services.influencer_fetch_service import InfluencerFetchService

    # 确保大V记录存在
    influencer_id = await test_database_operations()

    # 初始化采集服务
    fetch_service = InfluencerFetchService(db)

    logger.info(f"\n开始采集大V动态: {influencer_id}")
    logger.info("注意: 由于 Bilibili 反爬虫限制，采集可能失败")

    # 执行采集
    result = await fetch_service.fetch_influencer_posts(influencer_id)

    logger.info(f"\n采集结果:")
    logger.info(f"  成功: {result['success']}")
    logger.info(f"  获取数量: {result['posts_fetched']}")
    logger.info(f"  新增数量: {result['posts_new']}")
    logger.info(f"  耗时: {result['elapsed_seconds']:.2f}s")

    if result.get('error'):
        logger.error(f"  错误: {result['error']}")

    return result


async def main():
    """主测试流程"""
    logger.info("开始测试 Bilibili 大V数据获取")
    logger.info(f"测试账号: 二狗学长好 (UID: 72844725)")
    logger.info(f"主页: https://space.bilibili.com/72844725")

    try:
        # 测试 1: API 直接调用
        api_success = await test_bilibili_api()

        if not api_success:
            logger.warning("\n⚠️  Bilibili API 调用失败（反爬虫限制）")
            logger.info("这是正常现象，Bilibili 有严格的反爬虫机制")
            logger.info("建议:")
            logger.info("  1. 使用更长的重试延迟（retry_delay）")
            logger.info("  2. 降低采集频率（fetchInterval）")
            logger.info("  3. 考虑使用 Bilibili Cookie 认证（需要登录）")

        # 测试 2: 数据库操作
        influencer_id = await test_database_operations()

        # 测试 3: 采集服务
        logger.info("\n是否测试完整的采集服务？(可能因反爬虫失败)")
        logger.info("继续执行采集服务测试...")
        await asyncio.sleep(5)  # 等待5秒避免请求过快

        result = await test_fetch_service()

        # 总结
        logger.info("\n" + "=" * 60)
        logger.info("测试总结")
        logger.info("=" * 60)
        logger.info(f"✓ 大V ID: {influencer_id}")
        logger.info(f"✓ 采集服务: {'成功' if result['success'] else '失败（反爬虫）'}")

        if result['success']:
            logger.info(f"✓ 新增动态: {result['posts_new']} 条")
        else:
            logger.warning("⚠️  由于 Bilibili 反爬虫限制，采集失败是正常现象")
            logger.info("解决方案:")
            logger.info("  1. 配置 Bilibili Cookie (需要登录状态)")
            logger.info("  2. 使用代理IP池")
            logger.info("  3. 增加请求延迟和重试机制")

    except Exception as e:
        logger.error(f"测试失败: {e}", exc_info=True)
        return 1

    return 0


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
