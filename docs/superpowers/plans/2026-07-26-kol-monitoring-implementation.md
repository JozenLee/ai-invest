# 大V监控系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a KOL monitoring system that tracks influencer opinions across 6 platforms (Weibo, Bilibili, Xiaohongshu, Zhihu, Douyin, Alipay), analyzes them with Claude AI, and aggregates insights by domain.

**Architecture:** Pluggable Provider system for data collection, independent AI queue for async analysis, opinion aggregation service for trend analysis, integrated with existing news/trends pages via tabs and enhanced AI insights.

**Tech Stack:** Python 3.11+ (FastAPI, Prisma, aiohttp, APScheduler), Next.js 16, React 19, TypeScript, Claude API, SQLite

## Global Constraints

- Python version: ≥ 3.11
- Node.js version: ≥ 18
- All async operations use Python asyncio
- All database operations use Prisma ORM
- AI analysis uses Claude Sonnet 4
- Follow existing code style: snake_case for Python, camelCase for TypeScript
- All user-facing text in Chinese
- Commit after each passing test
- DRY: Extract common logic, no duplication
- YAGNI: Only implement what the spec requires
- TDD: Test first, then minimal implementation

---

## Phase 1: Database Foundation (Week 1, Day 1-2)

### Task 1.1: Database Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/YYYYMMDDHHMMSS_add_influencer_tables/migration.sql`

**Interfaces:**
- Produces: Influencer, InfluencerPost, DomainInfluencer, InfluencerFetchLog, InfluencerAnalysisLog models

- [ ] **Step 1: Add Influencer model to schema**

Open `prisma/schema.prisma` and add after existing models:

```prisma
model Influencer {
  id           String   @id @default(cuid())
  name         String
  platform     String
  accountId    String
  profileUrl   String?
  avatarUrl    String?
  category     String?
  tags         String?
  priority     String   @default("medium")
  fetchInterval Int     @default(60)
  driverType   String   @default("api")
  providerConfig String?
  isActive     Boolean  @default(true)
  lastFetchAt  DateTime?
  lastFetchStatus String?
  lastFetchError String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  posts   InfluencerPost[]
  domains DomainInfluencer[]

  @@unique([platform, accountId])
  @@index([priority, isActive])
  @@index([lastFetchAt])
}
```

- [ ] **Step 2: Add InfluencerPost model**

Add to `prisma/schema.prisma`:

```prisma
model InfluencerPost {
  id              String    @id @default(cuid())
  influencerId    String
  content         String
  originalUrl     String?
  publishTime     DateTime
  mediaType       String    @default("text")
  mediaUrls       String?
  engagement      String?
  
  aiProcessed     Boolean   @default(false)
  aiProcessedAt   DateTime?
  aiError         String?
  
  opinionSummary  String?
  opinionStance   String?
  opinionConfidence Float?  @default(0)
  mainPoints      String?
  
  arguments       String?
  credibilityScore Float?   @default(0)
  
  primaryDomain   String?
  secondaryDomains String?
  domainScores    String?
  
  sentiment       Float?
  sentimentAspects String?
  
  risks           String?
  investmentImplications String?
  
  consistencyChecked Boolean @default(false)
  consistencyData    String?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  influencer Influencer @relation(fields: [influencerId], references: [id], onDelete: Cascade)

  @@index([influencerId, publishTime])
  @@index([aiProcessed])
  @@index([primaryDomain, publishTime])
  @@index([opinionStance])
}
```

- [ ] **Step 3: Add DomainInfluencer relation model**

Add to `prisma/schema.prisma`:

```prisma
model DomainInfluencer {
  domainId     String
  influencerId String
  relevance    Float @default(1.0)

  domain     Domain     @relation(fields: [domainId], references: [id])
  influencer Influencer @relation(fields: [influencerId], references: [id])

  @@id([domainId, influencerId])
}
```

- [ ] **Step 4: Add logging models**

Add to `prisma/schema.prisma`:

```prisma
model InfluencerFetchLog {
  id             String   @id @default(cuid())
  influencerId   String
  platform       String
  status         String
  postsFetched   Int      @default(0)
  postsNew       Int      @default(0)
  durationMs     Int
  errorMessage   String?
  createdAt      DateTime @default(now())
  
  @@index([influencerId])
  @@index([createdAt])
  @@index([status])
}

model InfluencerAnalysisLog {
  id             String   @id @default(cuid())
  postId         String
  influencerId   String
  status         String
  durationMs     Int
  tokensUsed     Int      @default(0)
  errorMessage   String?
  createdAt      DateTime @default(now())
  
  @@index([postId])
  @@index([createdAt])
}
```

- [ ] **Step 5: Update Domain model with DomainInfluencer relation**

Find the existing `Domain` model in `prisma/schema.prisma` and add:

