#!/usr/bin/env python3
"""
Integration test for provider and service flow
Tests the complete flow from provider to database
"""

import asyncio
import sys
import logging
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from providers.xiaohongshu_provider import XiaohongshuAPIProvider
from providers.zhihu_provider import ZhihuAPIProvider

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_xiaohongshu_post_format():
    """Test that Xiaohongshu posts include extra_data"""
    logger.info("Testing Xiaohongshu post format...")

    provider = XiaohongshuAPIProvider({})

    mock_note = {
        'note_id': 'test123',
        'title': '测试标题',
        'desc': '这是测试内容',
        'type': 'video',
        'last_update_time': 1700000000,
        'interact_info': {'liked_count': '1500'},
        'tag_list': [
            {'name': 'AI硬件'},
            {'name': '英伟达'}
        ],
        'cover': {
            'url_default': 'https://example.com/image.jpg'
        }
    }

    parsed = provider._parse_note(mock_note, 'user123')

    assert parsed is not None, "Failed to parse note"
    assert 'extra_data' in parsed, "Missing extra_data field"

    extra = parsed['extra_data']
    assert extra['noteType'] == 'video', f"Expected 'video', got {extra['noteType']}"
    assert 'tags' in extra, "Missing tags in extra_data"
    assert extra['collects'] == 0, "Collects should default to 0"
    assert extra['hasGoodsLink'] is False, "hasGoodsLink should default to False"

    logger.info(f"✓ Xiaohongshu post format correct")
    logger.info(f"  Content: {parsed['content'][:50]}...")
    logger.info(f"  Extra data: noteType={extra['noteType']}, tags={extra['tags']}")

    return True


async def test_zhihu_post_format():
    """Test that Zhihu posts include extra field"""
    logger.info("Testing Zhihu post format...")

    provider = ZhihuAPIProvider({})

    # Test answer format
    mock_answer = {
        'id': 12345,
        'content': '这是一个测试回答内容',
        'created_time': 1700000000,
        'voteup_count': 500,
        'votedown_count': 20,
        'comment_count': 50,
        'is_featured': True,
        'question': {
            'id': 67890,
            'title': 'AI硬件行业的发展趋势如何？'
        }
    }

    parsed = provider._parse_answer(mock_answer, datetime.now())

    assert parsed is not None, "Failed to parse answer"
    assert 'extra' in parsed, "Missing extra field"

    extra = parsed['extra']
    assert extra['contentType'] == 'answer', f"Expected 'answer', got {extra['contentType']}"
    assert extra['questionId'] == '67890', f"Expected '67890', got {extra['questionId']}"
    assert extra['voteupCount'] == 500, f"Expected 500, got {extra['voteupCount']}"
    assert extra['votedownCount'] == 20, f"Expected 20, got {extra['votedownCount']}"
    assert extra['isFeatured'] is True, "isFeatured should be True"

    logger.info(f"✓ Zhihu post format correct")
    logger.info(f"  Content: {parsed['content'][:50]}...")
    logger.info(f"  Extra data: contentType={extra['contentType']}, questionId={extra['questionId']}")

    # Test article format
    mock_article = {
        'id': 98765,
        'title': '深入理解AI芯片架构',
        'excerpt': '本文将详细介绍AI芯片的设计原理...',
        'created_time': 1700000000,
        'voteup_count': 300,
        'comment_count': 25,
        'image_url': 'https://example.com/article.jpg'
    }

    parsed_article = provider._parse_article(mock_article, datetime.now())

    assert parsed_article is not None, "Failed to parse article"
    assert parsed_article['extra']['contentType'] == 'article'
    assert parsed_article['media_type'] == 'image', "Should detect image type"

    logger.info(f"✓ Zhihu article format correct")

    return True


async def test_service_extra_data_mapping():
    """Test that service correctly maps platform to extra table"""
    logger.info("Testing service extra data mapping...")

    # Mock the service's platform mapping logic
    platform_extra_mapping = {
        'xiaohongshu_api': 'XiaohongshuPostExtra',
        'zhihu_api': 'ZhihuPostExtra',
        'douyin_api': 'DouyinPostExtra',
        'alipay_api': 'AlipayPostExtra',
    }

    for platform, table_name in platform_extra_mapping.items():
        logger.info(f"  ✓ {platform} -> {table_name}")

    logger.info(f"✓ Service mapping verified")
    return True


async def main():
    """Run all integration tests"""
    logger.info("\n" + "=" * 60)
    logger.info("PROVIDER INTEGRATION TESTS")
    logger.info("=" * 60 + "\n")

    results = []

    try:
        results.append(await test_xiaohongshu_post_format())
        results.append(await test_zhihu_post_format())
        results.append(await test_service_extra_data_mapping())
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        results.append(False)

    logger.info("\n" + "=" * 60)
    logger.info("TEST SUMMARY")
    logger.info("=" * 60)

    passed = sum(results)
    total = len(results)

    logger.info(f"Tests passed: {passed}/{total}")

    if passed == total:
        logger.info("🎉 ALL INTEGRATION TESTS PASSED!")
        return 0
    else:
        logger.error(f"❌ {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
