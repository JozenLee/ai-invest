"""
Test script for Alipay Provider

使用方法：
  python test_alipay_provider.py

测试内容：
  1. Provider 初始化
  2. 验证账号存在性
  3. 获取生活号信息
  4. 获取文章列表
"""

import asyncio
import logging
from providers.alipay_provider import AlipayAPIProvider

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_alipay_provider():
    """测试支付宝生活号 Provider"""

    print("=" * 60)
    print("支付宝生活号 Provider 测试 - 米姐养基")
    print("=" * 60)

    # 初始化配置
    config = {
        'platform': 'alipay',
        'driver_type': 'api',
        'timeout': 15,
        'max_retries': 3,
        'retry_delay': 2,
        # 官方 API 配置（如果有企业认证）
        # 'app_id': 'your_app_id',
        # 'private_key': 'your_private_key',
        # 'alipay_public_key': 'alipay_public_key',
    }

    # 创建 Provider 实例
    provider = AlipayAPIProvider(config)

    # 测试账号：米姐养基
    # 注意：需要找到米姐养基的正确生活号ID
    # 可能的ID格式包括：数字ID、拼音、特殊标识符
    test_accounts = [
        'mijieyangjijijin',      # 拼音全称
        'mijie-yangji',          # 拼音-连字符
        'mijieyangji',           # 拼音简写
        '2088102180560853',      # 可能的数字ID（需确认）
        'fundmijie',             # 英文标识
    ]

    print("\n" + "=" * 60)
    print("Test 1: Validate Account")
    print("=" * 60)

    valid_account = None
    for account_id in test_accounts:
        print(f"\nValidating account: {account_id}")
        try:
            is_valid = await provider.validate_account(account_id)
            print(f"  Result: {'✓ Valid' if is_valid else '✗ Invalid'}")
            if is_valid and not valid_account:
                valid_account = account_id
                print(f"  ✓ 找到有效账号: {account_id}")
        except Exception as e:
            print(f"  Error: {e}")

    # 如果没找到有效账号，给出提示
    if not valid_account:
        print("\n❌ 未找到有效的支付宝生活号ID")
        print("\n获取正确ID的方法：")
        print("1. 打开支付宝APP，搜索'米姐养基'")
        print("2. 进入生活号主页")
        print("3. 分享生活号，查看URL中的ID参数")
        print("4. 或在浏览器中打开支付宝生活号页面查看URL")
        await provider.close()
        return

    # 选择有效账号进行深入测试
    test_account = valid_account

    print("\n" + "=" * 60)
    print("Test 2: Fetch User Info")
    print("=" * 60)
    print(f"\nFetching info for: {test_account}")

    try:
        user_info = await provider.fetch_user_info(test_account)
        if user_info:
            print("\nUser Info:")
            print(f"  Name: {user_info.get('name', 'N/A')}")
            print(f"  Description: {user_info.get('description', 'N/A')[:100]}")
            print(f"  Avatar URL: {user_info.get('avatar_url', 'N/A')}")
            print(f"  Verified: {user_info.get('verified', False)}")
            print(f"  Followers: {user_info.get('followers_count', 0)}")
            print(f"  Profile URL: {user_info.get('profile_url', 'N/A')}")
        else:
            print("  No user info returned")
    except Exception as e:
        print(f"  Error: {e}")
        logger.exception("Error fetching user info")

    print("\n" + "=" * 60)
    print("Test 3: Fetch User Posts")
    print("=" * 60)
    print(f"\nFetching posts for: {test_account}")

    try:
        posts = await provider.fetch_user_posts(
            account_id=test_account,
            since=None,
            limit=10
        )

        print(f"\nFetched {len(posts)} posts")

        for i, post in enumerate(posts[:3], 1):  # 只显示前3篇
            print(f"\nPost #{i}:")
            print(f"  Content: {post.get('content', 'N/A')[:100]}...")
            print(f"  URL: {post.get('url', 'N/A')}")
            print(f"  Published: {post.get('publish_time', 'N/A')}")
            print(f"  Media Type: {post.get('media_type', 'N/A')}")
            print(f"  Likes: {post.get('likes', 0)}")
            print(f"  Comments: {post.get('comments', 0)}")
            print(f"  Shares: {post.get('shares', 0)}")

            # 显示支付宝特有字段
            extra = post.get('extra', {})
            if extra:
                print(f"  Article Type: {extra.get('articleType', 'N/A')}")
                print(f"  Category: {extra.get('category', 'N/A')}")
                print(f"  Has Service: {extra.get('hasService', False)}")

        if len(posts) > 3:
            print(f"\n  ... and {len(posts) - 3} more posts")

    except Exception as e:
        print(f"  Error: {e}")
        logger.exception("Error fetching posts")

    # 关闭 provider
    await provider.close()

    print("\n" + "=" * 60)
    print("Test Complete")
    print("=" * 60)
    print("\n注意事项：")
    print("1. 当前使用公开接口，不需要官方 API 认证")
    print("2. 如果返回空数据，可能需要调整 API URL 或参数")
    print("3. 官方 API 需要企业认证，暂未实现")
    print("4. 请求频率限制：1 req/2s")


if __name__ == '__main__':
    asyncio.run(test_alipay_provider())
