#!/usr/bin/env python3
"""
多平台影响者数据提供者综合测试
测试所有已实现的平台：知乎、小红书、抖音、微博、Bilibili

使用方法：
  python3 test_all_platforms.py

测试内容：
  1. Provider 初始化
  2. 账号验证
  3. 用户信息获取
  4. 动态/内容列表获取
  5. 数据格式验证
  6. 扩展字段检查
"""

import asyncio
import sys
import logging
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from providers.zhihu_provider import ZhihuAPIProvider
from providers.xiaohongshu_provider import XiaohongshuAPIProvider
from providers.douyin_provider import DouyinCrawlerProvider
from providers.weibo_provider import WeiboAPIProvider

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# 测试账号配置
TEST_ACCOUNTS = {
    'zhihu': {
        'name': '知乎科技号',
        'account_ids': [
            'excited-vczh',      # 轮子哥
            'wang-yuan-zhe-52',  # 科技类大V
            'peng-lin-90',       # 技术类
        ],
        'description': '知乎 - 回答、文章、想法、视频'
    },
    'xiaohongshu': {
        'name': '小红书博主',
        'account_ids': [
            '5c8e1e9e000000001001a6b0',  # 示例ID（需替换为真实ID）
            '5d8e1e9e000000001001a6b1',
        ],
        'description': '小红书 - 图文笔记、视频笔记'
    },
    'douyin': {
        'name': '抖音创作者',
        'account_ids': [
            'MS4wLjABAAAA_example',  # 示例sec_uid（需替换）
        ],
        'description': '抖音 - 短视频内容'
    },
    'weibo': {
        'name': '微博用户',
        'account_ids': [
            '1234567890',  # 微博数字UID（需替换）
        ],
        'description': '微博 - 微博动态'
    },
    'bilibili': {
        'name': 'B站UP主',
        'account_ids': [
            '1',          # B站UID
            '2',
        ],
        'description': 'Bilibili - 视频、动态'
    },
}


class PlatformTestResult:
    """平台测试结果"""

    def __init__(self, platform: str):
        self.platform = platform
        self.initialized = False
        self.account_validated = False
        self.user_info_fetched = False
        self.posts_fetched = False
        self.valid_account_id = None
        self.user_info = {}
        self.posts_count = 0
        self.sample_post = None
        self.errors = []

    def add_error(self, stage: str, error: str):
        self.errors.append(f"[{stage}] {error}")

    def is_success(self) -> bool:
        return (self.initialized and
                self.account_validated and
                self.user_info_fetched and
                self.posts_fetched and
                len(self.errors) == 0)

    def summary(self) -> str:
        status = "✅ 成功" if self.is_success() else "❌ 失败"
        return f"{self.platform}: {status}"


async def test_zhihu() -> PlatformTestResult:
    """测试知乎平台"""
    result = PlatformTestResult('知乎')
    logger.info("\n" + "=" * 80)
    logger.info("测试平台: 知乎")
    logger.info("=" * 80)

    try:
        # 初始化
        config = {
            'timeout': 10,
            'max_retries': 2,
            'retry_delay': 2,
            # Cookie 可选，不提供则使用公开接口
            # 'cookie_str': 'your_cookie_string_here'
        }
        provider = ZhihuAPIProvider(config)
        result.initialized = True
        logger.info("✓ Provider 初始化成功")

        # 测试账号
        test_accounts = TEST_ACCOUNTS['zhihu']['account_ids']

        for account_id in test_accounts:
            logger.info(f"\n测试账号: {account_id}")

            # 验证账号
            is_valid = await provider.validate_account(account_id)
            if is_valid:
                result.account_validated = True
                result.valid_account_id = account_id
                logger.info(f"  ✓ 账号有效")

                # 获取用户信息
                user_info = await provider.fetch_user_info(account_id)
                if user_info and user_info.get('name'):
                    result.user_info_fetched = True
                    result.user_info = user_info
                    logger.info(f"  ✓ 用户信息: {user_info.get('name')}")
                    logger.info(f"    - 粉丝数: {user_info.get('followers_count', 0)}")
                    logger.info(f"    - 认证: {'是' if user_info.get('verified') else '否'}")

                    # 获取动态列表
                    posts = await provider.fetch_user_posts(account_id, limit=5)
                    if posts:
                        result.posts_fetched = True
                        result.posts_count = len(posts)
                        result.sample_post = posts[0]
                        logger.info(f"  ✓ 获取到 {len(posts)} 条动态")

                        # 显示第一条动态
                        post = posts[0]
                        logger.info(f"    示例动态:")
                        logger.info(f"      - 内容: {post['content'][:60]}...")
                        logger.info(f"      - 类型: {post.get('extra', {}).get('contentType', 'N/A')}")
                        logger.info(f"      - 点赞: {post['likes']}, 评论: {post['comments']}")

                        break
                    else:
                        result.add_error("获取动态", "动态列表为空")
                else:
                    result.add_error("获取用户信息", "用户信息为空或无名称")
            else:
                logger.info(f"  ✗ 账号无效，尝试下一个")

        await provider.close()

    except Exception as e:
        result.add_error("整体测试", str(e))
        logger.error(f"知乎测试失败: {e}", exc_info=True)

    return result


