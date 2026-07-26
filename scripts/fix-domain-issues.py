#!/usr/bin/env python3
"""
修复特定新闻的领域代码和影响力问题
1. new_energy → battery (宁德时代等)
2. irrelevant新闻的impact强制为1
"""

import sys
import os
import asyncio
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from pathlib import Path
from dotenv import load_dotenv

project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)

from db import db


async def fix_domain_issues():
    """修复领域代码和影响力问题"""

    print("=" * 80)
    print("🔧 修复领域代码和影响力问题")
    print("=" * 80)
    print()

    # 问题1: 修复 new_energy → battery
    print("📊 修复问题1: new_energy → battery")
    query1 = """
    SELECT id, title, domainIds
    FROM NewsArticle
    WHERE domainIds LIKE '%"new_energy"%'
    """

    async with db.get_connection() as conn:
        cursor = await conn.execute(query1)
        articles = await cursor.fetchall()

    if articles:
        print(f"   找到 {len(articles)} 条需要修复的new_energy新闻")
        for article in articles:
            article_id, title, domain_ids_str = article
            try:
                domains = json.loads(domain_ids_str) if domain_ids_str else []
                # 替换 new_energy 为 battery
                new_domains = ["battery" if d == "new_energy" else d for d in domains]

                update_query = "UPDATE NewsArticle SET domainIds = ? WHERE id = ?"
                async with db.get_connection() as conn:
                    await conn.execute(update_query, (json.dumps(new_domains, ensure_ascii=False), article_id))

                print(f"   ✅ {title[:50]}...")
                print(f"      {domains} → {new_domains}")
            except Exception as e:
                print(f"   ❌ 失败: {e}")
    else:
        print("   ✅ 没有需要修复的new_energy新闻")

    print()

    # 问题2: irrelevant新闻的impact强制为1
    print("📊 修复问题2: irrelevant新闻的impact强制为1")
    query2 = """
    SELECT id, title, domainIds, impact
    FROM NewsArticle
    WHERE domainIds LIKE '%"irrelevant"%' AND impact > 1
    """

    async with db.get_connection() as conn:
        cursor = await conn.execute(query2)
        articles = await cursor.fetchall()

    if articles:
        print(f"   找到 {len(articles)} 条irrelevant新闻但impact>1")
        for article in articles:
            article_id, title, domain_ids_str, impact = article
            try:
                update_query = "UPDATE NewsArticle SET impact = 1 WHERE id = ?"
                async with db.get_connection() as conn:
                    await conn.execute(update_query, (article_id,))

                print(f"   ✅ {title[:50]}...")
                print(f"      impact: {impact} → 1")
            except Exception as e:
                print(f"   ❌ 失败: {e}")
    else:
        print("   ✅ 没有需要修复的irrelevant新闻")

    print()
    print("=" * 80)
    print("✅ 修复完成")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(fix_domain_issues())
