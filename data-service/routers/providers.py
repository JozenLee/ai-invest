"""
Provider 管理 API
提供 Provider 列表、Schema 查询、配置测试等功能
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import sys
import os

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from providers.loader import ProviderLoader
from providers.schemas import (
    get_provider_schema,
    list_provider_schemas,
    validate_provider_config,
    get_provider_categories,
)


router = APIRouter(prefix="/providers", tags=["providers"])


class ProviderTestRequest(BaseModel):
    """Provider 测试请求"""
    config: Dict[str, Any]


class ProviderTestResponse(BaseModel):
    """Provider 测试响应"""
    success: bool
    message: str
    user_info: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@router.get("/list")
async def list_providers():
    """
    列出所有可用的 Provider

    Returns:
        Provider 列表，包含基本信息
    """
    try:
        providers = list_provider_schemas()
        return {
            "success": True,
            "data": providers,
            "total": len(providers),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def get_categories():
    """
    获取 Provider 按类别分组

    Returns:
        分类字典
    """
    try:
        categories = get_provider_categories()
        return {
            "success": True,
            "data": categories,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{provider_name}/schema")
async def get_schema(provider_name: str):
    """
    获取指定 Provider 的 Schema

    Args:
        provider_name: Provider 名称

    Returns:
        Provider Schema
    """
    try:
        schema = get_provider_schema(provider_name)
        return {
            "success": True,
            "data": schema,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{provider_name}/validate")
async def validate_config(provider_name: str, request: ProviderTestRequest):
    """
    验证 Provider 配置

    Args:
        provider_name: Provider 名称
        request: 包含配置的请求

    Returns:
        验证结果
    """
    try:
        is_valid, errors = validate_provider_config(provider_name, request.config)
        return {
            "success": True,
            "data": {
                "valid": is_valid,
                "errors": errors,
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{provider_name}/test")
async def test_provider(provider_name: str, request: ProviderTestRequest) -> ProviderTestResponse:
    """
    测试 Provider 配置
    实际加载 Provider 并尝试获取用户信息

    Args:
        provider_name: Provider 名称
        request: 包含配置的请求

    Returns:
        测试结果，包含用户信息（如果成功）
    """
    try:
        # 验证配置
        is_valid, errors = validate_provider_config(provider_name, request.config)
        if not is_valid:
            return ProviderTestResponse(
                success=False,
                message="配置验证失败",
                error="; ".join(errors),
            )

        # 加载 Provider（不使用缓存）
        provider = ProviderLoader.load_provider(
            provider_name,
            request.config,
            use_cache=False
        )

        # 测试获取用户信息
        user_info = None
        if provider_name == 'bilibili':
            uid = request.config.get('uid')
            user_info = await provider.get_user_info(uid)
        elif provider_name == 'weibo':
            uid = request.config.get('uid')
            user_info = await provider.get_user_info(uid)
        elif provider_name == 'xiaohongshu':
            user_id = request.config.get('user_id')
            user_info = await provider.get_user_info(user_id)

        if user_info:
            return ProviderTestResponse(
                success=True,
                message="Provider 配置测试成功",
                user_info=user_info,
            )
        else:
            return ProviderTestResponse(
                success=False,
                message="无法获取用户信息",
                error="Provider returned no user info",
            )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        return ProviderTestResponse(
            success=False,
            message="Provider 测试失败",
            error=str(e),
        )


@router.get("/cache/stats")
async def get_cache_stats():
    """
    获取 Provider 缓存统计

    Returns:
        缓存统计信息
    """
    try:
        stats = ProviderLoader.get_cache_stats()
        return {
            "success": True,
            "data": stats,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
async def clear_cache(provider_name: Optional[str] = None):
    """
    清除 Provider 缓存

    Args:
        provider_name: 要清除的 Provider 名称（可选）

    Returns:
        清除结果
    """
    try:
        ProviderLoader.clear_cache(provider_name)
        return {
            "success": True,
            "message": f"Cache cleared for {provider_name or 'all providers'}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
