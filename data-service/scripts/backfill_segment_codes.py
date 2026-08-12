"""
回填脚本：为现有新闻补充 segmentCodes
"""
import asyncio
import sys
import os
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 加载环境变量
from dotenv import load_dotenv
load_dotenv(project_root.parent / '.env')

import logging
import json
from workers.ai_analyzer import AIAnalyzer
from models.article import RawArticle
from db import Database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def backfill_segment_codes():
    """为所有没有segmentCodes的新闻补充产业细分领域标签"""

    # 初始化AI分析器
    logger.info("初始化AI分析器...")
    analyzer = AIAnalyzer(concurrency=3)

    # 加载产业细分领域
    logger.info("加载产业细分领域...")
    await analyzer.load_industry_segments()

    if not analyzer.industry_segments:
        logger.error("❌ 未能加载产业细分领域，请检查知识图谱数据")
        return

    logger.info(f"✅ 已加载 {len(analyzer.industry_segments)} 个产业细分领域")

    # 连接数据库
    db = Database()
    conn = db.get_connection()
    cursor = conn.cursor()

    # 查询所有需要回填的新闻
    cursor.execute("""
        SELECT id, title, content, source, url, publishTime
        FROM NewsArticle
        WHERE segmentCodes IS NULL OR segmentCodes = '[]' OR segmentCodes = ''
    """)

    articles = cursor.fetchall()

    if not articles:
        logger.info("✅ 所有新闻都已有 segmentCodes，无需回填")
        conn.close()
        return

    logger.info(f"找到 {len(articles)} 条需要回填的新闻")

    # 转换为 RawArticle 格式
    raw_articles = []
    for article in articles:
        raw_article = RawArticle(
            id=article['id'],
            title=article['title'],
            content=article['content'] or '',
            source=article['source'],
            url=article['url'] or '',
            publishTime=article['publishTime'] or ''
        )
        raw_articles.append(raw_article)

    # 批量分析
    logger.info("开始AI分析（仅提取 segmentCodes）...")
    analyzed_articles = await analyzer.analyze_batch(raw_articles)

    # 更新数据库
    updated_count = 0
    for analyzed in analyzed_articles:
        if analyzed.segmentCodes:
            segment_codes_json = json.dumps(analyzed.segmentCodes, ensure_ascii=False)
            cursor.execute("""
                UPDATE NewsArticle
                SET segmentCodes = ?
                WHERE id = ?
            """, (segment_codes_json, analyzed.id))
            updated_count += 1

    # 提交更改
    conn.commit()
    conn.close()

    logger.info(f"✅ 回填完成：更新了 {updated_count}/{len(articles)} 条新闻")


if __name__ == '__main__':
    asyncio.run(backfill_segment_codes())
