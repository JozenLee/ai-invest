"""
Influencer Fetch Service
Fetches posts from influencers using configured providers
"""
import hashlib
import logging
import json
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from providers.provider_registry import InfluencerProviderRegistry

logger = logging.getLogger(__name__)


class InfluencerFetchService:
    """Service for fetching influencer posts"""

    def __init__(self, db):
        """
        Initialize the fetch service

        Args:
            db: Database instance
        """
        self.db = db

    async def fetch_influencer_posts(self, influencer_id: str) -> Dict:
        """
        Fetch posts for a single influencer

        Args:
            influencer_id: ID of the influencer to fetch

        Returns:
            Dict with keys:
                - success: bool
                - posts_fetched: int
                - posts_new: int
                - error: Optional[str]
        """
        start_time = datetime.now()
        posts_fetched = 0
        posts_new = 0
        error_message = None
        status = 'running'

        try:
            # 1. Get influencer configuration
            influencer = await self._get_influencer(influencer_id)
            if not influencer:
                raise ValueError(f"Influencer not found: {influencer_id}")

            platform = influencer['platform']
            account_id = influencer['accountId']
            driver_type = influencer.get('driverType', 'api')
            provider_config = json.loads(influencer.get('providerConfig') or '{}')

            logger.info(f"Fetching posts for influencer {influencer_id} ({platform}/{account_id})")

            # 2. Get provider instance
            provider_class = InfluencerProviderRegistry.get_provider(platform, driver_type)
            provider_config.update({
                'platform': platform,
                'driver_type': driver_type
            })
            provider = provider_class(provider_config)

            # 3. Fetch posts from provider
            since = None
            if influencer.get('lastFetchAt'):
                since = datetime.fromisoformat(influencer['lastFetchAt'])

            posts = await provider.fetch_user_posts(
                account_id=account_id,
                since=since,
                limit=20
            )
            posts_fetched = len(posts)

            logger.info(f"Fetched {posts_fetched} posts from {platform}")

            # 4. Get existing posts for deduplication
            existing_hashes = await self._get_existing_content_hashes(influencer_id)

            # 5. Save new posts
            for post in posts:
                # Calculate content hash for deduplication
                content_hash = self._calculate_content_hash(
                    platform=platform,
                    account_id=account_id,
                    content=post['content']
                )

                # Skip if already exists
                if content_hash in existing_hashes:
                    logger.debug(f"Skipping duplicate post: {content_hash[:8]}")
                    continue

                # Save to database
                saved = await self._save_post(influencer_id, post, platform, account_id)
                if saved:
                    posts_new += 1
                    existing_hashes.add(content_hash)

            # 6. Update influencer status
            await self._update_influencer_status(
                influencer_id=influencer_id,
                status='success',
                last_fetch_at=datetime.now()
            )

            status = 'success'
            logger.info(f"Successfully fetched {posts_new} new posts for {influencer_id}")

        except Exception as e:
            status = 'error'
            error_message = str(e)
            logger.error(f"Failed to fetch posts for {influencer_id}: {e}")

            # Update influencer with error
            try:
                await self._update_influencer_status(
                    influencer_id=influencer_id,
                    status='error',
                    error=error_message,
                    last_fetch_at=datetime.now()
                )
            except Exception as update_error:
                logger.error(f"Failed to update influencer status: {update_error}")

        finally:
            # 7. Create fetch log
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            try:
                await self._create_fetch_log(
                    influencer_id=influencer_id,
                    platform=influencer.get('platform', 'unknown') if 'influencer' in locals() else 'unknown',
                    status=status,
                    posts_fetched=posts_fetched,
                    posts_new=posts_new,
                    duration_ms=duration_ms,
                    error_message=error_message
                )
            except Exception as log_error:
                logger.error(f"Failed to create fetch log: {log_error}")

        return {
            'success': status == 'success',
            'posts_fetched': posts_fetched,
            'posts_new': posts_new,
            'error': error_message
        }

    async def fetch_all_due(self) -> Dict[str, int]:
        """
        Fetch posts for all influencers that are due for update

        Returns:
            Dict with keys:
                - total_fetched: Total number of influencers processed
                - success_count: Number of successful fetches
                - error_count: Number of failed fetches
        """
        logger.info("Starting batch fetch for due influencers")

        total_fetched = 0
        success_count = 0
        error_count = 0

        try:
            # Get all due influencers
            due_influencers = await self._get_due_influencers()
            logger.info(f"Found {len(due_influencers)} due influencers")

            # Fetch each influencer
            for influencer in due_influencers:
                total_fetched += 1
                result = await self.fetch_influencer_posts(influencer['id'])

                if result['success']:
                    success_count += 1
                else:
                    error_count += 1

        except Exception as e:
            logger.error(f"Batch fetch failed: {e}")

        logger.info(
            f"Batch fetch complete: {total_fetched} total, "
            f"{success_count} success, {error_count} errors"
        )

        return {
            'total_fetched': total_fetched,
            'success_count': success_count,
            'error_count': error_count
        }

    # ========== Private Helper Methods ==========

    async def _get_influencer(self, influencer_id: str) -> Optional[Dict]:
        """Get influencer by ID"""
        async with self.db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM Influencer WHERE id = ?",
                (influencer_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def _get_due_influencers(self) -> List[Dict]:
        """Get all influencers that are due for fetching"""
        async with self.db.get_connection() as conn:
            # Get active influencers where:
            # 1. Never fetched (lastFetchAt is NULL), OR
            # 2. Last fetch was more than fetchInterval minutes ago
            cursor = await conn.execute("""
                SELECT * FROM Influencer
                WHERE isActive = 1
                AND (
                    lastFetchAt IS NULL
                    OR datetime(lastFetchAt, '+' || fetchInterval || ' minutes') <= datetime('now')
                )
                ORDER BY priority DESC, lastFetchAt ASC
            """)
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def _get_existing_content_hashes(self, influencer_id: str) -> set:
        """Get set of existing content hashes for deduplication"""
        async with self.db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT content FROM InfluencerPost WHERE influencerId = ?",
                (influencer_id,)
            )
            rows = await cursor.fetchall()

            # Calculate hash for each existing post
            hashes = set()
            for row in rows:
                # Get influencer info for hash calculation
                influencer = await self._get_influencer(influencer_id)
                if influencer:
                    content_hash = self._calculate_content_hash(
                        platform=influencer['platform'],
                        account_id=influencer['accountId'],
                        content=row['content']
                    )
                    hashes.add(content_hash)

            return hashes

    def _calculate_content_hash(self, platform: str, account_id: str, content: str) -> str:
        """
        Calculate unique hash for content deduplication

        Args:
            platform: Platform name
            account_id: Account ID
            content: Post content

        Returns:
            MD5 hash string
        """
        # Combine platform + accountId + content for unique hash
        unique_string = f"{platform}:{account_id}:{content}"
        return hashlib.md5(unique_string.encode('utf-8')).hexdigest()

    async def _save_post(
        self,
        influencer_id: str,
        post: Dict,
        platform: str,
        account_id: str
    ) -> bool:
        """Save a post to database"""
        try:
            async with self.db.get_connection() as conn:
                post_id = f"post_{int(datetime.now().timestamp() * 1000000)}"

                # Serialize complex fields
                media_urls = json.dumps(post.get('media_urls', []))
                engagement = json.dumps({
                    'likes': post.get('likes', 0),
                    'comments': post.get('comments', 0),
                    'shares': post.get('shares', 0)
                })

                await conn.execute("""
                    INSERT INTO InfluencerPost (
                        id, influencerId, content, originalUrl, publishTime,
                        mediaType, mediaUrls, engagement, aiProcessed, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    post_id,
                    influencer_id,
                    post.get('content', ''),
                    post.get('url'),
                    post.get('publish_time').isoformat() if isinstance(post.get('publish_time'), datetime) else post.get('publish_time'),
                    post.get('media_type', 'text'),
                    media_urls,
                    engagement,
                    0,  # aiProcessed
                    datetime.now().isoformat()
                ))

                logger.debug(f"Saved post {post_id}")
                return True

        except Exception as e:
            logger.error(f"Failed to save post: {e}")
            return False

    async def _update_influencer_status(
        self,
        influencer_id: str,
        status: str,
        last_fetch_at: Optional[datetime] = None,
        error: Optional[str] = None
    ):
        """Update influencer fetch status"""
        async with self.db.get_connection() as conn:
            await conn.execute("""
                UPDATE Influencer
                SET lastFetchStatus = ?,
                    lastFetchAt = ?,
                    lastFetchError = ?,
                    updatedAt = ?
                WHERE id = ?
            """, (
                status,
                last_fetch_at.isoformat() if last_fetch_at else None,
                error,
                datetime.now().isoformat(),
                influencer_id
            ))

    async def _create_fetch_log(
        self,
        influencer_id: str,
        platform: str,
        status: str,
        posts_fetched: int,
        posts_new: int,
        duration_ms: int,
        error_message: Optional[str] = None
    ):
        """Create a fetch log entry"""
        async with self.db.get_connection() as conn:
            log_id = f"log_{int(datetime.now().timestamp() * 1000000)}"

            await conn.execute("""
                INSERT INTO InfluencerFetchLog (
                    id, influencerId, platform, status, postsFetched,
                    postsNew, durationMs, errorMessage, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                log_id,
                influencer_id,
                platform,
                status,
                posts_fetched,
                posts_new,
                duration_ms,
                error_message,
                datetime.now().isoformat()
            ))

            logger.debug(f"Created fetch log {log_id}")
