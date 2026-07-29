# Quick Reference: Adding New Providers

## Overview

This guide shows how to add new platform providers to the Influencer Data Service using the established pattern.

## Provider Implementation Checklist

### 1. Create Provider File

Create `providers/{platform}_provider.py`:

```python
"""
{Platform} Provider - {平台名称}数据提供者

Brief description of the platform and data sources.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

from providers.base_influencer_provider import BaseInfluencerProvider
from core import (
    BaseHTTPClient,
    get_rate_limiter,
    get_random_user_agent,
    parse_timestamp,
    clean_text,
)

logger = logging.getLogger(__name__)


class {Platform}APIProvider(BaseInfluencerProvider):
    """Provider for {Platform} platform"""

    def __init__(self, config: Dict):
        super().__init__(config)
        self.base_url = "https://api.example.com"
        
        # Lazy rate limiter initialization
        self.rate_limiter = None
        self._rate_limiter_initialized = False
        
        # Initialize HTTP client
        self.http_client = BaseHTTPClient(
            base_url=self.base_url,
            headers=self._get_default_headers(),
            timeout=config.get('timeout', 10),
            max_retries=config.get('max_retries', 3),
            retry_delay=config.get('retry_delay', 2),
        )

    async def _ensure_rate_limiter(self):
        """Lazy initialization of rate limiter"""
        if not self._rate_limiter_initialized:
            self.rate_limiter = await get_rate_limiter(
                platform='{platform}',
                rate=1.0,  # requests per second
                capacity=2
            )
            self._rate_limiter_initialized = True

    def _get_default_headers(self) -> Dict:
        """Get default request headers"""
        return {
            'User-Agent': get_random_user_agent(),
            'Accept': 'application/json',
        }

    async def fetch_user_info(self, account_id: str) -> Dict:
        """Fetch user information"""
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()
        
        # Implementation here
        return {
            'name': '',
            'avatar_url': '',
            'description': '',
            'verified': False,
            'followers_count': 0,
            'profile_url': '',
        }

    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """Fetch user posts"""
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()
        
        # Implementation here
        posts = []
        # Each post should include:
        return [{
            'content': '',
            'url': '',
            'publish_time': datetime,
            'media_type': 'text|image|video',
            'media_urls': [],
            'likes': 0,
            'comments': 0,
            'shares': 0,
            'extra_data': {  # Platform-specific fields
                'field1': 'value1',
            }
        }]

    async def validate_account(self, account_id: str) -> bool:
        """Validate if account exists"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info and user_info.get('name'))
```

### 2. Register Provider

Edit `providers/__init__.py`:

```python
from providers.{platform}_provider import {Platform}APIProvider

# Add to registration section
InfluencerProviderRegistry.register_provider('{platform}_api', {Platform}APIProvider)
```

### 3. Create Database Extension Table (if needed)

Edit `prisma/schema.prisma`:

```prisma
model {Platform}PostExtra {
  id       String   @id @default(cuid())
  postId   String   @unique
  
  // Platform-specific fields
  field1   String
  field2   Int      @default(0)
  field3   Boolean  @default(false)

  post     InfluencerPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([postId])
}
```

Add relation to `InfluencerPost` model:

```prisma
model InfluencerPost {
  // ... existing fields ...
  
  {platform}Extra {Platform}PostExtra?
}
```

Run migration:
```bash
npm run db:migrate
```

### 4. Update Service Layer

Edit `services/influencer_fetch_service.py` in the `_save_platform_extra()` method:

```python
elif platform == '{platform}_api':
    # {Platform}PostExtra
    await conn.execute("""
        INSERT INTO {Platform}PostExtra (
            id, postId, field1, field2, field3, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        f"extra_{post_id}",
        post_id,
        extra.get('field1', 'default'),
        extra.get('field2', 0),
        extra.get('field3', False),
        now,
        now
    ))
    logger.debug(f"Saved {Platform}PostExtra for post {post_id}")
```

### 5. Test Your Provider

Create `test_{platform}_provider.py`:

```python
import asyncio
from providers.{platform}_provider import {Platform}APIProvider

async def test_provider():
    config = {}
    provider = {Platform}APIProvider(config)
    
    # Test instantiation
    assert provider is not None
    
    # Test rate limiter
    await provider._ensure_rate_limiter()
    assert provider.rate_limiter is not None
    
    print("✓ Provider tests passed")

asyncio.run(test_provider())
```

## Key Patterns to Follow

### Rate Limiting
Always use lazy initialization to avoid blocking in `__init__`:

```python
self.rate_limiter = None
self._rate_limiter_initialized = False

async def _ensure_rate_limiter(self):
    if not self._rate_limiter_initialized:
        self.rate_limiter = await get_rate_limiter(...)
        self._rate_limiter_initialized = True
```

### Error Handling
Wrap API calls in try/except:

```python
try:
    result = await self.http_client.get(url)
    # Process result
    return data
except Exception as e:
    logger.error(f"Failed to fetch: {e}", exc_info=True)
    return {}  # or []
```

### Extra Data Field Naming
Use consistent naming:
- **Xiaohongshu:** `extra_data` key in post dict
- **Zhihu:** `extra` key in post dict
- Both patterns are supported by the service layer

### Content Parsing
Use core utilities:

```python
from core import parse_timestamp, clean_text

publish_time = parse_timestamp(raw_timestamp)
content = clean_text(raw_content)
```

## Testing Your Implementation

1. **Unit Test:** Run `python3 test_{platform}_provider.py`
2. **Integration Test:** Add test to `test_new_providers.py`
3. **Import Test:** `python3 -c "from providers import {Platform}APIProvider"`
4. **Registry Test:** Verify it appears in `InfluencerProviderRegistry.list_providers()`

## Common Pitfalls

❌ **Don't:** Call `get_rate_limiter()` synchronously in `__init__`
✅ **Do:** Use lazy async initialization

❌ **Don't:** Use blocking I/O operations
✅ **Do:** Use async/await with BaseHTTPClient

❌ **Don't:** Fail the entire fetch if extra data save fails
✅ **Do:** Log warning and continue (service layer handles this)

❌ **Don't:** Hardcode credentials in provider code
✅ **Do:** Accept them via config dict

## File Locations

```
data-service/
├── providers/
│   ├── __init__.py                    # Register here
│   ├── base_influencer_provider.py    # Base class
│   ├── {platform}_provider.py         # Your implementation
│   └── provider_registry.py           # Registry logic
├── services/
│   └── influencer_fetch_service.py    # Add extra data handling
└── core/                               # Shared utilities
    ├── http_client.py
    ├── rate_limiter.py
    ├── parsers.py
    └── user_agent.py
```

## Example: Full Working Providers

See these for reference:
- `providers/xiaohongshu_provider.py` - API-based, complex parsing
- `providers/zhihu_provider.py` - Multiple content types
- `providers/bilibili_provider.py` - Video platform pattern
- `providers/weibo_provider.py` - Social media pattern

## Support

For questions or issues, check:
1. Provider integration tests: `test_new_providers.py`
2. Integration report: `PROVIDER_INTEGRATION_REPORT.md`
3. Existing provider implementations for patterns

---

*Last Updated: 2026-07-28*
