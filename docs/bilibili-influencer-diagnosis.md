# Bilibili 大V数据采集问题诊断报告

## 问题描述

测试账号：**二狗学长好**
- UID: `72844725`
- 主页: https://space.bilibili.com/72844725

## 测试结果

### 1. API 调用测试
- ❌ 用户信息获取：失败（错误码 -401：非法访问）
- ❌ 动态数据获取：失败（HTTP 412：反爬虫拦截）

### 2. 数据库操作
- ✅ 成功创建大V记录：`inf_bilibili_72844725`
- ✅ 数据库表结构正常

### 3. 采集服务
- ⚠️ 服务运行正常，但因 API 限制未获取到数据
- 采集耗时：6.31s（包含3次重试）
- 获取数量：0 条

## 问题根因

Bilibili 采用了严格的反爬虫机制：

1. **请求频率限制** (-799)：请求过于频繁
2. **反爬虫验证** (412)：需要特定的请求头和 Cookie
3. **非法访问** (-401)：缺少必要的认证信息

## 当前实现状态

### 已完成
✅ Bilibili Provider 基础框架
✅ 重试机制（3次重试，延迟递增）
✅ 完整的请求头配置
✅ 数据库模型和采集服务
✅ 错误处理和日志记录

### 存在问题
❌ 无法绕过 Bilibili 反爬虫机制
❌ 缺少 Cookie 认证
❌ 无代理IP支持

## 解决方案

### 方案 1: Cookie 认证（推荐）

需要配置已登录的 Bilibili Cookie：

```python
# 在 providerConfig 中添加
{
    "cookies": {
        "SESSDATA": "your_sessdata",
        "bili_jct": "your_bili_jct",
        "DedeUserID": "your_dedeuserid"
    }
}
```

**获取方式：**
1. 浏览器登录 Bilibili
2. 打开开发者工具 -> Application -> Cookies
3. 复制上述三个关键 Cookie 值

**实现步骤：**
```python
# 修改 bilibili_provider.py
def _get_headers(self, referer: str) -> Dict[str, str]:
    headers = {...}
    
    # 添加 Cookie
    if self.cookies:
        cookie_str = "; ".join([f"{k}={v}" for k, v in self.cookies.items()])
        headers['Cookie'] = cookie_str
    
    return headers
```

### 方案 2: 代理IP池

配置轮换的代理IP：

```python
{
    "proxy": {
        "enabled": true,
        "pool": [
            "http://proxy1:port",
            "http://proxy2:port"
        ]
    }
}
```

### 方案 3: 降低采集频率

- 当前：60分钟/次
- 建议：180-360分钟/次（3-6小时）
- 添加随机延迟：2-5秒

### 方案 4: 使用第三方API服务（备选）

考虑使用商业化的 Bilibili 数据API服务（需付费）。

## 代码修复

### 1. 添加 Cookie 支持

已修改文件：`data-service/providers/bilibili_provider.py`

**主要改进：**
- ✅ 添加重试机制（3次，延迟递增）
- ✅ 完善请求头
- ✅ 超时控制（10秒）
- ✅ 详细的错误日志
- ⚠️ Cookie 支持（待配置）

### 2. 数据库记录

已创建测试大V记录：

```sql
INSERT INTO Influencer (
    id: 'inf_bilibili_72844725',
    name: '二狗学长好',
    platform: 'bilibili',
    accountId: '72844725',
    profileUrl: 'https://space.bilibili.com/72844725',
    fetchInterval: 60,
    isActive: 1
)
```

## 验证步骤

### 测试脚本
创建了 `test-bilibili-influencer.py`，包含：
1. API 直接调用测试
2. 数据库操作验证
3. 完整采集服务测试

**运行方式：**
```bash
python3 test-bilibili-influencer.py
```

### 手动验证
```bash
# 1. 检查大V记录
python3 -c "
import sys
sys.path.insert(0, 'data-service')
import asyncio
from db import db

async def check():
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            'SELECT * FROM Influencer WHERE accountId = ?',
            ('72844725',)
        )
        row = await cursor.fetchone()
        print(dict(row) if row else 'Not found')

asyncio.run(check())
"

# 2. 触发采集
curl -X POST http://localhost:8000/api/influencers/inf_bilibili_72844725/fetch

# 3. 查看采集日志
python3 -c "
import sys
sys.path.insert(0, 'data-service')
import asyncio
from db import db

async def check():
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            'SELECT * FROM InfluencerFetchLog ORDER BY createdAt DESC LIMIT 5'
        )
        rows = await cursor.fetchall()
        for row in rows:
            print(dict(row))

asyncio.run(check())
"
```

## 下一步行动

### 立即可做
1. ✅ 创建大V数据库记录（已完成）
2. ✅ 完善错误处理和重试机制（已完成）
3. ⏳ 配置 Bilibili Cookie（待用户提供）

### 需要配置
1. 获取 Bilibili Cookie（SESSDATA, bili_jct, DedeUserID）
2. 配置到 `providerConfig` 中
3. 调整采集频率为 3-6 小时

### 可选增强
1. 实现代理IP池轮换
2. 添加请求频率限制器
3. 集成第三方 Bilibili API 服务

## 总结

**问题状态：** 🟡 部分解决

- ✅ 代码框架完整，功能正常
- ✅ 错误处理健壮
- ❌ 受 Bilibili 反爬虫限制，需要 Cookie 认证

**推荐方案：** 配置 Bilibili Cookie（方案1）

**预期效果：** 配置 Cookie 后，可以正常获取用户信息和动态数据

**风险提示：** Cookie 有过期时间，需要定期更新（通常7-30天）

## 相关文件

- Provider: `data-service/providers/bilibili_provider.py`
- 服务: `data-service/services/influencer_fetch_service.py`
- 路由: `data-service/routers/influencers.py`
- 测试: `test-bilibili-influencer.py`
- 数据库: `prisma/dev.db` (Influencer 表)

---

**报告时间:** 2026-07-26
**测试账号:** 二狗学长好 (UID: 72844725)
**状态:** 待配置 Cookie
