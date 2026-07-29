# 多平台数据采集基础设施实施报告

## 📋 实施概要

本次实施完成了数据服务层的多平台采集基础设施建设，构建了可复用、可扩展的核心组件库，并成功集成了多个社交媒体和内容平台的数据采集能力。

**实施日期**: 2026-07-28  
**版本**: v1.0  
**状态**: ✅ 已完成

---

## 🎯 实施目标

1. **基础设施层建设**: 构建通用的 HTTP 客户端、限流器、配置管理等核心组件
2. **多平台支持**: 集成知乎、微博、Bilibili、抖音、小红书、支付宝等平台
3. **统一数据格式**: 定义标准化的影响者和内容数据模型
4. **可扩展架构**: 提供清晰的接口和基类，便于后续添加新平台

---

## 📦 已完成的组件清单

### 1. 核心基础设施层 (`data-service/core/`)

| 组件 | 文件 | 功能描述 | 状态 |
|------|------|---------|------|
| **HTTP 客户端** | `http_client.py` | 统一的异步 HTTP 请求封装，支持重试、超时、会话管理 | ✅ |
| **限流器** | `rate_limiter.py` | 令牌桶算法实现，支持按平台配置不同速率 | ✅ |
| **User-Agent 池** | `user_agent.py` | 随机 UA 轮换，包含桌面端和移动端 UA | ✅ |
| **配置管理器** | `config_manager.py` | 平台配置加载、缓存管理（TTL 5分钟） | ✅ |
| **数据解析器** | `parsers.py` | 时间戳解析、文本清理、媒体类型检测 | ✅ |

**核心特性**:
- 🔄 自动重试：指数退避策略，支持 429 和 5xx 错误重试
- ⏱️ 智能限流：令牌桶算法，避免触发平台反爬机制
- 💾 配置缓存：5分钟 TTL，减少数据库查询
- 🎭 反爬保护：随机 UA、Referer、Origin 等 Header 注入

---

### 2. 平台 Provider 实现

#### 已完成的平台

| 平台 | Provider 文件 | 数据类型 | API 类型 | 认证要求 | 状态 |
|------|--------------|---------|---------|---------|------|
| **知乎** | `zhihu_provider.py` | 用户信息、动态（回答/文章/想法/视频） | 半公开 API | Cookie | ✅ |
| **微博** | `weibo_provider.py` | 用户信息、微博内容 | 半公开 API | Cookie | ✅ |
| **Bilibili** | `bilibili_provider.py` | UP主信息、视频列表 | 公开 API | 可选 Cookie | ✅ |
| **抖音** | `douyin_provider.py` | 用户信息、视频列表 | 半公开 API | Cookie | ✅ |
| **小红书** | `xiaohongshu_provider.py` | 用户信息、笔记列表 | 半公开 API | Cookie | ✅ |
| **支付宝** | `alipay_provider.py` | 生活号信息、内容列表 | 半公开 API | Cookie | ✅ |
| **NewsNow** | `newsnow_provider.py` | 财经新闻聚合 | 开源 API | 无 | ✅ |
| **雪球** | `xueqiu_provider.py` | 行情数据、热门帖子 | 半公开 API | Cookie | ✅ |

#### 数据源聚合

| 传统数据源 | Provider 文件 | 数据类型 | 状态 |
|-----------|--------------|---------|------|
| **AKShare** | `akshare_provider.py` | 市场数据、新闻、资金流向 | ✅ |
| **Tushare** | `tushare_provider.py` | 市场数据、财务数据 | ✅ |
| **东方财富直连** | `eastmoney_direct_provider.py` | 资金流向、北向资金 | ✅ |
| **新浪财经** | `sina_provider.py` | 实时行情 | ✅ |

---

## 🏗️ 基础设施层详解

### 1. BaseHTTPClient - 统一 HTTP 客户端

**位置**: `data-service/core/http_client.py`

