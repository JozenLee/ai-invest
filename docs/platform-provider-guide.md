# 平台 Provider 配置与使用指南

## 📖 概述

本指南详细说明如何配置和使用各个平台的数据采集 Provider，包括认证配置、限流参数、常见问题排查和 API 端点说明。

---

## 🔐 认证配置

### 1. 知乎 (Zhihu)

#### Cookie 获取方式

1. **浏览器登录知乎**
   - 访问 https://www.zhihu.com/
   - 登录你的账号

2. **获取 Cookie**
   - 打开浏览器开发者工具（F12）
   - 切换到 Network 标签
   - 刷新页面
   - 点击任意请求，查看 Request Headers
   - 复制 Cookie 字段的完整值

3. **关键 Cookie 字段**
   ```
   z_c0=2|1:0|10:1627891200|5:z_c0|92:xxxxx...
   _zap=xxxxx...
   d_c0=xxxxx...
   ```

#### 配置示例

**数据库配置**（PlatformConfig 表）:
```json
{
  "platform": "zhihu",
  "enabled": true,
  "config": {
    "cookie_str": "z_c0=...; _zap=...; d_c0=...",
    "timeout": 10,
    "max_retries": 3,
    "retry_delay": 2
  },
  "rate_limit": {
    "rate": 0.33,
    "capacity": 10
  }
}
```

**Python 代码配置**:
```python
from providers.zhihu_provider import ZhihuAPIProvider

config = {
    'cookie_str': 'z_c0=...; _zap=...; d_c0=...',
    'timeout': 10,
    'max_retries': 3
}

provider = ZhihuAPIProvider(config)
user_info = await provider.fetch_user_info('excited-vczh')
```

#### 限流参数建议

| 环境 | rate (req/s) | capacity | 说明 |
|------|-------------|----------|------|
| 开发 | 0.33 (1/3s) | 5 | 保守配置，避免触发限流 |
| 生产 | 0.25 (1/4s) | 10 | 推荐配置 |
| 测试 | 0.5 (1/2s) | 3 | 快速测试，可能触发 -799 |

#### 常见错误

**错误码 -799: 请求过于频繁**
```json
{"error": {"code": -799, "message": "请求过于频繁"}}
```
**解决方案**:
- 降低 `rate` 值（如从 0.5 改为 0.33）
- 增加 `retry_delay`（如从 2s 改为 3s）
- 检查是否有其他进程在同时请求

**Cookie 失效**
```json
{"error": {"code": 100, "message": "未登录"}}
```
**解决方案**:
- 重新登录知乎获取新 Cookie
- 检查 Cookie 是否完整（特别是 `z_c0` 字段）
- Cookie 有效期通常为 30-90 天

---

### 2. 微博 (Weibo)

#### Cookie 获取方式

1. **浏览器登录微博**
   - 访问 https://weibo.com/
   - 登录你的账号

2. **获取 Cookie**
   - F12 开发者工具 → Network
   - 访问任意用户主页
   - 查看 Request Headers 中的 Cookie

3. **关键 Cookie 字段**
   ```
   SUB=xxxxx...
   SUBP=xxxxx...
   ```

#### 配置示例

```json
{
  "platform": "weibo",
  "enabled": true,
  "config": {
    "cookie_str": "SUB=...; SUBP=...",
    "timeout": 10,
    "max_retries": 3
  },
  "rate_limit": {
    "rate": 0.5,
    "capacity": 15
  }
}
```

#### 限流参数建议

| 环境 | rate (req/s) | capacity | 说明 |
|------|-------------|----------|------|
| 开发 | 0.5 (1/2s) | 10 | 标准配置 |
| 生产 | 0.4 (1/2.5s) | 15 | 推荐配置 |

#### API 端点

| 功能 | 端点 | 参数 |
|------|------|------|
| 用户信息 | `/ajax/profile/info` | `uid` |
| 微博列表 | `/ajax/statuses/mymblog` | `uid`, `page`, `feature=0` |
| 长文本 | `/ajax/statuses/longtext` | `id` |

---

### 3. Bilibili

#### Cookie 获取方式（可选）

Bilibili API 部分接口无需认证，但提供 Cookie 可提高限额。

1. **登录 B站**
   - 访问 https://www.bilibili.com/
   - 登录账号

2. **获取 Cookie**
   - F12 → Network → 任意请求
   - 复制 Cookie（特别是 `SESSDATA`）

3. **关键 Cookie 字段**
   ```
   SESSDATA=xxxxx...
   bili_jct=xxxxx...
   DedeUserID=xxxxx
   ```

