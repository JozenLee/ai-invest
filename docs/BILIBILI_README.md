# Bilibili 大V数据采集功能

## 概述

本功能实现了对 Bilibili 大V（KOL/Influencer）的数据采集，包括用户信息和动态内容的自动抓取。

**测试账号：** 二狗学长好 (UID: 72844725)  
**主页：** https://space.bilibili.com/72844725

## 功能特性

✅ **自动化采集**
- 定时自动采集大V动态
- 可配置采集频率（默认 3 小时）
- 智能去重，避免重复存储

✅ **健壮的错误处理**
- 3次自动重试机制
- 延迟递增策略（2秒 → 4秒 → 6秒）
- 详细的错误日志和分类

✅ **反爬虫应对**
- Cookie 认证支持
- 完善的请求头配置
- 超时控制（10秒）

✅ **数据持久化**
- SQLite 数据库存储
- 采集日志完整记录
- 支持增量更新

## 快速开始

### 方法 1: 使用快速配置脚本（推荐）

```bash
./bilibili-quick-setup.sh
```

脚本会引导你完成：
1. 检查环境和数据库
2. 创建大V记录（如果不存在）
3. 配置 Bilibili Cookie
4. 验证采集功能

### 方法 2: 手动配置

#### 1. 获取 Bilibili Cookie

1. 浏览器访问 https://www.bilibili.com 并登录
2. 按 `F12` 打开开发者工具
3. 选择 **Application** (Chrome) 或 **Storage** (Firefox)
4. 展开 **Cookies** → `https://www.bilibili.com`
5. 复制以下三个 Cookie：
   - `SESSDATA`
   - `bili_jct`
   - `DedeUserID`

#### 2. 配置 Cookie

```bash
# 交互式配置
python3 configure-bilibili-cookie.py

# 或命令行配置
python3 configure-bilibili-cookie.py \
  --sessdata "your_sessdata" \
  --bili-jct "your_bili_jct" \
  --dedeuserid "your_dedeuserid"
```

#### 3. 测试采集

```bash
python3 test-bilibili-influencer.py
```

期望输出：
```
✓ 用户名: 二狗学长好
✓ 粉丝数: XXXXX
✓ 成功获取 N 条动态
```

## API 使用

### 启动数据服务

```bash
cd data-service
python main.py
```

服务将在 http://localhost:8000 启动

### API 端点

#### 1. 获取大V列表

```bash
GET /api/influencers?platform=bilibili
```

**响应：**
```json
{
  "items": [
    {
      "id": "inf_bilibili_72844725",
      "name": "二狗学长好",
      "platform": "bilibili",
      "accountId": "72844725",
      "isActive": true,
      "lastFetchAt": "2026-07-26T16:01:49",
      "lastFetchStatus": "success"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

#### 2. 获取大V详情

```bash
GET /api/influencers/{influencer_id}
```

#### 3. 手动触发采集

```bash
POST /api/influencers/{influencer_id}/fetch
```

**响应：**
```json
{
  "success": true,
  "postsFetched": 15,
  "postsNew": 10,
  "error": null
}
```

#### 4. 创建新大V

```bash
POST /api/influencers
Content-Type: application/json

{
  "name": "大V名称",
  "platform": "bilibili",
  "accountId": "UID",
  "driverType": "api",
  "providerConfig": "{\"cookies\":{...}}",
  "fetchInterval": 180,
  "priority": "medium",
  "isActive": true
}
```

## 工具脚本

### 1. Cookie 配置工具

```bash
# 交互式配置
python3 configure-bilibili-cookie.py

# 验证现有配置
python3 configure-bilibili-cookie.py --verify

# 命令行配置
python3 configure-bilibili-cookie.py \
  --sessdata "xxx" --bili-jct "yyy" --dedeuserid "zzz"