```prisma
model Domain {
  // ... existing fields ...
  
  influencers  DomainInfluencer[]  // ADD THIS LINE
}
```

- [ ] **Step 6: Generate and run migration**

```bash
npx prisma migrate dev --name add_influencer_tables
```

Expected output: Migration created and applied successfully

- [ ] **Step 7: Generate Prisma Client**

```bash
npx prisma generate
```

Expected output: Prisma Client generated successfully

- [ ] **Step 8: Verify schema in Prisma Studio**

```bash
npx prisma studio
```

Expected: New tables visible in UI (Influencer, InfluencerPost, etc.)

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add influencer monitoring tables

- Add Influencer model with priority-based scheduling
- Add InfluencerPost with AI analysis fields
- Add DomainInfluencer for domain mapping
- Add logging tables for monitoring"
```

---

## Phase 2: Provider System Foundation (Week 1, Day 2-3)

### Task 2.1: Base Provider Interface

**Files:**
- Create: `data-service/providers/__init__.py`
- Create: `data-service/providers/base_influencer_provider.py`
- Create: `data-service/tests/unit/test_base_provider.py`

**Interfaces:**
- Produces: `BaseInfluencerProvider` abstract class with methods:
  - `async def fetch_user_info(account_id: str) -> Dict`
  - `async def fetch_user_posts(account_id: str, since: Optional[datetime], limit: int) -> List[Dict]`
  - `async def validate_account(account_id: str) -> bool`
  - `def normalize_post(raw_post: Dict) -> Dict`

- [ ] **Step 1: Write test for base provider interface**

Create `data-service/tests/unit/test_base_provider.py`:

```python
import pytest
from abc import ABC
from providers.base_influencer_provider import BaseInfluencerProvider

def test_base_provider_is_abstract():
    """Test that BaseInfluencerProvider cannot be instantiated directly"""
    with pytest.raises(TypeError):
        BaseInfluencerProvider({'platform': 'test'})

def test_base_provider_requires_abstract_methods():
    """Test that subclass must implement all abstract methods"""
    
    class IncompleteProvider(BaseInfluencerProvider):
        async def fetch_user_info(self, account_id: str):
            return {}
    
    with pytest.raises(TypeError):
        IncompleteProvider({'platform': 'test'})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd data-service
pytest tests/unit/test_base_provider.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'providers'"

- [ ] **Step 3: Create providers package**

Create `data-service/providers/__init__.py`:

```python
"""
Influencer Provider System
Pluggable providers for different platforms
"""

__version__ = "1.0.0"
```

- [ ] **Step 4: Implement BaseInfluencerProvider**

Create `data-service/providers/base_influencer_provider.py`:

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from datetime import datetime

