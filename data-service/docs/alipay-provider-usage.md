# Alipay Provider 使用指南

## 快速开始

### 1. 导入 Provider

```python
from providers.alipay_provider import AlipayAPIProvider
```

### 2. 初始化

```python
config = {
    'platform': 'alipay',
    'driver_type': 'api',
    'timeout': 15,
    'max_retries': 3,
    'retry_delay': 2,
}

provider = AlipayAPIProvider(config)
```

### 3. 获取生活号信息

```python
# 验证账号
is_valid = await provider.validate_account('2088123456789012')

# 获取详细信息
user_info = await provider.fetch_user_info('2088123456789012')
print(f"生活号名称: {user_info['name']}")
print(f"认证状态: {user_info['verified']}")
print(f"粉丝数: {user_info['followers_count']}")
```

### 4. 获取文章列表

```python
from datetime import datetime, timedelta

# 获取最近7天的文章
since = datetime.now() - timedelta(days=7)
posts = await provider.fetch_user_posts(
    account_id='2088123456789012',
    since=since,
    limit=20
)

for post in posts:
    print(f"标题: {post['content'][:50]}")
    print(f"类型: {post['extra']['articleType']}")
    print(f"点赞: {post['likes']}")
    print("---")
```

### 5. 关闭连接

```python
await provider.close()
```

## 通过 Registry 使用

### 1. 从注册表获取

```python
from providers import InfluencerProviderRegistry

# 获取 Provider 类
AlipayProvider = InfluencerProviderRegistry.get_provider('alipay_api')

# 创建实例
provider = AlipayProvider(config)
```

### 2. 统一接口调用

```python
# 所有 Provider 都实现相同接口
async def fetch_influencer_data(provider, account_id):
    """通用的获取 KOL 数据函数"""
    
    # 验证账号
    if not await provider.validate_account(account_id):
        return None
    
    # 获取信息
    user_info = await provider.fetch_user_info(account_id)
    posts = await provider.fetch_user_posts(account_id, limit=10)
    
    return {
        'user_info': user_info,
        'posts': posts
    }

# 适用于所有平台
data = await fetch_influencer_data(provider, '2088123456789012')
```

## 数据结构

### UserInfo 结构

```python
{
    'name': str,              # 生活号名称
    'avatar_url': str,        # 头像URL
    'description': str,       # 简介
    'verified': bool,         # 是否认证
    'followers_count': int,   # 粉丝数
    'profile_url': str        # 主页URL
}
```

### Post 结构

```python
{
    'content': str,           # 文章内容（标题+摘要）
    'url': str,               # 文章链接
    'publish_time': datetime, # 发布时间
    'media_type': str,        # 'text' | 'image' | 'video'
    'media_urls': list,       # 媒体URL列表
    'likes': int,             # 点赞数
    'comments': int,          # 评论数
    'shares': int,            # 分享数
    'extra': {                # 支付宝特有字段
        'articleType': str,   # 'news' | 'service' | 'promotion'
        'category': str,      # 分类标签
        'serviceId': str,     # 服务ID（可选）
        'hasService': bool,   # 是否关联服务
        'viewCount': int      # 浏览量
    }
}
```

## 完整示例

### 示例 1: 获取特定类型的文章

```python
async def get_service_articles(account_id):
    """获取所有服务类文章"""
    provider = AlipayAPIProvider(config)
    
    posts = await provider.fetch_user_posts(account_id, limit=50)
    
    # 筛选服务类文章
    service_posts = [
        post for post in posts
        if post['extra']['articleType'] == 'service'
    ]
    
    await provider.close()
    return service_posts

articles = await get_service_articles('2088123456789012')
```

### 示例 2: 批量获取多个生活号

```python
async def fetch_multiple_accounts(account_ids):
    """批量获取多个生活号的数据"""
    provider = AlipayAPIProvider(config)
    results = {}
    
    for account_id in account_ids:
        try:
            user_info = await provider.fetch_user_info(account_id)
            posts = await provider.fetch_user_posts(account_id, limit=10)
            
            results[account_id] = {
                'user_info': user_info,
                'posts': posts,
                'status': 'success'
            }
        except Exception as e:
            results[account_id] = {
                'status': 'error',
                'error': str(e)
            }
    
    await provider.close()
    return results

accounts = ['2088001', '2088002', '2088003']
data = await fetch_multiple_accounts(accounts)
```

### 示例 3: 统计分析

```python
async def analyze_account(account_id):
    """分析生活号的内容和互动数据"""
    provider = AlipayAPIProvider(config)
    
    posts = await provider.fetch_user_posts(account_id, limit=100)
    
    # 统计分析
    total_posts = len(posts)
    total_likes = sum(p['likes'] for p in posts)
    total_comments = sum(p['comments'] for p in posts)
    
    # 按类型分组
    type_counts = {}
    for post in posts:
        article_type = post['extra']['articleType']
        type_counts[article_type] = type_counts.get(article_type, 0) + 1
    
    await provider.close()
    
    return {
        'total_posts': total_posts,
        'avg_likes': total_likes / total_posts if total_posts > 0 else 0,
        'avg_comments': total_comments / total_posts if total_posts > 0 else 0,
        'type_distribution': type_counts
    }

stats = await analyze_account('2088123456789012')
print(f"总文章数: {stats['total_posts']}")
print(f"平均点赞: {stats['avg_likes']:.1f}")
print(f"类型分布: {stats['type_distribution']}")
```

