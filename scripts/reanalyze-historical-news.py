#!/usr/bin/env python3
"""
重新分析历史新闻数据
对 aiProcessed=0 或数据不完整的历史新闻进行AI分析
"""

import asyncio
import sqlite3
import sys
import os
from datetime import datetime
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent
data_service_path = project_root / "data-service"
sys.path.insert(0, str(data_service_path))

# 切换到项目根目录
os.chdir(project_root)

from services.content_analyzer import content_analyzer

DB_PATH = "prisma/dev.db"
BATCH_SIZE = 50  # 每批处理50条
MAX_TOTAL = 500  # 最多处理500条（避免过多API调用）

def get_unprocessed_news(limit=BATCH_SIZE):
    """获取未处理或数据不完整的新闻"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            id, title, content, summary, category,
            sentimentLabel, impact, aiProcessed
        FROM NewsArticle
        WHERE (
            aiProcessed = 0
            OR summary = title
            OR category IS NULL
            OR impact IS NULL
        )
        ORDER BY publishTime DESC
        LIMIT ?
    """, (limit,))

    results = cursor.fetchall()
    conn.close()

    return results

def update_news_analysis(news_id, analysis):
    """更新新闻AI分析结果"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        import json

        cursor.execute("""
            UPDATE NewsArticle
            SET
                summary = ?,
                category = ?,
                sentiment = ?,
                sentimentLabel = ?,
                sentimentConfidence = ?,
                impact = ?,
                keywords = ?,
                aiProcessed = 1,
                aiProcessedAt = ?
            WHERE id = ?
        """, (
            analysis.get("summary"),
            analysis.get("category"),
            analysis.get("sentiment"),
            analysis.get("sentimentLabel"),
            analysis.get("sentimentConfidence"),
            analysis.get("impact"),
            json.dumps(analysis.get("keywords", []), ensure_ascii=False) if analysis.get("keywords") else None,
            datetime.utcnow().isoformat(),
            news_id
        ))

        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 更新失败: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

async def reanalyze_batch(batch):
    """重新分析一批新闻"""
    news_list = []
    for row in batch:
        news_list.append({
            "title": row[1],
            "content": row[2] or row[1]  # 如果没有content，使用title
        })

    # 批量AI分析
    try:
        results = await content_analyzer.analyze_news_batch(news_list, batch_size=10)
        return results
    except Exception as e:
        print(f"❌ AI分析失败: {e}")
        return []

async def main():
    print("=" * 80)
    print("历史新闻重新分析工具")
    print("=" * 80)
    print(f"执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # 统计待处理数量
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) FROM NewsArticle
        WHERE aiProcessed = 0
           OR summary = title
           OR category IS NULL
           OR impact IS NULL
    """)
    total_unprocessed = cursor.fetchone()[0]
    conn.close()

    print(f"待处理新闻总数: {total_unprocessed}")
    print(f"本次最多处理: {MAX_TOTAL} 条")
    print(f"批次大小: {BATCH_SIZE} 条")
    print()

    if total_unprocessed == 0:
        print("✅ 所有新闻已处理完毕！")
        return

    # 确认执行
    user_input = input(f"是否开始重新分析？这将调用AI API，可能产生费用。(y/n): ")
    if user_input.lower() != 'y':
        print("取消执行")
        return

    print()
    print("开始重新分析...")
    print()

    processed_count = 0
    success_count = 0
    failed_count = 0

    while processed_count < MAX_TOTAL:
        # 获取一批未处理的新闻
        batch = get_unprocessed_news(BATCH_SIZE)

        if not batch:
            print("✅ 所有新闻已处理完毕！")
            break

        print(f"正在处理第 {processed_count + 1}-{processed_count + len(batch)} 条...")

        # AI分析
        results = await reanalyze_batch(batch)

        # 更新数据库
        for i, row in enumerate(batch):
            news_id = row[0]
            title = row[1][:50]

            if i < len(results):
                analysis = results[i]
                if update_news_analysis(news_id, analysis):
                    success_count += 1
                    print(f"  ✅ {success_count}. {title}...")
                else:
                    failed_count += 1
                    print(f"  ❌ 更新失败: {title}...")
            else:
                failed_count += 1
                print(f"  ❌ AI分析失败: {title}...")

        processed_count += len(batch)

        print(f"已处理: {processed_count}, 成功: {success_count}, 失败: {failed_count}")
        print()

        # 避免API限流，稍微延迟
        await asyncio.sleep(2)

    print()
    print("=" * 80)
    print("重新分析完成")
    print("=" * 80)
    print(f"总处理: {processed_count} 条")
    print(f"成功: {success_count} 条")
    print(f"失败: {failed_count} 条")
    print()

if __name__ == "__main__":
    asyncio.run(main())
