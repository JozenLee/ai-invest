# Xiaohongshu (小红书) Provider

## 概述

`XiaohongshuAPIProvider` 是小红书平台的数据提供者实现，使用小红书移动端 Web API 获取用户信息和笔记内容。

## 功能特性

### 核心功能

1. **用户信息获取** (`fetch_user_info`)
   - 用户名称、头像、简介
   - 认证状态（红V认证）
   - 粉丝数量
   - 用户主页链接

2. **笔记列表获取** (`fetch_user_posts`)
   - 笔记标题和内容
   - 发布时间
   - 媒体类型（图文/视频）
   - 互动数据（点赞数）
   - 笔记链接

3. **账号验证** (`validate_account`)
   - 检查账号是否存在
   - 验证账号可访问性

### 基础设施集成

使用 `data-service/core/` 提供的基础设施组件：

- **BaseHTTPClient**: HTTP 客户端，支持自动重试、超时控制
- **RateLimiter**: 限流器，控制请求频率（1 req/2s）
- **UserAgent**: 随机 User-Agent 池（移动端 UA）
- **DataParser**: 数据解析工具（时间戳、文本清理）

## API 接口

### 用户信息 API

```
GET https://edith.xiaohongshu.com/api/sns/web/v1/user/{user_id}
```

**响应示例：**

```json
{
  "code": 0,
  "data": {
    "basic_info": {
      "nickname": "用户昵称",
      "images": "https://avatar.url",
      "desc": "个人简介",
      "red_official_verified": true
    },
    "interactions": [
      {
        "type": "fans",
        "count": "10.5万"
      }
    ]
  }
}
```

### 笔记列表 API

```
GET https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?user_id={user_id}&num=20
```

**响应示例：**

```json
{
  "code": 0,
  "data": {
    "notes": [
      {
        "note_id": "abc123",
        "title": "笔记标题",
        "desc": "笔记内容",
        "type": "video",
        "cover": {
          "url_default": "https://cover.url"
        },
        "interact_info": {
          "liked_count": "1234"
        },
        "last_update_time": 1640000000000,
        "tag_list": [
          {"name": "科技"},
          {"name": "AI"}
        ]
      }
    ]
  }
}
```

## 使用方法

### 1. 基础配置

```python
from providers.xiaohongshu_provider import XiaohongshuAPIProvider

config = {
    'platform': 'xiaohongshu',
    'driver_type': 'api',
    'timeout': 10,
    'max_retries': 3,
    'retry_delay': 2.0,
    # Cookie 认证（必需）
    'cookie_str': 'a1=xxx; webId=xxx; web_session=xxx',
}

provider = XiaohongshuAPIProvider(config)
```

### 2. 获取用户信息

```python
user_info = await provider.fetch_user_info('5c3e9eb90000000006019f23')

print(user_info)
# {
#     'name': '用户昵称',
#     'avatar_url': 'https://...',
#     'description': '个人简介',
#     'verified': True,
#     'followers_count': 105000,
#     'profile_url': 'https://www.xiaohongshu.com/user/profile/...'
# }
```

### 3. 获取用户笔记

```python
from datetime import datetime, timedelta

# 获取最近7天的笔记
since = datetime.now() - timedelta(days=7)
posts = await provider.fetch_user_posts(
    account_id='5c3e9eb90000000006019f23',
    since=since,
    limit=20
)

for post in posts:
    print(f"标题: {post['content'][:50]}...")
    print(f"类型: {post['media_type']}")
    print(f"点赞: {post['likes']}")
    print(f"链接: {post['url']}")
    print()
```

### 4. 验证账号

```python
is_valid = await provider.validate_account('5c3e9eb90000000006019f23')
print(f"账号有效: {is_valid}")
```

### 5. 通过注册表使用

```python
from providers import InfluencerProviderRegistry

# 获取 Provider 类
ProviderClass = InfluencerProviderRegistry.get_provider('xiaohongshu', 'api')

# 实例化
provider = ProviderClass(config)
```

## 数据结构

### 用户信息返回格式

```python
{
    'name': str,              # 用户昵称
    'avatar_url': str,        # 头像 URL
    'description': str,       # 个人简介
    'verified': bool,         # 是否认证
    'followers_count': int,   # 粉丝数量
    'profile_url': str        # 用户主页链接
}
```

