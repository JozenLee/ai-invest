# Core 基础设施层使用手册

## 📖 概述

`core` 模块提供了数据采集的核心基础设施，包括 HTTP 客户端、限流器、配置管理、数据解析等可复用组件。本手册提供详细的使用示例和最佳实践。

**目录**:
- [BaseHTTPClient - HTTP 客户端](#basehttpclient)
- [RateLimiter - 限流器](#ratelimiter)
- [PlatformConfigManager - 配置管理](#platformconfigmanager)
- [UserAgentPool - UA 轮换](#useragentpool)
- [DataParser - 数据解析](#dataparser)
- [在新 Provider 中使用](#在新-provider-中使用)

---

## BaseHTTPClient

统一的异步 HTTP 客户端，封装 aiohttp，提供重试、超时、会话管理等功能。

### 基础用法

```python
from core import BaseHTTPClient

async with BaseHTTPClient(
    base_url="https://api.example.com",
    headers={"User-Agent": "MyApp/1.0"},
    cookies={"session": "abc123"},
    timeout=10,
    max_retries=3,
    retry_delay=1.0
) as client:
    # GET 请求
    result = await client.get("/users/123", params={"fields": "name,avatar"})
    
    # POST 请求
    result = await client.post("/users", json={"name": "Alice"})
    
    # 自定义请求
    result = await client.request(
        "PUT",
        "/users/123",
        json={"name": "Bob"},
        headers={"X-Custom": "value"}
    )
```

### 特性说明

#### 1. 自动重试

```python
async with BaseHTTPClient(max_retries=3, retry_delay=1.0) as client:
    # 自动重试以下错误:
    # - 429 (Rate Limit): 识别 Retry-After 头
    # - 5xx (Server Error): 指数退避
    # - Timeout: 指数退避
    result = await client.get("/api/endpoint")
```

**重试策略**:
- 第 1 次重试: 延迟 1s
- 第 2 次重试: 延迟 2s (2^1)
- 第 3 次重试: 延迟 4s (2^2)

#### 2. 超时控制

```python
async with BaseHTTPClient(timeout=10) as client:
    # 单次请求超时 10 秒
    # 超时后自动重试（如果未达到 max_retries）
    result = await client.get("/slow-endpoint")
```

#### 3. 会话管理

```python
# Session 自动创建和复用
client = BaseHTTPClient(base_url="https://api.example.com")

async with client:
    # 多个请求共享同一个 Session（连接池）
    result1 = await client.get("/endpoint1")
    result2 = await client.get("/endpoint2")
    result3 = await client.get("/endpoint3")
    # Session 自动关闭
```

#### 4. Cookie 管理

```python
# 默认 Cookie（所有请求共享）
async with BaseHTTPClient(cookies={"session": "abc123"}) as client:
    result = await client.get("/api/user")

# 请求级别 Cookie（覆盖默认值）
async with BaseHTTPClient(cookies={"session": "abc123"}) as client:
    result = await client.get(
        "/api/admin",
        cookies={"admin_token": "xyz789"}  # 额外的 Cookie
    )
```

#### 5. Header 管理

```python
# 默认 Header
async with BaseHTTPClient(
    headers={
        "User-Agent": "MyApp/1.0",
        "Accept": "application/json"
    }
) as client:
    # 请求级别 Header（合并）
    result = await client.get(
        "/api/endpoint",
        headers={"X-Custom": "value"}  # 额外的 Header
    )
```

### 错误处理

```python
from core import BaseHTTPClient
import logging

logger = logging.getLogger(__name__)

async with BaseHTTPClient(max_retries=3) as client:
    result = await client.get("/api/endpoint")
    
    if result is None:
        # 所有重试都失败
        logger.error("Request failed after all retries")
    else:
        # 成功获取数据
        logger.info(f"Got data: {result}")
```

### 非 JSON 响应处理

```python
async with BaseHTTPClient() as client:
    result = await client.get("/api/html-page")
    
    if result and "text" in result:
        # 非 JSON 响应，返回文本
        html_content = result["text"]
```

---

## RateLimiter

令牌桶算法实现，用于控制请求频率，避免触发平台反爬机制。

### 基础用法

```python
from core import get_rate_limiter

# 获取限流器（全局单例）
limiter = await get_rate_limiter(
    platform="zhihu",
    rate=0.33,      # 每秒 0.33 个请求（即每 3 秒 1 个）
    capacity=10     # 桶容量 10，允许突发 10 个请求
)

# 获取令牌（等待至有可用令牌）
await limiter.acquire()

# 执行 API 请求
result = await client.get("/api/endpoint")
```

### 令牌桶算法

**原理**:
1. 令牌以恒定速率（`rate`）生成
2. 令牌桶最多容纳 `capacity` 个令牌
3. 每次请求消耗 1 个令牌
4. 令牌不足时，等待直到有足够令牌

**示例**:
```python
limiter = RateLimiter(
    rate=1.0,       # 每秒生成 1 个令牌
    capacity=5,     # 桶容量 5
    platform="test"
)

# 场景 1: 突发请求
for i in range(5):
    await limiter.acquire()  # 立即成功（消耗初始的 5 个令牌）

await limiter.acquire()  # 等待 1 秒（等待新令牌生成）

# 场景 2: 平稳请求
while True:
    await limiter.acquire()  # 每秒执行 1 次
    await do_request()
```

### 高级用法

#### 1. 非阻塞获取

```python
# try_acquire: 尝试获取令牌，失败立即返回 False
success = await limiter.try_acquire()

if success:
    await do_request()
else:
    logger.warning("Rate limit reached, skipping request")
```

#### 2. 动态调整速率

```python
limiter = await get_rate_limiter("zhihu", rate=1.0, capacity=10)

# 根据监控数据动态调整
if error_rate > 0.1:
    limiter.update_rate(0.5)  # 降低到 0.5 req/s
    logger.info("Rate limit reduced due to high error rate")
```

#### 3. 查看限流器状态

```python
status = limiter.get_status()

print(f"Platform: {status['platform']}")
print(f"Available tokens: {status['tokens']:.2f}/{status['capacity']}")
print(f"Rate: {status['rate']}/s")
print(f"Utilization: {status['utilization']:.1%}")
```

### 全局注册表

```python
from core.rate_limiter import RateLimiterRegistry

# 获取全局注册表
registry = RateLimiterRegistry()

# 获取或创建限流器
limiter = await registry.get_limiter("zhihu", rate=0.33, capacity=10)

# 直接通过注册表获取令牌
await registry.acquire("zhihu")

# 查看所有限流器状态
all_status = registry.get_all_status()
for platform, status in all_status.items():
    print(f"{platform}: {status['tokens']:.1f}/{status['capacity']}")
```

### 限流参数推荐

| 平台 | rate (req/s) | capacity | 说明 |
|------|-------------|----------|------|
| 知乎 | 0.33 (1/3s) | 10 | 严格限流 |
| 微博 | 0.5 (1/2s) | 15 | 中等限流 |
| Bilibili | 1.0 | 10 | 较宽松 |
| 抖音 | 0.5 (1/2s) | 10 | 中等限流 |
| 小红书 | 0.33 (1/3s) | 5 | 严格限流 |

---

## PlatformConfigManager

从数据库加载平台配置，提供内存缓存（TTL 5分钟）。

### 基础用法

```python
from core import get_config_manager

# 初始化配置管理器（注入数据库连接）
manager = get_config_manager(db_connection)

# 获取平台配置
config = await manager.get_config("bilibili")

if config:
    print(f"Platform: {config['platform']}")
    print(f"Enabled: {config['enabled']}")
    print(f"Config: {config['config']}")
    print(f"Rate limit: {config['rate_limit']}")
```

### 配置结构

```python
{
    "platform": "zhihu",
    "enabled": True,
    "config": {
        "cookie_str": "z_c0=...; _zap=...",
        "timeout": 10,
        "max_retries": 3,
        "retry_delay": 2
    },
    "rate_limit": {
        "rate": 0.33,
        "capacity": 10
    },
    "updated_at": datetime(2024, 7, 28, 10, 30, 0)
}
```

### 缓存管理

```python
# 获取配置（使用缓存）
config = await manager.get_config("zhihu")

# 强制刷新（忽略缓存）
config = await manager.reload_config("zhihu")

# 清除缓存
await manager.clear_cache("zhihu")  # 清除单个平台
await manager.clear_cache()         # 清除所有平台

# 查看缓存状态
status = manager.get_cache_status()
print(f"Cached platforms: {status['platforms']}")
print(f"Cache ages: {status['cache_ages']}")
```

### 批量获取

```python
# 获取所有平台配置
all_configs = await manager.get_all_configs()

for platform, config in all_configs.items():
    print(f"{platform}: enabled={config['enabled']}")
```

### 延迟注入数据库连接

```python
# 场景：启动时数据库未就绪
manager = get_config_manager()  # 不传入 db_connection

# 稍后注入
manager.set_db_connection(db_connection)

# 现在可以使用
config = await manager.get_config("zhihu")
```

---

## UserAgentPool

随机 User-Agent 轮换，包含桌面端和移动端 UA。

### 基础用法

```python
from core import (
    get_random_user_agent,
    get_desktop_user_agent,
    get_mobile_user_agent,
    get_chrome_user_agent
)

# 随机 UA（70% 桌面，30% 移动）
ua = get_random_user_agent(prefer_desktop=True)

# 桌面端 UA
desktop_ua = get_desktop_user_agent()

# 移动端 UA
mobile_ua = get_mobile_user_agent()

# Chrome 桌面端 UA（常用于 API 请求）
chrome_ua = get_chrome_user_agent()
```

### 与 HTTP 客户端集成

```python
from core import BaseHTTPClient, get_random_user_agent

async with BaseHTTPClient(
    base_url="https://api.example.com",
    headers={"User-Agent": get_random_user_agent()}
) as client:
    result = await client.get("/api/endpoint")
```

### 自定义 UA

```python
from core.user_agent import UserAgentPool

pool = UserAgentPool()

# 添加自定义 UA
pool.add_custom_agent(
    "MyBot/1.0 (compatible; CustomBot)",
    is_mobile=False
)

# 获取随机 UA（包含自定义 UA）
ua = pool.get_random()
```

### 高级选择

```python
from core.user_agent import UserAgentPool

pool = UserAgentPool()

# 获取 Safari 移动端 UA（模拟 iOS）
safari_ua = pool.get_safari_mobile()

# 获取 Chrome 桌面端 UA（排除 Edge）
chrome_ua = pool.get_chrome_desktop()

# 50% 桌面，50% 移动
balanced_ua = pool.get_random(prefer_desktop=False)
```

---

## DataParser

数据解析工具，提供时间戳解析、文本清理、媒体类型检测等功能。

### 时间戳解析

```python
from core import parse_timestamp

# Unix 秒时间戳
dt = parse_timestamp(1627891200)  # → datetime(2021, 8, 2, 8, 0, 0)

# Unix 毫秒时间戳（自动检测）
dt = parse_timestamp(1627891200000)  # → datetime(2021, 8, 2, 8, 0, 0)

# ISO 8601 格式
dt = parse_timestamp("2024-07-28T10:30:00Z")

# 常见格式
dt = parse_timestamp("2024-07-28 10:30:00")
dt = parse_timestamp("2024/07/28 10:30:00")

# 已经是 datetime 对象
dt = parse_timestamp(datetime.now())  # → 原样返回

# 解析失败
dt = parse_timestamp("invalid")  # → None
```

### 文本清理

```python
from core import clean_text

# 去除 HTML 标签
text = clean_text("<p>这是<strong>内容</strong></p>")  # → "这是内容"

# 去除多余空格和换行
text = clean_text("  文本   内容  \n\n")  # → "文本 内容"

# 解码 HTML 实体
text = clean_text("&lt;tag&gt; &amp; &quot;text&quot;")  # → "<tag> & "text""

# 截断到指定长度
text = clean_text("很长的文本内容...", max_length=10)  # → "很长的文本内容..."

# 完整示例
html = """
<div class="content">
  <p>这是一段&nbsp;HTML&nbsp;内容</p>
  <script>alert('xss')</script>
  <style>.class{color:red}</style>
</div>
"""
clean = clean_text(html)  # → "这是一段 HTML 内容"
```

### 媒体类型检测

```python
from core import detect_media_type

# 根据 URL 检测
media_type = detect_media_type("", url="https://www.bilibili.com/video/BV1xx411c7XZ")  # → "video"
media_type = detect_media_type("", url="https://image.example.com/photo.jpg")  # → "image"

# 根据内容检测
media_type = detect_media_type("观看视频：...", url="")  # → "video"

# 根据元数据检测
media_type = detect_media_type("", url="", metadata={"type": "video"})  # → "video"

# 完整示例
def parse_post(raw_data):
    url = raw_data.get('url', '')
    content = raw_data.get('text', '')
    metadata = raw_data.get('metadata', {})
    
    media_type = detect_media_type(content, url, metadata)
    
    return {
        'content': content,
        'url': url,
        'media_type': media_type
    }
```

### 辅助工具

```python
from core.parsers import DataParser

# 提取 URL
urls = DataParser.extract_urls("访问 https://example.com 和 https://test.com")
# → ['https://example.com', 'https://test.com']

# 提取话题标签
tags = DataParser.extract_hashtags("今天天气不错 #晴天 #周末")
# → ['晴天', '周末']

# 提取提及用户
mentions = DataParser.extract_mentions("@alice 和 @bob 一起")
# → ['alice', 'bob']

# 清理文件名
filename = DataParser.sanitize_filename("file<>:name?.txt", max_length=255)
# → "file__name_.txt"
```

---

## 在新 Provider 中使用

### 完整示例：创建新平台 Provider

```python
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
    detect_media_type
)

logger = logging.getLogger(__name__)


class NewPlatformProvider(BaseInfluencerProvider):
    """新平台 Provider 示例"""
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.base_url = "https://api.newplatform.com"
        
        # 1. 初始化限流器
        self.rate_limiter = None  # 异步初始化
        
        # 2. 解析 Cookie
        self.cookies = config.get('cookies', {})
        if not self.cookies and config.get('cookie_str'):
            self.cookies = self._parse_cookie_string(config['cookie_str'])
        
        # 3. 初始化 HTTP 客户端
        self.http_client = BaseHTTPClient(
            base_url=self.base_url,
            headers=self._get_default_headers(),
            cookies=self.cookies,
            timeout=config.get('timeout', 10),
            max_retries=config.get('max_retries', 3),
            retry_delay=config.get('retry_delay', 2)
        )
    
    def _parse_cookie_string(self, cookie_str: str) -> Dict:
        """解析 Cookie 字符串"""
        cookies = {}
        for item in cookie_str.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key.strip()] = value.strip()
        return cookies
    
    def _get_default_headers(self) -> Dict:
        """获取默认请求头"""
        return {
            'User-Agent': get_random_user_agent(),
            'Accept': 'application/json',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Referer': 'https://www.newplatform.com/',
            'Origin': 'https://www.newplatform.com'
        }
    
    async def _ensure_rate_limiter(self):
        """确保限流器已初始化"""
        if self.rate_limiter is None:
            rate_config = self.config.get('rate_limit', {})
            self.rate_limiter = await get_rate_limiter(
                platform='newplatform',
                rate=rate_config.get('rate', 0.5),
                capacity=rate_config.get('capacity', 10)
            )
    
    async def fetch_user_info(self, account_id: str) -> Dict:
        """
        获取用户信息
        
        Args:
            account_id: 用户 ID
            
        Returns:
            用户信息字典
        """
        # 应用限流
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()
        
        # 发送请求
        url = f"/api/v1/users/{account_id}"
        params = {'fields': 'name,avatar,bio,followers'}
        
        try:
            result = await self.http_client.get(url, params=params)
            
            if not result:
                logger.error(f"Failed to fetch user info for {account_id}")
                return {}
            
            # 解析数据
            return {
                'name': result.get('name', ''),
                'avatar_url': result.get('avatar_url', ''),
                'description': clean_text(result.get('bio', '')),
                'verified': result.get('verified', False),
                'followers_count': int(result.get('followers_count', 0)),
                'profile_url': f"https://www.newplatform.com/u/{account_id}"
            }
            
        except Exception as e:
            logger.error(f"Error fetching user info: {e}", exc_info=True)
            return {}
    
    async def fetch_user_posts(
        self,
        account_id: str,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """
        获取用户内容列表
        
        Args:
            account_id: 用户 ID
            since: 仅获取此时间之后的内容
            limit: 最大数量
            
        Returns:
            内容列表
        """
        await self._ensure_rate_limiter()
        await self.rate_limiter.acquire()
        
        url = f"/api/v1/users/{account_id}/posts"
        params = {
            'limit': limit,
            'sort': 'time'
        }
        
        try:
            result = await self.http_client.get(url, params=params)
            
            if not result or 'data' not in result:
                logger.error(f"Failed to fetch posts for {account_id}")
                return []
            
            posts = []
            for item in result['data']:
                post = self._parse_post(item)
                
                # 过滤时间
                if post and since and post.get('publish_time'):
                    if post['publish_time'] < since:
                        continue
                
                if post:
                    posts.append(post)
            
            logger.info(f"Fetched {len(posts)} posts for {account_id}")
            return posts[:limit]
            
        except Exception as e:
            logger.error(f"Error fetching posts: {e}", exc_info=True)
            return []
    
    def _parse_post(self, raw: Dict) -> Optional[Dict]:
        """解析单条内容"""
        try:
            # 提取基础字段
            content = clean_text(raw.get('content', ''), max_length=500)
            url = raw.get('url', '')
            
            # 解析时间戳
            publish_time = parse_timestamp(raw.get('created_at'))
            if not publish_time:
                publish_time = datetime.now()
            
            # 检测媒体类型
            media_urls = raw.get('media_urls', [])
            media_type = detect_media_type(
                content,
                url=url,
                metadata={'has_video': raw.get('has_video', False)}
            )
            
            # 提取指标
            likes = int(raw.get('likes_count', 0))
            comments = int(raw.get('comments_count', 0))
            shares = int(raw.get('shares_count', 0))
            
            return {
                'content': content,
                'url': url,
                'publish_time': publish_time,
                'media_type': media_type,
                'media_urls': media_urls,
                'likes': likes,
                'comments': comments,
                'shares': shares
            }
            
        except Exception as e:
            logger.warning(f"Failed to parse post: {e}")
            return None
    
    async def validate_account(self, account_id: str) -> bool:
        """验证账号是否存在"""
        user_info = await self.fetch_user_info(account_id)
        return bool(user_info and user_info.get('name'))
    
    async def close(self):
        """关闭 HTTP 客户端"""
        await self.http_client.close()
```

### 使用示例

```python
# 初始化 Provider
config = {
    'cookie_str': 'session=abc123; uid=456',
    'timeout': 10,
    'max_retries': 3,
    'rate_limit': {
        'rate': 0.5,  # 每秒 0.5 个请求
        'capacity': 10
    }
}

provider = NewPlatformProvider(config)

# 获取用户信息
user_info = await provider.fetch_user_info('user123')
print(user_info)

# 获取用户内容
posts = await provider.fetch_user_posts(
    account_id='user123',
    since=datetime(2024, 7, 1),
    limit=50
)

for post in posts:
    print(f"{post['publish_time']}: {post['content'][:50]}")

# 关闭连接
await provider.close()
```

---

## 🎯 最佳实践

### 1. 错误处理

```python
import logging
from typing import Optional

logger = logging.getLogger(__name__)

async def safe_fetch_user_info(provider, account_id: str) -> Optional[Dict]:
    """安全的用户信息获取，带完整错误处理"""
    try:
        # 应用限流
        await provider.rate_limiter.acquire()
        
        # 发送请求
        result = await provider.http_client.get(f"/users/{account_id}")
        
        if not result:
            logger.warning(f"Empty result for user {account_id}")
            return None
        
        # 验证数据完整性
        if not result.get('name'):
            logger.warning(f"Invalid user data for {account_id}")
            return None
        
        return result
        
    except asyncio.TimeoutError:
        logger.error(f"Timeout fetching user {account_id}")
        return None
    except Exception as e:
        logger.error(f"Error fetching user {account_id}: {e}", exc_info=True)
        return None
```

### 2. 批量请求

```python
async def fetch_multiple_users(provider, account_ids: List[str]) -> List[Dict]:
    """批量获取用户信息（带限流）"""
    results = []
    
    for account_id in account_ids:
        # 限流器自动控制速率
        user_info = await provider.fetch_user_info(account_id)
        if user_info:
            results.append(user_info)
        
        # 可选：添加进度日志
        logger.info(f"Processed {len(results)}/{len(account_ids)}")
    
    return results
```

### 3. 并发控制

```python
import asyncio

async def fetch_with_concurrency(
    provider,
    account_ids: List[str],
    max_concurrent: int = 3
) -> List[Dict]:
    """并发获取（限制并发数）"""
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def fetch_one(account_id):
        async with semaphore:
            return await provider.fetch_user_info(account_id)
    
    tasks = [fetch_one(aid) for aid in account_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 过滤异常
    return [r for r in results if isinstance(r, dict)]
```

### 4. 配置验证

```python
def validate_config(config: Dict) -> bool:
    """验证 Provider 配置"""
    required_fields = ['cookie_str', 'timeout']
    
    for field in required_fields:
        if field not in config:
            logger.error(f"Missing required config field: {field}")
            return False
    
    # 验证限流配置
    rate_limit = config.get('rate_limit', {})
    if 'rate' in rate_limit and rate_limit['rate'] <= 0:
        logger.error("Invalid rate limit: rate must be > 0")
        return False
    
    return True
```

---

## 📚 相关文档

- **平台配置指南**: `../../docs/platform-provider-guide.md`
- **项目总览**: `../../CLAUDE.md`

---

**文档版本**: v1.0  
**更新日期**: 2026-07-28
