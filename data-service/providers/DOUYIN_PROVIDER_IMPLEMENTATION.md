# 抖音 Provider 实现总结

## 实现文件
- `data-service/providers/douyin_provider.py` - DouyinCrawlerProvider 实现
- `data-service/providers/__init__.py` - 已注册 `douyin_crawler` Provider

## 核心功能

### 1. DouyinCrawlerProvider 类
继承自 `BaseInfluencerProvider`，实现了三个核心方法：

#### `fetch_user_info(account_id: str) -> Dict`
- 获取抖音用户信息（昵称、头像、简介、认证状态、粉丝数）
- API: `/aweme/v1/web/aweme/detail/`
- 使用 sec_uid 作为用户标识
- 返回标准化用户信息字典

#### `fetch_user_posts(account_id: str, since: Optional[datetime], limit: int) -> List[Dict]`
- 获取用户视频列表
- API: `/aweme/v1/web/aweme/post/`
- 支持时间过滤（since参数）
- 支持数量限制（limit参数，单次最多35条）
- 返回标准化视频数据列表

#### `validate_account(account_id: str) -> bool`
- 验证抖音账号是否存在和可访问
- 通过调用 fetch_user_info 判断账号有效性

## 技术特性

### 1. 基础设施集成
- **BaseHTTPClient**: 统一的 HTTP 请求处理
  - Session 管理
  - 自动重试（默认2次）
  - 超时控制（默认10秒）
  
- **RateLimiter**: 令牌桶限流
  - 抖音限流：1 req/4s（0.25 req/s）
  - 容量：5个令牌
  - 防止触发反爬限制

- **UserAgentPool**: 随机 User-Agent
  - 模拟真实浏览器
  - 降低被识别为爬虫的风险

### 2. 数据解析

#### 视频数据解析 (`_parse_aweme`)
标准字段：
- `content`: 视频描述
- `url`: 视频链接（https://www.douyin.com/video/{aweme_id}）
- `publish_time`: 发布时间（datetime对象）
- `media_type`: 媒体类型（固定为'video'）
- `media_urls`: 媒体URL列表（封面、视频）
- `likes`: 点赞数
- `comments`: 评论数
- `shares`: 分享数

#### DouyinPostExtra 字段
抖音特有数据（映射到 DouyinPostExtra 表）：
- `video_duration`: 视频时长（秒）
- `music_id`: 音乐ID
- `music_title`: 音乐标题
- `music_author`: 音乐作者
- `challenge_tags`: 挑战标签/话题（JSON数组）
- `is_ad`: 是否为广告

### 3. 反爬策略
- 保守的请求频率（1 req/4s）
- 随机 User-Agent
- 完整的浏览器请求头
- Referer 设置
- 预留 X-Bogus 签名扩展空间

## API 参数

### 用户信息 API
```
GET /aweme/v1/web/aweme/detail/
Params:
  - sec_uid: 用户唯一标识
  - aid: 6383 (抖音Web版app_id)
```

### 视频列表 API
```
GET /aweme/v1/web/aweme/post/
Params:
  - sec_uid: 用户唯一标识
  - count: 返回数量（最多35）
  - max_cursor: 分页游标
  - aid: 6383
```

## 注册信息
Provider 已在 `providers/__init__.py` 注册：
```python
InfluencerProviderRegistry.register_provider('douyin_crawler', DouyinCrawlerProvider)
```

## 使用示例

```python
from providers.douyin_provider import DouyinCrawlerProvider

config = {
    'platform': 'douyin',
    'driver_type': 'crawler',
    'timeout': 10,
    'max_retries': 2,
}

provider = DouyinCrawlerProvider(config)

# 验证账号
is_valid = await provider.validate_account('MS4wLjABAAAA_example_sec_uid')

# 获取用户信息
user_info = await provider.fetch_user_info('MS4wLjABAAAA_example_sec_uid')

# 获取视频列表（最近5个视频）
posts = await provider.fetch_user_posts('MS4wLjABAAAA_example_sec_uid', limit=5)

# 关闭资源
await provider.close()
```

## 测试结果
✅ 所有测试通过：
- Provider 初始化正常
- 所有必需方法已实现
- 数据解析正确
- DouyinPostExtra 字段匹配 Prisma schema
- 限流器集成成功
- HTTP 客户端配置正确
- Provider 已成功注册

## 注意事项

### 1. 抖音反爬
抖音的反爬机制最严格，当前实现为基础版本：
- 未实现 X-Bogus 签名（可能导致部分请求失败）
- 未实现 device_id、iid 等设备指纹
- 建议在生产环境中逐步测试和优化

### 2. 后续优化方向
- **签名算法**: 实现 X-Bogus 签名以提高成功率
- **设备指纹**: 添加 device_id、iid 等参数
- **Cookie 管理**: 支持登录态 Cookie
- **代理支持**: 添加代理池避免 IP 封禁
- **分页抓取**: 实现 max_cursor 分页获取历史视频
- **错误处理**: 更细粒度的错误分类和重试策略

### 3. 数据库集成
确保 Prisma schema 中包含 DouyinPostExtra 模型：
```prisma
model DouyinPostExtra {
  id            String   @id @default(cuid())
  postId        String   @unique
  videoDuration Int      // 秒
  musicId       String?
  musicTitle    String?
  musicAuthor   String?
  challengeTags String?  // JSON array
  isAd          Boolean  @default(false)
  
  post          InfluencerPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## 依赖关系
```
DouyinCrawlerProvider
├── BaseInfluencerProvider (继承)
├── BaseHTTPClient (HTTP 请求)
├── RateLimiter (限流)
├── UserAgentPool (UA 管理)
└── DataParser (时间戳解析)
```

## 状态
✅ **实现完成**
- 核心功能已实现
- 测试通过
- 已注册到 Provider Registry
- 准备好用于生产环境测试
