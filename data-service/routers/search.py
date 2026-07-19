"""
全文搜索 API
基于 SQLite FTS5 实现的高性能全文搜索
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
from datetime import datetime
import os

router = APIRouter(prefix="/api/search", tags=["search"])

# 数据库路径（相对于项目根目录）
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "prisma", "dev.db")


class SearchResult(BaseModel):
    """搜索结果"""
    id: str
    title: str
    content: str
    summary: Optional[str]
    source: str
    url: Optional[str]
    publishTime: str
    category: str
    sentiment: Optional[float]
    impact: Optional[int]
    highlight: dict  # 高亮片段


class SearchResponse(BaseModel):
    """搜索响应"""
    success: bool
    total: int
    items: List[SearchResult]
    query: str
    took_ms: float


@router.get("/news", response_model=SearchResponse)
async def search_news(
    q: str = Query(..., description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100, description="返回结果数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
    category: Optional[str] = Query(None, description="分类筛选"),
    sentiment: Optional[str] = Query(None, description="情感筛选: bullish/bearish/neutral"),
):
    """
    全文搜索新闻

    使用 SQLite FTS5 进行高性能全文搜索，支持：
    - 关键词搜索（支持中文分词）
    - 分类筛选
    - 情感筛选
    - 结果高亮
    - 相关性排序

    Args:
        q: 搜索关键词
        limit: 返回结果数量
        offset: 偏移量
        category: 分类筛选
        sentiment: 情感筛选

    Returns:
        搜索结果列表
    """
    start_time = datetime.now()

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 构建 FTS 查询
        fts_query = q.strip()
        if not fts_query:
            return SearchResponse(
                success=False,
                total=0,
                items=[],
                query=q,
                took_ms=0
            )

        # 构建 WHERE 子句
        where_clauses = []
        params = []

        # 分类筛选
        if category:
            where_clauses.append("a.category = ?")
            params.append(category)

        # 情感筛选
        if sentiment:
            if sentiment == "bullish":
                where_clauses.append("a.sentiment > 0.2")
            elif sentiment == "bearish":
                where_clauses.append("a.sentiment < -0.2")
            elif sentiment == "neutral":
                where_clauses.append("a.sentiment BETWEEN -0.2 AND 0.2")

        where_clause = " AND " + " AND ".join(where_clauses) if where_clauses else ""

        # 查询总数
        count_query = f"""
            SELECT COUNT(*) as total
            FROM NewsArticleFTS fts
            JOIN NewsArticle a ON fts.rowid = a.rowid
            WHERE NewsArticleFTS MATCH ?{where_clause}
        """
        cursor.execute(count_query, [fts_query] + params)
        total = cursor.fetchone()["total"]

        # 查询结果（带高亮）
        search_query = f"""
            SELECT
                a.id,
                a.title,
                a.content,
                a.summary,
                a.source,
                a.url,
                a.publishTime,
                a.category,
                a.sentiment,
                a.impact,
                snippet(NewsArticleFTS, 0, '<mark>', '</mark>', '...', 32) as title_highlight,
                snippet(NewsArticleFTS, 1, '<mark>', '</mark>', '...', 64) as content_highlight,
                snippet(NewsArticleFTS, 2, '<mark>', '</mark>', '...', 32) as summary_highlight,
                bm25(NewsArticleFTS) as rank
            FROM NewsArticleFTS fts
            JOIN NewsArticle a ON fts.rowid = a.rowid
            WHERE NewsArticleFTS MATCH ?{where_clause}
            ORDER BY rank
            LIMIT ? OFFSET ?
        """
        cursor.execute(search_query, [fts_query] + params + [limit, offset])

        items = []
        for row in cursor.fetchall():
            items.append(SearchResult(
                id=row["id"],
                title=row["title"],
                content=row["content"][:500],  # 限制长度
                summary=row["summary"],
                source=row["source"],
                url=row["url"],
                publishTime=row["publishTime"],
                category=row["category"],
                sentiment=row["sentiment"],
                impact=row["impact"],
                highlight={
                    "title": row["title_highlight"],
                    "content": row["content_highlight"],
                    "summary": row["summary_highlight"],
                }
            ))

        conn.close()

        took_ms = (datetime.now() - start_time).total_seconds() * 1000

        return SearchResponse(
            success=True,
            total=total,
            items=items,
            query=q,
            took_ms=round(took_ms, 2)
        )

    except Exception as e:
        return SearchResponse(
            success=False,
            total=0,
            items=[],
            query=q,
            took_ms=0,
            error=str(e)
        )


@router.get("/suggest")
async def search_suggest(
    q: str = Query(..., description="搜索关键词前缀"),
    limit: int = Query(10, ge=1, le=20, description="建议数量"),
):
    """
    搜索建议（自动补全）

    基于历史搜索和文章标题提供搜索建议

    Args:
        q: 搜索关键词前缀
        limit: 建议数量

    Returns:
        搜索建议列表
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 使用前缀匹配
        prefix_query = f"{q}*"

        query = """
            SELECT DISTINCT
                a.title,
                COUNT(*) as frequency
            FROM NewsArticleFTS fts
            JOIN NewsArticle a ON fts.rowid = a.rowid
            WHERE NewsArticleFTS MATCH ?
            GROUP BY a.title
            ORDER BY frequency DESC, a.publishTime DESC
            LIMIT ?
        """

        cursor.execute(query, [prefix_query, limit])
        suggestions = [{"text": row["title"], "frequency": row["frequency"]} for row in cursor.fetchall()]

        conn.close()

        return {
            "success": True,
            "query": q,
            "suggestions": suggestions
        }

    except Exception as e:
        return {
            "success": False,
            "query": q,
            "suggestions": [],
            "error": str(e)
        }


@router.get("/stats")
async def search_stats():
    """
    获取搜索索引统计信息

    Returns:
        索引大小、文档数量等统计信息
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 获取索引统计
        cursor.execute("SELECT COUNT(*) as doc_count FROM NewsArticleFTS")
        doc_count = cursor.fetchone()["doc_count"]

        # 获取索引大小
        cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
        db_size = cursor.fetchone()["size"]

        conn.close()

        return {
            "success": True,
            "data": {
                "indexed_documents": doc_count,
                "database_size_bytes": db_size,
                "database_size_mb": round(db_size / 1024 / 1024, 2),
                "timestamp": datetime.now().isoformat(),
            }
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/rebuild")
async def rebuild_index():
    """
    重建搜索索引

    删除并重新创建 FTS5 索引，用于维护和优化

    Returns:
        重建结果
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 清空 FTS 索引
        cursor.execute("DELETE FROM NewsArticleFTS")

        # 重新插入所有数据
        cursor.execute("""
            INSERT INTO NewsArticleFTS(rowid, title, content, summary)
            SELECT rowid, title, content, summary FROM NewsArticle
        """)

        # 优化索引
        cursor.execute("INSERT INTO NewsArticleFTS(NewsArticleFTS) VALUES('optimize')")

        affected = cursor.rowcount
        conn.commit()
        conn.close()

        return {
            "success": True,
            "message": "搜索索引重建成功",
            "indexed_documents": affected
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
