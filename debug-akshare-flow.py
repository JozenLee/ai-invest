"""
调试AKShare数据采集流程
找出数据被过滤的具体位置
"""
import sys
sys.path.insert(0, 'data-service')

import asyncio
import json
from datetime import datetime
from providers.akshare_provider import AKShareProvider

async def main():
    print("=" * 80)
    print("AKShare数据采集流程调试")
    print("=" * 80)

    # 步骤1: 获取原始数据
    print("\n步骤1: 获取原始数据")
    print("-" * 80)
    provider = AKShareProvider()
    df = await provider.get_news(keyword="AI", limit=3, api="stock_news_em")

    if df.empty:
        print("❌ 未获取到数据")
        return

    raw_data = []
    for idx, row in df.iterrows():
        item = {
            "title": row['新闻标题'],
            "content": row['新闻内容'],
            "url": row.get('新闻链接', ''),
            "publishTime": row['发布时间'],
            "source": row.get('来源', '未知')
        }
        raw_data.append(item)
        print(f"  {idx+1}. {item['title'][:40]}...")
        print(f"     发布时间: {item['publishTime']}")
        print(f"     URL: {item['url'][:50]}...")

    print(f"\n✅ 获取到 {len(raw_data)} 条原始数据")

    # 步骤2: 简单规则处理
    print("\n步骤2: 简单规则处理")
    print("-" * 80)
    from services.fetch_service import FetchService
    fetch_service = FetchService()

    processed_data = fetch_service._simple_process(raw_data)
    print(f"✅ 处理后得到 {len(processed_data)} 条数据")

    for idx, item in enumerate(processed_data[:3]):
        print(f"\n  {idx+1}. {item['title'][:40]}...")
        print(f"     分类: {item.get('category')}")
        print(f"     情感: {item.get('sentiment')} ({item.get('sentimentLabel')})")
        print(f"     板块: {item.get('sectors')}")
        print(f"     领域IDs: {item.get('domainIds', [])}")

    # 步骤3: 领域筛选（如果有配置）
    print("\n步骤3: 检查领域筛选")
    print("-" * 80)

    # 模拟数据源配置（无领域筛选）
    domain_filter_config = None

    if domain_filter_config and domain_filter_config.get('enabled'):
        print(f"  领域筛选已启用")
        print(f"  模式: {domain_filter_config.get('mode')}")
        print(f"  领域IDs: {domain_filter_config.get('domainIds')}")

        filtered_data = fetch_service.apply_domain_filter(processed_data, domain_filter_config)
        print(f"✅ 筛选后剩余 {len(filtered_data)} 条数据")
    else:
        print("  ℹ️  领域筛选未启用")
        filtered_data = processed_data

    # 步骤4: 准备存储数据
    print("\n步骤4: 准备存储数据")
    print("-" * 80)

    for idx, item in enumerate(filtered_data[:3]):
        print(f"\n  {idx+1}. 准备存储:")
        print(f"     标题: {item['title'][:40]}...")
        print(f"     发布时间: {item['publishTime']}")
        print(f"     URL: {item.get('url', '')[:50]}...")
        print(f"     分类: {item.get('category')}")
        print(f"     来源: {item.get('source')}")

        # 检查URL是否存在
        url = item.get('url', '')
        if url:
            from db import db
            exists = await db.check_article_exists(url)
            if exists:
                print(f"     ⚠️  URL已存在，会被跳过")
            else:
                print(f"     ✅ URL不存在，可以插入")
        else:
            print(f"     ⚠️  没有URL")

    print("\n" + "=" * 80)
    print("调试完成")
    print("=" * 80)

    # 总结
    print(f"\n总结:")
    print(f"  原始数据: {len(raw_data)}条")
    print(f"  处理后: {len(processed_data)}条")
    print(f"  筛选后: {len(filtered_data)}条")

    if len(filtered_data) == 0 and len(raw_data) > 0:
        print(f"\n❌ 问题: 数据被完全过滤！")
    elif len(filtered_data) > 0:
        print(f"\n✅ 有 {len(filtered_data)} 条数据准备存储")

if __name__ == "__main__":
    asyncio.run(main())