async def test_xiaohongshu() -> PlatformTestResult:
    """测试小红书平台"""
    result = PlatformTestResult('小红书')
    logger.info("\n" + "=" * 80)
    logger.info("测试平台: 小红书")
    logger.info("=" * 80)

    try:
        # 初始化（需要Cookie）
        config = {
            'timeout': 10,
            'max_retries': 2,
            'retry_delay': 2,
            # 小红书需要Cookie才能访问
            'cookie_str': '',  # 需要提供Cookie
        }

        if not config['cookie_str']:
            logger.warning("⚠️  小红书需要Cookie才能访问，跳过测试")
            logger.info("   获取Cookie方法：")
            logger.info("   1. 浏览器登录小红书")
            logger.info("   2. 打开开发者工具 (F12)")
            logger.info("   3. 访问任意用户主页")
            logger.info("   4. 在Network标签中找到请求")
            logger.info("   5. 复制Cookie字符串")
            result.add_error("初始化", "缺少Cookie配置")
            return result

        provider = XiaohongshuAPIProvider(config)
        result.initialized = True
        logger.info("✓ Provider 初始化成功")

        # 测试账号
        test_accounts = TEST_ACCOUNTS['xiaohongshu']['account_ids']

        for account_id in test_accounts:
            logger.info(f"\n测试账号: {account_id}")

            # 验证账号
            is_valid = await provider.validate_account(account_id)
            if is_valid:
                result.account_validated = True
                result.valid_account_id = account_id
                logger.info(f"  ✓ 账号有效")

                # 获取用户信息
                user_info = await provider.fetch_user_info(account_id)
                if user_info and user_info.get('name'):
                    result.user_info_fetched = True
                    result.user_info = user_info
                    logger.info(f"  ✓ 用户信息: {user_info.get('name')}")
                    logger.info(f"    - 粉丝数: {user_info.get('followers_count', 0)}")

                    # 获取笔记列表
                    posts = await provider.fetch_user_posts(account_id, limit=5)
                    if posts:
                        result.posts_fetched = True
                        result.posts_count = len(posts)
                        result.sample_post = posts[0]
                        logger.info(f"  ✓ 获取到 {len(posts)} 篇笔记")

                        # 显示第一篇笔记
                        post = posts[0]
                        extra = post.get('extra_data', {})
                        logger.info(f"    示例笔记:")
                        logger.info(f"      - 内容: {post['content'][:60]}...")
                        logger.info(f"      - 类型: {extra.get('noteType', 'N/A')}")
                        logger.info(f"      - 点赞: {post['likes']}")

                        break
                    else:
                        result.add_error("获取笔记", "笔记列表为空")
                else:
                    result.add_error("获取用户信息", "用户信息为空")
            else:
                logger.info(f"  ✗ 账号无效")

        await provider.close()

    except Exception as e:
        result.add_error("整体测试", str(e))
        logger.error(f"小红书测试失败: {e}", exc_info=True)

    return result


async def test_douyin() -> PlatformTestResult:
    """测试抖音平台"""
    result = PlatformTestResult('抖音')
    logger.info("\n" + "=" * 80)
    logger.info("测试平台: 抖音")
    logger.info("=" * 80)

    try:
        # 初始化
        config = {
            'timeout': 10,
            'max_retries': 2,
        }
        provider = DouyinCrawlerProvider(config)
        result.initialized = True
        logger.info("✓ Provider 初始化成功")

        # 测试账号
        test_accounts = TEST_ACCOUNTS['douyin']['account_ids']

        logger.warning("⚠️  抖音需要真实的sec_uid才能测试")
        logger.info("   获取sec_uid方法：")
        logger.info("   1. 打开抖音网页版")
        logger.info("   2. 访问用户主页")
        logger.info("   3. URL中包含: /user/MS4wLjABAAAA...")
        logger.info("   4. MS4wLjABAAAA... 就是sec_uid")

        for account_id in test_accounts:
            if 'example' in account_id:
                logger.info(f"\n跳过示例账号: {account_id}")
                continue

            logger.info(f"\n测试账号: {account_id}")

            # 验证账号
            is_valid = await provider.validate_account(account_id)
            if is_valid:
                result.account_validated = True
                result.valid_account_id = account_id
                logger.info(f"  ✓ 账号有效")

                # 获取用户信息
                user_info = await provider.fetch_user_info(account_id)
                if user_info and user_info.get('name'):
                    result.user_info_fetched = True
                    result.user_info = user_info
                    logger.info(f"  ✓ 用户信息: {user_info.get('name')}")
                    logger.info(f"    - 粉丝数: {user_info.get('followers_count', 0)}")

                    # 获取视频列表
                    posts = await provider.fetch_user_posts(account_id, limit=5)
                    if posts:
                        result.posts_fetched = True
                        result.posts_count = len(posts)
                        result.sample_post = posts[0]
                        logger.info(f"  ✓ 获取到 {len(posts)} 个视频")

                        # 显示第一个视频
                        post = posts[0]
                        extra = post.get('douyin_extra', {})
                        logger.info(f"    示例视频:")
                        logger.info(f"      - 内容: {post['content'][:60]}...")
                        logger.info(f"      - 时长: {extra.get('video_duration', 0)}秒")
                        logger.info(f"      - 点赞: {post['likes']}, 评论: {post['comments']}")

                        break
                else:
                    result.add_error("获取用户信息", "用户信息为空")

        await provider.close()

    except Exception as e:
        result.add_error("整体测试", str(e))
        logger.error(f"抖音测试失败: {e}", exc_info=True)

    return result