#### 配置示例

```json
{
  "platform": "bilibili",
  "enabled": true,
  "config": {
    "cookie_str": "SESSDATA=...; bili_jct=...; DedeUserID=...",
    "timeout": 10,
    "max_retries": 3,
    "retry_delay": 2
  },
  "rate_limit": {
    "rate": 1.0,
    "capacity": 10
  }
}
```

#### 限流参数建议

| 环境 | rate (req/s) | capacity | 说明 |
|------|-------------|----------|------|
| 无 Cookie | 0.5 (1/2s) | 5 | 较严格 |
| 有 Cookie | 1.0 (1/1s) | 10 | 推荐配置 |
| 高频采集 | 0.8 (1/1.25s) | 15 | 避免 -799 |

#### 常见错误

**错误码 -799: 请求过快**
```json
{"code": -799, "message": "请求过快，请稍后再试"}
```
**解决方案**:
- 实现了自动重试（指数退避）
- 降低 `rate` 值
- 增加请求间延迟（`base_delay=1.5s`）

**用户不存在**
```json
{"code": -404, "message": "啥都木有"}
```
**解决方案**:
- 检查 `mid`（用户ID）是否正确
- 部分隐私账号无法访问

#### API 端点

| 功能 | 端点 | 参数 |
|------|------|------|
| 用户信息 | `/x/space/acc/info` | `mid` |
| 视频列表 | `/x/space/arc/search` | `mid`, `ps`, `pn` |
| 视频详情 | `/x/web-interface/view` | `bvid` 或 `aid` |

---

### 4. 抖音 (Douyin)

#### Cookie 获取方式

抖音反爬严格，必须提供有效 Cookie。

1. **手机浏览器登录**
   - 访问 https://www.douyin.com/
   - 使用手机号登录

2. **获取 Cookie**
   - 方式 1: 浏览器开发者工具
   - 方式 2: 使用 Chrome 扩展（如 EditThisCookie）

3. **关键 Cookie 字段**
   ```
   ttwid=xxxxx...
   s_v_web_id=xxxxx...
   __ac_nonce=xxxxx...
   ```

#### 配置示例

```json
{
  "platform": "douyin",
  "enabled": true,
  "config": {
    "cookie_str": "ttwid=...; s_v_web_id=...; __ac_nonce=...",
    "timeout": 15,
    "max_retries": 3
  },
  "rate_limit": {
    "rate": 0.5,
    "capacity": 10
  }
}
```

#### 限流参数建议

| 环境 | rate (req/s) | capacity | 说明 |
|------|-------------|----------|------|
| 开发 | 0.5 (1/2s) | 5 | 保守配置 |
| 生产 | 0.4 (1/2.5s) | 10 | 推荐配置 |

#### 常见问题

**Cookie 快速失效**
- 抖音 Cookie 有效期较短（1-7天）
- 建议配置自动刷新机制
- 考虑使用浏览器自动化（Playwright）

---

### 5. 小红书 (Xiaohongshu)

#### Cookie 获取方式

小红书反爬最严格，需要 Cookie + 签名头。

1. **登录小红书**
   - 访问 https://www.xiaohongshu.com/
   - 登录账号

2. **获取 Cookie + 签名头**
   - F12 → Network
   - 访问任意笔记
   - 查看请求头中的 `x-s` 和 `x-t`

3. **关键字段**
   ```
   Cookie: web_session=xxxxx...
   x-s: xxxxx...  (动态签名，需实时生成)
   x-t: 1627891200  (时间戳)
   ```

#### 配置示例

```json
{
  "platform": "xiaohongshu",
  "enabled": true,
  "config": {
    "cookie_str": "web_session=...; xhsuid=...",
    "timeout": 15,
    "max_retries": 2
  },
  "rate_limit": {
    "rate": 0.33,
    "capacity": 5
  }
}
```

#### 限流参数建议

| 环境 | rate (req/s) | capacity | 说明 |
|------|-------------|----------|------|
| 开发 | 0.33 (1/3s) | 3 | 极保守 |
| 生产 | 0.25 (1/4s) | 5 | 推荐配置 |

#### 重要提示

⚠️ **小红书签名机制**:
- `x-s` 签名动态生成，需要逆向或使用第三方库
- 当前实现为基础版本，可能需要进一步优化
- 建议使用浏览器自动化方案

---

### 6. 支付宝生活号 (Alipay)

#### Cookie 获取方式

1. **登录支付宝**
   - 访问 https://www.alipay.com/
   - 登录账号

