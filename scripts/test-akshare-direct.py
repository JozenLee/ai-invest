#!/usr/bin/env python3
"""
直接测试AKShare Provider的get_news方法
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

import asyncio


async def test_akshare_direct():
    """直接测试AKShareProvider"""

    from providers.akshare_provider import AKShareProvider

    provider = AKShareProvider()

    print("=" * 80)
    print("直接测试 AKShareProvider.get_news()")
    print("=" * 80)
    print()

    # 测试1: stock_news_em
    print("测试1: stock_news_em (财联社)")
    print("-" * 80)
    try:
        df = await provider.get_news(keyword="财联社", limit=5, api="stock_news_em")
        print(f"✅ 成功获取 {len(df)} 条数据")
        if not df.empty:
            print(f"字段: {list(df.columns)}")
            print(f"\n前3条数据:")
            print(df.head(3)[['新闻标题', '发布时间', '来源']].to_string())
    except Exception as e:
        print(f"❌ 失败: {e}")

    print("\n")

    # 测试2: stock_news_main_cx
    print("测试2: stock_news_main_cx (财新网)")
    print("-" * 80)
    try:
        df = await provider.get_news(keyword="", limit=5, api="stock_news_main_cx")
        print(f"✅ 成功获取 {len(df)} 条数据")
        if not df.empty:
            print(f"字段: {list(df.columns)}")
            print(f"\n前3条数据:")
            print(df.head(3)[['新闻标题', '发布时间', '来源']].to_string())
    except Exception as e:
        print(f"❌ 失败: {e}")

    print("\n")

    # 测试3: futures_news_shmet
    print("测试3: futures_news_shmet (上海金属网)")
    print("-" * 80)
    try:
        df = await provider.get_news(keyword="全部", limit=5, api="futures_news_shmet")
        print(f"✅ 成功获取 {len(df)} 条数据")
        if not df.empty:
            print(f"字段: {list(df.columns)}")
            print(f"\n前3条数据:")
            print(df.head(3)[['新闻标题', '发布时间', '来源']].to_string())
    except Exception as e:
        print(f"❌ 失败: {e}")


if __name__ == "__main__":
    asyncio.run(test_akshare_direct())
