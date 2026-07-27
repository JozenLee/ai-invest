"""
Test script for Xiaohongshu Provider

Usage:
    python test_xiaohongshu_provider.py
"""
import asyncio
import logging
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from providers.xiaohongshu_provider import XiaohongshuAPIProvider

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


async def test_user_info(provider: XiaohongshuAPIProvider, user_id: str):
    """Test fetching user info"""
    logger.info(f"\n{'='*60}")
    logger.info(f"Testing user info for: {user_id}")
    logger.info(f"{'='*60}")

    user_info = await provider.fetch_user_info(user_id)

    if user_info:
        logger.info(f"✓ User info fetched successfully")
        logger.info(f"  Name: {user_info.get('name')}")
        logger.info(f"  Avatar: {user_info.get('avatar_url', '')[:60]}...")
        logger.info(f"  Description: {user_info.get('description', '')[:100]}...")
        logger.info(f"  Verified: {user_info.get('verified')}")
        logger.info(f"  Followers: {user_info.get('followers_count')}")
        logger.info(f"  Profile URL: {user_info.get('profile_url')}")
    else:
        logger.error(f"✗ Failed to fetch user info")

    return user_info


async def test_user_posts(provider: XiaohongshuAPIProvider, user_id: str, limit: int = 5):
    """Test fetching user posts"""
    logger.info(f"\n{'='*60}")
    logger.info(f"Testing user posts for: {user_id} (limit={limit})")
    logger.info(f"{'='*60}")

    posts = await provider.fetch_user_posts(user_id, limit=limit)

    if posts:
        logger.info(f"✓ Fetched {len(posts)} posts")
        for i, post in enumerate(posts[:3], 1):
            logger.info(f"\n  Post {i}:")
            logger.info(f"    Content: {post.get('content', '')[:100]}...")
            logger.info(f"    URL: {post.get('url')}")
            logger.info(f"    Publish Time: {post.get('publish_time')}")
            logger.info(f"    Media Type: {post.get('media_type')}")
            logger.info(f"    Likes: {post.get('likes')}")

            # Show extra data if available
            extra_data = post.get('extra_data', {})
            if extra_data:
                logger.info(f"    Note Type: {extra_data.get('noteType')}")
                logger.info(f"    Tags: {extra_data.get('tags', '[]')}")
    else:
        logger.warning(f"✗ No posts found")

    return posts


async def test_validate_account(provider: XiaohongshuAPIProvider, user_id: str):
    """Test account validation"""
    logger.info(f"\n{'='*60}")
    logger.info(f"Testing account validation for: {user_id}")
    logger.info(f"{'='*60}")

    is_valid = await provider.validate_account(user_id)

    if is_valid:
        logger.info(f"✓ Account is valid")
    else:
        logger.warning(f"✗ Account is invalid or not accessible")

    return is_valid


async def main():
    """Main test function"""
    logger.info("Starting Xiaohongshu Provider Tests")

    # Configuration (Note: Cookie is required for actual API access)
    config = {
        'platform': 'xiaohongshu',
        'driver_type': 'api',
        'timeout': 15,
        'max_retries': 3,
        'retry_delay': 2.0,
        # Add cookies here for actual testing:
        # 'cookie_str': 'your_cookie_string_here',
    }

    # Initialize provider
    provider = XiaohongshuAPIProvider(config)

    # Test user ID (replace with actual Xiaohongshu user ID for testing)
    test_user_id = "5c3e9eb90000000006019f23"  # Example user ID

    logger.info(f"\nNote: This test requires valid cookies for authentication.")
    logger.info(f"Set 'cookie_str' in config for actual API testing.\n")

    try:
        # Test 1: Validate account
        await test_validate_account(provider, test_user_id)

        # Test 2: Fetch user info
        await test_user_info(provider, test_user_id)

        # Test 3: Fetch user posts
        await test_user_posts(provider, test_user_id, limit=5)

        logger.info(f"\n{'='*60}")
        logger.info("All tests completed!")
        logger.info(f"{'='*60}")

    except Exception as e:
        logger.error(f"Test failed with error: {e}", exc_info=True)

    finally:
        # Cleanup
        await provider.client.close()


if __name__ == '__main__':
    asyncio.run(main())
