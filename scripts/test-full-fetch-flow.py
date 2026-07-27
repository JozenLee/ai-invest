#!/usr/bin/env python3
"""
测试完整的采集流程
直接调用 InfluencerFetchService
"""

import asyncio
import sys
import os

# Add data-service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from services.influencer_fetch_service import InfluencerFetchService
from db import db


async def test_fetch():
    """测试采集流程"""

    influencer_id = "inf_1785044475094355"

    print("=" * 60)
    print("测试完整采集流程")
    print("=" * 60)

    # 查看采集前的数据
    print("\n[采集前] 数据库中的动态数")
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT COUNT(*) as count FROM InfluencerPost WHERE influencerId = ?",
            (influencer_id,)
        )
        row = await cursor.fetchone()
        before_count = row['count']
        print(f"   动态数: {before_count}")

    # 调用采集服务
    print("\n[执行采集]")
    fetch_service = InfluencerFetchService(db)
    result = await fetch_service.fetch_influencer_posts(influencer_id)

    print(f"\n采集结果:")
    print(f"   success: {result['success']}")
    print(f"   posts_fetched: {result['posts_fetched']}")
    print(f"   posts_new: {result['posts_new']}")
    print(f"   error: {result.get('error')}")
    print(f"   elapsed: {result['elapsed_seconds']:.2f}s")

    # 查看采集后的数据
    print("\n[采集后] 数据库中的动态数")
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT COUNT(*) as count FROM InfluencerPost WHERE influencerId = ?",
            (influencer_id,)
        )
        row = await cursor.fetchone()
        after_count = row['count']
        print(f"   动态数: {after_count}")
        print(f"   新增: {after_count - before_count}")

    # 显示最新的动态
    print("\n[最新动态]")
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT publishTime, substr(content, 1, 50) as content_preview FROM InfluencerPost WHERE influencerId = ? ORDER BY publishTime DESC LIMIT 5",
            (influencer_id,)
        )
        rows = await cursor.fetchall()

        for row in rows:
            print(f"   {row['publishTime']}: {row['content_preview']}")


if __name__ == "__main__":
    asyncio.run(test_fetch())
