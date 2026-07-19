"""
缓存管理 API
提供缓存统计、清理等功能
"""
from fastapi import APIRouter, Query
from services.cache_service import cache_service

router = APIRouter(prefix="/api/cache", tags=["cache"])


@router.get("/stats")
async def get_cache_stats():
    """
    获取缓存统计信息

    Returns:
        缓存命中率、缓存大小等统计数据
    """
    try:
        stats = cache_service.get_stats()
        return {
            "success": True,
            "data": stats
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/clear")
async def clear_cache(
    pattern: str = Query(None, description="缓存键模式（支持通配符），不传则清空所有")
):
    """
    清空缓存

    Args:
        pattern: 缓存键模式，例如 "news:*" 清空所有新闻缓存

    Returns:
        删除的键数量
    """
    try:
        deleted_count = cache_service.clear(pattern)
        return {
            "success": True,
            "message": f"已清空 {deleted_count} 个缓存键",
            "deleted_count": deleted_count
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/health")
async def cache_health():
    """
    缓存服务健康检查

    Returns:
        缓存服务状态
    """
    try:
        stats = cache_service.get_stats()
        return {
            "success": True,
            "backend": stats["backend"],
            "status": "healthy",
            "hit_rate": stats["hit_rate"]
        }
    except Exception as e:
        return {
            "success": False,
            "status": "unhealthy",
            "error": str(e)
        }
