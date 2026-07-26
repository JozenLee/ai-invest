#!/usr/bin/env python3
"""
快速修复历史数据的domainIds字段
只处理aiProcessed=1但domainIds为NULL的记录
"""

import sys
import os
import asyncio
import json

# 添加data-service目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime

# 加载环境变量
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)

from services.content_analyzer import content_analyzer
from db import db


async def fix_historical_domains():
    """修复历史数据的domainIds字段"""

    print("=" * 80)
    print("🔧 修复历史新闻的领域标签")
    print("=" * 80)
    print()

    # 查询需要修复的新闻（aiProcessed=1 但 domainIds 为 NULL）
    query = """
    SELECT id, title, content, category, sentiment, sentimentLabel
    FROM NewsArticle
    WHERE aiProcessed = 1 AND domainIds IS NULL
    ORDER BY aiProcessedAt DESC
    LIMIT 100
    """

    print("📊 查询需要修复的新闻...")

    async with db.get_connection() as conn:
        cursor = await conn.execute(query)
        articles = await cursor.fetchall()

    if not articles:
        print("✅ 没有需要修复的新闻")
        return

    print(f"📦 找到 {len(articles)} 条需要修复的新闻")
    print()

    fixed_count = 0
    irrelevant_count = 0

    for idx, article in enumerate(articles, 1):
        try:
            article_id = article[0]
            title = article[1]
            content = article[2] or ""

            print(f"[{idx}/{len(articles)}] 处理: {title[:50]}...")

            # 重新AI分析
            analysis = await content_analyzer._analyze_single_comprehensive(title, content)

            domains = analysis.get("domains", [])
            sentiment = analysis.get("sentiment")
            sentiment_label = analysis.get("sentimentLabel")

            # 更新数据库
            update_query = """
            UPDATE NewsArticle
            SET domainIds = ?,
                sentiment = ?,
                sentimentLabel = ?
            WHERE id = ?
            """

            domains_json = json.dumps(domains, ensure_ascii=False) if domains else None

            async with db.get_connection() as conn:
                await conn.execute(
                    update_query,
                    (domains_json, sentiment, sentiment_label, article_id)
                )

            fixed_count += 1

            if "irrelevant" in domains:
                irrelevant_count += 1
                print(f"   ✅ 标记为无影响: {domains}")
            else:
                print(f"   ✅ 领域: {domains}, 情感: {sentiment_label}")

        except Exception as e:
            print(f"   ❌ 失败: {e}")
            continue

    print()
    print("=" * 80)
    print(f"✅ 修复完成")
    print(f"   总处理: {len(articles)} 条")
    print(f"   成功修复: {fixed_count} 条")
    print(f"   无影响新闻: {irrelevant_count} 条")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(fix_historical_domains())
