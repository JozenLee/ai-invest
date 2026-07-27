#!/usr/bin/env python3
"""
Test script for ZhihuAPIProvider

Usage:
    python3 test_zhihu_provider.py
"""

import asyncio
import logging
from providers.zhihu_provider import ZhihuAPIProvider
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


async def test_zhihu_provider():
    """Test Zhihu Provider functionality"""

    # Configure provider
    config = {
        'platform': 'zhihu',
        'driver_type': 'api',
        'timeout': 10,
        'max_retries': 3,
        'retry_delay': 2,
        # Add your Zhihu cookies here for authenticated requests
        'cookie_str': '',  # Optional: 'd_c0=xxx; _zap=xxx; ...'
    }

    provider = ZhihuAPIProvider(config)

    try:
        # Test 1: Validate account
        logger.info("=" * 60)
        logger.info("Test 1: Validate Account")
        logger.info("=" * 60)

        # Example: Use a well-known Zhihu account (e.g., 'excited-vczh' for 轮子哥)
        test_account = 'excited-vczh'

        is_valid = await provider.validate_account(test_account)
        logger.info(f"Account {test_account} valid: {is_valid}")

        if not is_valid:
            logger.warning("Account validation failed. Please check the account_id or cookies.")
            return

        # Test 2: Fetch user info
        logger.info("\n" + "=" * 60)
        logger.info("Test 2: Fetch User Info")
        logger.info("=" * 60)

        user_info = await provider.fetch_user_info(test_account)
        if user_info:
            logger.info(f"Name: {user_info.get('name')}")
            logger.info(f"Description: {user_info.get('description')}")
            logger.info(f"Verified: {user_info.get('verified')}")
            logger.info(f"Followers: {user_info.get('followers_count')}")
            logger.info(f"Profile URL: {user_info.get('profile_url')}")
            logger.info(f"Avatar URL: {user_info.get('avatar_url')}")
        else:
            logger.error("Failed to fetch user info")

        # Test 3: Fetch user posts
        logger.info("\n" + "=" * 60)
        logger.info("Test 3: Fetch User Posts")
        logger.info("=" * 60)

        # Fetch posts from the last 30 days
        since = datetime.now() - timedelta(days=30)
        posts = await provider.fetch_user_posts(test_account, since=since, limit=5)

        logger.info(f"Fetched {len(posts)} posts")

        for i, post in enumerate(posts, 1):
            logger.info(f"\n--- Post {i} ---")
            logger.info(f"Content: {post.get('content', '')[:100]}...")
            logger.info(f"URL: {post.get('url')}")
            logger.info(f"Publish Time: {post.get('publish_time')}")
            logger.info(f"Media Type: {post.get('media_type')}")
            logger.info(f"Likes: {post.get('likes')}")
            logger.info(f"Comments: {post.get('comments')}")

            # Show extra Zhihu-specific data
            extra = post.get('extra', {})
            logger.info(f"Content Type: {extra.get('contentType')}")
            if extra.get('questionTitle'):
                logger.info(f"Question: {extra.get('questionTitle')}")
            logger.info(f"Voteup Count: {extra.get('voteupCount')}")
            logger.info(f"Is Featured: {extra.get('isFeatured')}")

        logger.info("\n" + "=" * 60)
        logger.info("All tests completed successfully!")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)

    finally:
        # Clean up
        await provider.close()


if __name__ == '__main__':
    asyncio.run(test_zhihu_provider())
