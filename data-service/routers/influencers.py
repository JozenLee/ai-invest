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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/influencers", tags=["influencers"])

# Initialize services
fetch_service = InfluencerFetchService(db)
# Note: OpinionAggregationService requires Prisma client, we'll handle this separately


# ==================== Request/Response Models ====================

class InfluencerCreate(BaseModel):
    model_config = {"populate_by_name": True}

    name: str
    platform: str  # weibo, bilibili
    account_id: str = Field(serialization_alias="accountId", alias="accountId")
    driver_type: str = Field(default="api", serialization_alias="driverType", alias="driverType")
    provider_config: Optional[str] = Field(default=None, serialization_alias="providerConfig", alias="providerConfig")
    fetch_interval: int = Field(default=60, serialization_alias="fetchInterval", alias="fetchInterval", description="Fetch interval in minutes")
    priority: str = Field(default="medium", description="Priority: high/medium/low")
    is_active: bool = Field(default=True, serialization_alias="isActive", alias="isActive")
    profile_url: Optional[str] = Field(default=None, serialization_alias="profileUrl", alias="profileUrl")
    avatar_url: Optional[str] = Field(default=None, serialization_alias="avatarUrl", alias="avatarUrl")
    category: Optional[str] = None
    tags: Optional[List[str]] = None


class InfluencerResponse(BaseModel):
    model_config = {"populate_by_name": True, "by_alias": True}

    id: str
    name: str
    platform: str
    account_id: str = Field(serialization_alias="accountId", alias="accountId")
    is_active: bool = Field(serialization_alias="isActive", alias="isActive")
    last_fetch_at: Optional[str] = Field(default=None, serialization_alias="lastFetchAt", alias="lastFetchAt")
    last_fetch_status: Optional[str] = Field(default=None, serialization_alias="lastFetchStatus", alias="lastFetchStatus")
    created_at: str = Field(serialization_alias="createdAt", alias="createdAt")
    priority: str
    fetch_interval: int = Field(serialization_alias="fetchInterval", alias="fetchInterval")
    driver_type: str = Field(serialization_alias="driverType", alias="driverType")
    profile_url: Optional[str] = Field(default=None, serialization_alias="profileUrl", alias="profileUrl")
    category: Optional[str] = None


class InfluencerListResponse(BaseModel):
    model_config = {"populate_by_name": True, "by_alias": True}

    items: List[InfluencerResponse]
    total: int
    page: int
    page_size: int = Field(serialization_alias="pageSize", alias="pageSize")


class FetchTriggerResponse(BaseModel):
    model_config = {"populate_by_name": True, "by_alias": True}

    success: bool
    posts_fetched: int = Field(serialization_alias="postsFetched", alias="postsFetched")
    posts_new: int = Field(serialization_alias="postsNew", alias="postsNew")
    error: Optional[str] = None


# ==================== API Endpoints ====================