```

### 2. 测试脚本

```bash
python3 test-bilibili-influencer.py
```

包含：
- API 直接调用测试
- 数据库操作验证
- 完整采集服务测试

### 3. 快速配置脚本

```bash
./bilibili-quick-setup.sh
```

一键完成所有配置步骤。

## 数据库

### Influencer 表

存储大V基本信息：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 大V ID |
| name | TEXT | 大V名称 |
| platform | TEXT | 平台（bilibili） |
| accountId | TEXT | Bilibili UID |
| providerConfig | TEXT | JSON 配置（包含 Cookie） |
| fetchInterval | INT | 采集间隔（分钟） |
| isActive | BOOLEAN | 是否激活 |
| lastFetchAt | TEXT | 最后采集时间 |
| lastFetchStatus | TEXT | 采集状态 |

### InfluencerPost 表

存储采集到的动态：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 动态ID |
| influencerId | TEXT | 大V ID |
| content | TEXT | 动态内容 |
| originalUrl | TEXT | 原始链接 |
| publishTime | TEXT | 发布时间 |
| mediaType | TEXT | 媒体类型 |
| engagement | TEXT | 互动数据（JSON） |
| aiProcessed | BOOLEAN | 是否AI分析 |

### InfluencerFetchLog 表

记录采集日志：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 日志ID |
| influencerId | TEXT | 大V ID |
| platform | TEXT | 平台 |
| status | TEXT | 状态 |
| postsFetched | INT | 获取数量 |
| postsNew | INT | 新增数量 |
| durationMs | INT | 耗时（毫秒） |
| errorMessage | TEXT | 错误信息 |

## 配置说明

### providerConfig 格式

```json
{
  "cookies": {
    "SESSDATA": "cookie_value",
    "bili_jct": "cookie_value",
    "DedeUserID": "user_id"
  },
  "retry_delay": 3,
  "max_retries": 3
}
```

### 推荐配置

- **采集间隔（fetchInterval）**: 180-360 分钟（3-6 小时）
- **重试延迟（retry_delay）**: 3-5 秒
- **最大重试（max_retries）**: 3 次
- **优先级（priority）**: medium

## 故障排查

### Cookie 无效

**症状：** 返回 -401 或 -799 错误

**解决方案：**
1. 验证 Cookie：`python3 configure-bilibili-cookie.py --verify`
2. 重新获取 Cookie（步骤见上文）
3. 更新配置

### 请求被拦截

**症状：** 返回 412 错误

**解决方案：**
1. 增加 `retry_delay` 到 5-10 秒
2. 降低采集频率（`fetchInterval` 设为 360 分钟）
3. 确认 Cookie 已正确配置

### Cookie 过期

**症状：** 之前能用，现在突然失败

**解决方案：**
1. Cookie 通常 7-30 天过期
2. 重新获取并更新 Cookie
3. 建议每周检查一次

### 查看日志

```bash
# 查看最近采集日志
python3 -c "
import sys
sys.path.insert(0, 'data-service')
import asyncio
from db import db

async def check():
    async with db.get_connection() as conn:
        cursor = await conn.execute('''
            SELECT * FROM InfluencerFetchLog 
            WHERE platform = 'bilibili' 
            ORDER BY createdAt DESC 
            LIMIT 10
        ''')
        rows = await cursor.fetchall()
        for row in rows:
            print(f'{row[\"createdAt\"]}: {row[\"status\"]} - {row[\"postsFetched\"]} posts - {row[\"errorMessage\"] or \"OK\"}')

asyncio.run(check())
"
```

## 安全注意事项

⚠️ **重要提醒：**

1. **不要分享 Cookie** - Cookie 等同于账号密码
2. **不要提交到代码仓库** - 将包含 Cookie 的文件添加到 `.gitignore`
3. **定期更新** - Cookie 会过期，需要定期更新（7-30天）
4. **使用小号** - 建议使用专门的采集账号，不要使用主账号
5. **遵守服务条款** - 确保使用符合 Bilibili 的服务条款
6. **合理频率** - 不要过度频繁采集，避免触发限流

## 文档

详细文档请查看：

- 📖 [修复总结](docs/bilibili-fix-summary.md) - 完整的修复报告
- 📖 [Cookie 配置指南](docs/bilibili-cookie-setup.md) - Cookie 获取和配置详细步骤
- 📖 [问题诊断报告](docs/bilibili-influencer-diagnosis.md) - 问题分析和解决方案

## 技术架构

```
┌─────────────────────────────────────────────┐
│          FastAPI 数据服务                    │
│         (data-service/main.py)              │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌──────▼──────────┐
│ Influencer     │  │ Bilibili        │
│ Router         │  │ Provider        │
│ (routers/)     │  │ (providers/)    │
└───────┬────────┘  └──────┬──────────┘
        │                   │
        │         ┌─────────▼──────────┐
        │         │ HTTP Client        │
        │         │ + Cookie Auth      │
        │         │ + Retry Logic      │
        │         └─────────┬──────────┘
        │                   │
┌───────▼────────┐         │
│ Fetch Service  │◄────────┘
│ (services/)    │
└───────┬────────┘
        │
┌───────▼────────┐
│ SQLite DB      │
│ (prisma/dev.db)│
└────────────────┘
```

## 常见问题

**Q: Cookie 多久需要更新一次？**  
A: 通常 7-30 天，建议每周检查一次。

**Q: 可以使用多个账号轮换吗？**  
A: 可以，为不同大V配置不同的 Cookie。

**Q: 会不会导致账号被封？**  
A: 正常的低频率采集（3-6 小时/次）风险很低，但建议使用专门的采集账号。

**Q: 如何添加更多大V？**  
A: 使用 `POST /api/influencers` 接口或直接操作数据库。

**Q: 动态数据会自动分析吗？**  
A: 目前仅采集原始数据，AI 分析功能需要单独配置。

## 版本历史

- **v1.0.0** (2026-07-26)
  - ✅ 初始版本发布
  - ✅ Bilibili Provider 实现
  - ✅ Cookie 认证支持
  - ✅ 重试和错误处理
  - ✅ 完整工具和文档

## 贡献者

Claude (Opus 5) - 完整实现和文档

## 许可证

本项目遵循 AI投资分析系统 的许可证。

---

**更新日期:** 2026-07-26  
**状态:** ✅ 就绪，待配置 Cookie  
**支持:** 查看文档或运行 `python3 test-bilibili-influencer.py`