### 笔记返回格式

```python
{
    'content': str,           # 笔记内容（标题+正文）
    'url': str,               # 笔记链接
    'publish_time': datetime, # 发布时间
    'media_type': str,        # 媒体类型: 'video' | 'image' | 'text'
    'media_urls': List[str],  # 媒体 URL 列表
    'likes': int,             # 点赞数
    'comments': int,          # 评论数（列表 API 不可用）
    'shares': int,            # 分享数（列表 API 不可用）
    'extra_data': {           # 平台特定数据
        'noteType': str,      # 笔记类型: 'video' | 'normal'
        'tags': str,          # 标签 JSON 数组
        'collects': int,      # 收藏数
        'hasGoodsLink': bool, # 是否有商品链接
        'topicIds': str       # 话题 ID JSON 数组
    }
}
```

## 数据库集成

笔记的平台特定数据会保存到 `XiaohongshuPostExtra` 表：

```prisma
model XiaohongshuPostExtra {
  id            String   @id @default(cuid())
  postId        String   @unique
  noteType      String   // 'image' | 'video'
  tags          String   // JSON array
  collects      Int      @default(0)
  hasGoodsLink  Boolean  @default(false)
  topicIds      String?  // JSON array

  post          InfluencerPost @relation(...)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## 限流策略

- **请求频率**: 1 请求/2秒 (0.5 req/s)
- **令牌桶容量**: 2
- **实现方式**: 使用 `core.RateLimiter`

```python
# 自动限流
await self.rate_limiter.acquire()  # 在每次请求前调用
```

## Cookie 认证

小红书 API 需要 Cookie 认证。获取方式：

1. 在浏览器中登录小红书网页版
2. 打开开发者工具 (F12) -> Network 标签
3. 刷新页面，找到任意请求
4. 复制 Request Headers 中的 Cookie 值
5. 设置到配置中的 `cookie_str`

**必需的 Cookie 字段**：
- `a1`: 用户标识
- `webId`: 设备标识
- `web_session`: 会话令牌

## 错误处理

```python
try:
    user_info = await provider.fetch_user_info(account_id)
    if not user_info:
        print("用户信息获取失败")
except Exception as e:
    logger.error(f"请求失败: {e}")
```

**常见错误**：

- **HTTP 401/403**: Cookie 无效或过期
- **HTTP 429**: 请求过于频繁，触发限流
- **HTTP 404**: 用户不存在
- **code != 0**: API 返回错误码

## 测试

运行测试脚本：

```bash
cd data-service
python3 test_xiaohongshu_provider.py
```

**注意**: 需要在脚本中配置有效的 Cookie 才能测试实际 API 调用。

## 技术细节

### 请求头配置

```python
{
    'User-Agent': 'Mozilla/5.0 (iPhone; ...) Mobile Safari/604.1',  # 移动端 UA
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Origin': 'https://www.xiaohongshu.com',
    'Referer': 'https://www.xiaohongshu.com/',
}
```

### 粉丝数解析

支持多种格式：
- `"10.5万"` -> 105000
- `"1.2w"` -> 12000
- `"5.5K"` -> 5500
- `"1234"` -> 1234

### 笔记类型映射

- `type: "video"` -> `media_type: "video"`
- `type: "normal"` -> `media_type: "image"`
- 其他 -> `media_type: "text"`

## 未来优化

1. **签名参数支持**: 实现 x-s、x-t 签名参数（反爬虫）
2. **笔记详情 API**: 获取更完整的互动数据（评论数、分享数、收藏数）
3. **分页支持**: 支持获取更多历史笔记
4. **代理支持**: 通过代理池提高稳定性
5. **Cookie 池**: 支持多账号轮换

## 注意事项

1. **Cookie 时效**: Cookie 会过期，需定期更新
2. **限流策略**: 遵守平台限流规则，避免封禁
3. **数据合规**: 仅用于合法用途，遵守平台服务条款
4. **反爬虫**: 小红书有较强的反爬虫机制，生产环境需要更完善的策略

## 参考资料

- [小红书开放平台](https://open.xiaohongshu.com/)
- [BaseInfluencerProvider 接口](./base_influencer_provider.py)
- [Core Infrastructure](../core/README.md)
