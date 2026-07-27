# Core Infrastructure Layer - Usage Guide

## Overview

The core infrastructure layer provides reusable components for building robust data providers:

- **BaseHTTPClient**: Unified HTTP client with retry logic and session management
- **RateLimiter**: Token bucket rate limiting for API calls
- **UserAgentPool**: User-Agent rotation for anti-crawler protection
- **DataParser**: Utilities for parsing timestamps, cleaning text, and detecting media types
- **PlatformConfigManager**: Configuration management with caching

## Installation

All components are in `data-service/core/` and can be imported as:

```python
from core import (
    BaseHTTPClient,
    RateLimiter,
    get_rate_limiter,
    get_random_user_agent,
    parse_timestamp,
    clean_text,
    detect_media_type,
    get_config_manager,
)
```

## Component Usage

### 1. BaseHTTPClient

Unified HTTP client with automatic retry and logging.

```python
from core import BaseHTTPClient, get_random_user_agent

# Create client with base configuration
client = BaseHTTPClient(
    base_url="https://api.example.com",
    headers={"User-Agent": get_random_user_agent()},
    cookies={"session": "xxx"},
    timeout=10,
    max_retries=3,
    retry_delay=1.0,
)

# Make requests
async with client:
    # GET request
    data = await client.get("/users", params={"id": "123"})
    
    # POST request
    result = await client.post("/submit", json={"key": "value"})
    
    # With custom headers
    response = await client.get(
        "/protected",
        headers={"Authorization": "Bearer token"}
    )

# Or manage lifecycle manually
client = BaseHTTPClient(base_url="https://api.example.com")
try:
    data = await client.get("/endpoint")
finally:
    await client.close()
```

**Features:**
- Automatic session management
- Exponential backoff retry (429, 5xx errors)
- Request logging with timing
- Cookie and header merging
- Timeout handling

### 2. RateLimiter

Token bucket algorithm for API rate limiting.

```python
from core import RateLimiter, get_rate_limiter

# Create limiter for a platform
limiter = RateLimiter(
    rate=2.0,        # 2 tokens per second
    capacity=10,     # Burst capacity of 10
    platform="bilibili"
)

# Acquire tokens (blocks until available)
await limiter.acquire(1)  # Get 1 token
print("Request allowed")

# Try acquire (non-blocking)
if await limiter.try_acquire(1):
    print("Token acquired immediately")
else:
    print("No tokens available")

# Check status
status = limiter.get_status()
print(f"Available tokens: {status['tokens']}/{status['capacity']}")

# Using global registry (recommended)
bilibili_limiter = await get_rate_limiter("bilibili", rate=1.0, capacity=10)
await bilibili_limiter.acquire(1)
```

**Integration Example:**
```python
class MyProvider:
    def __init__(self):
        self.limiter = await get_rate_limiter("my_platform", rate=2.0, capacity=5)
    
    async def fetch_data(self):
        await self.limiter.acquire(1)  # Wait for rate limit
        return await self.client.get("/api/data")
```

### 3. UserAgentPool

Rotate User-Agent strings to avoid detection.

```python
from core import (
    UserAgentPool,
    get_random_user_agent,
    get_desktop_user_agent,
    get_mobile_user_agent,
    get_chrome_user_agent,
)

# Using pool instance
pool = UserAgentPool()
desktop_ua = pool.get_random_desktop()
mobile_ua = pool.get_random_mobile()
random_ua = pool.get_random(prefer_desktop=True)  # 70% desktop, 30% mobile

# Using global functions (recommended)
ua = get_random_user_agent()
chrome_ua = get_chrome_user_agent()

# Add custom UA
pool.add_custom_agent("My Custom UA", is_mobile=False)
```

**Integration with HTTP Client:**
```python
from core import BaseHTTPClient, get_random_user_agent

client = BaseHTTPClient(
    base_url="https://api.example.com",
    headers={"User-Agent": get_random_user_agent()}
)
```

### 4. DataParser

Parse and clean data from various sources.

```python
from core import DataParser, parse_timestamp, clean_text, detect_media_type

# Parse timestamps (Unix seconds/ms, ISO 8601, common formats)
dt1 = parse_timestamp(1672531200)           # Unix seconds
dt2 = parse_timestamp(1672531200000)        # Unix milliseconds
dt3 = parse_timestamp("2023-01-01 00:00:00")
dt4 = parse_timestamp("2023-01-01T00:00:00Z")

# Clean text (remove HTML, extra whitespace)
raw_html = "<p>Hello   <b>World</b>!</p><script>alert('xss')</script>"
clean = clean_text(raw_html)  # "Hello World! alert('xss')"
clean_short = clean_text(raw_html, max_length=10)  # "Hello Worl..."

# Detect media type
media_type = detect_media_type(
    content="Check out this video",
    url="https://www.bilibili.com/video/BV1234567890",
    metadata={"type": "video"}
)
# Returns: "video"

# Extract URLs from text
parser = DataParser()
urls = parser.extract_urls("Visit https://example.com and http://test.com")
# Returns: ['https://example.com', 'http://test.com']

# Extract hashtags
hashtags = parser.extract_hashtags("This is a #test post #AI #tech")
# Returns: ['test', 'AI', 'tech']

# Extract mentions
mentions = parser.extract_mentions("Thanks @user1 and @user2!")
# Returns: ['user1', 'user2']

# Sanitize filenames
safe_filename = parser.sanitize_filename("report:2023/01/01.pdf")
# Returns: "report_2023_01_01.pdf"
```