2. **访问生活号页面**
   - 进入任意生活号主页
   - F12 → Network → 查看 Cookie

3. **关键 Cookie 字段**
   ```
   ctoken=xxxxx...
   ALIPAYJSESSIONID=xxxxx...
   ```

#### 配置示例

```json
{
  "platform": "alipay",
  "enabled": true,
  "config": {
    "cookie_str": "ctoken=...; ALIPAYJSESSIONID=...",
    "timeout": 10,
    "max_retries": 3
  },
  "rate_limit": {
    "rate": 0.5,
    "capacity": 10
  }
}
```

#### 限流参数建议

| 环境 | rate (req/s) | capacity | 说明 |
|------|-------------|----------|------|
| 开发 | 0.5 (1/2s) | 10 | 标准配置 |
| 生产 | 0.4 (1/2.5s) | 15 | 推荐配置 |

---

### 7. NewsNow（无需认证）

NewsNow 是开源新闻聚合 API，无需认证。

#### 配置示例

```json
{
  "platform": "newsnow",
  "enabled": true,
  "config": {
    "timeout": 10
  },
  "rate_limit": {
    "rate": 2.0,
    "capacity": 20
  }
}
```

#### 支持的平台

| 平台 ID | 名称 | 说明 |
|---------|------|------|
| `wallstreetcn-hot` | 华尔街见闻 | 专业财经媒体 |
| `cls-hot` | 财联社 | 7x24 快讯 |
| `thepaper` | 澎湃财经 | 宏观经济新闻 |
| `36kr` | 36氪 | 科技创投资讯 |
| `jinse` | 金色财经 | 区块链/加密货币 |

#### 使用示例

```python
from providers.newsnow_provider import NewsNowProvider

provider = NewsNowProvider(timeout=10)
df = await provider.get_news(keyword='cls-hot', limit=50)

print(df[['新闻标题', '发布时间', '来源']])
```

---

## 🔍 常见问题排查

### 问题 1: Cookie 失效

**症状**:
- 返回 401 Unauthorized
- 返回空数据
- 错误提示"未登录"

**排查步骤**:
1. 检查 Cookie 是否完整
2. 在浏览器中验证 Cookie 是否有效
3. 查看 Cookie 过期时间
4. 重新登录获取新 Cookie

**预防措施**:
- 定期刷新 Cookie（建议 7-30 天）
- 监控 401 错误，自动告警
- 配置 Cookie 池轮换

---

### 问题 2: 触发限流（429/403）

**症状**:
- HTTP 429 Too Many Requests
- HTTP 403 Forbidden
- 知乎返回 -799
- Bilibili 返回 -799

**排查步骤**:
1. 检查 `rate` 配置是否过高
2. 查看限流器状态: `limiter.get_status()`
3. 检查是否有多个进程同时请求
4. 查看日志中的请求频率

**解决方案**:
```python
# 降低速率
rate_limit = {
    "rate": 0.25,  # 从 0.5 降低到 0.25
    "capacity": 5   # 从 10 降低到 5
}

# 增加重试延迟
config = {
    "retry_delay": 3,  # 从 2s 增加到 3s
    "max_retries": 5   # 增加重试次数
}
```

---

### 问题 3: 数据为空

**症状**:
- API 请求成功（200 OK）
- 但返回数据为空或字段缺失

**排查步骤**:
1. 检查 `account_id` 是否正确
2. 验证用户是否设置隐私保护
3. 查看 API 响应原始数据
4. 检查解析逻辑是否正确

**调试方法**:
```python
# 启用详细日志
import logging
logging.basicConfig(level=logging.DEBUG)

# 查看原始响应
result = await provider.fetch_user_info(account_id)
print(json.dumps(result, indent=2, ensure_ascii=False))
```

---

### 问题 4: 请求超时

**症状**:
- `asyncio.TimeoutError`
- 请求耗时过长

**排查步骤**:
1. 检查网络连接
2. 检查目标平台是否可访问
3. 查看 `timeout` 配置

**解决方案**:
```python
config = {
    "timeout": 15,  # 从 10s 增加到 15s
    "max_retries": 3
}
```

**考虑使用代理**:
```python
# BaseHTTPClient 支持代理配置
async with BaseHTTPClient(
    base_url="...",
    proxy="http://proxy.example.com:8080"
) as client:
    ...
```

---

### 问题 5: 解析错误

**症状**:
- `KeyError`
- `AttributeError`
- 数据格式不符合预期

**原因**:
- 平台 API 返回格式变更
- 部分字段缺失
- 新增反爬机制

