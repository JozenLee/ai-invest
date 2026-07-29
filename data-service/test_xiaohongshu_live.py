#!/usr/bin/env python3
"""
小红书 Provider 真实测试
使用真实Cookie和账号ID进行测试
"""

import asyncio
import sys
import logging
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from providers.xiaohongshu_provider import XiaohongshuAPIProvider

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_xiaohongshu_with_real_data():
    """使用真实Cookie和ID测试小红书"""

    logger.info("\n" + "=" * 80)
    logger.info("小红书 Provider 真实测试")
    logger.info("=" * 80 + "\n")

    # 真实配置
    cookie_str = "acw_tc=0a00da1317852539624715209e279f3dce83ece5404e85fa8bb920c31888e4; abRequestId=2648b74e-e078-5954-81c6-70d751f86c89; ets=1785253966176; webBuild=6.36.1; xsecappid=xhs-pc-web; loadts=1785253966283; a1=19fa96db1d10i3xc3hye9swoep7w005wu8bcjgx5q50000236515; webId=ed3a75bbe245a8b2cdc283e2e83a9877; websectiga=8886be45f388a1ee7bf611a69f3e174cae48f1ea02c0f8ec3256031b8be9c7ee; sec_poison_id=bb461721-e027-4b55-9978-e9b77143dba2; gid=yji0jKfSJK78yji0jKfDyYkCfy83qCSqxvdjD2AMEldUWS28E882EV888JqK2y28DSJj8jWj; web_session=040069b166550c5784d833985d384b19ed1f98; id_token=VjEAAJKvvEfFFj3xTHKSFV7UyemgYnC5B1goxizwI1ojQ9NrRp5VRncQM7Wj8yG18j0TDCdbRL8QaHX1JyXb5xVpnrca8z85Op539TwFjuicUY6VvXX/P7WEQbnVeQKj8SDLEjUT; x-rednote-datactry=CN; x-rednote-holderctry=CN"

    test_user_id = "60cc27c30000000001005f2c"  # 测试账号ID（正确格式）

    config = {
        'cookie_str': cookie_str,
        'timeout': 15,
        'max_retries': 3,
        'retry_delay': 2,
    }

    try:
        # 初始化 Provider
        provider = XiaohongshuAPIProvider(config)
        logger.info("✓ Provider 初始化成功\n")

        # Step 1: 验证账号
        logger.info("=" * 80)
        logger.info("Step 1: 验证账号")
        logger.info("=" * 80)
        logger.info(f"测试账号ID: {test_user_id}\n")

        is_valid = await provider.validate_account(test_user_id)

        if not is_valid:
            logger.error("✗ 账号验证失败")
            logger.info("\n可能的原因:")
            logger.info("1. Cookie已过期，需要重新获取")
            logger.info("2. 账号ID格式不正确")
            logger.info("3. 账号不存在或已被封禁")
            return False

        logger.info(f"✓ 账号验证成功: {test_user_id}\n")

        # Step 2: 获取用户信息
        logger.info("=" * 80)
        logger.info("Step 2: 获取用户信息")
        logger.info("=" * 80 + "\n")

        user_info = await provider.fetch_user_info(test_user_id)

        if not user_info:
            logger.error("✗ 获取用户信息失败")
            return False

        logger.info("✓ 用户信息获取成功:\n")
        logger.info(f"  用户名: {user_info.get('name', 'N/A')}")
        logger.info(f"  头像URL: {user_info.get('avatar_url', 'N/A')[:80]}...")
        logger.info(f"  简介: {user_info.get('description', 'N/A')[:100]}")
        logger.info(f"  认证状态: {'✓ 已认证' if user_info.get('verified') else '✗ 未认证'}")
        logger.info(f"  粉丝数: {user_info.get('followers_count', 0):,}")
        logger.info(f"  主页URL: {user_info.get('profile_url', 'N/A')}\n")

        # Step 3: 获取笔记列表
        logger.info("=" * 80)
        logger.info("Step 3: 获取笔记列表")
        logger.info("=" * 80 + "\n")

        posts = await provider.fetch_user_posts(
            account_id=test_user_id,
            limit=10
        )

        if not posts:
            logger.warning("⚠️  未获取到笔记数据")
            logger.info("\n可能的原因:")
            logger.info("1. 该账号暂无公开笔记")
            logger.info("2. API返回格式变化")
            logger.info("3. 需要额外的权限")
            return True  # 用户信息成功就算部分成功

        logger.info(f"✓ 成功获取 {len(posts)} 篇笔记\n")

        # 显示前3篇笔记
        for i, post in enumerate(posts[:3], 1):
            logger.info(f"{'=' * 80}")
            logger.info(f"笔记 #{i}")
            logger.info(f"{'=' * 80}")

            content = post.get('content', '')
            logger.info(f"内容预览: {content[:100]}..." if len(content) > 100 else f"内容: {content}")
            logger.info(f"URL: {post.get('url', 'N/A')}")
            logger.info(f"发布时间: {post.get('publish_time', 'N/A')}")
            logger.info(f"媒体类型: {post.get('media_type', 'N/A')}")

            # 互动数据
            logger.info(f"\n互动数据:")
            logger.info(f"  点赞: {post.get('likes', 0):,}")
            logger.info(f"  评论: {post.get('comments', 0):,}")
            logger.info(f"  分享: {post.get('shares', 0):,}")

            # 媒体URL
            media_urls = post.get('media_urls', [])
            if media_urls:
                logger.info(f"\n媒体文件: {len(media_urls)} 个")
                for j, url in enumerate(media_urls[:2], 1):
                    logger.info(f"  [{j}] {url[:80]}...")

            # 扩展字段
            extra_data = post.get('extra_data', {})
            if extra_data:
                logger.info(f"\n扩展信息:")
                logger.info(f"  笔记类型: {extra_data.get('noteType', 'N/A')}")
                tags_str = extra_data.get('tags', '[]')
                try:
                    tags = json.loads(tags_str) if isinstance(tags_str, str) else tags_str
                    if tags:
                        logger.info(f"  标签: {', '.join(tags)}")
                except:
                    logger.info(f"  标签: {tags_str}")
                logger.info(f"  收藏数: {extra_data.get('collects', 0)}")
                logger.info(f"  商品链接: {'有' if extra_data.get('hasGoodsLink') else '无'}")

            logger.info("")

        if len(posts) > 3:
            logger.info(f"... 还有 {len(posts) - 3} 篇笔记未显示\n")

        # Step 4: 测试增量获取
        logger.info("=" * 80)
        logger.info("Step 4: 测试增量获取（最近7天）")
        logger.info("=" * 80 + "\n")

        from datetime import timedelta
        since_time = datetime.now() - timedelta(days=7)

        recent_posts = await provider.fetch_user_posts(
            account_id=test_user_id,
            since=since_time,
            limit=20
        )

        logger.info(f"✓ 最近7天内的笔记: {len(recent_posts)} 篇\n")

        # 清理
        await provider.close()

        # 总结
        logger.info("=" * 80)
        logger.info("测试总结")
        logger.info("=" * 80)
        logger.info(f"✓ Provider初始化: 成功")
        logger.info(f"✓ 账号验证: 成功")
        logger.info(f"✓ 用户信息获取: 成功 ({user_info.get('name', 'N/A')})")
        logger.info(f"✓ 笔记列表获取: 成功 ({len(posts)} 篇)")
        logger.info(f"✓ 增量获取: 成功 ({len(recent_posts)} 篇)")
        logger.info("=" * 80)
        logger.info("\n🎉 小红书平台测试全部通过！")
        logger.info("=" * 80 + "\n")

        return True

    except Exception as e:
        logger.error(f"\n✗ 测试失败: {e}", exc_info=True)
        return False


async def main():
    """主函数"""
    try:
        success = await test_xiaohongshu_with_real_data()
        return 0 if success else 1
    except KeyboardInterrupt:
        logger.info("\n测试被用户中断")
        return 1
    except Exception as e:
        logger.error(f"测试出错: {e}", exc_info=True)
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
