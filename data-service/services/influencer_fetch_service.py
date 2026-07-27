"""
Influencer Fetch Service
Fetches posts from influencers using configured providers
"""
import hashlib
import logging
import json
import time
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
                - elapsed_seconds: float
        """
        start_time = time.time()
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

            logger.info(f"Starting fetch for influencer: {influencer_id} (platform={platform}, account={account_id}, driver={driver_type})")

            # 2. Get provider instance with merged config
            # Priority: PlatformConfig table > influencer.providerConfig
            try:
                async with self.db.get_connection() as conn:
                    cursor = await conn.execute(
                        "SELECT configData FROM PlatformConfig WHERE platform = ? AND isActive = 1",
                        (platform,)
                    )
                    platform_config_row = await cursor.fetchone()

                if platform_config_row:
                    platform_config_data = json.loads(platform_config_row['configData'])
                    # Merge: platform config overrides influencer config
                    provider_config.update(platform_config_data)
                    logger.info(f"Using platform config for {platform}")
                else:
                    logger.info(f"No platform config found for {platform}, using influencer-specific config")
            except Exception as e:
                logger.warning(f"Failed to load platform config: {e}, using influencer-specific config")

            provider_class = InfluencerProviderRegistry.get_provider(platform, driver_type)
            provider_config.update({
                'platform': platform,
                'driver_type': driver_type
            })
            provider = provider_class(provider_config)

            # 2.5. Sync platform information
            try:
                user_info = await provider.fetch_user_info(account_id)
                if user_info and user_info.get('name'):
                    # Update platform-bound fields
                    async with self.db.get_connection() as conn:
                        await conn.execute("""
                            UPDATE Influencer SET
                                name = ?,
                                avatarUrl = ?,
                                profileUrl = ?,
                                category = ?,
                                updatedAt = ?
                            WHERE id = ?
                        """, (
                            user_info.get('name'),
                            user_info.get('avatar_url'),
                            user_info.get('profile_url'),
                            user_info.get('category'),
                            datetime.now().isoformat(),
                            influencer_id
                        ))
                    logger.info(f"Synced platform info for influencer {influencer_id}")
            except Exception as e:
                logger.warning(f"Failed to sync platform info for {influencer_id}: {e}")
                # Continue with fetch even if sync fails

            # 3. Fetch posts from provider
            # Determine the time range based on dataRetentionDays
            # Always fetch from retention period to ensure complete historical data
            data_retention_days = influencer.get('dataRetentionDays', 30)
            retention_cutoff = datetime.now() - timedelta(days=data_retention_days)
            since = retention_cutoff

            logger.info(f"Fetching posts since {since.isoformat()} (retention: {data_retention_days} days)")

            fetch_start = time.time()
            posts = await provider.fetch_user_posts(
                account_id=account_id,
                since=since,
                limit=100  # Increase limit for initial fetch
            )
            total_posts_from_api = len(posts)
            fetch_elapsed = time.time() - fetch_start

            logger.info(f"Provider fetch completed: {total_posts_from_api} posts from {platform} in {fetch_elapsed:.2f}s")

            # 4. Get existing posts for deduplication
            dedup_start = time.time()
            existing_hashes = await self._get_existing_content_hashes(influencer_id)
            dedup_elapsed = time.time() - dedup_start
            logger.debug(f"Deduplication check: {len(existing_hashes)} existing hashes loaded in {dedup_elapsed:.2f}s")

            # 5. Save new posts
            duplicates_skipped = 0
            empty_content_skipped = 0
            valid_posts = 0  # Track valid posts with content
            for post in posts:
                content = post.get('content', '')

                # Skip posts with empty content (unsupported dynamic types)
                if not content or not content.strip():
                    empty_content_skipped += 1
                    logger.debug(f"Skipping post with empty content (unsupported type)")
                    continue

                valid_posts += 1  # Count posts with valid content

                # Calculate content hash for deduplication
                content_hash = self._calculate_content_hash(
                    platform=platform,
                    account_id=account_id,
                    content=content
                )

                # Skip if already exists
                if content_hash in existing_hashes:
                    duplicates_skipped += 1
                    logger.debug(f"Skipping duplicate post: {content_hash[:8]}")
                    continue

                # Save to database
                saved = await self._save_post(influencer_id, post, platform, account_id)
                if saved:
                    posts_new += 1
                    existing_hashes.add(content_hash)

            # Set posts_fetched to valid posts count (excluding empty content)
            posts_fetched = valid_posts

            if duplicates_skipped > 0:
                logger.info(f"Skipped {duplicates_skipped} duplicate posts for {influencer_id}")
            if empty_content_skipped > 0:
                logger.info(f"Skipped {empty_content_skipped} empty content posts (API returned {total_posts_from_api} total) for {influencer_id}")

            # 6. Update influencer status
            await self._update_influencer_status(
                influencer_id=influencer_id,
                status='success',
                last_fetch_at=datetime.now()
            )

            status = 'success'
            elapsed = time.time() - start_time
            logger.info(
                f"Fetch completed for {influencer_id}: "
                f"{posts_new} new posts (out of {posts_fetched} fetched), "
                f"took {elapsed:.2f}s"
            )

        except Exception as e:
            status = 'error'
            error_message = str(e)
            elapsed = time.time() - start_time
            logger.error(
                f"Fetch failed for {influencer_id} after {elapsed:.2f}s: {e}",
                exc_info=True
            )

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
            duration_ms = int((time.time() - start_time) * 1000)
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
            'error': error_message,
            'elapsed_seconds': duration_ms / 1000.0
        }

    async def fetch_all_due(self) -> Dict[str, int]:
        """
        Fetch posts for all influencers that are due for update

        Returns:
            Dict with keys:
                - total_fetched: Total number of influencers processed
                - success_count: Number of successful fetches
                - error_count: Number of failed fetches
                - elapsed_seconds: Total time taken
        """
        batch_start = time.time()
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
            logger.error(f"Batch fetch failed: {e}", exc_info=True)

        batch_elapsed = time.time() - batch_start
        success_rate = (success_count / total_fetched * 100) if total_fetched > 0 else 0

        logger.info(
            f"Batch fetch complete: {total_fetched} total, "
            f"{success_count} success ({success_rate:.1f}%), "
            f"{error_count} errors, "
            f"took {batch_elapsed:.2f}s"
        )

        return {
            'total_fetched': total_fetched,
            'success_count': success_count,
            'error_count': error_count,
            'elapsed_seconds': batch_elapsed
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
        """Save a post to database with platform-specific extra data"""
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
                        mediaType, mediaUrls, engagement, aiProcessed, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))

                # Save platform-specific extra data
                await self._save_platform_extra(conn, post_id, platform, post)

                logger.debug(f"Saved post {post_id} with {platform} extra data")
                return True

        except Exception as e:
            logger.error(f"Failed to save post: {e}", exc_info=True)
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

    async def _save_platform_extra(
        self,
        conn,
        post_id: str,
        platform: str,
        post: Dict
    ):
        """
        Save platform-specific extra data to extension tables

        Args:
            conn: Database connection
            post_id: ID of the post
            platform: Platform name
            post: Post dict containing 'extra' or 'extra_data' field
        """
        # Get extra data from post (supports both 'extra' and 'extra_data' keys)
        extra = post.get('extra') or post.get('extra_data')
        if not extra:
            return

        now = datetime.now().isoformat()

        try:
            if platform == 'xiaohongshu_api':
                # XiaohongshuPostExtra
                await conn.execute("""
                    INSERT INTO XiaohongshuPostExtra (
                        id, postId, noteType, tags, collects, hasGoodsLink, topicIds, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"extra_{post_id}",
                    post_id,
                    extra.get('noteType', 'normal'),
                    extra.get('tags', '[]'),
                    extra.get('collects', 0),
                    extra.get('hasGoodsLink', False),
                    extra.get('topicIds'),
                    now,
                    now
                ))
                logger.debug(f"Saved XiaohongshuPostExtra for post {post_id}")

            elif platform == 'zhihu_api':
                # ZhihuPostExtra
                await conn.execute("""
                    INSERT INTO ZhihuPostExtra (
                        id, postId, contentType, questionId, questionTitle,
                        voteupCount, votedownCount, isFeatured, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"extra_{post_id}",
                    post_id,
                    extra.get('contentType', 'unknown'),
                    extra.get('questionId'),
                    extra.get('questionTitle'),
                    extra.get('voteupCount', 0),
                    extra.get('votedownCount', 0),
                    extra.get('isFeatured', False),
                    now,
                    now
                ))
                logger.debug(f"Saved ZhihuPostExtra for post {post_id}")

            elif platform == 'douyin_api':
                # DouyinPostExtra
                await conn.execute("""
                    INSERT INTO DouyinPostExtra (
                        id, postId, videoDuration, musicId, musicTitle,
                        musicAuthor, challengeTags, isAd, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"extra_{post_id}",
                    post_id,
                    extra.get('videoDuration', 0),
                    extra.get('musicId'),
                    extra.get('musicTitle'),
                    extra.get('musicAuthor'),
                    extra.get('challengeTags'),
                    extra.get('isAd', False),
                    now,
                    now
                ))
                logger.debug(f"Saved DouyinPostExtra for post {post_id}")

            elif platform == 'alipay_api':
                # AlipayPostExtra
                await conn.execute("""
                    INSERT INTO AlipayPostExtra (
                        id, postId, articleType, category, serviceId, hasService, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"extra_{post_id}",
                    post_id,
                    extra.get('articleType', 'news'),
                    extra.get('category'),
                    extra.get('serviceId'),
                    extra.get('hasService', False),
                    now,
                    now
                ))
                logger.debug(f"Saved AlipayPostExtra for post {post_id}")

        except Exception as e:
            # Don't fail the entire post save if extra data fails
            logger.warning(f"Failed to save {platform} extra data for post {post_id}: {e}")