**解决方案**:
1. 捕获异常并记录原始数据
2. 添加字段存在性检查
3. 使用 `dict.get()` 替代 `dict['key']`
4. 更新解析逻辑

```python
# 安全解析示例
name = data.get('name', '未知')
avatar = data.get('avatar_url') or data.get('face') or ''
followers = int(data.get('follower_count', 0))
```

---

## 📊 监控和日志

### 推荐监控指标

1. **API 成功率**
   - 每个平台的成功请求百分比
   - 按错误类型分组统计

2. **限流触发次数**
   - 429/403 错误计数
   - 平台级别的限流频率

3. **响应时间**
   - P50、P95、P99 延迟
   - 超时请求百分比

4. **Cookie 有效性**
   - 401 错误次数
   - 上次刷新时间

### 日志配置

```python
import logging

# 配置日志格式
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler('data-service.log'),
        logging.StreamHandler()
    ]
)

# 启用详细日志（开发环境）
logging.getLogger('core').setLevel(logging.DEBUG)
logging.getLogger('providers').setLevel(logging.DEBUG)
```

---

## 🛠️ 高级配置

### 代理池配置

```python
from core import BaseHTTPClient

# 配置代理池
PROXY_POOL = [
    "http://proxy1.example.com:8080",
    "http://proxy2.example.com:8080",
    "http://proxy3.example.com:8080",
]

import random

async with BaseHTTPClient(
    base_url="...",
    proxy=random.choice(PROXY_POOL)
) as client:
    result = await client.get("/api/endpoint")
```

### 自定义重试策略

```python
from core import BaseHTTPClient

# 自定义重试延迟
async with BaseHTTPClient(
    max_retries=5,
    retry_delay=2.0  # 基础延迟 2s，指数退避: 2s → 4s → 8s → 16s → 32s
) as client:
    result = await client.get("/api/endpoint")
```

### Cookie 自动刷新

```python
from providers.zhihu_provider import ZhihuAPIProvider
from datetime import datetime, timedelta

class ZhihuProviderWithAutoRefresh(ZhihuAPIProvider):
    def __init__(self, config):
        super().__init__(config)
        self.cookie_expires = datetime.now() + timedelta(days=30)
    
    async def ensure_cookie_valid(self):
        if datetime.now() >= self.cookie_expires:
            # 触发 Cookie 刷新逻辑
            await self.refresh_cookie()
            self.cookie_expires = datetime.now() + timedelta(days=30)
```

---

## 📝 配置模板

### 完整配置模板（JSON）

```json
{
  "platforms": [
    {
      "platform": "zhihu",
      "enabled": true,
      "config": {
        "cookie_str": "z_c0=...; _zap=...; d_c0=...",
        "timeout": 10,
        "max_retries": 3,
        "retry_delay": 2
      },
      "rate_limit": {
        "rate": 0.33,
        "capacity": 10
      }
    },
    {
      "platform": "weibo",
      "enabled": true,
      "config": {
        "cookie_str": "SUB=...; SUBP=...",
        "timeout": 10,
        "max_retries": 3
      },
      "rate_limit": {
        "rate": 0.5,
        "capacity": 15
      }
    },
    {
      "platform": "bilibili",
      "enabled": true,
      "config": {
        "cookie_str": "SESSDATA=...; bili_jct=...",
        "timeout": 10,
        "max_retries": 3,
        "retry_delay": 2
      },
      "rate_limit": {
        "rate": 1.0,
        "capacity": 10
      }
    }
  ]
}
```

### 数据库迁移 SQL

```sql
-- PlatformConfig 表结构
CREATE TABLE IF NOT EXISTS PlatformConfig (
  id TEXT PRIMARY KEY,
  platform TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  config TEXT NOT NULL,  -- JSON 格式
  rate_limit TEXT,       -- JSON 格式: {"rate": 0.5, "capacity": 10}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入知乎配置
INSERT INTO PlatformConfig (id, platform, enabled, config, rate_limit)
VALUES (
  'zhihu_config',
  'zhihu',
  TRUE,
  '{"cookie_str": "...", "timeout": 10, "max_retries": 3}',
  '{"rate": 0.33, "capacity": 10}'
);
```

---

## 🔗 相关资源

- **基础设施使用手册**: `data-service/core/USAGE.md`
- **数据源说明**: `docs/DATA-SOURCE.md`
- **NewsNow 开源项目**: https://github.com/ourongxing/newsnow

---

**文档版本**: v1.0  
**更新日期**: 2026-07-28  
**维护者**: AI Invest Team
