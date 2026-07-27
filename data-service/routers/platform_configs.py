"""
Platform Configuration API
管理不同平台的配置（Cookie等认证信息）
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import logging

from db import Database

logger = logging.getLogger(__name__)

router = APIRouter()
db = Database()


class PlatformConfigCreate(BaseModel):
    platform: str
    displayName: str
    configData: Dict[str, Any]  # 包含 cookie_str, retry_delay 等
    expiresAt: Optional[str] = None
    autoRefresh: bool = False


class PlatformConfigUpdate(BaseModel):
    displayName: Optional[str] = None
    configData: Optional[Dict[str, Any]] = None
    isActive: Optional[bool] = None
    expiresAt: Optional[str] = None
    autoRefresh: Optional[bool] = None


class PlatformConfigResponse(BaseModel):
    id: str
    platform: str
    displayName: str
    configData: Dict[str, Any]
    isActive: bool
    lastUpdatedAt: str
    expiresAt: Optional[str]
    autoRefresh: bool
    createdAt: str
    updatedAt: str


@router.get("/", response_model=List[PlatformConfigResponse])
async def list_platform_configs(active_only: bool = False):
    """
    获取所有平台配置列表
    """
    try:
        async with db.get_connection() as conn:
            if active_only:
                cursor = await conn.execute(
                    "SELECT * FROM PlatformConfig WHERE isActive = 1 ORDER BY platform"
                )
            else:
                cursor = await conn.execute(
                    "SELECT * FROM PlatformConfig ORDER BY platform"
                )
            rows = await cursor.fetchall()

        configs = []
        for row in rows:
            config_data = json.loads(row['configData']) if row['configData'] else {}
            configs.append({
                'id': row['id'],
                'platform': row['platform'],
                'displayName': row['displayName'],
                'configData': config_data,
                'isActive': bool(row['isActive']),
                'lastUpdatedAt': row['lastUpdatedAt'],
                'expiresAt': row['expiresAt'],
                'autoRefresh': bool(row['autoRefresh']),
                'createdAt': row['createdAt'],
                'updatedAt': row['updatedAt']
            })

        return configs

    except Exception as e:
        logger.error(f"Failed to list platform configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{platform}", response_model=PlatformConfigResponse)
async def get_platform_config(platform: str):
    """
    获取指定平台的配置
    """
    try:
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM PlatformConfig WHERE platform = ?",
                (platform,)
            )
            row = await cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Platform config not found: {platform}")

        config_data = json.loads(row['configData']) if row['configData'] else {}

        return {
            'id': row['id'],
            'platform': row['platform'],
            'displayName': row['displayName'],
            'configData': config_data,
            'isActive': bool(row['isActive']),
            'lastUpdatedAt': row['lastUpdatedAt'],
            'expiresAt': row['expiresAt'],
            'autoRefresh': bool(row['autoRefresh']),
            'createdAt': row['createdAt'],
            'updatedAt': row['updatedAt']
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get platform config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=PlatformConfigResponse)
async def create_platform_config(config: PlatformConfigCreate):
    """
    创建新的平台配置
    """
    try:
        # 检查平台是否已存在
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id FROM PlatformConfig WHERE platform = ?",
                (config.platform,)
            )
            existing = await cursor.fetchone()

        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Platform config already exists: {config.platform}"
            )

        # 创建配置
        config_id = f"pc_{datetime.now().timestamp():.0f}"
        now = datetime.now().isoformat()
        config_data_json = json.dumps(config.configData)

        async with db.get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO PlatformConfig (
                    id, platform, displayName, configData, isActive,
                    lastUpdatedAt, expiresAt, autoRefresh, createdAt, updatedAt
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    config_id,
                    config.platform,
                    config.displayName,
                    config_data_json,
                    1,  # isActive
                    now,
                    config.expiresAt,
                    1 if config.autoRefresh else 0,
                    now,
                    now
                )
            )
            await conn.commit()

        logger.info(f"Created platform config: {config.platform}")

        return {
            'id': config_id,
            'platform': config.platform,
            'displayName': config.displayName,
            'configData': config.configData,
            'isActive': True,
            'lastUpdatedAt': now,
            'expiresAt': config.expiresAt,
            'autoRefresh': config.autoRefresh,
            'createdAt': now,
            'updatedAt': now
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create platform config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{platform}", response_model=PlatformConfigResponse)
async def update_platform_config(platform: str, update: PlatformConfigUpdate):
    """
    更新平台配置
    """
    try:
        # 检查平台是否存在
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM PlatformConfig WHERE platform = ?",
                (platform,)
            )
            existing = await cursor.fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail=f"Platform config not found: {platform}")

        # 构建更新语句
        updates = []
        params = []

        if update.displayName is not None:
            updates.append("displayName = ?")
            params.append(update.displayName)

        if update.configData is not None:
            updates.append("configData = ?")
            params.append(json.dumps(update.configData))
            updates.append("lastUpdatedAt = ?")
            params.append(datetime.now().isoformat())

        if update.isActive is not None:
            updates.append("isActive = ?")
            params.append(1 if update.isActive else 0)

        if update.expiresAt is not None:
            updates.append("expiresAt = ?")
            params.append(update.expiresAt)

        if update.autoRefresh is not None:
            updates.append("autoRefresh = ?")
            params.append(1 if update.autoRefresh else 0)

        updates.append("updatedAt = ?")
        params.append(datetime.now().isoformat())

        params.append(platform)

        async with db.get_connection() as conn:
            await conn.execute(
                f"UPDATE PlatformConfig SET {', '.join(updates)} WHERE platform = ?",
                tuple(params)
            )
            await conn.commit()

            # 获取更新后的数据
            cursor = await conn.execute(
                "SELECT * FROM PlatformConfig WHERE platform = ?",
                (platform,)
            )
            row = await cursor.fetchone()

        logger.info(f"Updated platform config: {platform}")

        config_data = json.loads(row['configData']) if row['configData'] else {}

        return {
            'id': row['id'],
            'platform': row['platform'],
            'displayName': row['displayName'],
            'configData': config_data,
            'isActive': bool(row['isActive']),
            'lastUpdatedAt': row['lastUpdatedAt'],
            'expiresAt': row['expiresAt'],
            'autoRefresh': bool(row['autoRefresh']),
            'createdAt': row['createdAt'],
            'updatedAt': row['updatedAt']
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update platform config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{platform}")
async def delete_platform_config(platform: str):
    """
    删除平台配置
    """
    try:
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id FROM PlatformConfig WHERE platform = ?",
                (platform,)
            )
            existing = await cursor.fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail=f"Platform config not found: {platform}")

        async with db.get_connection() as conn:
            await conn.execute(
                "DELETE FROM PlatformConfig WHERE platform = ?",
                (platform,)
            )
            await conn.commit()

        logger.info(f"Deleted platform config: {platform}")

        return {"success": True, "message": f"Platform config deleted: {platform}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete platform config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{platform}/test")
async def test_platform_config(platform: str):
    """
    测试平台配置是否有效
    """
    try:
        # 获取配置
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM PlatformConfig WHERE platform = ?",
                (platform,)
            )
            row = await cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Platform config not found: {platform}")

        config_data = json.loads(row['configData']) if row['configData'] else {}

        # 根据平台测试配置
        if platform == 'bilibili':
            from providers.bilibili_provider import BilibiliAPIProvider
            provider = BilibiliAPIProvider(config_data)

            # 测试获取用户信息
            user_info = await provider.fetch_user_info("72844725")  # 测试账号

            if user_info:
                return {
                    "success": True,
                    "message": "Platform config is valid",
                    "testResult": {
                        "userName": user_info.get('name'),
                        "followers": user_info.get('followers_count')
                    }
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to validate config",
                    "error": "Unable to fetch user info"
                }
        else:
            return {
                "success": False,
                "message": f"Test not implemented for platform: {platform}"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test platform config: {e}")
        return {
            "success": False,
            "message": "Test failed",
            "error": str(e)
        }
