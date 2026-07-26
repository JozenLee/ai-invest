# KOL监控系统完整文档

## 📋 系统概述

KOL（Key Opinion Leader）监控系统是AI投资分析系统的核心模块之一，用于追踪和分析行业大V的观点动态，为投资决策提供专业意见参考。

### 核心功能
- ✅ 多平台KOL管理（微博、B站）
- ✅ 自动化内容抓取
- ✅ AI驱动的观点分析（14维度）
- ✅ 领域观点聚合
- ✅ 实时观点追踪

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (Next.js)                        │
│  /events/influencers - KOL列表管理                       │
│  /events/influencers/new - 添加新KOL                     │
│  /events/influencers/[id] - KOL详情                      │
└─────────────────────────────────────────────────────────┘
                           ↓ HTTP/REST
┌─────────────────────────────────────────────────────────┐
│              API路由层 (FastAPI)                         │
│  POST   /api/influencers/          - 创建KOL            │
│  GET    /api/influencers/          - 列表查询           │
│  GET    /api/influencers/{id}      - 详情查询           │
│  PUT    /api/influencers/{id}      - 更新信息           │
│  DELETE /api/influencers/{id}      - 删除KOL            │
│  POST   /api/influencers/{id}/fetch - 触发抓取          │
│  GET    /api/influencers/{id}/posts - 内容列表          │
│  POST   /api/influencers/batch/fetch - 批量抓取         │
│  GET    /api/influencers/opinions/aggregated - 观点聚合 │
│  GET    /api/influencers/stats     - 统计信息           │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   服务层 (Services)                      │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  InfluencerFetchService                         │   │
│  │  - 协调多Provider抓取                            │   │
│  │  - MD5去重                                       │   │
│  │  - 批量入库                                       │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  InfluencerAnalysisService                      │   │
│  │  - Claude API调用                                │   │
│  │  - 14维度分析                                     │   │
│  │  - JSON解析和验证                                 │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  OpinionAggregationService                      │   │
│  │  - 时间窗口聚合 (3d/7d/30d)                      │   │
│  │  - 复合评分计算                                   │   │
│  │  - 趋势分析                                       │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               Worker层 (Async Queue)                     │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  InfluencerAIQueue                              │   │
│  │  - 3 Worker并发处理                             │   │
│  │  - asyncio.Queue实现                            │   │
│  │  - 异步AI分析                                    │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Provider层 (Platform APIs)                  │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────┐            │
│  │ WeiboProvider   │  │ BilibiliProvider  │            │
│  │ - 热搜API       │  │ - 搜索API         │            │
│  │ - 内容解析      │  │ - 时间戳解析      │            │
│  └─────────────────┘  └──────────────────┘            │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                 数据层 (SQLite + Prisma)                 │
│                                                          │
│  - Influencer           KOL基本信息                      │
│  - InfluencerPost       抓取的内容                       │
│  - InfluencerOpinion    AI分析结果                       │
│  - InfluencerFetchLog   抓取日志                         │
│  - InfluencerAnalysisLog AI分析日志                      │
└─────────────────────────────────────────────────────────┘
```

## 📊 数据模型

### Influencer (KOL基本信息)
```typescript
{
  id: string              // inf_<timestamp>
  name: string            // KOL名称
  platform: string        // weibo | bilibili
  accountId: string       // 平台账号ID
  profileUrl: string?     // 主页链接
  avatarUrl: string?      // 头像URL
  category: string?       // 分类标签
  tags: string[]?         // 标签数组
  priority: string        // high | medium | low
  fetchInterval: number   // 抓取间隔（分钟）
  driverType: string      // api | scraper
  providerConfig: string? // Provider配置JSON
  isActive: boolean       // 是否启用
  lastFetchAt: DateTime?  // 最后抓取时间
  lastFetchStatus: string? // success | error
  lastFetchError: string? // 错误信息
  createdAt: DateTime
  updatedAt: DateTime
}
```

### InfluencerPost (内容记录)
```typescript
{
  id: string              // post_<timestamp>
  influencerId: string    // 关联KOL
  platform: string        // 平台
  contentHash: string     // MD5去重
  content: string         // 内容文本
  publishedAt: DateTime   // 发布时间
  url: string?            // 原文链接
  metadata: string?       // 额外元数据JSON
  createdAt: DateTime
}
```

### InfluencerOpinion (AI分析结果)
```typescript
{
  id: string              // opinion_<timestamp>
  postId: string          // 关联内容
  influencerId: string    // 关联KOL
  domain: string          // chip | display | ai | gpu 等
  sentiment: string       // positive | negative | neutral
  confidence: number      // 0.0-1.0
  keyPoints: string[]     // 关键论点
  reasoning: string       // 推理过程
  // 14维度分析字段
  investmentSignal: string
  timeHorizon: string
  impactScope: string
  dataSource: string
  marketTiming: string
  riskLevel: string
  catalystType: string
  valueChainPosition: string
  competitiveImpact: string
  regulatoryImpact: string
  macroSensitivity: string
  correlatedAssets: string[]
  contraryIndicators: string[]
  credibilityScore: number
  createdAt: DateTime
}
```

## 🔧 API接口详解

### 1. 创建KOL
```bash
POST /api/influencers/
Content-Type: application/json

