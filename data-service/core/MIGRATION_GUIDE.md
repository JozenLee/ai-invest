# Core Infrastructure Migration Guide

## Migrating Existing Providers

This guide shows how to refactor existing providers to use the new core infrastructure.

## Before: Original BilibiliProvider Pattern

```python
import aiohttp
import asyncio
import logging

class BilibiliProvider:
    def __init__(self, config: Dict):
        self.config = config
        self.base_url = "https://api.bilibili.com"
        self.cookies = self._parse_cookie_string(config.get('cookie_str', ''))
    
    def _get_headers(self, account_id: str = None) -> Dict:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
            'Accept': 'application/json, text/plain, */*',
        }
        if account_id:
            headers['Referer'] = f'https://space.bilibili.com/{account_id}'
        return headers
    
    async def fetch_user_info(self, account_id: str, retry_count: int = 0) -> Dict:
        url = f"{self.base_url}/x/space/acc/info"
        params = {'mid': account_id}
        headers = self._get_headers(account_id)
        max_retries = self.config.get('max_retries', 3)
        retry_delay = self.config.get('retry_delay', 2)
        
        try:
            async with aiohttp.ClientSession(cookies=self.cookies) as session:
                base_delay = 1.5 if retry_count == 0 else retry_delay * (retry_count + 1)
                await asyncio.sleep(base_delay)
                
                async with session.get(url, params=params, headers=headers, 
                                      timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status == 200:
                        result = await response.json()
                        if result.get('code') == 0:
                            # Parse and return data
                            return {...}
                        else:
                            error_code = result.get('code')
                            if error_code == -799 and retry_count < max_retries:
                                wait_time = retry_delay * (2 ** retry_count)
                                await asyncio.sleep(wait_time)
                                return await self.fetch_user_info(account_id, retry_count + 1)
                            return {}
                    else:
                        return {}
        except asyncio.TimeoutError:
            if retry_count < max_retries:
                return await self.fetch_user_info(account_id, retry_count + 1)
            return {}
        except Exception as e:
            logger.error(f"Error: {e}")
            return {}
```

**Issues:**
- Creates new session for each request (no connection pooling)
- Manual retry logic duplicated across methods
- Hardcoded User-Agent
- No rate limiting
- Manual delay management
- Complex error handling

## After: Using Core Infrastructure

