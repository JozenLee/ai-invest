"""
Influencer Management Router
Provides influencer management, post fetching, and opinion aggregation endpoints
"""

import json
import logging
from datetime import datetime
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from db import db
from services.influencer_fetch_service import InfluencerFetchService
from services.opinion_aggregation_service import OpinionAggregationService
from providers.bilibili_provider import BilibiliAPIProvider

logger = logging.getLogger(__name__)

# Load Bilibili configuration
def load_bilibili_config():
    """Load Bilibili configuration from config file"""
    config_path = Path(__file__).parent.parent / "config" / "bilibili_config.json"
    try:
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load Bilibili config: {e}")
    return {
        'cookie_str': '',
        'retry_delay': 2,
        'max_retries': 3
    }

router = APIRouter(prefix="/api/influencers", tags=["influencers"])

# Initialize services
fetch_service = InfluencerFetchService(db)
# Note: OpinionAggregationService requires Prisma client, we'll handle this separately


# ==================== Request/Response Models ====================

class InfluencerCreate(BaseModel):
    name: str
    platform: str  # weibo, bilibili
    accountId: str
    driverType: str = "api"
    providerConfig: Optional[str] = None
    fetchInterval: int = Field(default=60, description="Fetch interval in minutes")
    priority: str = Field(default="medium", description="Priority: high/medium/low")
    isActive: bool = True
    profileUrl: Optional[str] = None
    avatarUrl: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None

    # Schedule configuration fields
    scheduleType: str = Field(default="polling", description="Schedule type: polling or daily")
    dailyFetchTimes: Optional[List[str]] = Field(default=None, description="Daily fetch times in HH:MM format")
    dataRetentionDays: int = Field(default=30, description="Data retention in days")


class InfluencerResponse(BaseModel):
    id: str
    name: str
    platform: str
    accountId: str
    isActive: bool
    lastFetchAt: Optional[str]
    lastFetchStatus: Optional[str]
    createdAt: str
    priority: str
    fetchInterval: int
    driverType: str
    profileUrl: Optional[str] = None
    avatarUrl: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = []
    postCount: int = 0

    # Schedule configuration fields
    scheduleType: str
    dailyFetchTimes: Optional[List[str]] = None
    dataRetentionDays: int


class InfluencerListResponse(BaseModel):
    items: List[InfluencerResponse]
    total: int
    page: int
    pageSize: int


class FetchTriggerResponse(BaseModel):
    success: bool
    postsFetched: int
    postsNew: int
    error: Optional[str] = None


class InfluencerUpdate(BaseModel):
    """Update model with only editable fields"""
    tags: Optional[List[str]] = None
    priority: Optional[str] = None
    isActive: Optional[bool] = None
    fetchInterval: Optional[int] = None
    scheduleType: Optional[str] = None
    dailyFetchTimes: Optional[List[str]] = None
    dataRetentionDays: Optional[int] = None


# ==================== API Endpoints ====================

@router.post("/validate")
async def validate_influencer_account(data: dict):
    """
    验证平台账号并获取信息

    支持的平台会返回自动获取的用户信息
    不支持的平台返回错误提示
    """
    try:
        platform = data.get('platform')
        account_id = data.get('accountId')

        if not platform or not account_id:
            raise HTTPException(
                status_code=400,
                detail="缺少必要参数: platform 和 accountId"
            )

        # 检查平台是否支持自动获取
        if platform == 'bilibili':
            # 初始化Bilibili provider（从配置文件读取Cookie）
            bilibili_config = load_bilibili_config()
            provider = BilibiliAPIProvider(config=bilibili_config)

            # 获取用户信息（带重试机制）
            logger.info(f"Validating Bilibili account: {account_id}")
            user_info = await provider.fetch_user_info(account_id)

            if not user_info or not user_info.get('name'):
                # B站API可能返回空，提供更友好的错误信息
                logger.warning(f"Failed to fetch Bilibili user info for {account_id}, user can proceed manually")
                raise HTTPException(
                    status_code=400,
                    detail="B站API暂时无法访问（可能是频率限制或Cookie失效），请稍后重试（建议等待10-30秒）或手动填写信息"
                )

            logger.info(f"Validated Bilibili account: {account_id} -> {user_info.get('name')}")

            return {
                "success": True,
                "data": {
                    "name": user_info['name'],
                    "avatarUrl": user_info.get('avatar_url'),
                    "profileUrl": user_info.get('profile_url', f'https://space.bilibili.com/{account_id}'),
                    "verified": user_info.get('verified', False),
                    "description": user_info.get('description', '')
                }
            }
        else:
            # 其他平台暂不支持
            raise HTTPException(
                status_code=400,
                detail=f"该平台暂不支持自动获取，请手动填写信息"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to validate influencer account: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=InfluencerResponse)