**核心功能**:
```python
async with BaseHTTPClient(
    base_url="https://api.example.com",
    headers={"User-Agent": "..."},
    cookies={"session": "..."},
    timeout=10,
    max_retries=3
) as client:
    result = await client.get("/api/endpoint", params={"key": "value"})
```

**特性**:
- ✅ aiohttp Session 自动管理
- ✅ 指数退避重试（1s → 2s → 4s）
- ✅ 429 限流自动处理（识别 Retry-After 头）
- ✅ 5xx 服务器错误自动重试
- ✅ 请求日志记录（URL、状态码、耗时）

---

### 2. RateLimiter - 令牌桶限流器

**位置**: `data-service/core/rate_limiter.py`

**核心功能**:
```python
limiter = await get_rate_limiter(
    platform="zhihu",
    rate=1/3,        # 每3秒1个请求
    capacity=10      # 最大突发10个请求
)

await limiter.acquire()  # 获取令牌（等待至有可用令牌）
```

**算法**: 令牌桶（Token Bucket）
- 令牌以恒定速率生成（rate 个/秒）
- 桶容量上限为 capacity
- 请求消耗令牌，不足则等待

**全局注册表**: `RateLimiterRegistry` 管理所有平台的限流器实例

---

### 3. PlatformConfigManager - 配置管理

**位置**: `data-service/core/config_manager.py`

**核心功能**:
```python
manager = get_config_manager(db_connection)
config = await manager.get_config("bilibili")

# 配置结构
{
    "platform": "bilibili",
    "enabled": True,
    "config": {
        "base_url": "https://api.bilibili.com",
        "timeout": 10,
        "max_retries": 3,
        "cookies": {...}
    },
    "rate_limit": {"rate": 1.0, "capacity": 10}
}
```

**缓存策略**:
- 内存缓存 TTL：5分钟
- Double-check locking 避免并发加载
- 支持强制刷新 `reload_config(platform)`

---

### 4. UserAgentPool - User-Agent 轮换

**位置**: `data-service/core/user_agent.py`

**核心功能**:
```python
from core import get_random_user_agent, get_chrome_user_agent

ua = get_random_user_agent(prefer_desktop=True)  # 70% 桌面，30% 移动
chrome_ua = get_chrome_user_agent()  # 专用于 API 请求
```

**UA 库**:
- 12 个桌面端 UA（Chrome、Firefox、Safari、Edge）
- 10 个移动端 UA（iOS Safari、Chrome、Android）
- 支持自定义添加

---

### 5. DataParser - 数据解析工具

**位置**: `data-service/core/parsers.py`

**核心功能**:
```python
from core import parse_timestamp, clean_text, detect_media_type

# 时间戳解析（支持秒/毫秒/ISO 8601）
dt = parse_timestamp(1627891200)  # → datetime对象

# 文本清理（去HTML、空格、截断）
clean = clean_text("<p>文本内容</p>", max_length=100)

# 媒体类型检测
media_type = detect_media_type(content, url="https://b23.tv/video")  # → 'video'
```

**支持的时间格式**:
- Unix 秒时间戳
- Unix 毫秒时间戳
- ISO 8601: `2024-07-28T10:30:00Z`
- 常见格式: `2024-07-28 10:30:00`

---

## 📱 各平台实现状态

### 1. 知乎 (ZhihuAPIProvider)

**实现方法**:
- ✅ `fetch_user_info(account_id)` - 获取用户信息
- ✅ `fetch_user_posts(account_id, since, limit)` - 获取用户动态
- ✅ `validate_account(account_id)` - 验证账号存在性

**支持的内容类型**:
- 回答 (answer) - 包含问题标题和回答内容
- 文章 (article) - 专栏文章
- 想法 (pin) - 短动态
- 视频 (zvideo) - 视频内容

**限流配置**: 1 req / 3s（避免触发 -799 错误）

