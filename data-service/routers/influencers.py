"""
Influencer Management Router
Provides influencer management, post fetching, and opinion aggregation endpoints
"""

import json
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from db import db
from services.influencer_fetch_service import InfluencerFetchService
from services.opinion_aggregation_service import OpinionAggregationService
from providers.bilibili_provider import BilibiliAPIProvider

logger = logging.getLogger(__name__)

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
    category: Optional[str] = None

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
            # 初始化Bilibili provider
            provider = BilibiliAPIProvider(config={
                'cookies': {},  # TODO: 从配置读取
                'retry_delay': 2,
                'max_retries': 3
            })

            # 获取用户信息
            user_info = await provider.fetch_user_info(account_id)

            if not user_info or not user_info.get('name'):
                raise HTTPException(
                    status_code=400,
                    detail="无法获取用户信息，请检查账号ID是否正确"
                )

            logger.info(f"Validated Bilibili account: {account_id} -> {user_info.get('name')}")

            return {
                "success": True,
                "data": {
                    "name": user_info['name'],
                    "avatarUrl": user_info.get('avatar_url'),
                    "profileUrl": user_info.get('profile_url', f'https://space.bilibili.com/{account_id}'),
                    "category": user_info.get('category', '未分类'),
                    "verified": user_info.get('verified', False),
                    "followersCount": user_info.get('followers_count', 0)
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
        logger.error(f"Failed to validate influencer account: {e}")
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

        # Serialize tags and dailyFetchTimes
        tags_str = json.dumps(data.tags) if data.tags else None
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
            # Parse dailyFetchTimes if present
            daily_times = json.loads(row['dailyFetchTimes']) if row.get('dailyFetchTimes') else None

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
                category=row['category'],
                scheduleType=row.get('scheduleType', 'polling'),
                dailyFetchTimes=daily_times,
                dataRetentionDays=row.get('dataRetentionDays', 30)
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

        # Parse dailyFetchTimes if present
        daily_times = json.loads(row['dailyFetchTimes']) if row.get('dailyFetchTimes') else None

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
            category=row['category'],
            scheduleType=row.get('scheduleType', 'polling'),
            dailyFetchTimes=daily_times,
            dataRetentionDays=row.get('dataRetentionDays', 30)
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
            top_opinions.append({
                "post_id": row['id'],
                "influencer_name": row.get('influencer_name', 'Unknown'),
                "opinion_summary": row.get('opinionSummary', ''),
                "stance": row.get('opinionStance', 'neutral'),
                "confidence": row.get('opinionConfidence', 0),
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
