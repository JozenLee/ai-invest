# Zhihu Provider Implementation

## 概述

ZhihuAPIProvider 是知乎平台的数据提供者实现，使用知乎半公开 API 获取用户信息和动态数据。

## 技术实现

### 核心特性

1. **基础设施集成**
   - 使用 `BaseHTTPClient` 处理 HTTP 请求（Session 管理、重试、日志）
   - 使用 `RateLimiter` 控制请求频率（1 req/3s）
   - 使用 `get_random_user_agent()` 随机 User-Agent
   - 使用 `parse_timestamp()` 解析时间戳

2. **内容类型支持**
   - `answer` - 回答（包含问题信息）
   - `article` - 文章
   - `pin` - 想法
   - `video` - 视频

3. **数据解析**
   - 自动识别内容类型
   - 提取问题标题和ID（回答类型）
   - 区分赞同数（voteup）和反对数（votedown）
   - 识别精选回答（isFeatured）

### API 端点

#### 1. 获取用户信息
```
GET /api/v4/members/{url_token}
```

**参数:**
- `url_token`: 用户的 URL 标识符（如 "excited-vczh"）
- `include`: 包含字段列表

**返回字段:**
- `name` - 用户名
- `avatar_url` - 头像 URL
- `headline` - 一句话介绍
- `description` - 个人简介
- `follower_count` - 粉丝数
- `is_org` - 是否机构账号
- `badge` - 认证徽章

#### 2. 获取用户动态
```
GET /api/v4/members/{url_token}/activities
```

**参数:**
- `url_token`: 用户的 URL 标识符
- `limit`: 返回数量（默认 20）
- `desktop`: 桌面版（true）

**返回结构:**
```json
{
  "data": [
    {
      "type": "MEMBER_ANSWER_ARTICLE",
      "target": {
        "type": "answer",
        "id": 123456,
        "content": "...",
        "question": {
          "id": 789,
          "title": "..."
        },
        "voteup_count": 100,
        "comment_count": 10,
        "created_time": 1234567890
      }
    }
  ]
}
```

### 数据映射

#### 标准格式映射
```python
{
    'content': str,           # 内容文本
    'url': str,              # 原文链接
    'publish_time': datetime, # 发布时间
    'media_type': str,       # 'text' | 'image' | 'video'
    'media_urls': List[str], # 媒体文件 URL
    'likes': int,            # 赞同数
    'comments': int,         # 评论数
    'shares': int,           # 分享数（知乎不提供，默认 0）
}
```

#### ZhihuPostExtra 扩展字段
```python
{
    'contentType': str,      # 'answer' | 'article' | 'pin' | 'video'
    'questionId': str,       # 问题 ID（仅回答类型）
    'questionTitle': str,    # 问题标题（仅回答类型）
    'voteupCount': int,      # 赞同数
    'votedownCount': int,    # 反对数
    'isFeatured': bool,      # 是否精选
}
```

### URL 格式

- **回答**: `https://www.zhihu.com/question/{question_id}/answer/{answer_id}`
- **文章**: `https://zhuanlan.zhihu.com/p/{article_id}`
- **想法**: `https://www.zhihu.com/pin/{pin_id}`
- **视频**: `https://www.zhihu.com/zvideo/{video_id}`

## 配置示例

### 基础配置
```python
config = {
    'platform': 'zhihu',
    'driver_type': 'api',
    'timeout': 10,
    'max_retries': 3,
    'retry_delay': 2,
}
```

### Cookie 认证（可选）
```python
config = {
    'platform': 'zhihu',
    'driver_type': 'api',
    'cookie_str': 'd_c0=xxx; _zap=xxx; z_c0=xxx',
    # 或者使用字典格式
    'cookies': {
        'd_c0': 'xxx',
        '_zap': 'xxx',
        'z_c0': 'xxx',
    }
}
```

## 使用示例

### 1. 初始化 Provider
```python
from providers.zhihu_provider import ZhihuAPIProvider

config = {
    'platform': 'zhihu',
    'driver_type': 'api',
}

provider = ZhihuAPIProvider(config)
```

### 2. 验证账号
```python
account_id = 'excited-vczh'
is_valid = await provider.validate_account(account_id)
```

