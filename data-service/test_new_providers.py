#!/usr/bin/env python3
"""
Test script for new provider implementations
Validates instantiation and basic method calls
"""

import asyncio
import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from providers.xiaohongshu_provider import XiaohongshuAPIProvider
from providers.zhihu_provider import ZhihuAPIProvider
from providers.provider_registry import InfluencerProviderRegistry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_xiaohongshu_provider():
    """Test XiaohongshuAPIProvider"""
    logger.info("=" * 60)
    logger.info("Testing XiaohongshuAPIProvider")
    logger.info("=" * 60)

    try:
        # 1. Test instantiation
        config = {
            'timeout': 10,
            'max_retries': 2,
            'retry_delay': 1.0,
        }
        provider = XiaohongshuAPIProvider(config)
        logger.info("✓ Provider instantiation successful")

        # 2. Test method existence
        assert hasattr(provider, 'fetch_user_info'), "Missing fetch_user_info method"
        assert hasattr(provider, 'fetch_user_posts'), "Missing fetch_user_posts method"
        assert hasattr(provider, 'validate_account'), "Missing validate_account method"
        logger.info("✓ All required methods present")

        # 3. Test rate limiter initialization
        await provider._ensure_rate_limiter()
        assert provider.rate_limiter is not None, "Rate limiter not initialized"
        logger.info("✓ Rate limiter initialized")

        # 4. Test helper methods
        follower_count = provider._parse_follower_count("1.2万")
        assert follower_count == 12000, f"Expected 12000, got {follower_count}"
        logger.info(f"✓ Follower count parser works: '1.2万' -> {follower_count}")

        # 5. Test cookie parsing
        cookie_str = "key1=value1; key2=value2"
        cookies = provider._parse_cookie_string(cookie_str)
        assert cookies == {'key1': 'value1', 'key2': 'value2'}
        logger.info("✓ Cookie parsing works")

        logger.info("✅ XiaohongshuAPIProvider: ALL TESTS PASSED\n")
        return True

    except Exception as e:
        logger.error(f"❌ XiaohongshuAPIProvider test failed: {e}", exc_info=True)
        return False


async def test_zhihu_provider():
    """Test ZhihuAPIProvider"""
    logger.info("=" * 60)
    logger.info("Testing ZhihuAPIProvider")
    logger.info("=" * 60)

    try:
        # 1. Test instantiation
        config = {
            'timeout': 10,
            'max_retries': 2,
            'retry_delay': 1.0,
        }
        provider = ZhihuAPIProvider(config)
        logger.info("✓ Provider instantiation successful")

        # 2. Test method existence
        assert hasattr(provider, 'fetch_user_info'), "Missing fetch_user_info method"
        assert hasattr(provider, 'fetch_user_posts'), "Missing fetch_user_posts method"
        assert hasattr(provider, 'validate_account'), "Missing validate_account method"
        logger.info("✓ All required methods present")

        # 3. Test rate limiter initialization
        await provider._ensure_rate_limiter()
        assert provider.rate_limiter is not None, "Rate limiter not initialized"
        logger.info("✓ Rate limiter initialized")

        # 4. Test helper methods
        content_type = provider._determine_content_type('MEMBER_CREATE_ARTICLE', {'type': 'article'})
        assert content_type == 'article', f"Expected 'article', got {content_type}"
        logger.info(f"✓ Content type detection works: {content_type}")

        # 5. Test cookie parsing
        cookie_str = "session=abc123; _xsrf=xyz789"
        cookies = provider._parse_cookie_string(cookie_str)
        assert cookies == {'session': 'abc123', '_xsrf': 'xyz789'}
        logger.info("✓ Cookie parsing works")

        logger.info("✅ ZhihuAPIProvider: ALL TESTS PASSED\n")
        return True

    except Exception as e:
        logger.error(f"❌ ZhihuAPIProvider test failed: {e}", exc_info=True)
        return False