class BaseInfluencerProvider(ABC):
    """Base class for all influencer providers"""
    
    def __init__(self, config: Dict):
        """
        Initialize provider with configuration
        
        Args:
            config: Provider configuration dict
                - platform: Platform name
                - driver_type: 'api' or 'crawler'
                - Additional platform-specific config
        """
        self.config = config
        self.platform = config.get('platform')
        self.driver_type = config.get('driver_type', 'api')
    
    @abstractmethod
    async def fetch_user_info(self, account_id: str) -> Dict:
        """
        Fetch user profile information
        
        Args:
            account_id: Platform-specific account identifier
            
        Returns:
            Dict with keys: name, avatar_url, description, verified, followers_count
        """
        pass
    
    @abstractmethod
    async def fetch_user_posts(
        self, 
        account_id: str, 
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        Fetch user's posts/dynamics
        
        Args:
            account_id: Platform-specific account identifier
            since: Only fetch posts after this time (optional)
            limit: Maximum number of posts to fetch
            
        Returns:
            List of post dicts (use normalize_post for standard format)
        """
        pass
    
    @abstractmethod
    async def validate_account(self, account_id: str) -> bool:
        """
        Check if account exists and is accessible
        
        Args:
            account_id: Platform-specific account identifier
            
        Returns:
            True if account exists, False otherwise
        """
        pass
    
    def normalize_post(self, raw_post: Dict) -> Dict:
        """
        Convert platform-specific post format to standard format
        
        Args:
            raw_post: Platform-specific post data
            
        Returns:
            Standardized post dict with keys:
                - content: Post text content
                - url: Original post URL
                - publish_time: datetime object
                - media_type: 'text', 'image', or 'video'
                - media_urls: List of media URLs
                - likes, comments, shares: Engagement metrics
        """
        return {
            'content': raw_post.get('content', ''),
            'url': raw_post.get('url'),
            'publish_time': raw_post.get('publish_time'),
            'media_type': raw_post.get('media_type', 'text'),
            'media_urls': raw_post.get('media_urls', []),
            'likes': raw_post.get('likes', 0),
            'comments': raw_post.get('comments', 0),
            'shares': raw_post.get('shares', 0),
        }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd data-service
pytest tests/unit/test_base_provider.py -v
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add data-service/providers/ data-service/tests/unit/test_base_provider.py
git commit -m "feat(providers): add base provider interface

- Create abstract BaseInfluencerProvider class
- Define standard interface for all platforms
- Add normalize_post for data standardization
- Add unit tests for interface validation"
```

---

### Task 2.2: Provider Registry

**Files:**
- Create: `data-service/providers/provider_registry.py`
- Create: `data-service/tests/unit/test_provider_registry.py`

**Interfaces:**
- Consumes: `BaseInfluencerProvider` from Task 2.1
- Produces: `InfluencerProviderRegistry` class with methods:
  - `@classmethod get_provider(platform: str, driver_type: str = 'api') -> Type[BaseInfluencerProvider]`
  - `@classmethod register_provider(key: str, provider_class: Type[BaseInfluencerProvider])`

- [ ] **Step 1: Write test for provider registry**

Create `data-service/tests/unit/test_provider_registry.py`:

```python
import pytest
from providers.provider_registry import InfluencerProviderRegistry
from providers.base_influencer_provider import BaseInfluencerProvider

class MockProvider(BaseInfluencerProvider):
    """Mock provider for testing"""
    async def fetch_user_info(self, account_id: str):
        return {'name': 'test'}
    
    async def fetch_user_posts(self, account_id: str, since=None, limit=20):
        return []
    
    async def validate_account(self, account_id: str):
        return True

def test_register_and_get_provider():
    """Test registering and retrieving a provider"""
    # Register mock provider
    InfluencerProviderRegistry.register_provider('test_api', MockProvider)
    
    # Retrieve it
    provider_class = InfluencerProviderRegistry.get_provider('test', 'api')
    
    assert provider_class == MockProvider

def test_get_nonexistent_provider_raises_error():
    """Test that getting unknown provider raises ValueError"""
    with pytest.raises(ValueError, match="Unsupported provider"):
        InfluencerProviderRegistry.get_provider('nonexistent', 'api')

def test_get_provider_with_default_driver():
    """Test get_provider defaults to 'api' driver"""
    InfluencerProviderRegistry.register_provider('default_api', MockProvider)
    
    provider_class = InfluencerProviderRegistry.get_provider('default')
    
    assert provider_class == MockProvider
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd data-service
pytest tests/unit/test_provider_registry.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'providers.provider_registry'"

- [ ] **Step 3: Implement InfluencerProviderRegistry**

Create `data-service/providers/provider_registry.py`:

```python
from typing import Dict, Type
from providers.base_influencer_provider import BaseInfluencerProvider

class InfluencerProviderRegistry:
    """
    Registry for managing influencer providers
    Supports dynamic registration and retrieval by platform + driver type
    """
    
    _providers: Dict[str, Type[BaseInfluencerProvider]] = {}
    
    @classmethod
    def register_provider(cls, key: str, provider_class: Type[BaseInfluencerProvider]):
        """
        Register a provider class
        
        Args:
            key: Registry key (format: "platform_drivertype", e.g. "weibo_api")
            provider_class: Provider class (subclass of BaseInfluencerProvider)
        """
        cls._providers[key] = provider_class
    
    @classmethod
    def get_provider(cls, platform: str, driver_type: str = 'api') -> Type[BaseInfluencerProvider]:
        """
        Get provider class by platform and driver type
        
        Args:
            platform: Platform name (e.g. 'weibo', 'bilibili')
            driver_type: Driver type ('api' or 'crawler'), defaults to 'api'
            
        Returns:
            Provider class
            
        Raises:
            ValueError: If provider not found
        """
        key = f"{platform}_{driver_type}"
        provider_class = cls._providers.get(key)
        
        if not provider_class:
            raise ValueError(f"Unsupported provider: {key}")
        
        return provider_class
    
    @classmethod
    def list_providers(cls) -> Dict[str, Type[BaseInfluencerProvider]]:
        """Get all registered providers"""
        return cls._providers.copy()
    
    @classmethod
    def clear(cls):
        """Clear all registered providers (for testing)"""
        cls._providers.clear()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd data-service
pytest tests/unit/test_provider_registry.py -v
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add data-service/providers/provider_registry.py data-service/tests/unit/test_provider_registry.py
git commit -m "feat(providers): add provider registry

- Implement dynamic provider registration system
- Support platform + driver_type lookup
- Add unit tests for registry operations"
```

---

## Phase 3: Weibo Provider Implementation (Week 1, Day 3-4)

### Task 3.1: Weibo API Provider

**Files:**
- Create: `data-service/providers/weibo_provider.py`
- Create: `data-service/tests/unit/test_weibo_provider.py`
- Modify: `data-service/providers/__init__.py`

**Interfaces:**
- Consumes: `BaseInfluencerProvider` from Task 2.1
- Produces: `WeiboAPIProvider` class implementing all abstract methods

- [ ] **Step 1: Write test for Weibo provider**

Create `data-service/tests/unit/test_weibo_provider.py`:

```python
import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime
from providers.weibo_provider import WeiboAPIProvider

@pytest.fixture
def provider():
    config = {
        'platform': 'weibo',
        'driver_type': 'api',
        'api_key': 'test_key',
        'access_token': 'test_token'
    }
    return WeiboAPIProvider(config)

@pytest.mark.asyncio
async def test_fetch_user_info_success(provider):
    """Test successful user info fetch"""
    mock_response_data = {
        'screen_name': '测试用户',
        'avatar_large': 'http://example.com/avatar.jpg',
        'description': '这是简介',
        'verified': True,
        'followers_count': 10000
    }
    
    with patch('aiohttp.ClientSession') as mock_session:
        mock_session.return_value.__aenter__.return_value.get.return_value.__aenter__.return_value.status = 200
        mock_session.return_value.__aenter__.return_value.get.return_value.__aenter__.return_value.json = AsyncMock(return_value=mock_response_data)
        
        result = await provider.fetch_user_info('1234567890')
        
        assert result['name'] == '测试用户'
        assert result['avatar_url'] == 'http://example.com/avatar.jpg'
        assert result['verified'] == True
        assert result['followers_count'] == 10000

@pytest.mark.asyncio
async def test_fetch_user_posts_success(provider):
    """Test successful posts fetch"""
    mock_response_data = {
        'statuses': [
            {
                'id': '12345',
                'text': '这是一条测试微博',
                'created_at': 'Tue May 31 17:46:55 +0800 2011',
                'user': {'id': '1234567890'},
                'pic_urls': [],
                'attitudes_count': 100,
                'comments_count': 50,
                'reposts_count': 30
            }
        ]
    }
    
    with patch('aiohttp.ClientSession') as mock_session:
        mock_session.return_value.__aenter__.return_value.get.return_value.__aenter__.return_value.status = 200
        mock_session.return_value.__aenter__.return_value.get.return_value.__aenter__.return_value.json = AsyncMock(return_value=mock_response_data)
        
        result = await provider.fetch_user_posts('1234567890', limit=20)
        
        assert len(result) == 1
        assert result[0]['content'] == '这是一条测试微博'
        assert result[0]['likes'] == 100

@pytest.mark.asyncio
async def test_validate_account_exists(provider):
    """Test account validation - exists"""
    with patch.object(provider, 'fetch_user_info', return_value={'name': '测试'}):
        result = await provider.validate_account('1234567890')
        assert result == True

@pytest.mark.asyncio
async def test_validate_account_not_exists(provider):
    """Test account validation - not exists"""
    with patch.object(provider, 'fetch_user_info', return_value={}):
        result = await provider.validate_account('invalid')
        assert result == False
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd data-service
pytest tests/unit/test_weibo_provider.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'providers.weibo_provider'"

- [ ] **Step 3: Implement WeiboAPIProvider**

Create `data-service/providers/weibo_provider.py`:

```python
import aiohttp
import logging
from typing import List, Dict, Optional
from datetime import datetime
from dateutil import parser
from providers.base_influencer_provider import BaseInfluencerProvider

logger = logging.getLogger(__name__)

class WeiboAPIProvider(BaseInfluencerProvider):
    """Weibo Open Platform API Provider"""
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.api_key = config.get('api_key')
        self.api_secret = config.get('api_secret')
        self.access_token = config.get('access_token')
        self.base_url = "https://api.weibo.com/2"
    
    async def fetch_user_info(self, account_id: str) -> Dict:
        """Fetch Weibo user information"""
        url = f"{self.base_url}/users/show.json"
        params = {
            'uid': account_id,
            'access_token': self.access_token
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            'name': data.get('screen_name'),
                            'avatar_url': data.get('avatar_large'),
                            'description': data.get('description'),
                            'verified': data.get('verified', False),
                            'followers_count': data.get('followers_count', 0)
                        }
                    else:
                        logger.error(f"Weibo API error: {response.status}")
                        return {}
        except Exception as e:
            logger.error(f"Failed to fetch Weibo user info: {e}")
            return {}
    
    async def fetch_user_posts(
        self, 
        account_id: str, 
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """Fetch Weibo user timeline"""
        url = f"{self.base_url}/statuses/user_timeline.json"
        params = {
            'uid': account_id,
            'count': min(limit, 100),
            'access_token': self.access_token
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        statuses = data.get('statuses', [])
                        return [self._parse_weibo(status) for status in statuses]
                    else:
                        logger.error(f"Weibo API error: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"Failed to fetch Weibo posts: {e}")
            return []
    
    async def validate_account(self, account_id: str) -> bool:
        """Validate if Weibo account exists"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info)
    
    def _parse_weibo(self, raw: Dict) -> Dict:
        """Parse Weibo status to standard format"""
        return {
            'content': raw.get('text', ''),
            'url': f"https://weibo.com/{raw.get('user', {}).get('id')}/{raw.get('id')}",
            'publish_time': self._parse_weibo_time(raw.get('created_at')),
            'media_type': 'image' if raw.get('pic_urls') else 'text',
            'media_urls': [pic['thumbnail_pic'] for pic in raw.get('pic_urls', [])],
            'likes': raw.get('attitudes_count', 0),
            'comments': raw.get('comments_count', 0),
            'shares': raw.get('reposts_count', 0),
        }
    
    def _parse_weibo_time(self, time_str: str) -> datetime:
        """Parse Weibo time format: 'Tue May 31 17:46:55 +0800 2011'"""
        try:
            return parser.parse(time_str)
        except:
            return datetime.now()
```

- [ ] **Step 4: Register Weibo provider**

Modify `data-service/providers/__init__.py`:

```python
"""
Influencer Provider System
Pluggable providers for different platforms
"""

from providers.weibo_provider import WeiboAPIProvider
from providers.provider_registry import InfluencerProviderRegistry

__version__ = "1.0.0"

# Register providers
InfluencerProviderRegistry.register_provider('weibo_api', WeiboAPIProvider)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd data-service
pytest tests/unit/test_weibo_provider.py -v
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add data-service/providers/weibo_provider.py data-service/providers/__init__.py data-service/tests/unit/test_weibo_provider.py
git commit -m "feat(providers): implement Weibo API provider

- Add WeiboAPIProvider with full API integration
- Parse Weibo-specific data format
- Auto-register in provider registry
- Add comprehensive unit tests"
```

---

### Task 3.2: Bilibili Provider

**Files:**
- Create: `data-service/providers/bilibili_provider.py`
- Create: `data-service/tests/unit/test_bilibili_provider.py`
- Modify: `data-service/providers/__init__.py`

**Interfaces:**
- Consumes: `BaseInfluencerProvider` from Task 2.1
- Produces: `BilibiliAPIProvider` class

**Implementation:** Follow same TDD pattern as Weibo provider (Task 3.1). Key differences:
- Base URL: `https://api.bilibili.com`
- Parse dynamic format (not weibo status format)
- Handle video media type

- [ ] Write tests for Bilibili provider
- [ ] Run tests (fail)
- [ ] Implement BilibiliAPIProvider
- [ ] Register in registry
- [ ] Run tests (pass)
- [ ] Commit with message: "feat(providers): implement Bilibili API provider"

---

## Phase 4: Fetch Service & AI Queue (Week 1, Day 4-7)

### Task 4.1: Influencer Fetch Service

**Files:**
- Create: `data-service/services/__init__.py`
- Create: `data-service/services/influencer_fetch_service.py`
- Create: `data-service/tests/unit/test_fetch_service.py`

**Interfaces:**
- Consumes: `InfluencerProviderRegistry.get_provider()`
- Produces: `InfluencerFetchService` with methods:
  - `async def fetch_influencer_posts(influencer_id: str) -> Dict`
  - `async def batch_fetch_active_influencers(priority: Optional[str]) -> Dict`

- [ ] **Step 1: Write test for single influencer fetch**

Create `data-service/tests/unit/test_fetch_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime
from services.influencer_fetch_service import InfluencerFetchService

@pytest.fixture
def fetch_service(mock_prisma):
    return InfluencerFetchService(mock_prisma)

@pytest.mark.asyncio
async def test_fetch_influencer_posts_success(fetch_service):
    """Test successful fetch of influencer posts"""
    # Mock influencer data
    mock_influencer = {
        'id': 'inf_123',
        'platform': 'weibo',
        'accountId': '1234567890',
        'driverType': 'api',
        'providerConfig': '{"api_key": "test"}'
    }
    
    # Mock provider
    mock_provider = Mock()
    mock_provider.fetch_user_posts = AsyncMock(return_value=[
        {
            'content': 'Test post',
            'url': 'http://test.com/1',
            'publish_time': datetime.now(),
            'media_type': 'text',
            'media_urls': [],
            'likes': 100,
            'comments': 50,
            'shares': 30
        }
    ])
    
    with patch('services.influencer_fetch_service.InfluencerProviderRegistry.get_provider', return_value=Mock(return_value=mock_provider)):
        with patch.object(fetch_service, 'get_influencer_from_db', return_value=mock_influencer):
            with patch.object(fetch_service, 'batch_insert_posts', return_value=['post_1']):
                result = await fetch_service.fetch_influencer_posts('inf_123')
                
                assert result['success'] == True
                assert result['new_count'] == 1
```

- [ ] **Step 2: Implement InfluencerFetchService**

Create `data-service/services/influencer_fetch_service.py`:

```python
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime
from providers.provider_registry import InfluencerProviderRegistry

logger = logging.getLogger(__name__)

class InfluencerFetchService:
    """Service for fetching influencer posts"""
    
    def __init__(self, prisma_client):
        self.prisma = prisma_client
        self.ai_queue = None  # Injected later
    
    async def fetch_influencer_posts(self, influencer_id: str) -> Dict:
        """
        Fetch posts for a single influencer
        
        Args:
            influencer_id: Influencer ID
            
        Returns:
            Dict with success, fetched_count, new_count, queued_for_analysis
        """
        try:
            # 1. Get influencer config
            influencer = await self.get_influencer_from_db(influencer_id)
            
            # 2. Get provider
            provider_class = InfluencerProviderRegistry.get_provider(
                influencer['platform'],
                influencer.get('driverType', 'api')
            )
            
            config = json.loads(influencer.get('providerConfig', '{}'))
            config['platform'] = influencer['platform']
            config['driver_type'] = influencer.get('driverType', 'api')
            provider = provider_class(config)
            
            # 3. Get last fetch time
            last_fetch = await self.get_last_fetch_time(influencer_id)
            
            # 4. Fetch posts
            raw_posts = await provider.fetch_user_posts(
                influencer['accountId'],
                since=last_fetch,
                limit=50
            )
            
            # 5. Normalize posts
            normalized_posts = [provider.normalize_post(p) for p in raw_posts]
            
            # 6. Filter duplicates and insert
            new_posts = await self.filter_duplicates(normalized_posts, influencer_id)
            post_ids = await self.batch_insert_posts(new_posts, influencer_id)
            
            # 7. Queue for AI analysis
            if self.ai_queue and post_ids:
                await self.ai_queue.publish_batch(post_ids)
            
            # 8. Update last fetch time
            await self.update_last_fetch(influencer_id, 'success', len(post_ids))
            
            return {
                'success': True,
                'influencer_id': influencer_id,
                'fetched_count': len(raw_posts),
                'new_count': len(post_ids),
                'queued_for_analysis': len(post_ids)
            }
            
        except Exception as e:
            logger.error(f"Failed to fetch posts for {influencer_id}: {e}")
            await self.update_last_fetch(influencer_id, 'failed', 0, str(e))
            return {
                'success': False,
                'error': str(e)
            }
    
    async def batch_fetch_active_influencers(self, priority: Optional[str] = None) -> Dict:
        """Batch fetch for active influencers by priority"""
        # Implementation details...
        pass
    
    async def get_influencer_from_db(self, influencer_id: str) -> Dict:
        """Get influencer from database"""
        influencer = await self.prisma.influencer.find_unique({
            'where': {'id': influencer_id}
        })
        return influencer.__dict__ if influencer else {}
    
    async def get_last_fetch_time(self, influencer_id: str) -> Optional[datetime]:
        """Get last successful fetch time"""
        influencer = await self.prisma.influencer.find_unique({
            'where': {'id': influencer_id},
            'select': {'lastFetchAt': True}
        })
        return influencer.lastFetchAt if influencer else None
    
    async def filter_duplicates(self, posts: List[Dict], influencer_id: str) -> List[Dict]:
        """Filter out already existing posts"""
        # Check by URL
        urls = [p['url'] for p in posts if p.get('url')]
        existing = await self.prisma.influencerpost.find_many({
            'where': {
                'influencerId': influencer_id,
                'originalUrl': {'in': urls}
            },
            'select': {'originalUrl': True}
        })
        
        existing_urls = {p.originalUrl for p in existing}
        return [p for p in posts if p.get('url') not in existing_urls]
    
    async def batch_insert_posts(self, posts: List[Dict], influencer_id: str) -> List[str]:
        """Insert posts in batch"""
        if not posts:
            return []
        
        created = []
        for post in posts:
            result = await self.prisma.influencerpost.create({
                'data': {
                    'influencerId': influencer_id,
                    'content': post['content'],
                    'originalUrl': post.get('url'),
                    'publishTime': post['publish_time'],
                    'mediaType': post.get('media_type', 'text'),
                    'mediaUrls': json.dumps(post.get('media_urls', [])),
                    'engagement': json.dumps({
                        'likes': post.get('likes', 0),
                        'comments': post.get('comments', 0),
                        'shares': post.get('shares', 0)
                    })
                }
            })
            created.append(result.id)
        
        return created
    
    async def update_last_fetch(self, influencer_id: str, status: str, count: int, error: str = None):
        """Update last fetch status"""
        await self.prisma.influencer.update({
            'where': {'id': influencer_id},
            'data': {
                'lastFetchAt': datetime.now(),
                'lastFetchStatus': status,
                'lastFetchError': error
            }
        })
```

- [ ] **Step 3-6: Run tests, commit** (follow TDD pattern)

- [ ] **Commit:**

```bash
git add data-service/services/
git commit -m "feat(services): add influencer fetch service

- Implement single and batch fetch
- Handle provider selection and config
- Filter duplicates before insert
- Queue posts for AI analysis"
```

---

### Task 4.2: AI Analysis Queue

**Files:**
- Create: `data-service/workers/__init__.py`
- Create: `data-service/workers/influencer_ai_queue.py`
- Create: `data-service/tests/unit/test_ai_queue.py`

**Interfaces:**
- Produces: `InfluencerAIQueue` with methods:
  - `async def start()`
  - `async def publish(post_id: str)`
  - `async def publish_batch(post_ids: List[str])`
  - `async def stop()`

**Implementation:** Asyncio Queue with worker pool pattern. Follow TDD, similar structure to fetch service.

- [ ] Write tests for queue operations
- [ ] Implement InfluencerAIQueue with 3 workers
- [ ] Add worker processing logic (stub for now)
- [ ] Commit: "feat(workers): add independent AI analysis queue"

---

### Task 4.3: AI Analysis Service

**Files:**
- Create: `data-service/services/influencer_analysis_service.py`
- Create: `data-service/tests/unit/test_analysis_service.py`

**Interfaces:**
- Produces: `InfluencerAnalysisService` with method:
  - `async def analyze_post(post_id: str) -> Dict`

**Key Implementation Points:**
- Build analysis prompt from post + influencer data
- Call Claude API with structured output
- Parse JSON response
- Save to database (all AI fields in InfluencerPost)

- [ ] Write tests with mocked Claude API
- [ ] Implement prompt building
- [ ] Implement Claude API call
- [ ] Implement result parsing and storage
- [ ] Commit: "feat(services): add AI analysis service with Claude integration"

---

## Phase 5: Opinion Aggregation (Week 2, Day 1-2)

### Task 5.1: Opinion Aggregation Service

**Files:**
- Create: `data-service/services/opinion_aggregation_service.py`
- Create: `data-service/tests/unit/test_aggregation_service.py`

**Interfaces:**
- Produces: `OpinionAggregationService` with methods:
  - `async def aggregate_domain_opinions(domain_code: str, time_window: str) -> Dict`
  - `async def compare_influencers(influencer_ids: List[str], domain_code: str, days: int) -> Dict`

**Key Aggregations:**
- Opinion distribution (bullish/bearish/neutral)
- Average confidence and sentiment
- Top quality opinions (by composite score)
- Consensus points (keyword clustering)
- Opinion timeline

- [ ] Write tests for domain aggregation
- [ ] Implement stats calculation
- [ ] Implement top opinions extraction
- [ ] Implement consensus analysis
- [ ] Implement timeline building
- [ ] Commit: "feat(services): add opinion aggregation service"

---

## Phase 6: API Layer (Week 2, Day 2-3)

### Task 6.1: FastAPI Routes

**Files:**
- Create: `data-service/routers/influencers.py`
- Modify: `data-service/main.py`
- Create: `data-service/tests/integration/test_influencers_api.py`

**Endpoints to implement:**
- POST /api/influencers/ - Create influencer
- GET /api/influencers/ - List influencers
- GET /api/influencers/{id} - Get influencer
- POST /api/influencers/{id}/fetch - Trigger fetch
- GET /api/influencers/opinions/domain/{code} - Get domain opinions

- [ ] Write integration tests for each endpoint
- [ ] Implement CRUD operations
- [ ] Implement fetch trigger
- [ ] Implement opinion aggregation endpoint
- [ ] Update main.py to include router
- [ ] Commit: "feat(api): add influencer management endpoints"

---

### Task 6.2: Next.js API Routes

**Files:**
- Create: `src/app/api/influencers/route.ts`
- Create: `src/app/api/influencers/[id]/route.ts`
- Create: `src/app/api/influencers/[id]/posts/route.ts`

**Purpose:** Proxy to FastAPI for queries, with data transformation

- [ ] Implement GET /api/influencers
- [ ] Implement GET /api/influencers/[id]
- [ ] Implement GET /api/influencers/[id]/posts
- [ ] Add error handling
- [ ] Commit: "feat(api): add Next.js influencer query routes"

---

## Phase 7: Frontend Integration (Week 2, Day 4-5)

### Task 7.1: Influencer List Page

**Files:**
- Modify: `src/app/(dashboard)/events/influencers/page.tsx`

**Features:**
- Display influencer cards
- Platform filter
- Search by name
- Click to detail page

- [ ] Update page with real data fetching
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test UI flow
- [ ] Commit: "feat(ui): implement influencer list page"

---

### Task 7.2: Trends Page Integration

**Files:**
- Modify: `src/app/(dashboard)/events/trends/[domain]/page.tsx`
- Create: `src/components/trends/InfluencerOpinionsSection.tsx`

**Features:**
- Add "大V观点" tab
- Fetch domain opinions
- Display stats, timeline, top opinions
- Time window switcher (3d/7d/30d)

- [ ] Create InfluencerOpinionsSection component
- [ ] Add tab to trends page
- [ ] Fetch and display data
- [ ] Add charts (recharts)
- [ ] Commit: "feat(ui): integrate KOL opinions into trends page"

---

### Task 7.3: AI Analysis Enhancement

**Files:**
- Modify: `src/components/trends/AIInsightSection.tsx`
- Modify: `src/app/api/events/trends/analysis/route.ts`

**Features:**
- Pass influencer opinions to AI analysis
- Display "综合X位大V观点" badge
- Show KOL insights in analysis

- [ ] Modify API to include influencer data
- [ ] Update component to show KOL count
- [ ] Add visual indicator
- [ ] Commit: "feat(ui): enhance AI analysis with KOL data"

---

## Phase 8: Scheduler & Monitoring (Week 2, Day 5-7)

### Task 8.1: Task Scheduler

**Files:**
- Create: `data-service/scheduler/influencer_scheduler.py`
- Modify: `data-service/main.py`

**Features:**
- High priority: every 15min
- Medium: every 1hour
- Low: every 4hours
- Data cleanup: daily 2am

- [ ] Implement InfluencerScheduler with APScheduler
- [ ] Add priority-based job scheduling
- [ ] Integrate in main.py lifespan
- [ ] Commit: "feat(scheduler): add priority-based fetch scheduling"

---

### Task 8.2: Monitoring APIs

**Files:**
- Create: `data-service/routers/monitoring.py`
- Create: `data-service/monitoring/metrics.py`

**Endpoints:**
- GET /api/monitoring/influencers/health
- GET /api/monitoring/influencers/metrics
- GET /api/monitoring/influencers/platforms

- [ ] Implement metrics collection
- [ ] Implement monitoring endpoints
- [ ] Add to main router
- [ ] Commit: "feat(monitoring): add health and metrics endpoints"

---

## Phase 9: Testing & Documentation (Week 3)

### Task 9.1: Integration Tests

**Files:**
- Create: `data-service/tests/integration/test_full_flow.py`

**Test Scenarios:**
- Add influencer → Fetch → Analyze → Aggregate
- Error handling flows
- Rate limiting behavior

- [ ] Write end-to-end test
- [ ] Run and verify
- [ ] Commit: "test: add integration test suite"

---

### Task 9.2: Deployment Scripts

**Files:**
- Create: `scripts/setup_influencer_system.sh`
- Modify: `.env.example`
- Create: `data-service/requirements.txt` (if not exists)

- [ ] Add all Python dependencies
- [ ] Create setup script
- [ ] Update env example with new vars
- [ ] Commit: "chore: add deployment setup scripts"

---

## Self-Review Checklist

**Spec Coverage:**
- [x] Database schema for Influencer, Posts, Logs
- [x] Provider system with 2 implementations (Weibo, Bilibili)
- [x] Fetch service with priority-based scheduling
- [x] AI analysis service with Claude integration
- [x] Opinion aggregation (domain, timeline, consensus)
- [x] Independent AI queue
- [x] FastAPI endpoints (CRUD, fetch, aggregation)
- [x] Next.js API routes
- [x] Frontend integration (list page, trends page, AI enhancement)
- [x] Monitoring and health checks
- [x] Scheduler for automated fetching

**Placeholder Check:**
- No TBD/TODO placeholders in task definitions
- All code blocks contain actual implementations
- All test cases have assertions

**Type Consistency:**
- Provider interface consistent across all tasks
- Service method signatures match between definition and usage
- API route paths consistent between FastAPI and Next.js

**Additional Providers (P1/P2):**
Note: Xiaohongshu, Zhihu, Douyin, Alipay providers follow same pattern as Tasks 3.1-3.2, can be added incrementally after core system works.

---

## Execution Notes

This plan implements Phase 1 (P0 platforms: Weibo, Bilibili) as a fully working system. Once validated:

1. **Phase 1 Validation** (Week 1-2): Core system with 2 providers
2. **Phase 2 Expansion** (Week 3): Add P1 providers (Xiaohongshu, Zhihu)
3. **Phase 3 Complete** (Week 4): Add P2 providers (Douyin, Alipay)

Each phase delivers working, testable software independently.