{
  "name": "半导体行业观察",
  "platform": "weibo",
  "accountId": "1234567890",
  "driverType": "api",
  "fetchInterval": 60,
  "priority": "high",
  "isActive": true,
  "category": "tech",
  "tags": ["半导体", "芯片", "AI"]
}
```

**响应**:
```json
{
  "id": "inf_1722000000000000",
  "name": "半导体行业观察",
  "platform": "weibo",
  "accountId": "1234567890",
  "isActive": true,
  "lastFetchAt": null,
  "lastFetchStatus": null,
  "createdAt": "2026-07-26T13:00:00",
  "priority": "high",
  "fetchInterval": 60,
  "driverType": "api",
  "profileUrl": null,
  "category": "tech"
}
```

### 2. 查询KOL列表
```bash
GET /api/influencers/?page=1&pageSize=20&platform=weibo
```

**响应**:
```json
{
  "items": [
    {
      "id": "inf_001",
      "name": "半导体行业观察",
      "platform": "weibo",
      "accountId": "1234567890",
      "isActive": true,
      "lastFetchAt": "2026-07-26T12:00:00",
      "lastFetchStatus": "success",
      "createdAt": "2026-07-25T10:00:00",
      "priority": "high",
      "fetchInterval": 60,
      "driverType": "api",
      "profileUrl": "https://weibo.com/1234567890",
      "category": "tech"
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 20
}
```

### 3. 触发内容抓取
```bash
POST /api/influencers/{id}/fetch
```

**响应**:
```json
{
  "success": true,
  "postsFetched": 25,
  "postsNew": 5,
  "error": null
}
```

### 4. 获取观点聚合
```bash
GET /api/influencers/opinions/aggregated?domain=chip&window=7d
```

**响应**:
```json
{
  "domain": "chip",
  "window": "7d",
  "aggregatedSentiment": "positive",
  "overallConfidence": 0.78,
  "topOpinions": [
    {
      "influencerName": "半导体行业观察",
      "sentiment": "positive",
      "confidence": 0.85,
      "keyPoints": ["AI芯片需求增长", "制程技术突破"],
      "publishedAt": "2026-07-25T14:30:00",
      "compositeScore": 0.82
    }
  ],
  "sentimentDistribution": {
    "positive": 12,
    "neutral": 3,
    "negative": 2
  },
  "totalOpinions": 17
}
```

## 🧪 测试覆盖

### 单元测试
- ✅ `test_weibo_provider.py` (4/4 通过)
- ✅ `test_bilibili_provider.py` (5/5 通过)
- ✅ `test_influencer_fetch_service.py` (4/4 通过)
- ✅ `test_influencer_ai_queue.py` (7/7 通过)
- ✅ `test_influencer_analysis_service.py` (5/5 通过)
- ✅ `test_opinion_aggregation_service.py` (7/7 通过)
- ✅ `test_influencer_router.py` (13/13 通过)

**总计**: 45个单元测试全部通过

### 集成测试
- API端点测试
- 数据库一致性检查
- 服务健康检查

## 🚀 部署指南

### 1. 环境要求
- Python 3.9+
- Node.js 20+
- SQLite 3.35+

### 2. 快速部署
```bash
# 运行部署脚本
bash scripts/deploy-kol-system.sh

# 或手动部署
cd data-service
pip install -r requirements.txt
cd ..
npm install
npm run db:migrate
```

### 3. 启动服务
```bash
# 启动后端
cd data-service && python main.py

# 启动前端
npm run dev
```

### 4. 访问系统
- 前端页面: http://localhost:3000/events/influencers
- API文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

## 🔍 故障排查

### 问题1: 前端页面报错 "Cannot read properties of undefined"
**原因**: API返回数据结构不匹配或数据为空
**解决**: 已修复，使用防御性编程 `(data?.items || []).filter(...)`

### 问题2: Pydantic验证错误 "Field required: account_id"
**原因**: 前端发送camelCase，后端期望snake_case
**解决**: 配置Pydantic别名 `account_id: str = Field(alias="accountId")`

### 问题3: Bilibili时间戳解析错误
**原因**: 顶层`pub_ts`字段为0
**解决**: 从`module_author.pub_ts`路径提取正确时间戳

### 问题4: AI分析返回markdown包裹的JSON
**原因**: Claude返回 ` ```json ... ``` ` 格式
**解决**: 正则表达式提取纯JSON内容

## 📈 性能指标

- **并发处理**: 3 Worker并发AI分析
- **去重效率**: MD5哈希 O(1) 查找
- **API响应**: < 100ms (列表查询)
- **AI分析**: ~2-5秒/条 (依赖Claude API)
- **批量抓取**: 支持多KOL并行

## 🔐 安全考虑

- ✅ SQL注入防护（参数化查询）
- ✅ API密钥环境变量管理
- ✅ CORS跨域限制
- ✅ 错误日志记录
- ✅ 数据验证（Pydantic）

## 📝 后续优化

1. **性能优化**
   - [ ] Redis缓存热门KOL数据
   - [ ] 数据库索引优化
   - [ ] 批量写入优化

2. **功能增强**
   - [ ] 小红书平台支持
   - [ ] 实时WebSocket推送
   - [ ] 观点对比分析

3. **可观测性**
   - [ ] Prometheus指标
   - [ ] 抓取成功率监控
   - [ ] AI分析延迟追踪

## 📚 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目总览
- [数据管道诊断](./data-pipeline-diagnosis.md)
- [新闻分类优化](./news-classification-fix-report.md)

---

**最后更新**: 2026-07-26
**文档版本**: 1.0.0
**系统状态**: ✅ 生产就绪
