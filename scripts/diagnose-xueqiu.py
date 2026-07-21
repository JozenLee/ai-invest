#!/usr/bin/env python3
"""
雪球数据源诊断脚本
检查为什么采集了10条数据但成功处理0条，且资讯流页面没有数据
"""

import sys
import os
import asyncio
import aiosqlite
from datetime import datetime

# 设置路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'prisma', 'dev.db')

async def diagnose():
    print("=" * 60)
    print("雪球数据源诊断")
    print("=" * 60)

    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row

    try:
        # 1. 检查雪球数据源配置
        print("\n【1】雪球数据源配置")
        print("-" * 60)
        cursor = await conn.execute("""
            SELECT id, name, type, provider, driverType, category, isActive,
                   lastFetchAt, lastFetchStatus, errorMessage
            FROM DataSource
            WHERE name LIKE '%雪球%' OR provider = 'xueqiu'
        """)
        sources = await cursor.fetchall()

        if not sources:
            print("❌ 未找到雪球数据源")
            print("\n所有数据源：")
            cursor = await conn.execute("SELECT name, provider FROM DataSource LIMIT 10")
            all_sources = await cursor.fetchall()
            for s in all_sources:
                print(f"  - {s['name']} (provider: {s['provider']})")
            return

        xueqiu_source = dict(sources[0])
        source_id = xueqiu_source['id']

        print(f"✅ 找到雪球数据源")
        print(f"  ID: {source_id}")
        print(f"  名称: {xueqiu_source['name']}")
        print(f"  类型: {xueqiu_source['type']}")
        print(f"  Provider: {xueqiu_source['provider']}")
        print(f"  驱动类型: {xueqiu_source['driverType']}")
        print(f"  分类: {xueqiu_source['category']}")
        print(f"  激活状态: {'✅ 已激活' if xueqiu_source['isActive'] else '❌ 未激活'}")
        print(f"  最后采集: {xueqiu_source['lastFetchAt']}")
        print(f"  最后状态: {xueqiu_source['lastFetchStatus']}")
        if xueqiu_source['errorMessage']:
            print(f"  错误信息: {xueqiu_source['errorMessage']}")

        # 2. 检查采集日志
        print("\n【2】最近5条采集日志")
        print("-" * 60)
        cursor = await conn.execute("""
            SELECT id, status, message, fetchedCount, processedCount, failedCount,
                   duration, errorDetail, createdAt
            FROM DataSourceLog
            WHERE sourceId = ?
            ORDER BY createdAt DESC
            LIMIT 5
        """, (source_id,))
        logs = await cursor.fetchall()

        if not logs:
            print("❌ 没有采集日志")
        else:
            for i, log in enumerate(logs, 1):
                print(f"\n日志 {i}:")
                print(f"  时间: {log['createdAt']}")
                print(f"  状态: {log['status']}")
                print(f"  消息: {log['message']}")
                print(f"  采集数: {log['fetchedCount']}")
                print(f"  成功处理: {log['processedCount']}")
                print(f"  失败数: {log['failedCount']}")
                print(f"  耗时: {log['duration']}ms")

                # 关键问题：采集了10条但处理成功0条
                if log['fetchedCount'] > 0 and log['processedCount'] == 0:
                    print(f"  ⚠️ 问题：采集了 {log['fetchedCount']} 条数据但处理成功 0 条！")
                    if log['errorDetail']:
                        print(f"  错误详情: {log['errorDetail'][:300]}")

        # 3. 检查新闻文章表
        print("\n【3】雪球来源的新闻文章")
        print("-" * 60)

        # 按sourceId查询
        cursor = await conn.execute("""
            SELECT COUNT(*) as count FROM NewsArticle WHERE sourceId = ?
        """, (source_id,))
        count_by_source_id = (await cursor.fetchone())['count']
        print(f"按 sourceId 查询: {count_by_source_id} 条")

        # 按source字段查询
        cursor = await conn.execute("""
            SELECT COUNT(*) as count FROM NewsArticle WHERE source LIKE '%雪球%'
        """)
        count_by_source_name = (await cursor.fetchone())['count']
        print(f"按 source 字段查询: {count_by_source_name} 条")

        if count_by_source_id == 0 and count_by_source_name == 0:
            print("❌ 数据库中没有雪球来源的新闻文章")
            print("\n可能的原因：")
            print("  1. 数据采集后没有成功写入数据库")
            print("  2. AI处理失败导致数据被过滤")
            print("  3. 数据去重时被判定为已存在")
            print("  4. 写入数据库时发生异常")
        else:
            print(f"✅ 找到 {max(count_by_source_id, count_by_source_name)} 条新闻")

            # 显示最新的3条
            cursor = await conn.execute("""
                SELECT id, title, source, publishTime, aiProcessed, aiError, createdAt
                FROM NewsArticle
                WHERE sourceId = ?
                ORDER BY createdAt DESC
                LIMIT 3
            """, (source_id,))
            articles = await cursor.fetchall()

            print("\n最新3条文章:")
            for i, article in enumerate(articles, 1):
                print(f"\n  {i}. {article['title'][:60]}...")
                print(f"     来源: {article['source']}")
                print(f"     发布时间: {article['publishTime']}")
                print(f"     AI处理: {'✅' if article['aiProcessed'] else '❌'}")
                if article['aiError']:
                    print(f"     AI错误: {article['aiError'][:100]}")

        # 4. 检查数据源配置
        print("\n【4】数据源驱动配置")
        print("-" * 60)
        cursor = await conn.execute("""
            SELECT config, configSchema FROM DataSource WHERE id = ?
        """, (source_id,))
        config_row = await cursor.fetchone()
        if config_row and config_row['config']:
            import json
            try:
                config = json.loads(config_row['config'])
                print("配置内容:")
                print(json.dumps(config, indent=2, ensure_ascii=False))
            except:
                print(f"配置(原始): {config_row['config']}")
        else:
            print("❌ 没有配置信息")

        # 5. 检查采集任务调度
        print("\n【5】调度任务配置")
        print("-" * 60)
        cursor = await conn.execute("""
            SELECT id, scheduleType, scheduleConfig, isEnabled, lastRunAt, nextRunAt
            FROM SchedulerJob
            WHERE sourceId = ?
        """, (source_id,))
        jobs = await cursor.fetchall()

        if not jobs:
            print("❌ 没有配置调度任务")
        else:
            for job in jobs:
                print(f"  任务ID: {job['id']}")
                print(f"  调度类型: {job['scheduleType']}")
                print(f"  配置: {job['scheduleConfig']}")
                print(f"  启用状态: {'✅' if job['isEnabled'] else '❌'}")
                print(f"  上次运行: {job['lastRunAt']}")
                print(f"  下次运行: {job['nextRunAt']}")

        # 6. 问题总结
        print("\n" + "=" * 60)
        print("问题诊断总结")
        print("=" * 60)

        if logs and logs[0]['fetchedCount'] > 0 and logs[0]['processedCount'] == 0:
            print("\n❌ 核心问题：数据采集成功，但AI处理和存储失败")
            print("\n可能原因：")
            print("  1. fetch_service.py 的 _process_with_ai() 方法失败")
            print("  2. content_analyzer 服务不可用或API调用失败")
            print("  3. _store_to_database() 方法写入失败但没有抛出异常")
            print("  4. 数据格式不符合数据库schema要求")

            print("\n建议检查：")
            print("  1. 查看 data-service 日志中的详细错误信息")
            print("  2. 检查 ANTHROPIC_API_KEY 是否配置正确")
            print("  3. 验证 content_analyzer 服务是否正常工作")
            print("  4. 检查数据库约束（如 UNIQUE constraint）")

        if count_by_source_id == 0:
            print("\n❌ 资讯流页面没有数据的原因：数据库中没有对应的记录")
            print("\n前端查询逻辑：")
            print("  - event.service.ts 优先从本地数据库读取")
            print("  - 使用 sourceId 字段进行筛选")
            print("  - 如果本地无数据，会降级到 Python 服务")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(diagnose())