async def create_influencer(data: InfluencerCreate):
    """
    Create a new influencer

    Validates platform support and saves to database.
    """
    try:
        # Validate platform
        supported_platforms = ["weibo", "bilibili"]
        if data.platform not in supported_platforms:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported platform: {data.platform}. Supported: {supported_platforms}"
            )

        # Check if already exists
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id FROM Influencer WHERE platform = ? AND accountId = ?",
                (data.platform, data.accountId)
            )
            existing = await cursor.fetchone()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Influencer already exists: {data.platform}/{data.accountId}"
                )

        # Generate ID
        influencer_id = f"inf_{int(datetime.now().timestamp() * 1000000)}"
        created_at = datetime.now().isoformat()

        # Normalize tags: split any tags containing Chinese or English commas
        normalized_tags = []
        if data.tags:
            for tag in data.tags:
                # Split by both Chinese comma (，) and English comma (,)
                split_tags = tag.replace('，', ',').split(',')
                normalized_tags.extend([t.strip() for t in split_tags if t.strip()])

        # Serialize tags and dailyFetchTimes
        tags_str = json.dumps(normalized_tags) if normalized_tags else None
        daily_times_str = json.dumps(data.dailyFetchTimes) if data.dailyFetchTimes else None

        # Insert to database
        async with db.get_connection() as conn:
            await conn.execute("""
                INSERT INTO Influencer (
                    id, name, platform, accountId, driverType, providerConfig,
                    fetchInterval, priority, isActive, profileUrl, avatarUrl,
                    category, tags, scheduleType, dailyFetchTimes, dataRetentionDays,
                    createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                influencer_id,
                data.name,
                data.platform,
                data.accountId,
                data.driverType,
                data.providerConfig,
                data.fetchInterval,
                data.priority,
                1 if data.isActive else 0,
                data.profileUrl,
                data.avatarUrl,
                data.category,
                tags_str,
                data.scheduleType,
                daily_times_str,
                data.dataRetentionDays,
                created_at,
                created_at
            ))

        logger.info(f"Created influencer: {influencer_id} ({data.name})")

        return InfluencerResponse(
            id=influencer_id,
            name=data.name,
            platform=data.platform,
            accountId=data.accountId,
            isActive=data.isActive,
            lastFetchAt=None,
            lastFetchStatus=None,
            createdAt=created_at,
            priority=data.priority,
            fetchInterval=data.fetchInterval,
            driverType=data.driverType,
            profileUrl=data.profileUrl,
            category=data.category,
            scheduleType=data.scheduleType,
            dailyFetchTimes=data.dailyFetchTimes,
            dataRetentionDays=data.dataRetentionDays
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create influencer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=InfluencerListResponse)
async def list_influencers(
    platform: Optional[str] = Query(None, description="Filter by platform"),
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=100, description="Page size")
):
    """
    List influencers with optional filtering and pagination

    Supports filtering by platform and pagination.
    """
    try:
        offset = (page - 1) * pageSize

        # Build query
        where_clause = ""
        params = []

        if platform:
            where_clause = "WHERE platform = ?"
            params.append(platform)

        # Get total count
        async with db.get_connection() as conn:
            count_query = f"SELECT COUNT(*) as total FROM Influencer {where_clause}"
            cursor = await conn.execute(count_query, params)
            row = await cursor.fetchone()
            total = row['total'] if row else 0

            # Get paginated results
            query = f"""
                SELECT * FROM Influencer
                {where_clause}
                ORDER BY createdAt DESC
                LIMIT ? OFFSET ?
            """
            cursor = await conn.execute(query, params + [pageSize, offset])
            rows = await cursor.fetchall()

        # Convert to response models
        items = []
        for row in rows:
            # Parse dailyFetchTimes and tags if present
            row_dict = dict(row)
            daily_times = json.loads(row['dailyFetchTimes']) if row['dailyFetchTimes'] else None
            tags = json.loads(row['tags']) if row['tags'] else []

            items.append(InfluencerResponse(
                id=row['id'],
                name=row['name'],
                platform=row['platform'],
                accountId=row['accountId'],
                isActive=bool(row['isActive']),
                lastFetchAt=row['lastFetchAt'],
                lastFetchStatus=row['lastFetchStatus'],
                createdAt=row['createdAt'],
                priority=row['priority'],
                fetchInterval=row['fetchInterval'],
                driverType=row['driverType'],
                profileUrl=row['profileUrl'],
                avatarUrl=row_dict.get('avatarUrl'),
                category=row['category'],
                tags=tags,
                scheduleType=row_dict.get('scheduleType', 'polling'),
                dailyFetchTimes=daily_times,
                dataRetentionDays=row_dict.get('dataRetentionDays', 30)
            ))

        return InfluencerListResponse(
            items=items,
            total=total,
            page=page,
            pageSize=pageSize
        )

    except Exception as e:
        logger.error(f"Failed to list influencers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{influencer_id}/posts")
async def get_influencer_posts(
    influencer_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=100, description="Page size"),
    aiProcessed: Optional[bool] = Query(None, description="Filter by AI processing status")
):
    """
    Get posts for a specific influencer

    Returns paginated list of posts with optional AI processing filter.
    Posts are filtered by dataRetentionDays to only show recent data.
    """
    try:
        # Check if influencer exists and get dataRetentionDays
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id, dataRetentionDays FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            row = await cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Influencer not found: {influencer_id}")

        # Get data retention days (default to 30 if not set)
        row_dict = dict(row)
        data_retention_days = row_dict.get('dataRetentionDays', 30) or 30

        # Query posts
        async with db.get_connection() as conn:
            # Build query with data retention filter and optional AI processing filter
            where_clause = "WHERE influencerId = ? AND publishTime >= datetime('now', '-' || ? || ' days')"
            params = [influencer_id, data_retention_days]

            if aiProcessed is not None:
                where_clause += " AND aiProcessed = ?"
                params.append(1 if aiProcessed else 0)

            # Get total count
            count_query = f"SELECT COUNT(*) as total FROM InfluencerPost {where_clause}"
            cursor = await conn.execute(count_query, tuple(params))
            count_row = await cursor.fetchone()
            total = count_row['total'] if count_row else 0

            # Get paginated posts
            offset = (page - 1) * pageSize
            query = f"""
                SELECT * FROM InfluencerPost
                {where_clause}
                ORDER BY publishTime DESC
                LIMIT ? OFFSET ?
            """
            params.extend([pageSize, offset])

            cursor = await conn.execute(query, tuple(params))
            rows = await cursor.fetchall()

        # Format posts
        items = []
        for row in rows:
            # Parse JSON fields - extractedTopics来自mainPoints，relatedDomains来自secondaryDomains
            main_points = json.loads(row['mainPoints']) if row['mainPoints'] else []
            secondary_domains = json.loads(row['secondaryDomains']) if row['secondaryDomains'] else []

            # 构建relatedDomains列表（primaryDomain + secondaryDomains）
            related_domains = []
            if row['primaryDomain']:
                related_domains.append(row['primaryDomain'])
            related_domains.extend(secondary_domains)

            items.append({
                "id": row['id'],
                "influencerId": row['influencerId'],
                "content": row['content'],
                "url": row['originalUrl'] if row['originalUrl'] else '',
                "publishTime": row['publishTime'],
                "sentiment": row['sentiment'] if row['sentiment'] is not None else None,
                "extractedTopics": main_points,
                "relatedDomains": related_domains,
                "aiProcessed": bool(row['aiProcessed']),
                "createdAt": row['createdAt']
            })

        return {
            "success": True,
            "data": {
                "total": total,
                "page": page,
                "pageSize": pageSize,
                "items": items
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get influencer posts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{influencer_id}", response_model=InfluencerResponse)
async def get_influencer(influencer_id: str):
    """
    Get a single influencer by ID

    Returns 404 if not found.
    """
    try:
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            row = await cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Influencer not found: {influencer_id}")

        # Parse dailyFetchTimes and tags if present
        row_dict = dict(row)
        daily_times = json.loads(row['dailyFetchTimes']) if row['dailyFetchTimes'] else None
        tags = json.loads(row['tags']) if row['tags'] else []

        # Get post count filtered by dataRetentionDays
        data_retention_days = row_dict.get('dataRetentionDays', 30) or 30
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT COUNT(*) as count FROM InfluencerPost WHERE influencerId = ? AND publishTime >= datetime('now', '-' || ? || ' days')",
                (influencer_id, data_retention_days)
            )
            count_row = await cursor.fetchone()
            post_count = count_row['count'] if count_row else 0

        return InfluencerResponse(
            id=row['id'],
            name=row['name'],
            platform=row['platform'],
            accountId=row['accountId'],
            isActive=bool(row['isActive']),
            lastFetchAt=row['lastFetchAt'],
            lastFetchStatus=row['lastFetchStatus'],
            createdAt=row['createdAt'],
            priority=row['priority'],
            fetchInterval=row['fetchInterval'],
            driverType=row['driverType'],
            profileUrl=row['profileUrl'],
            avatarUrl=row_dict.get('avatarUrl'),
            category=row['category'],
            tags=tags,
            postCount=post_count,
            scheduleType=row_dict.get('scheduleType', 'polling'),
            dailyFetchTimes=daily_times,
            dataRetentionDays=row_dict.get('dataRetentionDays', 30)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get influencer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{influencer_id}/fetch", response_model=FetchTriggerResponse)
async def trigger_fetch(influencer_id: str):
    """
    Manually trigger fetch for an influencer

    Calls InfluencerFetchService to fetch posts from the platform.
    """
    try:
        # Check if influencer exists
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            row = await cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Influencer not found: {influencer_id}")

        logger.info(f"Triggering fetch for influencer: {influencer_id}")

        # Call fetch service
        result = await fetch_service.fetch_influencer_posts(influencer_id)

        return FetchTriggerResponse(
            success=result['success'],
            postsFetched=result['posts_fetched'],
            postsNew=result['posts_new'],
            error=result.get('error')
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger fetch: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class InfluencerUpdate(BaseModel):
    """Update model with only editable fields"""
    tags: Optional[List[str]] = None
    priority: Optional[str] = None
    isActive: Optional[bool] = None
    fetchInterval: Optional[int] = None
    scheduleType: Optional[str] = None
    dailyFetchTimes: Optional[List[str]] = None
    dataRetentionDays: Optional[int] = None


@router.put("/{influencer_id}", response_model=InfluencerResponse)
async def update_influencer(influencer_id: str, data: InfluencerUpdate):
    """
    Update an existing influencer

    Only editable fields can be modified. Platform-bound fields (name, platform, accountId,
    profileUrl, avatarUrl, category) are readonly and cannot be changed manually.
    """
    try:
        # Check if influencer exists
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            existing = await cursor.fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail=f"Influencer not found: {influencer_id}")

        # Normalize tags: split any tags containing Chinese or English commas
        normalized_tags = None
        if data.tags is not None:
            normalized_tags = []
            for tag in data.tags:
                # Split by both Chinese comma (，) and English comma (,)
                split_tags = tag.replace('，', ',').split(',')
                normalized_tags.extend([t.strip() for t in split_tags if t.strip()])

        # Serialize tags and dailyFetchTimes
        tags_str = json.dumps(normalized_tags) if normalized_tags is not None else None
        daily_times_str = json.dumps(data.dailyFetchTimes) if data.dailyFetchTimes is not None else None
        updated_at = datetime.now().isoformat()

        # Build update query dynamically for provided fields
        update_fields = []
        update_values = []

        if data.tags is not None:
            update_fields.append("tags = ?")
            update_values.append(tags_str)
        if data.priority is not None:
            update_fields.append("priority = ?")
            update_values.append(data.priority)
        if data.isActive is not None:
            update_fields.append("isActive = ?")
            update_values.append(1 if data.isActive else 0)
        if data.fetchInterval is not None:
            update_fields.append("fetchInterval = ?")
            update_values.append(data.fetchInterval)
        if data.scheduleType is not None:
            update_fields.append("scheduleType = ?")
            update_values.append(data.scheduleType)
        if data.dailyFetchTimes is not None:
            update_fields.append("dailyFetchTimes = ?")
            update_values.append(daily_times_str)
        if data.dataRetentionDays is not None:
            update_fields.append("dataRetentionDays = ?")
            update_values.append(data.dataRetentionDays)

        # Always update updatedAt
        update_fields.append("updatedAt = ?")
        update_values.append(updated_at)
        update_values.append(influencer_id)

        # Update only provided fields
        if update_fields:
            async with db.get_connection() as conn:
                query = f"UPDATE Influencer SET {', '.join(update_fields)} WHERE id = ?"
                await conn.execute(query, tuple(update_values))

                # Fetch updated record
                cursor = await conn.execute(
                    "SELECT * FROM Influencer WHERE id = ?",
                    (influencer_id,)
                )
                row = await cursor.fetchone()

        # Parse dailyFetchTimes and tags back
        row_dict = dict(row)
        daily_times = json.loads(row['dailyFetchTimes']) if row['dailyFetchTimes'] else None
        tags = json.loads(row['tags']) if row['tags'] else []

        logger.info(f"Updated influencer: {influencer_id}")

        return InfluencerResponse(
            id=row['id'],
            name=row['name'],
            platform=row['platform'],
            accountId=row['accountId'],
            isActive=bool(row['isActive']),
            lastFetchAt=row['lastFetchAt'],
            lastFetchStatus=row['lastFetchStatus'],
            createdAt=row['createdAt'],
            priority=row['priority'],
            fetchInterval=row['fetchInterval'],
            driverType=row['driverType'],
            profileUrl=row['profileUrl'],
            avatarUrl=row_dict.get('avatarUrl'),
            category=row['category'],
            tags=tags,
            scheduleType=row_dict.get('scheduleType', 'polling'),
            dailyFetchTimes=daily_times,
            dataRetentionDays=row_dict.get('dataRetentionDays', 30)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update influencer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{influencer_id}")
async def delete_influencer(influencer_id: str):
    """
    Delete an influencer and all related posts

    Permanently removes the influencer and cascades to delete all posts.
    """
    try:
        # Check if influencer exists
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id, name FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            existing = await cursor.fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail=f"Influencer not found: {influencer_id}")

        influencer_name = existing['name']

        # Delete influencer and related posts (cascade)
        async with db.get_connection() as conn:
            # Delete posts first
            await conn.execute(
                "DELETE FROM InfluencerPost WHERE influencerId = ?",
                (influencer_id,)
            )

            # Delete influencer
            await conn.execute(
                "DELETE FROM Influencer WHERE id = ?",
                (influencer_id,)
            )

        logger.info(f"Deleted influencer: {influencer_id} ({influencer_name})")

        return {
            "success": True,
            "message": f"Influencer {influencer_name} deleted successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete influencer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opinions/domain/{domain_code}")
async def get_domain_opinions(
    domain_code: str,
    time_window: str = Query("7d", pattern="^(3d|7d|30d)$", description="Time window: 3d, 7d, or 30d")
):
    """
    Get aggregated opinions by domain

    Calls OpinionAggregationService to aggregate and analyze opinions.
    Requires Prisma client for complex queries.
    """
    try:
        # For now, return mock data since OpinionAggregationService requires Prisma
        # In production, this would use: opinion_service.aggregate_domain_opinions(domain_code, time_window)
        logger.warning("OpinionAggregationService requires Prisma client - returning mock data")

        # Query posts directly from database
        async with db.get_connection() as conn:
            # Parse time window
            days = int(time_window.rstrip('d'))

            cursor = await conn.execute("""
                SELECT ip.*, i.name as influencer_name, i.platform
                FROM InfluencerPost ip
                JOIN Influencer i ON ip.influencerId = i.id
                WHERE ip.primaryDomain = ?
                AND ip.publishTime >= datetime('now', '-' || ? || ' days')
                AND ip.aiProcessed = 1
                ORDER BY ip.publishTime DESC
            """, (domain_code, days))

            rows = await cursor.fetchall()

        # Calculate statistics
        total = len(rows)
        bullish = sum(1 for r in rows if r.get('opinionStance') == 'bullish')
        neutral = sum(1 for r in rows if r.get('opinionStance') == 'neutral')
        bearish = sum(1 for r in rows if r.get('opinionStance') == 'bearish')

        confidences = [r['opinionConfidence'] for r in rows if r.get('opinionConfidence')]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        sentiments = [r['sentiment'] for r in rows if r.get('sentiment') is not None]
        avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0

        # Format top opinions
        top_opinions = []
        for row in rows[:10]:
            row_dict = dict(row)
            top_opinions.append({
                "post_id": row['id'],
                "influencer_name": row_dict.get('influencer_name', 'Unknown'),
                "opinion_summary": row['opinionSummary'] if row['opinionSummary'] else '',
                "stance": row['opinionStance'] if row['opinionStance'] else 'neutral',
                "confidence": row['opinionConfidence'] if row['opinionConfidence'] else 0,
                "publish_time": row['publishTime']
            })

        return {
            "domain": domain_code,
            "time_window": time_window,
            "statistics": {
                "total_opinions": total,
                "stance_distribution": {
                    "bullish": bullish,
                    "neutral": neutral,
                    "bearish": bearish
                },
                "avg_confidence": round(avg_confidence, 2),
                "avg_sentiment": round(avg_sentiment, 2)
            },
            "top_opinions": top_opinions
        }

    except Exception as e:
        logger.error(f"Failed to get domain opinions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