### 5. PlatformConfigManager

Manage platform configurations with caching.

```python
from core import PlatformConfigManager, get_config_manager, get_platform_config

# Create manager with DB connection
from db import get_db
db = get_db()
manager = PlatformConfigManager(db_connection=db, cache_ttl=300)

# Get platform config (cached for 5 minutes)
config = await manager.get_config("bilibili")
if config:
    print(f"Platform: {config['platform']}")
    print(f"Enabled: {config['enabled']}")
    print(f"Config: {config['config']}")
    print(f"Rate limit: {config['rate_limit']}")

# Get all configs
all_configs = await manager.get_all_configs()

# Force reload (ignore cache)
fresh_config = await manager.reload_config("bilibili")

# Clear cache
await manager.clear_cache("bilibili")  # Clear specific platform
await manager.clear_cache()            # Clear all

# Check cache status
status = manager.get_cache_status()
print(f"Cached platforms: {status['platforms']}")

# Using global manager (recommended)
config = await get_platform_config("bilibili")
```

## Complete Provider Example

Here's how to use all components together in a provider:

```python
from typing import List, Dict, Optional
from datetime import datetime
from core import (
    BaseHTTPClient,
    get_rate_limiter,
    get_random_user_agent,
    parse_timestamp,
    clean_text,
    detect_media_type,
    get_platform_config,
)

class ExampleProvider:
    """Example provider using core infrastructure"""
    
    def __init__(self):
        self.platform = "example"
        self.client = None
        self.limiter = None
    
    async def initialize(self):
        """Initialize provider with config"""
        # Load platform config
        config = await get_platform_config(self.platform)
        if not config or not config['enabled']:
            raise ValueError(f"Platform {self.platform} not enabled")
        
        # Setup HTTP client
        self.client = BaseHTTPClient(
            base_url=config['config'].get('base_url'),
            headers={"User-Agent": get_random_user_agent()},
            timeout=config['config'].get('timeout', 10),
            max_retries=config['config'].get('max_retries', 3),
        )
        
        # Setup rate limiter
        rate_config = config.get('rate_limit', {})
        self.limiter = await get_rate_limiter(
            self.platform,
            rate=rate_config.get('rate', 1.0),
            capacity=rate_config.get('capacity', 10),
        )
    
    async def fetch_posts(
        self,
        user_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """Fetch user posts with rate limiting"""
        # Rate limit
        await self.limiter.acquire(1)
        
        # Make request
        response = await self.client.get(
            f"/users/{user_id}/posts",
            params={"limit": limit}
        )
        
        if not response:
            return []
        
        # Parse posts
        posts = []
        for item in response.get('data', []):
            post = self._parse_post(item)
            
            # Filter by date
            if since and post['publish_time']:
                if post['publish_time'] < since:
                    continue
            
            posts.append(post)
        
        return posts[:limit]
    
    def _parse_post(self, raw: Dict) -> Dict:
        """Parse raw post data"""
        return {
            'content': clean_text(raw.get('text', '')),
            'url': raw.get('url', ''),
            'publish_time': parse_timestamp(raw.get('created_at')),
            'media_type': detect_media_type(
                content=raw.get('text'),
                url=raw.get('url'),
                metadata=raw
            ),
            'likes': raw.get('like_count', 0),
            'comments': raw.get('comment_count', 0),
        }
    
    async def close(self):
        """Cleanup resources"""
        if self.client:
            await self.client.close()

# Usage
async def main():
    provider = ExampleProvider()
    await provider.initialize()
    
    try:
        posts = await provider.fetch_posts("user123", limit=10)
        print(f"Fetched {len(posts)} posts")
    finally:
        await provider.close()
```

## Testing

Run the test suite:

```bash
cd data-service
python3 test_core_infrastructure.py
```

## Best Practices

1. **HTTP Client**: Always use context manager or manually close sessions
2. **Rate Limiter**: Use global registry for shared limiters across providers
3. **User Agent**: Rotate UA strings for each provider instance
4. **Parser**: Handle None returns from parse_timestamp gracefully
5. **Config Manager**: Set DB connection once at startup, reuse global instance

## Error Handling

All components handle errors gracefully:

```python
# HTTP Client returns None on failure
result = await client.get("/endpoint")
if result is None:
    logger.error("Request failed")

# Parser returns None for invalid timestamps
dt = parse_timestamp("invalid")
if dt is None:
    logger.warning("Could not parse timestamp")

# Rate limiter always succeeds (waits if needed)
await limiter.acquire(1)  # Will block until token available
```

## Performance

- **BaseHTTPClient**: Reuses aiohttp sessions, connection pooling
- **RateLimiter**: Lock-protected token updates, O(1) operations
- **UserAgentPool**: Pre-loaded lists, O(1) random selection
- **DataParser**: Compiled regex patterns, efficient string operations
- **ConfigManager**: In-memory cache with TTL, reduces DB queries
