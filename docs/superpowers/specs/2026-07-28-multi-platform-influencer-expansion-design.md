# 多平台大V监控扩展设计方案

**日期**: 2026-07-28
**版本**: 1.0
**状态**: 已批准

## 一、项目概述

### 1.1 目标

扩展现有的大V监控系统，从当前支持的 2 个平台（Bilibili、微博）扩展到 6 个平台，新增：
- 小红书（Xiaohongshu）
- 知乎（Zhihu）
- 抖音（Douyin）
- 支付宝生活号（Alipay）

### 1.2 设计原则

- **灵活性**: 根据平台特点选择最合适的技术方案（API 优先，爬虫备用）
- **可维护性**: 通过分层抽象减少重复代码，提高后续扩展效率
- **渐进式**: MVP 快速上线，后续迭代补充测试和文档
- **数据完整性**: 统一表 + 平台扩展表，保留平台特有数据

---

## 二、整体架构

### 2.1 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 UI 层                               │
│  (influencers/page.tsx, new/page.tsx, settings/page.tsx)    │
└───────────────────────┬─────────────────────────────────────┘
                        │ API 调用
┌───────────────────────▼─────────────────────────────────────┐
│                   Next.js API 路由层                          │
│      /api/influencers/*, /api/platform-configs/*            │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼─────────────────────────────────────┐
│              FastAPI 数据服务层 (data-service)                │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         InfluencerFetchService (调度层)              │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────▼────────────────────────────────┐   │
│  │      InfluencerProviderRegistry (注册中心)          │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────▼────────────────────────────────┐   │
│  │           基础设施层 (新增)                          │   │
│  │  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │ BaseHTTP     │  │ AntiSpider   │                │   │
│  │  │ Client       │  │ Toolkit      │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  │  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │ DataParser   │  │ PlatformConfig│               │   │
│  │  │              │  │ Manager      │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────▼────────────────────────────────┐   │
│  │            平台 Provider 层                           │   │
│  │  BilibiliProvider  │  WeiboProvider                  │   │
│  │  XiaohongshuProvider  │  ZhihuProvider              │   │
│  │  DouyinProvider  │  AlipayProvider                   │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ 数据持久化
┌───────────────────────▼─────────────────────────────────────┐
│                     数据库层 (SQLite)                         │
│                                                               │
│  InfluencerPost (统一表)  ← 通用字段                          │
│  ├── BilibiliPostExtra                                       │
│  ├── WeiboPostExtra                                          │
│  ├── XiaohongshuPostExtra (新增)                             │
│  ├── ZhihuPostExtra (新增)                                   │
│  ├── DouyinPostExtra (新增)                                  │
│  └── AlipayPostExtra (新增)                                  │
│                                                               │
│  PlatformConfig (平台配置)                                    │
│  Influencer (大V信息)                                         │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 基础设施层（新增）

**BaseHTTPClient**
- 统一的 aiohttp Session 管理
- Cookie/Header 自动注入
- 超时控制和自动重试
- 请求日志记录

**AntiSpiderToolkit**
- RateLimiter: 令牌桶限流器
- UserAgentPool: UA 池管理
- ProxyPool: 代理池（预留）

**DataParser**
- 时间戳统一解析
- HTML/JSON 安全解析
- 媒体类型识别
- 文本清洗

**PlatformConfigManager**
- 配置统一加载
- 配置缓存
- Cookie 池轮换

---

## 三、数据库设计

### 3.1 平台扩展表

```prisma
// 小红书动态扩展
model XiaohongshuPostExtra {
  id            String   @id
  postId        String   @unique
  noteType      String   // 'image' | 'video'
  tags          String   // JSON array
  collects      Int      @default(0)
  hasGoodsLink  Boolean  @default(false)
  topicIds      String?  // JSON array
  
  post          InfluencerPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// 知乎内容扩展
model ZhihuPostExtra {
  id            String   @id
  postId        String   @unique
  contentType   String   // 'answer' | 'article' | 'pin' | 'video'
  questionId    String?
  questionTitle String?
  voteupCount   Int      @default(0)
  votedownCount Int      @default(0)
  isFeatured    Boolean  @default(false)
  
  post          InfluencerPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// 抖音视频扩展
model DouyinPostExtra {
  id            String   @id
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

// 支付宝生活号文章扩展
model AlipayPostExtra {
  id            String   @id
  postId        String   @unique
  articleType   String   // 'news' | 'service' | 'promotion'
  category      String?
  serviceId     String?  // 关联的服务ID
  hasService    Boolean  @default(false)
  
  post          InfluencerPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

---

## 四、平台实现策略

### 4.1 小红书（Xiaohongshu）

**技术方案**: 爬虫
- 使用移动端 Web API
- 需要 `x-s`、`x-t` 签名参数
- Cookie 认证 + 设备指纹

**API 端点**:
- 用户信息: `/api/sns/web/v1/user/{user_id}`
- 笔记列表: `/api/sns/web/v1/user_posted?user_id={user_id}`

**挑战**: 签名算法逆向，频率限制严格

### 4.2 知乎（Zhihu）

**技术方案**: 半公开 API
- Cookie 认证
- User-Agent 伪装
- 限流控制

**API 端点**:
- 用户信息: `/api/v4/members/{url_token}`
- 动态列表: `/api/v4/members/{id}/activities`

**挑战**: API 限流，部分接口需登录

### 4.3 抖音（Douyin）

**技术方案**: 爬虫
- 使用移动端 API
- 需要 `X-Bogus` 签名（难度最高）
- 设备指纹伪造

**API 端点**:
- 用户信息: `/aweme/v1/web/aweme/detail/`
- 视频列表: `/aweme/v1/web/aweme/post/`

**挑战**: 签名算法复杂，反爬严格

### 4.4 支付宝生活号（Alipay）

**技术方案**: 官方 API（如可行）
- OAuth 2.0 认证
- 需要企业资质

**备选方案**: 爬取公开页面

**挑战**: 企业认证门槛

---

## 五、实施计划

### Phase 1: 基础设施层（2天）

| 组件 | 文件 | 功能 |
|------|------|------|
| BaseHTTPClient | core/http_client.py | HTTP 统一管理 |
| RateLimiter | core/rate_limiter.py | 令牌桶限流 |
| UserAgentPool | core/user_agent.py | UA 池 |
| DataParser | core/parsers.py | 数据解析 |
| PlatformConfigManager | core/config_manager.py | 配置管理 |
| 数据库扩展 | prisma/schema.prisma | 4个扩展表 |

### Phase 2: P1 平台实现（4天）

**小红书**（2天）
- 签名算法研究
- Provider 实现
- 数据入库测试

**知乎**（2天）
- API 调研
- Provider 实现
- 数据入库测试

### Phase 3: P2 平台实现（5天）

**抖音**（3天）
- 签名算法逆向
- Provider 实现
- 反爬对抗

**支付宝**（2天）
- 开放平台调研
- Provider 实现
- 认证方案确认

### Phase 4: 集成与优化（2天）

- 端到端测试
- 错误处理优化
- 性能调优
- 基础文档

---

## 六、成功标准（MVP）

### 功能完整性
- ✅ 4个平台 Provider 全部实现
- ✅ 用户信息获取正常
- ✅ 动态/内容抓取正常
- ✅ 数据正确入库（统一表 + 扩展表）
- ✅ 平台配置管理正常

### 质量标准
- ✅ 基础设施层有单元测试
- ✅ 每个 Provider 手工验证通过
- ✅ 基本错误处理（超时、限流、404）
- ✅ 关键代码有注释

### 文档标准
- ✅ 架构设计文档
- ✅ 每个平台配置说明
- ✅ README 更新

---

## 七、风险与应对

### 技术风险

| 风险 | 应对策略 |
|------|---------|
| 小红书签名算法难度高 | 参考开源项目，降级为手动配置 |
| 抖音签名算法复杂 | 预留充足时间，考虑第三方服务 |
| 支付宝需企业认证 | 评估后改为爬取公开页面 |
| 平台反爬升级 | 设计易更新架构，快速响应 |

### 业务风险

| 风险 | 应对策略 |
|------|---------|
| 违反平台服务条款 | 严格限流，官方API优先 |
| 账号封禁风险 | 遵守限流策略 |
| 数据准确性问题 | 数据验证机制 |

---

## 八、后续迭代方向

### 测试完善
- 集成测试
- 异常场景测试
- 性能压测

### 功能增强
- Cookie 自动刷新
- 多账号轮换
- 代理池集成
- 配置热更新

### 监控告警
- Provider 健康检查
- 采集成功率监控
- 限流告警
- 异常通知

---

**设计批准**: 2026-07-28
**预计完成**: 2026-08-10（13天）