```python
from typing import Dict, List, Optional
from datetime import datetime
import logging
from core import (
    BaseHTTPClient,
    get_rate_limiter,
    get_random_user_agent,
    parse_timestamp,
    clean_text,
    detect_media_type,
)
from providers.base_influencer_provider import BaseInfluencerProvider

logger = logging.getLogger(__name__)


class BilibiliProvider(BaseInfluencerProvider):
    """Bilibili provider using core infrastructure"""
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.platform = "bilibili"
        self.cookies = self._parse_cookies(config)
        
        # Initialize HTTP client with automatic retry
        self.client = BaseHTTPClient(
            base_url="https://api.bilibili.com",
            cookies=self.cookies,
            headers=self._get_base_headers(),
            timeout=config.get('timeout', 10),
            max_retries=config.get('max_retries', 3),
            retry_delay=config.get('retry_delay', 1.5),
        )
        
        # Initialize rate limiter (handled automatically)
        self.limiter = None
    
    async def initialize(self):
        """Initialize async resources"""
        # Setup rate limiter
        self.limiter = await get_rate_limiter(
            self.platform,
            rate=self.config.get('rate_limit', {}).get('rate', 1.0),
            capacity=self.config.get('rate_limit', {}).get('capacity', 10),
        )
    
    def _parse_cookies(self, config: Dict) -> Dict:
        """Parse cookie configuration"""
        cookies = config.get('cookies', {})
        if not cookies:
            cookie_str = config.get('cookie_str', '')
            if cookie_str:
                cookies = {}
                for item in cookie_str.split('; '):
                    if '=' in item:
                        key, value = item.split('=', 1)
                        cookies[key.strip()] = value.strip()
        return cookies
    
    def _get_base_headers(self) -> Dict:
        """Get base headers with random User-Agent"""
        return {
            'User-Agent': get_random_user_agent(),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }
    
    async def fetch_user_info(self, account_id: str) -> Dict:
        """Fetch user info with rate limiting and automatic retry"""
        # Rate limiting (handled by core)
        await self.limiter.acquire(1)
        
        # Add request-specific headers
        extra_headers = {
            'Referer': f'https://space.bilibili.com/{account_id}',
            'Origin': 'https://space.bilibili.com',
        }
        
        # Make request (retry handled by BaseHTTPClient)
        result = await self.client.get(
            "/x/space/acc/info",
            params={'mid': account_id},
            headers=extra_headers,
        )
        
        if not result or result.get('code') != 0:
            logger.error(f"Failed to fetch user info for {account_id}")
            return {}
        
        # Parse response
        data = result.get('data', {})
        official = data.get('official', {})
        
        return {
            'name': data.get('name'),
            'avatar_url': data.get('face'),
            'description': clean_text(data.get('sign', '')),
            'verified': official.get('type', -1) >= 0,
            'profile_url': f'https://space.bilibili.com/{account_id}'
        }
    
    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """Fetch user posts with automatic parsing"""
        # Rate limiting
        await self.limiter.acquire(1)
        
        # Make request
        result = await self.client.get(
            "/x/polymer/web-dynamic/v1/feed/space",
            params={'host_mid': account_id},
            headers={
                'Referer': f'https://space.bilibili.com/{account_id}',
            }
        )
        
        if not result or result.get('code') != 0:
            logger.error(f"Failed to fetch posts for {account_id}")
            return []
        
        # Parse posts
        items = result.get('data', {}).get('items', [])
        posts = []
        
        for item in items:
            post = self._parse_post(item)
            
            # Filter by date
            if since and post['publish_time']:
                if post['publish_time'] < since:
                    continue
            
            posts.append(post)
        
        return posts[:limit]
    
    def _parse_post(self, raw: Dict) -> Dict:
        """Parse post using core utilities"""
        dynamic_id = raw.get('id_str', '')
        modules = raw.get('modules', {})
        
        # Extract content
        content = self._extract_content(modules)
        
        # Extract stats
        module_stat = modules.get('module_stat', {})
        likes = module_stat.get('like', {}).get('count', 0) if isinstance(module_stat.get('like'), dict) else 0
        comments = module_stat.get('comment', {}).get('count', 0) if isinstance(module_stat.get('comment'), dict) else 0
        shares = module_stat.get('forward', {}).get('count', 0) if isinstance(module_stat.get('forward'), dict) else 0
        
        # Build URL
        url = f"https://t.bilibili.com/{dynamic_id}"
        
        # Parse timestamp using core utility
        module_author = modules.get('module_author', {})
        pub_ts = module_author.get('pub_ts')
        publish_time = parse_timestamp(pub_ts)
        
        # Detect media type using core utility
        media_type = detect_media_type(
            content=content,
            url=url,
            metadata={'type': raw.get('type', '')}
        )
        
        return {
            'content': clean_text(content),
            'url': url,
            'publish_time': publish_time,
            'media_type': media_type,
            'media_urls': [],
            'likes': likes,
            'comments': comments,
            'shares': shares,
        }
    
    def _extract_content(self, modules: Dict) -> str:
        """Extract content from dynamic modules"""
        module_dynamic = modules.get('module_dynamic', {})
        
        # Try desc field
        desc = module_dynamic.get('desc')
        if desc and isinstance(desc, dict):
            return desc.get('text', '')
        
        # Try major field
        major = module_dynamic.get('major', {})
        if major:
            archive = major.get('archive')
            if archive:
                return f"{archive.get('title', '')} {archive.get('desc', '')}".strip()
            
            article = major.get('article')
            if article:
                return f"{article.get('title', '')} {article.get('desc', '')}".strip()
        
        return ''
    
    async def validate_account(self, account_id: str) -> bool:
        """Validate account exists"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info)
    
    async def close(self):
        """Cleanup resources"""
        await self.client.close()


# Usage example
async def main():
    config = {
        'cookie_str': 'your_cookies_here',
        'timeout': 10,
        'max_retries': 3,
        'retry_delay': 1.5,
        'rate_limit': {
            'rate': 1.0,
            'capacity': 10,
        }
    }
    
    provider = BilibiliProvider(config)
    await provider.initialize()
    
    try:
        # Fetch user info
        user_info = await provider.fetch_user_info("1")
        print(f"User: {user_info}")
        
        # Fetch recent posts
        posts = await provider.fetch_user_posts("1", limit=5)
        print(f"Fetched {len(posts)} posts")
        
    finally:
        await provider.close()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

## Benefits of Migration

### 1. Reduced Code Complexity
- **Before**: ~160 lines with manual retry logic
- **After**: ~120 lines, cleaner and more maintainable

### 2. Better Error Handling
- Automatic retry with exponential backoff
- Consistent error logging
- Proper timeout handling

### 3. Performance Improvements
- Session reuse (connection pooling)
- Efficient rate limiting
- No unnecessary delays

### 4. Maintainability
- Centralized HTTP logic
- Reusable utilities
- Easy to test and debug

### 5. Consistency
- All providers use same patterns
- Standardized logging format
- Uniform error handling

## Migration Checklist

- [ ] Replace manual `aiohttp.ClientSession` with `BaseHTTPClient`
- [ ] Remove custom retry logic, use `BaseHTTPClient.max_retries`
- [ ] Replace hardcoded User-Agent with `get_random_user_agent()`
- [ ] Add rate limiting with `get_rate_limiter()`
- [ ] Use `parse_timestamp()` for all timestamp parsing
- [ ] Use `clean_text()` for text content
- [ ] Use `detect_media_type()` for media classification
- [ ] Remove manual delay/sleep calls (handled by rate limiter)
- [ ] Add `initialize()` method for async setup
- [ ] Add `close()` method for cleanup
- [ ] Update tests to use new structure

## Testing the Migration

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_bilibili_provider():
    config = {
        'cookie_str': 'test_cookie',
        'rate_limit': {'rate': 10.0, 'capacity': 10},  # Fast for testing
    }
    
    provider = BilibiliProvider(config)
    await provider.initialize()
    
    try:
        # Mock the HTTP client
        provider.client.get = AsyncMock(return_value={
            'code': 0,
            'data': {
                'name': 'Test User',
                'face': 'https://example.com/avatar.jpg',
                'sign': 'Test description',
                'official': {'type': 1},
            }
        })
        
        # Test fetch_user_info
        user_info = await provider.fetch_user_info("1")
        assert user_info['name'] == 'Test User'
        assert user_info['verified'] is True
        
    finally:
        await provider.close()
```

## Common Patterns

### Pattern 1: Rate-Limited API Calls
```python
async def fetch_data(self):
    await self.limiter.acquire(1)
    return await self.client.get("/endpoint")
```

### Pattern 2: Request with Extra Headers
```python
result = await self.client.get(
    "/endpoint",
    headers={'Referer': 'https://example.com'}
)
```

### Pattern 3: Parse Response Data
```python
data = result.get('data', {})
return {
    'content': clean_text(data.get('text')),
    'timestamp': parse_timestamp(data.get('created_at')),
    'type': detect_media_type(data.get('text'), data.get('url')),
}
```

### Pattern 4: Handle API Errors
```python
result = await self.client.get("/endpoint")
if not result or result.get('code') != 0:
    logger.error(f"API error: {result}")
    return None
```
