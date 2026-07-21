#!/usr/bin/env python3
"""
测试AKShare数据源采集流程
验证: 配置 → 采集 → AI处理 → 存储 → 展示
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

import asyncio
from services.fetch_service import fetch_service


async def test_akshare_fetch():
    """测试AKShare数据源采集"""

    print("=" * 80)
    print("AKShare 数据源采集流程测试")
    print("=" * 80)
    print()

    # 测试1: 财联社新闻 (stock_news_em)
    print("测试1: 财联社-AKShare (stock_news_em)")
    print("-" * 80)

    result1 = await fetch_service.execute_fetch_task(
        source_id="ds_akshare_cailian",
        source_config={
            "provider": "akshare",
            "driverType": "api",
            "api": "stock_news_em",
            "keyword": "财联社",
            "limit": 10
        }
    )

    print(f"\n结果:")
    print(f"  成功: {result1.get('success')}")
    print(f"  采集数量: {result1.get('fetched_count', 0)}")
    print(f"  AI处理成功: {result1.get('processed_count', 0)}")
    print(f"  AI处理失败: {result1.get('failed_count', 0)}")
    print(f"  存储数量: {result1.get('stored_count', 0)}")
    print(f"  耗时: {result1.get('duration_ms', 0)}ms")

    if not result1.get('success'):
        print(f"  错误: {result1.get('error')}")

    print()

    # 测试2: AI资讯 (stock_news_em)
    print("测试2: AI资讯-AKShare (stock_news_em)")
    print("-" * 80)

    result2 = await fetch_service.execute_fetch_task(
        source_id="ds_akshare_ai",
        source_config={
            "provider": "akshare",
            "driverType": "api",
            "api": "stock_news_em",
            "keyword": "AI",
            "limit": 10
        }
    )

    print(f"\n结果:")
    print(f"  成功: {result2.get('success')}")
    print(f"  采集数量: {result2.get('fetched_count', 0)}")
    print(f"  AI处理成功: {result2.get('processed_count', 0)}")
    print(f"  AI处理失败: {result2.get('failed_count', 0)}")
    print(f"  存储数量: {result2.get('stored_count', 0)}")
    print(f"  耗时: {result2.get('duration_ms', 0)}ms")

    if not result2.get('success'):
        print(f"  错误: {result2.get('error')}")

    print()

    # 测试3: 财新网 (stock_news_main_cx)
    print("测试3: 财新网-AKShare (stock_news_main_cx)")
    print("-" * 80)

    result3 = await fetch_service.execute_fetch_task(
        source_id="ds_akshare_caixin",
        source_config={
            "provider": "akshare",
            "driverType": "api",
            "api": "stock_news_main_cx",
            "limit": 10
        }
    )

    print(f"\n结果:")
    print(f"  成功: {result3.get('success')}")
    print(f"  采集数量: {result3.get('fetched_count', 0)}")
    print(f"  AI处理成功: {result3.get('processed_count', 0)}")
    print(f"  AI处理失败: {result3.get('failed_count', 0)}")
    print(f"  存储数量: {result3.get('stored_count', 0)}")
    print(f"  耗时: {result3.get('duration_ms', 0)}ms")

    if not result3.get('success'):
        print(f"  错误: {result3.get('error')}")

    print()

    # 汇总
    print("=" * 80)
    print("测试汇总")
    print("=" * 80)

    total_success = sum([
        1 if result1.get('success') else 0,
        1 if result2.get('success') else 0,
        1 if result3.get('success') else 0,
    ])

    total_fetched = sum([
        result1.get('fetched_count', 0),
        result2.get('fetched_count', 0),
        result3.get('fetched_count', 0),
    ])

    total_stored = sum([
        result1.get('stored_count', 0),
        result2.get('stored_count', 0),
        result3.get('stored_count', 0),
    ])

    print(f"成功测试: {total_success}/3")
    print(f"总采集数量: {total_fetched}")
    print(f"总存储数量: {total_stored}")
    print()

    if total_success == 3:
        print("✅ 所有测试通过！AKShare数据源集成成功！")
    else:
        print("⚠️ 部分测试失败，请检查日志")

    print()


if __name__ == "__main__":
    asyncio.run(test_akshare_fetch())