async def test_weibo() -> PlatformTestResult:
    """测试微博平台"""
    result = PlatformTestResult('微博')
    logger.info("\n" + "=" * 80)
    logger.info("测试平台: 微博")
    logger.info("=" * 80)

    try:
        # 初始化（需要access_token）
        config = {
            'api_key': '',
            'api_secret': '',
            'access_token': '',  # 需要提供access_token
        }

        if not config['access_token']:
            logger.warning("⚠️  微博需要access_token才能访问，跳过测试")
            logger.info("   获取access_token方法：")
            logger.info("   1. 注册微博开放平台账号")
            logger.info("   2. 创建应用")
            logger.info("   3. 获取App Key和App Secret")
            logger.info("   4. 通过OAuth 2.0获取access_token")
            result.add_error("初始化", "缺少access_token配置")
            return result

        provider = WeiboAPIProvider(config)
        result.initialized = True
        logger.info("✓ Provider 初始化成功")

        # 测试逻辑...

        await provider.close()

    except Exception as e:
        result.add_error("整体测试", str(e))
        logger.error(f"微博测试失败: {e}", exc_info=True)

    return result


async def test_bilibili() -> PlatformTestResult:
    """测试Bilibili平台"""
    result = PlatformTestResult('Bilibili')
    logger.info("\n" + "=" * 80)
    logger.info("测试平台: Bilibili")
    logger.info("=" * 80)

    try:
        logger.warning("⚠️  Bilibili Provider 尚未实现")
        logger.info("   需要实现的接口：")
        logger.info("   - 用户信息: https://api.bilibili.com/x/space/acc/info")
        logger.info("   - 视频列表: https://api.bilibili.com/x/space/arc/search")
        logger.info("   - 动态列表: https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space")
        result.add_error("初始化", "Provider未实现")

    except Exception as e:
        result.add_error("整体测试", str(e))
        logger.error(f"Bilibili测试失败: {e}", exc_info=True)

    return result


async def main():
    """主测试函数"""
    logger.info("\n" + "=" * 100)
    logger.info("多平台影响者数据提供者综合测试")
    logger.info("=" * 100)

    # 测试所有平台
    results = []

    # 知乎
    zhihu_result = await test_zhihu()
    results.append(zhihu_result)

    # 小红书
    xiaohongshu_result = await test_xiaohongshu()
    results.append(xiaohongshu_result)

    # 抖音
    douyin_result = await test_douyin()
    results.append(douyin_result)

    # 微博
    weibo_result = await test_weibo()
    results.append(weibo_result)

    # Bilibili
    bilibili_result = await test_bilibili()
    results.append(bilibili_result)

    # 打印总结
    logger.info("\n\n" + "=" * 100)
    logger.info("测试总结")
    logger.info("=" * 100)

    for result in results:
        logger.info(f"\n{result.platform}:")
        logger.info(f"  初始化: {'✓' if result.initialized else '✗'}")
        logger.info(f"  账号验证: {'✓' if result.account_validated else '✗'}")
        logger.info(f"  用户信息: {'✓' if result.user_info_fetched else '✗'}")
        logger.info(f"  内容获取: {'✓' if result.posts_fetched else '✗'}")
        if result.valid_account_id:
            logger.info(f"  有效账号: {result.valid_account_id}")
        if result.posts_count > 0:
            logger.info(f"  内容数量: {result.posts_count}")
        if result.errors:
            logger.info(f"  错误信息:")
            for error in result.errors:
                logger.info(f"    - {error}")

    # 统计
    logger.info("\n" + "=" * 100)
    success_count = sum(1 for r in results if r.is_success())
    total_count = len(results)
    logger.info(f"测试完成: {success_count}/{total_count} 个平台通过")

    if success_count == total_count:
        logger.info("🎉 所有平台测试通过！")
    else:
        logger.warning(f"⚠️  {total_count - success_count} 个平台测试失败")

    logger.info("=" * 100)

    return 0 if success_count > 0 else 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