## 错误处理

### 常见错误及处理

```python
from providers.alipay_provider import AlipayAPIProvider

provider = AlipayAPIProvider(config)

try:
    user_info = await provider.fetch_user_info(account_id)
    
    if not user_info:
        print("账号不存在或无法访问")
    else:
        print(f"成功获取: {user_info['name']}")
        
except asyncio.TimeoutError:
    print("请求超时，请检查网络连接")
    
except Exception as e:
    print(f"发生错误: {e}")
    
finally:
    await provider.close()
```

### 重试逻辑

```python
async def fetch_with_retry(provider, account_id, max_retries=3):
    """带重试的获取函数"""
    for attempt in range(max_retries):
        try:
            return await provider.fetch_user_info(account_id)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"尝试 {attempt + 1} 失败，重试...")
            await asyncio.sleep(2 ** attempt)  # 指数退避
```

## 性能优化

### 1. 使用连接池

```python
# Provider 内部自动管理 Session
provider = AlipayAPIProvider(config)

# 多次调用复用同一个 provider
for account_id in account_ids:
    await provider.fetch_user_info(account_id)

# 最后关闭
await provider.close()
```

### 2. 并发请求

```python
import asyncio

async def fetch_all_parallel(account_ids):
    """并发获取多个账号（注意限流）"""
    provider = AlipayAPIProvider(config)
    
    tasks = [
        provider.fetch_user_info(account_id)
        for account_id in account_ids
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    await provider.close()
    
    return results

# 注意：限流器会自动控制并发速度
results = await fetch_all_parallel(['2088001', '2088002', '2088003'])
```

### 3. 缓存结果

```python
from functools import lru_cache
import json

class CachedAlipayProvider:
    """带缓存的 Provider 包装器"""
    
    def __init__(self, config):
        self.provider = AlipayAPIProvider(config)
        self._cache = {}
    
    async def fetch_user_info(self, account_id):
        cache_key = f"user:{account_id}"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        result = await self.provider.fetch_user_info(account_id)
        self._cache[cache_key] = result
        return result
    
    async def close(self):
        await self.provider.close()
```

## 最佳实践

### 1. 遵守限流规则

```python
# ✓ 正确：Provider 自动限流
provider = AlipayAPIProvider(config)
for account_id in account_ids:
    await provider.fetch_user_info(account_id)  # 自动等待
```

```python
# ✗ 错误：绕过限流
for account_id in account_ids:
    provider = AlipayAPIProvider(config)  # 每次创建新实例
    await provider.fetch_user_info(account_id)  # 限流失效
```

### 2. 及时关闭连接

```python
# ✓ 正确：使用 try-finally
provider = AlipayAPIProvider(config)
try:
    await provider.fetch_user_info(account_id)
finally:
    await provider.close()
```

```python
# ✓ 更好：使用异步上下文管理器（如果实现）
async with AlipayAPIProvider(config) as provider:
    await provider.fetch_user_info(account_id)
```

### 3. 验证数据有效性

```python
user_info = await provider.fetch_user_info(account_id)

# 检查必要字段
if not user_info or not user_info.get('name'):
    raise ValueError(f"Invalid user info for {account_id}")

# 检查数据合理性
if user_info['followers_count'] < 0:
    logger.warning(f"Invalid follower count: {user_info['followers_count']}")
```

## 调试技巧

### 1. 启用详细日志

```python
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# 现在可以看到详细的请求日志
provider = AlipayAPIProvider(config)
await provider.fetch_user_info(account_id)
```

### 2. 检查限流状态

```python
from core import get_rate_limiter

limiter = await get_rate_limiter('alipay', rate=0.5, capacity=5)
status = limiter.get_status()

print(f"平台: {status['platform']}")
print(f"剩余令牌: {status['tokens']:.2f}/{status['capacity']}")
print(f"使用率: {status['utilization']:.1%}")
```

### 3. 测试不同账号格式

```python
# 测试不同的账号ID格式
test_ids = [
    '2088123456789012',  # 数字ID
    'alipay-service',     # 字符串标识
    'abc123',             # 短ID
]

for account_id in test_ids:
    print(f"\n测试账号: {account_id}")
    is_valid = await provider.validate_account(account_id)
    print(f"结果: {'有效' if is_valid else '无效'}")
```

## 常见问题

### Q: 如何获取生活号ID？

A: 生活号ID通常在生活号主页URL中，例如：
- `https://render.alipay.com/p/s/life-account/2088123456789012`
- ID为 `2088123456789012`

### Q: 为什么返回空数据？

A: 可能的原因：
1. 账号ID格式不正确
2. 生活号不存在或已关闭
3. API接口地址变更
4. 被限流或反爬

### Q: 如何提高数据获取速度？

A: 建议：
1. 使用并发请求（注意限流）
2. 添加缓存机制
3. 只获取必要的数据
4. 考虑使用官方API（如有权限）

### Q: 官方API如何申请？

A: 步骤：
1. 注册企业支付宝账号
2. 完成企业认证
3. 创建应用
4. 签约"生活号"产品
5. 获取 AppID 和密钥

## 相关资源

- [支付宝开放平台](https://open.alipay.com/)
- [生活号API文档](https://opendocs.alipay.com/open/054kxb)
- [RSA签名指南](https://opendocs.alipay.com/open/291/106074)
- [Provider实现报告](./alipay-provider-implementation.md)