async def test_provider_registry():
    """Test provider registration"""
    logger.info("=" * 60)
    logger.info("Testing Provider Registry")
    logger.info("=" * 60)

    try:
        # Test registered providers
        # When calling get_provider(platform, driver_type), it constructs key as "platform_driver_type"
        # So for 'weibo_api' registration, we call with platform='weibo' and driver_type='api'
        providers = [
            ('weibo', 'api', 'WeiboAPIProvider'),
            ('bilibili', 'api', 'BilibiliAPIProvider'),
            ('xiaohongshu', 'api', 'XiaohongshuAPIProvider'),
            ('zhihu', 'api', 'ZhihuAPIProvider'),
            ('douyin', 'crawler', 'DouyinCrawlerProvider'),
            ('alipay', 'api', 'AlipayAPIProvider'),
        ]

        for platform, driver_type, expected_name in providers:
            key = f"{platform}_{driver_type}"
            provider_class = InfluencerProviderRegistry.get_provider(platform, driver_type)
            assert provider_class is not None, f"Provider {key} not registered"
            assert provider_class.__name__ == expected_name, f"Expected {expected_name}, got {provider_class.__name__}"
            logger.info(f"✓ {key} -> {expected_name}")

        logger.info("✅ Provider Registry: ALL TESTS PASSED\n")
        return True

    except Exception as e:
        logger.error(f"❌ Provider Registry test failed: {e}", exc_info=True)
        return False


async def test_data_format():
    """Test that providers return data in expected format"""
    logger.info("=" * 60)
    logger.info("Testing Data Format Compliance")
    logger.info("=" * 60)

    try:
        from datetime import datetime

        # Test Xiaohongshu note parsing
        xhs_provider = XiaohongshuAPIProvider({})
        mock_note = {
            'note_id': 'test123',
            'title': 'Test Title',
            'desc': 'Test content',
            'type': 'video',
            'last_update_time': 1700000000,
            'interact_info': {'liked_count': '1000'},
            'tag_list': [{'name': 'tag1'}, {'name': 'tag2'}],
        }

        parsed = xhs_provider._parse_note(mock_note, 'user123')
        assert parsed is not None, "Failed to parse note"
        assert 'content' in parsed, "Missing 'content' field"
        assert 'url' in parsed, "Missing 'url' field"
        assert 'publish_time' in parsed, "Missing 'publish_time' field"
        assert 'media_type' in parsed, "Missing 'media_type' field"
        assert 'extra_data' in parsed, "Missing 'extra_data' field"
        assert parsed['media_type'] == 'video', f"Expected 'video', got {parsed['media_type']}"
        logger.info("✓ Xiaohongshu data format correct")

        # Test Zhihu answer parsing
        zhihu_provider = ZhihuAPIProvider({})
        mock_answer = {
            'id': 12345,
            'content': 'Test answer',
            'created_time': 1700000000,
            'voteup_count': 500,
            'comment_count': 50,
            'question': {
                'id': 67890,
                'title': 'Test Question'
            }
        }

        parsed = zhihu_provider._parse_answer(mock_answer, datetime.now())
        assert parsed is not None, "Failed to parse answer"
        assert 'content' in parsed, "Missing 'content' field"
        assert 'url' in parsed, "Missing 'url' field"
        assert 'extra' in parsed, "Missing 'extra' field"
        assert parsed['extra']['contentType'] == 'answer', "Wrong content type"
        logger.info("✓ Zhihu data format correct")

        logger.info("✅ Data Format: ALL TESTS PASSED\n")
        return True

    except Exception as e:
        logger.error(f"❌ Data format test failed: {e}", exc_info=True)
        return False


async def main():
    """Run all tests"""
    logger.info("\n" + "=" * 60)
    logger.info("STARTING PROVIDER INTEGRATION TESTS")
    logger.info("=" * 60 + "\n")

    results = []

    # Run tests
    results.append(await test_xiaohongshu_provider())
    results.append(await test_zhihu_provider())
    results.append(await test_provider_registry())
    results.append(await test_data_format())

    # Summary
    logger.info("=" * 60)
    logger.info("TEST SUMMARY")
    logger.info("=" * 60)

    passed = sum(results)
    total = len(results)

    logger.info(f"Tests passed: {passed}/{total}")

    if passed == total:
        logger.info("🎉 ALL TESTS PASSED!")
        return 0
    else:
        logger.error(f"❌ {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