**数据字段**:
```python
{
    'content': '内容文本',
    'url': '内容链接',
    'publish_time': datetime对象,
    'media_type': 'text|image|video',
    'media_urls': ['媒体URL列表'],
    'likes': 赞同数,
    'comments': 评论数,
    'shares': 分享数,
    'extra': {  # 知乎特有字段
        'contentType': 'answer',
        'questionId': '问题ID',
        'questionTitle': '问题标题',
        'voteupCount': 赞同数,
        'votedownCount': 反对数,
        'isFeatured': 是否精选
    }
}
```

---

### 2. 微博 (WeiboAPIProvider)

**实现方法**:
- ✅ `fetch_user_info(account_id)` - 获取用户信息
- ✅ `fetch_user_posts(account_id, since, limit)` - 获取微博列表
- ✅ `validate_account(account_id)` - 验证账号存在性

**API 端点**:
- 用户信息: `/ajax/profile/info?uid={uid}`
- 微博列表: `/ajax/statuses/mymblog?uid={uid}&page={page}`

**限流配置**: 1 req / 2s

**特殊处理**:
- 长文本检测：`isLongText=true` 时额外请求完整内容
- 转发微博解析：提取原微博内容
- 图片/视频 URL 提取

---

### 3. Bilibili (BilibiliAPIProvider)

**实现方法**:
- ✅ `fetch_user_info(account_id)` - 获取 UP 主信息
- ✅ `fetch_user_posts(account_id, since, limit)` - 获取视频列表
- ✅ `validate_account(account_id)` - 验证账号存在性

**API 端点**:
- 用户信息: `/x/space/acc/info?mid={mid}`
- 视频列表: `/x/space/arc/search?mid={mid}&ps={ps}&pn={pn}`

**限流配置**: 1 req / 1s

**领域分类**: 自动从认证信息提取（半导体、AI、科技、财经等）

**特殊功能**:
- 重试机制：-799 限流错误指数退避重试
- Cookie 支持：可选，提升限额
- 认证信息解析：提取 UP 主认证类型和领域

---

### 4. 抖音 (DouyinAPIProvider)

**实现方法**:
- ✅ `fetch_user_info(account_id)` - 获取用户信息
- ✅ `fetch_user_posts(account_id, since, limit)` - 获取视频列表
- ✅ `validate_account(account_id)` - 验证账号存在性

**API 端点**:
- 用户信息: `/aweme/v1/web/aweme/post/?sec_user_id={sec_user_id}`

**限流配置**: 1 req / 2s

**认证要求**: Cookie（包含 `ttwid`、`s_v_web_id` 等）

---

### 5. 小红书 (XiaohongshuProvider)

**实现方法**:
- ✅ `fetch_user_info(account_id)` - 获取用户信息
- ✅ `fetch_user_posts(account_id, since, limit)` - 获取笔记列表
- ✅ `validate_account(account_id)` - 验证账号存在性

**API 端点**:
- 用户信息: `/api/sns/web/v1/user/{user_id}`
- 笔记列表: `/api/sns/web/v1/user_posted?user_id={user_id}`

**限流配置**: 1 req / 3s（反爬严格）

**认证要求**: Cookie + `x-s`、`x-t` 签名头

---

### 6. 支付宝 (AlipayProvider)

**实现方法**:
- ✅ `fetch_user_info(account_id)` - 获取生活号信息
- ✅ `fetch_user_posts(account_id, since, limit)` - 获取内容列表
- ✅ `validate_account(account_id)` - 验证账号存在性

**API 端点**:
- 生活号信息: `/index/lifeplatform/getLifePublisher?userId={user_id}`
- 内容列表: `/index/lifeplatform/getLifeContents?userId={user_id}`

**限流配置**: 1 req / 2s

---

### 7. NewsNow (NewsNowProvider)

**实现方法**:
- ✅ `get_news(keyword, limit)` - 获取财经新闻聚合

