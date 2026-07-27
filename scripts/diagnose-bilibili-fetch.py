#!/usr/bin/env python3
"""
诊断 Bilibili 数据采集问题
直接调用 Bilibili API 并检查返回的动态数量
"""

import asyncio
import json
import sys
import os
from datetime import datetime, timedelta

# Add data-service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from providers.bilibili_provider import BilibiliAPIProvider
from db import db


async def diagnose_fetch():
    """诊断采集问题"""

    influencer_id = "inf_1785044475094355"
    account_id = "72844725"

    print("=" * 60)
    print("诊断 Bilibili 数据采集问题")
    print("=" * 60)

    # 1. 检查数据库中的现有数据
    print("\n[1] 检查数据库中的现有数据")
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT id, content, publishTime FROM InfluencerPost WHERE influencerId = ? ORDER BY publishTime DESC",
            (influencer_id,)
        )
        existing_posts = await cursor.fetchall()

    print(f"   数据库中现有动态数: {len(existing_posts)}")
    for post in existing_posts:
        content_preview = post['content'][:50] + "..." if len(post['content']) > 50 else post['content']
        print(f"   - {post['publishTime']}: {content_preview}")

    # 2. 获取平台配置
    print("\n[2] 获取 Bilibili 平台配置")
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT configData FROM PlatformConfig WHERE platform = 'bilibili' AND isActive = 1"
        )
        config_row = await cursor.fetchone()

    if config_row:
        config = json.loads(config_row['configData'])
        print(f"   ✓ 找到平台配置")
        print(f"   Cookie配置: {'已配置' if config.get('cookies') or config.get('cookie_str') else '未配置'}")
    else:
        print("   ✗ 未找到平台配置，使用空配置")
        config = {}

    # 3. 调用 Provider 获取动态
    print("\n[3] 调用 Bilibili API 获取动态")
    provider = BilibiliAPIProvider(config)

    # 计算30天前的时间
    since = datetime.now() - timedelta(days=30)
    print(f"   获取时间范围: {since.isoformat()} 至今")

    posts = await provider.fetch_user_posts(
        account_id=account_id,
        since=since,
        limit=100
    )

    print(f"   API 返回动态数: {len(posts)}")

    # 4. 显示获取到的动态详情
    print("\n[4] 获取到的动态详情")
    for i, post in enumerate(posts, 1):
        pub_time = post.get('publish_time')
        content = post.get('content', '')
        content_preview = content[:50] + "..." if len(content) > 50 else content

        pub_time_str = pub_time.isoformat() if pub_time else "无时间戳"
        print(f"   {i}. {pub_time_str}: {content_preview}")

    # 5. 检查去重逻辑
    print("\n[5] 检查去重逻辑")

    # 模拟去重
    import hashlib

    # 获取现有内容的哈希
    existing_hashes = set()
    for post in existing_posts:
        unique_string = f"bilibili:{account_id}:{post['content']}"
        content_hash = hashlib.md5(unique_string.encode('utf-8')).hexdigest()
        existing_hashes.add(content_hash)

    print(f"   现有内容哈希数: {len(existing_hashes)}")

    # 检查新获取的动态
    new_count = 0
    duplicate_count = 0

    for post in posts:
        content = post.get('content', '')
        unique_string = f"bilibili:{account_id}:{content}"
        content_hash = hashlib.md5(unique_string.encode('utf-8')).hexdigest()

        if content_hash in existing_hashes:
            duplicate_count += 1
            content_preview = content[:30] + "..." if len(content) > 30 else content
            print(f"   重复: {content_preview}")
        else:
            new_count += 1
            existing_hashes.add(content_hash)

    print(f"\n   新动态数: {new_count}")
    print(f"   重复动态数: {duplicate_count}")

    # 6. 结论
    print("\n" + "=" * 60)
    print("诊断结论:")
    print("=" * 60)

    if len(posts) == 0:
        print("✗ Bilibili API 没有返回任何动态")
        print("  可能原因: Cookie失效、账号不存在、API限流")
    elif new_count == 0 and len(posts) > 0:
        print("✗ API返回了动态，但全部是重复内容")
        print("  可能原因: 去重逻辑有问题，或者确实没有新动态")
    elif new_count > 0:
        print(f"✓ 发现 {new_count} 条新动态应该被保存")
        print("  但实际没有保存，需要检查保存逻辑")

    print("\n数据链路总结:")
    print(f"  1. Bilibili API 返回: {len(posts)} 条")
    print(f"  2. 去重后应保存: {new_count} 条")
    print(f"  3. 数据库中实际: {len(existing_posts)} 条")
    print(f"  4. 差异: {new_count} 条动态未被保存")


if __name__ == "__main__":
    asyncio.run(diagnose_fetch())