### 3. 获取用户信息
```python
user_info = await provider.fetch_user_info(account_id)
print(f"Name: {user_info['name']}")
print(f"Followers: {user_info['followers_count']}")
```

### 4. 获取用户动态
```python
from datetime import datetime, timedelta

# 获取最近 30 天的动态
since = datetime.now() - timedelta(days=30)
posts = await provider.fetch_user_posts(account_id, since=since, limit=20)

for post in posts:
    print(f"Content: {post['content'][:100]}")
    print(f"Type: {post['extra']['contentType']}")
    print(f"Likes: {post['likes']}")
```

### 5. 清理资源
```python
await provider.close()
```

## 注册到 Registry

Provider 已自动注册到 `InfluencerProviderRegistry`:

```python
# providers/__init__.py
from providers.zhihu_provider import ZhihuAPIProvider
InfluencerProviderRegistry.register_provider('zhihu_api', ZhihuAPIProvider)
```

### 通过 Registry 使用

```python
from providers.provider_registry import InfluencerProviderRegistry

# 创建 Provider 实例
provider = InfluencerProviderRegistry.create_provider('zhihu_api', config)

# 使用 Provider
user_info = await provider.fetch_user_info('excited-vczh')
```

## 测试

### 运行测试脚本
```bash
cd data-service
python3 test_zhihu_provider.py
```

### 测试覆盖
- ✅ 账号验证
- ✅ 用户信息获取
- ✅ 动态列表获取
- ✅ 多种内容类型解析（answer/article/pin/video）
- ✅ 时间过滤（since 参数）
- ✅ 限流控制（1 req/3s）

## 反爬虫策略

1. **请求频率控制**
   - 使用 RateLimiter，1 请求/3 秒
   - 失败后指数退避重试

2. **请求头模拟**
   - 随机 User-Agent
   - 完整的浏览器请求头
   - Referer 和 Origin 设置

3. **Cookie 认证**
   - 支持 Cookie 配置
   - 模拟登录用户行为

## 限制与注意事项

1. **API 限制**
   - 知乎 API 单次最多返回 20 条动态
   - 需要多次请求获取历史数据

2. **认证要求**
   - 部分接口可能需要登录 Cookie
   - 未登录可能返回数据不完整

3. **数据时效**
   - 动态数据有时效性
   - 建议定期增量抓取

4. **反爬风险**
   - 频繁请求可能触发验证码
   - 建议配置合理的请求间隔

## 错误处理

Provider 会自动处理以下错误：

- **网络错误**: 自动重试（最多 3 次）
- **超时错误**: 指数退避重试
- **限流错误**: 按照 Retry-After 头延迟重试
- **解析错误**: 记录警告并跳过问题数据

## 日志记录

所有关键操作都有日志记录：

```python
logger.info(f"Successfully fetched Zhihu user info for {account_id}")
logger.info(f"Fetched {len(posts)} posts for Zhihu user {account_id}")
logger.warning(f"Failed to parse Zhihu activity: {e}")
logger.error(f"Zhihu API error: {error_msg}")
```

## 与其他 Provider 的差异

| 特性 | Bilibili | Zhihu |
|------|----------|-------|
| 内容类型 | 动态/视频 | 回答/文章/想法/视频 |
| URL 格式 | 统一 t.bilibili.com | 多种域名格式 |
| 特殊字段 | - | 问题信息、反对数 |
| 限流策略 | 1.5s base delay | 1 req/3s |

## 后续优化

1. **分页支持**: 实现动态列表分页
2. **增量更新**: 使用 cursor 获取增量数据
3. **内容解析**: 更完善的富文本内容提取
4. **缓存机制**: 用户信息缓存
5. **批量查询**: 支持批量获取用户信息

## 相关文件

- `/Users/jozen.lee/ai-softwares/ai-invest/data-service/providers/zhihu_provider.py` - Provider 实现
- `/Users/jozen.lee/ai-softwares/ai-invest/data-service/providers/__init__.py` - Provider 注册
- `/Users/jozen.lee/ai-softwares/ai-invest/data-service/test_zhihu_provider.py` - 测试脚本
- `/Users/jozen.lee/ai-softwares/ai-invest/prisma/schema.prisma` - ZhihuPostExtra 数据模型
