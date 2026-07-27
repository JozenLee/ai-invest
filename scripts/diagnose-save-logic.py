#!/usr/bin/env python3
"""
诊断保存逻辑问题
模拟完整的采集和保存流程
"""

import asyncio
import json
import sys
import os
import hashlib
from datetime import datetime, timedelta

# Add data-service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from providers.bilibili_provider import BilibiliAPIProvider
from db import db


async def diagnose_save_logic():
    """诊断保存逻辑"""

    influencer_id = "inf_1785044475094355"
    account_id = "72844725"
    platform = "bilibili"

    print("=" * 60)
    print("诊断保存逻辑问题")
    print("=" * 60)

    # 1. 获取现有动态的哈希
    print("\n[1] 获取现有动态的内容哈希")
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT content FROM InfluencerPost WHERE influencerId = ?",
            (influencer_id,)
        )
        existing_posts = await cursor.fetchall()

    existing_hashes = set()
    for post in existing_posts:
        content = post['content']
        unique_string = f"{platform}:{account_id}:{content}"
        content_hash = hashlib.md5(unique_string.encode('utf-8')).hexdigest()
        existing_hashes.add(content_hash)
        content_preview = content[:30] + "..." if len(content) > 30 else content
        print(f"   现有哈希 {content_hash[:8]}: {content_preview}")

    # 2. 获取平台配置并调用 API
    print("\n[2] 调用 Bilibili API")
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT configData FROM PlatformConfig WHERE platform = 'bilibili' AND isActive = 1"
        )
        config_row = await cursor.fetchone()

    config = json.loads(config_row['configData']) if config_row else {}
    provider = BilibiliAPIProvider(config)

    since = datetime.now() - timedelta(days=30)
    posts = await provider.fetch_user_posts(
        account_id=account_id,
        since=since,
        limit=100
    )

    print(f"   API 返回: {len(posts)} 条动态")

    # 3. 模拟去重和保存逻辑
    print("\n[3] 模拟去重和保存逻辑")
    duplicates_skipped = 0
    posts_new = 0
    empty_content_count = 0

    for i, post in enumerate(posts, 1):
        content = post.get('content', '')
        pub_time = post.get('publish_time')

        # 计算哈希
        unique_string = f"{platform}:{account_id}:{content}"
        content_hash = hashlib.md5(unique_string.encode('utf-8')).hexdigest()

        # 检查内容
        if not content:
            empty_content_count += 1
            print(f"   [{i}] 空内容 - 哈希: {content_hash[:8]} - 时间: {pub_time}")
        else:
            content_preview = content[:40] + "..." if len(content) > 40 else content
            print(f"   [{i}] 有内容 - 哈希: {content_hash[:8]} - 时间: {pub_time}")
            print(f"        内容: {content_preview}")

        # 检查是否重复
        if content_hash in existing_hashes:
            duplicates_skipped += 1
            print(f"        ❌ 跳过（重复哈希）")
        else:
            posts_new += 1
            existing_hashes.add(content_hash)
            print(f"        ✅ 应该保存")

    # 4. 总结
    print("\n" + "=" * 60)
    print("诊断结论:")
    print("=" * 60)
    print(f"  API 返回动态数: {len(posts)}")
    print(f"  空内容动态数: {empty_content_count}")
    print(f"  有内容动态数: {len(posts) - empty_content_count}")
    print(f"  重复跳过数: {duplicates_skipped}")
    print(f"  应该新增数: {posts_new}")

    if empty_content_count > 0:
        print(f"\n⚠️  发现 {empty_content_count} 条空内容动态")
        print("   原因: Bilibili API 返回的某些动态类型我们尚未支持解析")
        print("   建议: 需要分析这些动态的类型，扩展 _parse_dynamic 方法")

    # 计算空内容的唯一哈希
    empty_hash = hashlib.md5(f"{platform}:{account_id}:".encode('utf-8')).hexdigest()
    print(f"\n空内容的统一哈希: {empty_hash}")
    print(f"如果多条空内容动态，第一条之后的都会被当作重复")


if __name__ == "__main__":
    asyncio.run(diagnose_save_logic())