@router.post("/", response_model=InfluencerResponse, response_model_by_alias=True)
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
                (data.platform, data.account_id)
            )
            existing = await cursor.fetchone()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Influencer already exists: {data.platform}/{data.account_id}"
                )

        # Generate ID
        influencer_id = f"inf_{int(datetime.now().timestamp() * 1000000)}"
        created_at = datetime.now().isoformat()

        # Serialize tags
        tags_str = json.dumps(data.tags) if data.tags else None

        # Insert to database
        async with db.get_connection() as conn:
            await conn.execute("""
                INSERT INTO Influencer (
                    id, name, platform, accountId, driverType, providerConfig,
                    fetchInterval, priority, isActive, profileUrl, avatarUrl,
                    category, tags, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                influencer_id,
                data.name,
                data.platform,
                data.account_id,
                data.driver_type,
                data.provider_config,
                data.fetch_interval,
                data.priority,
                1 if data.is_active else 0,
                data.profile_url,
                data.avatar_url,
                data.category,
                tags_str,
                created_at,
                created_at
            ))

        logger.info(f"Created influencer: {influencer_id} ({data.name})")

        return InfluencerResponse(
            id=influencer_id,
            name=data.name,
            platform=data.platform,
            account_id=data.account_id,
            is_active=data.is_active,
            last_fetch_at=None,
            last_fetch_status=None,
            created_at=created_at,
            priority=data.priority,
            fetch_interval=data.fetch_interval,
            driver_type=data.driver_type,
            profile_url=data.profile_url,
            category=data.category
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create influencer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=InfluencerListResponse, response_model_by_alias=True)
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
            items.append(InfluencerResponse(
                id=row['id'],
                name=row['name'],
                platform=row['platform'],
                account_id=row['accountId'],
                is_active=bool(row['isActive']),
                last_fetch_at=row['lastFetchAt'],
                last_fetch_status=row['lastFetchStatus'],
                created_at=row['createdAt'],
                priority=row['priority'],
                fetch_interval=row['fetchInterval'],
                driver_type=row['driverType'],
                profile_url=row['profileUrl'],
                category=row['category']
            ))

        return InfluencerListResponse(
            items=items,
            total=total,
            page=page,
            page_size=pageSize
        )

    except Exception as e:
        logger.error(f"Failed to list influencers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{influencer_id}", response_model=InfluencerResponse, response_model_by_alias=True)
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

        return InfluencerResponse(
            id=row['id'],
            name=row['name'],
            platform=row['platform'],
            account_id=row['accountId'],
            is_active=bool(row['isActive']),
            last_fetch_at=row['lastFetchAt'],
            last_fetch_status=row['lastFetchStatus'],
            created_at=row['createdAt'],
            priority=row['priority'],
            fetch_interval=row['fetchInterval'],
            driver_type=row['driverType'],
            profile_url=row['profileUrl'],
            category=row['category']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get influencer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{influencer_id}", response_model=InfluencerResponse, response_model_by_alias=True)
async def update_influencer(influencer_id: str, data: InfluencerCreate):
    """
    Update an existing influencer

    Updates influencer information by ID.
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

        # Serialize tags
        tags_str = json.dumps(data.tags) if data.tags else None
        updated_at = datetime.now().isoformat()

        # Update database
        async with db.get_connection() as conn:
            await conn.execute("""
                UPDATE Influencer SET
                    name = ?,
                    platform = ?,
                    accountId = ?,
                    driverType = ?,
                    providerConfig = ?,
                    fetchInterval = ?,
                    priority = ?,
                    isActive = ?,
                    profileUrl = ?,
                    avatarUrl = ?,
                    category = ?,
                    tags = ?,
                    updatedAt = ?
                WHERE id = ?
            """, (
                data.name,
                data.platform,
                data.account_id,
                data.driver_type,
                data.provider_config,
                data.fetch_interval,
                data.priority,
                1 if data.is_active else 0,
                data.profile_url,
                data.avatar_url,
                data.category,
                tags_str,
                updated_at,
                influencer_id
            ))

            # Fetch updated record
            cursor = await conn.execute(
                "SELECT * FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            row = await cursor.fetchone()

        logger.info(f"Updated influencer: {influencer_id} ({data.name})")

        return InfluencerResponse(
            id=row['id'],
            name=row['name'],
            platform=row['platform'],
            account_id=row['accountId'],
            is_active=bool(row['isActive']),
            last_fetch_at=row['lastFetchAt'],
            last_fetch_status=row['lastFetchStatus'],
            created_at=row['createdAt'],
            priority=row['priority'],
            fetch_interval=row['fetchInterval'],
            driver_type=row['driverType'],
            profile_url=row['profileUrl'],
            category=row['category']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update influencer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{influencer_id}")
async def delete_influencer(influencer_id: str):
    """
    Delete an influencer

    Performs a hard delete, removing the influencer and all associated posts.
    """
    try:
        # Check if influencer exists
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id, name FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            row = await cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Influencer not found: {influencer_id}")

        influencer_name = row['name']

        # Delete associated data (cascade delete)
        async with db.get_connection() as conn:
            # Delete posts
            await conn.execute(
                "DELETE FROM InfluencerPost WHERE influencerId = ?",
                (influencer_id,)
            )

            # Delete domain associations
            await conn.execute(
                "DELETE FROM DomainInfluencer WHERE influencerId = ?",
                (influencer_id,)
            )

            # Delete fetch logs
            await conn.execute(
                "DELETE FROM InfluencerFetchLog WHERE influencerId = ?",
                (influencer_id,)
            )

            # Delete the influencer
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


@router.get("/{influencer_id}/posts")
async def get_influencer_posts(
    influencer_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=100, description="Page size"),
    aiProcessed: Optional[bool] = Query(None, description="Filter by AI processing status")
):
    """
    Get posts for a specific influencer

    Supports pagination and filtering by AI processing status.
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

        offset = (page - 1) * pageSize

        # Build query
        where_clause = "WHERE influencerId = ?"
        params = [influencer_id]

        if aiProcessed is not None:
            where_clause += " AND aiProcessed = ?"
            params.append(1 if aiProcessed else 0)

        # Get total count
        async with db.get_connection() as conn:
            count_query = f"SELECT COUNT(*) as total FROM InfluencerPost {where_clause}"
            cursor = await conn.execute(count_query, params)
            row = await cursor.fetchone()
            total = row['total'] if row else 0

            # Get paginated results
            query = f"""
                SELECT * FROM InfluencerPost
                {where_clause}
                ORDER BY publishTime DESC
                LIMIT ? OFFSET ?
            """
            cursor = await conn.execute(query, params + [pageSize, offset])
            rows = await cursor.fetchall()

        # Format posts
        items = []
        for row in rows:
            items.append({
                "id": row['id'],
                "influencerId": row['influencerId'],
                "content": row['content'],
                "originalUrl": row['originalUrl'],
                "publishTime": row['publishTime'],
                "mediaType": row['mediaType'],
                "mediaUrls": row['mediaUrls'],
                "engagement": row['engagement'],
                "aiProcessed": bool(row['aiProcessed']),
                "aiProcessedAt": row['aiProcessedAt'],
                "opinionSummary": row['opinionSummary'],
                "opinionStance": row['opinionStance'],
                "opinionConfidence": row['opinionConfidence'],
                "primaryDomain": row['primaryDomain'],
                "secondaryDomains": row['secondaryDomains'],
                "sentiment": row['sentiment'],
                "createdAt": row['createdAt']
            })

        return {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": pageSize
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get influencer posts: {e}")
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
