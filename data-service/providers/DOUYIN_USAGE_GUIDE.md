# 抖音 Provider 使用指南

## 快速开始

### 1. 基本使用

```python
import asyncio
from providers import InfluencerProviderRegistry

async def main():
    # 获取 Provider 类
    DouyinProvider = InfluencerProviderRegistry.get_provider('douyin', 'crawler')
    
    # 配置
    config = {
        'platform': 'douyin',
        'driver_type': 'crawler',
        'timeout': 10,
        'max_retries': 2,
    }
    
    # 创建实例
    provider = DouyinProvider(config)
    
    try:
        # 验证账号
        account_id = "MS4wLjABAAAA_your_sec_uid"
        is_valid = await provider.validate_account(account_id)
        print(f"Account valid: {is_valid}")
        
        if is_valid:
            # 获取用户信息
            user_info = await provider.fetch_user_info(account_id)
            print(f"User: {user_info['name']}")
            print(f"Followers: {user_info.get('followers_count', 0)}")
            
            # 获取视频列表
            posts = await provider.fetch_user_posts(account_id, limit=10)
            print(f"Fetched {len(posts)} videos")
            
            for post in posts:
                print(f"- {post['content'][:50]}...")
                print(f"  Likes: {post['likes']}, Comments: {post['comments']}")
                
                # 抖音特有数据
                if 'douyin_extra' in post:
                    extra = post['douyin_extra']
                    print(f"  Duration: {extra['video_duration']}s")
                    print(f"  Music: {extra['music_title']}")
    
    finally:
        await provider.close()

asyncio.run(main())
```

### 2. 直接导入使用

```python
from providers.douyin_provider import DouyinCrawlerProvider

async def main():
    config = {
        'platform': 'douyin',
        'driver_type': 'crawler',
    }
    
    provider = DouyinCrawlerProvider(config)
    
    try:
        # Your code here
        pass
    finally:
        await provider.close()
```

## API 参考

### fetch_user_info(account_id: str) -> Dict

获取用户信息。

**参数:**
- `account_id`: 抖音用户的 sec_uid（例如：`MS4wLjABAAAA...`）

**返回值:**
```python
{
    'name': str,              # 用户昵称
    'avatar_url': str,        # 头像 URL
    'description': str,       # 个人简介
    'verified': bool,         # 是否认证
    'followers_count': int,   # 粉丝数
    'profile_url': str        # 主页链接
}
```

### fetch_user_posts(account_id: str, since: Optional[datetime] = None, limit: int = 20) -> List[Dict]

获取用户视频列表。

**参数:**
- `account_id`: 抖音用户的 sec_uid
- `since`: 仅获取此时间之后的视频（可选）
- `limit`: 最大获取数量（默认20，单次最多35）

**返回值:**
```python
[
    {
        'content': str,              # 视频描述
        'url': str,                  # 视频链接
        'publish_time': datetime,    # 发布时间
        'media_type': 'video',       # 媒体类型
        'media_urls': [str],         # 媒体 URL 列表
        'likes': int,                # 点赞数
        'comments': int,             # 评论数
        'shares': int,               # 分享数
        
        # 抖音特有数据
        'douyin_extra': {
            'video_duration': int,     # 视频时长（秒）
            'music_id': str,           # 音乐 ID
            'music_title': str,        # 音乐标题
            'music_author': str,       # 音乐作者
            'challenge_tags': str,     # 挑战标签（JSON数组）
            'is_ad': bool              # 是否为广告
        }
    }
]
```

### validate_account(account_id: str) -> bool

验证账号是否存在。

**参数:**
- `account_id`: 抖音用户的 sec_uid

**返回值:**
- `True`: 账号存在且可访问
- `False`: 账号不存在或无法访问

## 配置选项

```python
config = {
    'platform': 'douyin',        # 必需: 平台名称
    'driver_type': 'crawler',    # 必需: 驱动类型
    'timeout': 10,               # 可选: 请求超时（秒），默认10
    'max_retries': 2,            # 可选: 最大重试次数，默认2
}
```

## 获取 sec_uid

抖音使用 `sec_uid` 作为用户唯一标识。获取方法：

1. **从主页 URL 提取**
   - 主页格式: `https://www.douyin.com/user/MS4wLjABAAAA...`
   - `sec_uid` 就是 `/user/` 后面的部分

2. **从分享链接获取**
   - 打开抖音 APP，分享用户主页
   - 在浏览器中打开分享链接
   - 重定向后的 URL 中包含 `sec_uid` 参数

## 限流说明

抖音 Provider 使用保守的限流策略：
- **频率**: 1 请求 / 4 秒（0.25 req/s）
- **容量**: 5 个令牌

这是为了避免触发抖音的反爬限制。如果需要调整，可以通过 core 模块的 RateLimiter 配置。

## 错误处理

```python
try:
    user_info = await provider.fetch_user_info(account_id)
    
    if not user_info:
        print("Failed to fetch user info (API error or account not found)")
    else:
        print(f"User: {user_info['name']}")
        
except Exception as e:
    print(f"Error: {e}")
```

常见错误：
- **空返回 `{}`**: API 请求失败或账号不存在
- **限流**: 请求过于频繁，等待后重试
- **超时**: 网络问题或 API 响应慢

## 注意事项

### 1. 反爬限制
抖音有严格的反爬机制，当前实现为基础版本：
- 未实现 X-Bogus 签名（可能导致部分请求失败）
- 未实现设备指纹（device_id、iid）
- 建议使用真实的 Cookie（如果有）

### 2. 数据时效性
- 单次最多获取 35 条视频
- API 可能有缓存，数据更新有延迟
- since 参数过滤在客户端进行

### 3. 生产环境建议
- 使用代理池避免 IP 封禁
- 添加重试和降级策略
- 监控 API 成功率
- 考虑实现 X-Bogus 签名以提高成功率

## 集成到数据服务

在 `influencer_fetch_service.py` 中使用：

```python
from providers import InfluencerProviderRegistry

async def fetch_influencer_posts(influencer):
    """获取 KOL 的最新动态"""
    
    # 获取 Provider
    provider_class = InfluencerProviderRegistry.get_provider(
        platform=influencer.platform,
        driver_type=influencer.driverType
    )
    
    config = {
        'platform': influencer.platform,
        'driver_type': influencer.driverType,
        # 其他配置...
    }
    
    provider = provider_class(config)
    
    try:
        # 获取动态
        posts = await provider.fetch_user_posts(
            account_id=influencer.accountId,
            since=influencer.lastFetchAt,
            limit=20
        )
        
        # 处理动态数据
        for post in posts:
            # 保存到数据库
            save_post(post, influencer)
            
            # 如果是抖音，保存扩展数据
            if influencer.platform == 'douyin' and 'douyin_extra' in post:
                save_douyin_extra(post['douyin_extra'])
    
    finally:
        await provider.close()
```

## 测试

运行内置测试：

```bash
cd data-service
python3 providers/douyin_provider.py
```

注意：需要替换测试代码中的 `test_account` 为真实的 sec_uid。

## 更多信息

- [实现总结](./DOUYIN_PROVIDER_IMPLEMENTATION.md)
- [Core 基础设施文档](../core/README.md)
- [Provider 基类说明](./base_influencer_provider.py)