**支持的平台**:
- `wallstreetcn-hot` - 华尔街见闻热榜
- `cls-hot` - 财联社热榜
- `thepaper` - 澎湃财经
- `36kr` - 36氪
- `jinse` - 金色财经（加密货币）

**API 来源**: [NewsNow 开源项目](https://github.com/ourongxing/newsnow) (MIT License)

**特性**:
- 无需认证
- 多平台聚合
- 自动提取真实发布时间（页面解析）

---

## 🔧 使用示例

### 基础设施层示例

```python
# 1. HTTP 客户端
from core import BaseHTTPClient

async with BaseHTTPClient(
    base_url="https://api.zhihu.com",
    headers={"User-Agent": "..."},
    timeout=10,
    max_retries=3
) as client:
    result = await client.get("/api/v4/members/excited-vczh")

# 2. 限流器
from core import get_rate_limiter

limiter = await get_rate_limiter("zhihu", rate=1/3, capacity=10)
await limiter.acquire()
# ... 执行 API 请求

# 3. 配置管理
from core import get_config_manager

manager = get_config_manager(db)
config = await manager.get_config("bilibili")
print(config['config']['cookies'])

# 4. 数据解析
from core import parse_timestamp, clean_text

dt = parse_timestamp(1627891200000)  # 毫秒时间戳
text = clean_text("<p>HTML内容</p>", max_length=100)
```

### Provider 使用示例

```python
# 知乎 Provider
from providers.zhihu_provider import ZhihuAPIProvider

config = {
    'cookie_str': 'z_c0=...; _zap=...',
    'timeout': 10,
    'max_retries': 3
}

provider = ZhihuAPIProvider(config)

# 获取用户信息
user_info = await provider.fetch_user_info('excited-vczh')
print(user_info['name'], user_info['followers_count'])

# 获取用户动态
posts = await provider.fetch_user_posts(
    account_id='excited-vczh',
    since=datetime(2024, 1, 1),
    limit=20
)

for post in posts:
    print(f"{post['publish_time']}: {post['content'][:50]}")
```

### 完整集成示例

```python
from data-service.services.influencer_fetch_service import InfluencerFetchService
from core import get_config_manager

# 初始化服务
config_manager = get_config_manager(db)
fetch_service = InfluencerFetchService(db, config_manager)

# 添加知乎影响者
influencer = await db.influencer.create({
    'data': {
        'name': '轮子哥',
        'platform': 'zhihu',
        'accountId': 'excited-vczh',
        'category': 'AI',
        'isActive': True
    }
})

# 采集内容
await fetch_service.fetch_influencer_content(influencer.id)
```

---

## 🎨 数据模型

### 1. Influencer（影响者）

```typescript
model Influencer {
  id          String   @id @default(cuid())
  name        String
  platform    String   // zhihu, weibo, bilibili, etc.
  accountId   String   // 平台账号ID
  avatarUrl   String?
  description String?
  verified    Boolean  @default(false)
  category    String   // AI, 半导体, 财经, etc.
  isActive    Boolean  @default(true)
  
  posts       InfluencerPost[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([platform, accountId])
}
```

### 2. InfluencerPost（影响者内容）

```typescript
model InfluencerPost {
  id            String   @id @default(cuid())
  influencerId  String
  influencer    Influencer @relation(fields: [influencerId], references: [id])
  
  content       String
  url           String
  publishTime   DateTime
  
  mediaType     String   // text, image, video
  mediaUrls     Json     // String[]
  
  likes         Int      @default(0)
  comments      Int      @default(0)
  shares        Int      @default(0)
  
  // 平台特有字段（JSON 存储）
  extra         Json?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@unique([influencerId, url])
  @@index([influencerId, publishTime])
}
```

---

## ⚙️ 限流参数建议

| 平台 | 推荐速率 | 桶容量 | 说明 |
|------|---------|-------|------|
| 知乎 | 1 req / 3s | 10 | 严格限流，易触发 -799 错误 |
| 微博 | 1 req / 2s | 15 | 中等限流 |
| Bilibili | 1 req / 1s | 10 | 较宽松，但有 -799 检测 |
| 抖音 | 1 req / 2s | 10 | 需要有效 Cookie |
| 小红书 | 1 req / 3s | 5 | 反爬最严格 |
| 支付宝 | 1 req / 2s | 10 | 中等限流 |
| NewsNow | 2 req / 1s | 20 | 开源 API，较宽松 |

**调整建议**:
- 生产环境：降低 rate 值（更保守）
- 开发测试：capacity 设小（避免突发请求触发限流）
- 监控 429/403 错误率，动态调整速率

---

## ⚠️ 已知限制

### 1. 认证要求

**需要 Cookie 的平台**:
- 知乎、微博、抖音、小红书：必须提供有效 Cookie
- Bilibili、支付宝：Cookie 可选，但影响限额

**Cookie 获取方式**: 见 `docs/platform-provider-guide.md`

### 2. 反爬限制

**触发条件**:
- 请求频率过高
- User-Agent 异常
- 缺少 Referer/Origin 头
- IP 信誉差（需配置代理池）

**应对策略**:
- ✅ 已实现：随机 UA、限流器、重试机制
- ⏳ 待实现：IP 代理池、浏览器指纹模拟

### 3. API 稳定性

**半公开 API 风险**:
- 接口可能随时变更（无官方文档）
- 返回格式可能调整
- 新增反爬策略

**降级方案**:
- 捕获异常，记录日志
- 配置管理器可动态禁用平台
- 保留文件缓存作为降级数据

### 4. 数据完整性

**限制**:
- 部分平台无法获取完整历史数据（仅最近 N 条）
- 删除/隐私内容无法采集
- 付费内容可能需要额外权限

---

## 🚀 后续改进方向

### 短期优化（1-2周）

1. **IP 代理池集成**
   - 集成第三方代理服务
   - 自动轮换 IP
   - 失败 IP 黑名单

2. **监控和告警**
   - 限流触发次数统计
   - API 成功率监控
   - Cookie 失效告警

3. **配置 UI 界面**
   - 平台配置可视化管理
   - Cookie 更新界面
   - 限流参数调优工具

### 中期优化（1-2个月）

1. **浏览器自动化**
   - Playwright/Puppeteer 集成
   - 模拟真实用户行为
   - 自动登录和 Cookie 刷新

2. **增量采集优化**
   - 基于 `since` 参数的增量更新
   - 去重逻辑优化
   - 采集任务调度器

3. **数据质量提升**
   - 内容相关性过滤
   - 垃圾内容检测
   - 数据标准化和校验

### 长期规划（3-6个月）

1. **新平台扩展**
   - 今日头条
   - Twitter/X
   - LinkedIn
   - YouTube

2. **AI 内容分析**
   - 情感分析
   - 主题聚类
   - 影响力评分

3. **实时采集**
   - WebSocket 推送
   - 事件驱动架构
   - 分布式任务队列

---

## 📚 相关文档

- **平台配置指南**: `docs/platform-provider-guide.md`
- **基础设施使用手册**: `data-service/core/USAGE.md`
- **数据源能力对比**: `docs/DATASOURCE-FINAL-SUMMARY.md`
- **项目总览**: `CLAUDE.md`

---

## ✅ 验收标准

- [x] 核心基础设施组件完整（HTTP、限流、配置、解析）
- [x] 6+ 社交平台 Provider 实现
- [x] 统一数据模型和接口定义
- [x] 错误处理和重试机制
- [x] 配置管理和缓存优化
- [x] 代码注释和文档齐全
- [x] 测试脚本和使用示例

---

**报告生成时间**: 2026-07-28  
**负责人**: Claude (AI 开发助手)  
**状态**: ✅ 实施完成，进入运维阶段
