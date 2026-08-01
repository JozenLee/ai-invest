# 市场数据、资讯流与知识图谱联动系统设计

**设计日期**: 2026-08-01  
**设计方案**: 方案A - 渐进式改造  
**预计周期**: 3-4周

## 一、概述

### 1.1 目标

实现市场数据（指数、ETF）、新闻资讯流与知识图谱的深度联动，提供统一的标签体系和实时的数据关联。

### 1.2 核心功能

1. **统一标签体系**: 新闻资讯的分类标签与知识图谱的标签集合一致，支持多层级标签（领域→细分→技术→公司）
2. **新闻图谱联动**: 新闻入库时实时关联到相关图谱节点，统计各节点的新闻数量和情感倾向
3. **ETF节点绑定**: 知识图谱节点与指数、ETF相绑定，建立多对多关系
4. **市场数据展示**: 市场数据页面按子图展示不同领域的指数、ETF涨跌情况

### 1.3 设计原则

- **渐进式改造**: 基于现有结构扩展，最小化破坏性变更
- **向后兼容**: 保留现有Domain、GraphNode等结构，通过关联表桥接
- **实时更新**: 新闻关联和统计数据实时更新，无需人工干预
- **分阶段交付**: 每个阶段独立可验证

---

## 二、数据模型设计

### 2.1 统一标签体系

#### Tag 表（核心标签表）

```prisma
model Tag {
  id          String   @id @default(cuid())
  name        String   // 标签名称（如：AI算力、GPU、英伟达）
  code        String   @unique // 英文代码
  type        String   // domain/tech/company/concept
  level       Int      // 层级：1=一级领域，2=二级细分，3=三级技术，4=公司/概念
  parentId    String?  // 父标签ID
  description String?
  keywords    String?  // JSON: 关键词用于AI匹配
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  parent      Tag?     @relation("TagTree", fields: [parentId], references: [id])
  children    Tag[]    @relation("TagTree")
  
  newsArticles NewsArticleTag[]
  graphNodes   GraphNodeTag[]
  domains      DomainTag[]
}
```

**标签层级示例**:
```
Level 1: AI算力 (domain)
  ├─ Level 2: AI芯片 (tech)
  │   ├─ Level 3: GPU芯片 (tech)
  │   │   └─ Level 4: 英伟达 (company)
  │   └─ Level 3: NPU芯片 (tech)
  └─ Level 2: AI服务器 (tech)
      └─ Level 3: 液冷散热 (tech)
```

#### NewsArticleTag 表（新闻-标签关联）

```prisma
model NewsArticleTag {
  newsId     String
  tagId      String
  confidence Float    @default(1.0) // AI分类置信度
  createdAt  DateTime @default(now())
  
  news NewsArticle @relation(fields: [newsId], references: [id], onDelete: Cascade)
  tag  Tag         @relation(fields: [tagId], references: [id])
  
  @@id([newsId, tagId])
  @@index([tagId, createdAt])
}
```

#### GraphNodeTag 表（图谱节点-标签关联）

```prisma
model GraphNodeTag {
  nodeId    String
  tagId     String
  relevance Float    @default(1.0) // 相关度
  createdAt DateTime @default(now())
  
  node GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  tag  Tag       @relation(fields: [tagId], references: [id])
  
  @@id([nodeId, tagId])
  @@index([tagId])
}
```

#### DomainTag 表（Domain-标签桥接，过渡期使用）

```prisma
model DomainTag {
  domainId String
  tagId    String
  
  domain Domain @relation(fields: [domainId], references: [id])
  tag    Tag    @relation(fields: [tagId], references: [id])
  
  @@id([domainId, tagId])
}
```

### 2.2 图谱节点-ETF绑定

#### GraphNodeETF 表

```prisma
model GraphNodeETF {
  id          String   @id @default(cuid())
  nodeId      String
  etfCode     String   // ETF代码（如：515790）
  etfName     String   // ETF名称（如：光伏ETF）
  bindType    String   @default("tracking") // tracking=跟踪型, thematic=主题型
  weight      Float    @default(1.0) // 权重/相关度
  description String?  // 绑定说明
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  node GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  @@unique([nodeId, etfCode])
  @@index([etfCode])
  @@index([nodeId])
}
```

**说明**:
- `bindType`: 区分ETF类型
  - `tracking`: 跟踪型（紧密跟踪该领域）
  - `thematic`: 主题型（包含该领域成分）
- `weight`: 相关度权重，用于排序和过滤

### 2.3 现有表扩展

#### NewsArticle 表（无需修改）
- 保留 `domainId` 字段向后兼容
- 通过 `NewsArticleTag` 表建立与标签的关系

#### GraphNode 表（无需修改）
- 保留现有字段
- 现有的统计字段继续使用：
  - `newsCount7d` / `newsCount30d`
  - `sentimentScore`
  - `lastNewsAt`

---

## 三、业务流程设计

### 3.1 新闻入库与实时关联流程

```
┌────────────┐
│ 新闻采集   │
└─────┬──────┘
      ↓
┌────────────────────────┐
│ AI分类与标签提取       │
│ - 提取多层级标签       │
│ - 计算置信度           │
│ - 分析情感与影响       │
└─────┬──────────────────┘
      ↓
┌────────────────────────┐
│ 创建标签关联           │
│ NewsArticleTag         │
└─────┬──────────────────┘
      ↓
┌────────────────────────┐
│ 匹配图谱节点           │
│ Tag → GraphNodeTag     │
│    → GraphNode         │
└─────┬──────────────────┘
      ↓
┌────────────────────────┐
│ 创建新闻-节点关联      │
│ NewsGraphLink          │
└─────┬──────────────────┘
      ↓
┌────────────────────────┐
│ 更新节点统计数据       │
│ - newsCount7d/30d      │
│ - sentimentScore       │
│ - lastNewsAt           │
└────────────────────────┘
```

### 3.2 标签匹配策略

#### 匹配优先级
1. **精确匹配**: 新闻内容包含标签关键词
2. **语义匹配**: AI理解内容后推断相关标签
3. **关联推断**: 通过已匹配标签推断其父/子标签

#### 示例
新闻: "英伟达发布H100 GPU，用于AI训练"

**匹配结果**:
- 精确匹配: `英伟达` (company, L4), `H100` (product, L4)
- 语义匹配: `GPU芯片` (tech, L3), `AI芯片` (tech, L2)
- 关联推断: `AI算力` (domain, L1) ← 父标签

### 3.3 图谱节点统计更新机制

#### 触发方式
- **实时触发**: 新闻关联建立时立即更新
- **定时校准**: 每日凌晨2点重新计算（防止数据漂移）

#### 更新逻辑

```typescript
async function updateNodeNewsStats(nodeId: string) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  
  // 查询关联新闻
  const links7d = await prisma.newsGraphLink.findMany({
    where: {
      nodeId,
      createdAt: { gte: sevenDaysAgo }
    },
    include: { news: true }
  })
  
  const links30d = await prisma.newsGraphLink.findMany({
    where: {
      nodeId,
      createdAt: { gte: thirtyDaysAgo }
    },
    include: { news: true }
  })
  
  // 计算统计数据
  const newsCount7d = links7d.length
  const newsCount30d = links30d.length
  
  // 计算加权平均情感
  const sentimentScore = links7d.length > 0
    ? links7d.reduce((sum, link) => 
        sum + (link.news.sentiment || 0) * link.relevance, 0
      ) / links7d.length
    : null
  
  // 最后新闻时间
  const lastNewsAt = links7d.length > 0
    ? new Date(Math.max(...links7d.map(l => l.news.publishTime.getTime())))
    : null
  
  // 更新节点
  await prisma.graphNode.update({
    where: { id: nodeId },
    data: {
      newsCount7d,
      newsCount30d,
      sentimentScore,
      lastNewsAt
    }
  })
}
```

#### 防抖策略
- 同一节点1分钟内只更新一次
- 使用 Redis 记录更新时间戳

---

## 四、市场数据展示设计

### 4.1 子图市场数据聚合API

#### API端点
`GET /api/market/subgraph-overview`

#### 返回数据结构

```typescript
interface SubGraphMarketData {
  subGraphId: string
  subGraphName: string
  category: string
  
  // 关联的ETF数据
  etfs: Array<{
    code: string
    name: string
    currentPrice: number
    changePercent: number
    volume: number
    amount: number
    relatedNodes: Array<{
      nodeId: string
      nodeName: string
      weight: number
    }>
  }>
  
  // 关联的指数数据（如果有）
  indices: Array<{
    code: string
    name: string
    currentValue: number
    changePercent: number
    volume: number
  }>
  
  // 聚合统计
  stats: {
    avgChangePercent: number     // 平均涨跌幅
    totalNewsCount7d: number      // 7天新闻总数
    avgSentiment: number          // 平均情感得分
    trendIndicator: 'up' | 'down' | 'stable'
    hotNodes: Array<{             // 热门节点Top5
      nodeId: string
      nodeName: string
      newsCount: number
      sentiment: number
    }>
  }
}
```

#### 查询逻辑

```typescript
async function getSubGraphMarketOverview() {
  // 1. 获取所有活跃子图
  const subGraphs = await prisma.subGraph.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  })
  
  const result = []
  
  for (const subGraph of subGraphs) {
    // 2. 查询子图关联的节点
    const nodes = await prisma.graphNode.findMany({
      where: { subGraphId: subGraph.id },
      include: {
        etfBindings: {
          where: { isActive: true },
          orderBy: { weight: 'desc' }
        }
      }
    })
    
    // 3. 获取ETF最新市场数据
    const etfCodes = [...new Set(
      nodes.flatMap(n => n.etfBindings.map(e => e.etfCode))
    )]
    
    const etfData = await prisma.etfDaily.findMany({
      where: {
        ticker: { in: etfCodes },
        date: { gte: getLatestTradingDay() }
      }
    })
    
    // 4. 聚合统计
    const stats = {
      avgChangePercent: calculateAvgChange(etfData),
      totalNewsCount7d: nodes.reduce((sum, n) => sum + n.newsCount7d, 0),
      avgSentiment: calculateAvgSentiment(nodes),
      trendIndicator: determineTrend(etfData),
      hotNodes: nodes
        .sort((a, b) => b.newsCount7d - a.newsCount7d)
        .slice(0, 5)
        .map(n => ({
          nodeId: n.id,
          nodeName: n.name,
          newsCount: n.newsCount7d,
          sentiment: n.sentimentScore
        }))
    }
    
    result.push({
      subGraphId: subGraph.id,
      subGraphName: subGraph.name,
      category: subGraph.category,
      etfs: etfData,
      stats
    })
  }
  
  return result
}
```

### 4.2 市场数据页面扩展

#### 新增模块：「领域市场看板」

**布局位置**: 市场概览下方

**卡片设计**:
```
┌─────────────────────────────────────────┐
│ [AI算力] ↑ 2.1%                         │
│                                          │
│ 📈 ETF表现                               │
│   半导体ETF (512480)  +2.3%  ↑          │
│   AI芯片ETF (515070)  +1.8%  ↑          │
│   电子ETF (159997)    +1.5%  ↑          │
│                                          │
│ 📰 热点动态                              │
│   7日新闻: 45条  情感: ↑ 0.65 (积极)    │
│                                          │
│ 🔥 热门节点                              │
│   GPU芯片(23) | HBM存储(18) | ...       │
│                                          │
│ [查看详情 →]                             │
└─────────────────────────────────────────┘
```

**交互功能**:
- 点击卡片 → 跳转到子图的知识图谱详情页
- 点击ETF代码 → 查看ETF详细数据
- 点击热门节点 → 查看节点相关新闻列表
- 颜色指示: 上涨=绿色，下跌=红色，平稳=灰色

---

## 五、AI服务设计

### 5.1 新闻AI分析增强

#### 扩展分析结果结构

```typescript
interface NewsAIAnalysisResult {
  // 现有字段
  category: string
  sentiment: number
  sentimentLabel: string
  impact: number
  
  // 新增：多层级标签
  tags: Array<{
    tagId: string
    tagName: string
    tagCode: string
    level: number
    confidence: number
  }>
  
  // 新增：关联的图谱节点
  relatedNodes: Array<{
    nodeId: string
    nodeName: string
    relevance: number
    reason: string
  }>
}
```

#### AI Prompt 设计

```
你是一个专业的金融新闻分析师，需要分析以下新闻并提取结构化信息。

新闻标题: {title}
新闻内容: {content}
发布时间: {publishTime}

可用标签库:
{tagTreeJSON}

可用图谱节点:
{nodeListJSON}

请按以下格式返回JSON结果:
{
  "category": "分类",
  "sentiment": -1到1之间的数值,
  "sentimentLabel": "bullish/neutral/bearish",
  "impact": 1-5的影响评级,
  
  "tags": [
    {
      "tagId": "标签ID",
      "tagName": "标签名称",
      "tagCode": "标签代码",
      "level": 层级数字,
      "confidence": 0-1的置信度
    }
  ],
  
  "relatedNodes": [
    {
      "nodeId": "节点ID",
      "nodeName": "节点名称",
      "relevance": 0-1的相关度,
      "reason": "关联理由"
    }
  ]
}

要求:
1. 标签要包含多个层级（从一级领域到具体技术/公司）
2. 置信度要真实反映匹配程度
3. 相关节点要按相关度排序
4. 关联理由要具体说明为什么相关
```

### 5.2 标签匹配实现

```typescript
async function matchTagsForNews(
  newsContent: string,
  aiExtractedTags: Array<{tagCode: string, confidence: number}>
): Promise<string[]> {
  
  // 1. 获取标签树
  const allTags = await prisma.tag.findMany({
    where: { isActive: true },
    include: { parent: true, children: true }
  })
  
  const matchedTagIds = new Set<string>()
  
  // 2. 精确匹配 - AI提取的标签
  for (const extracted of aiExtractedTags) {
    const tag = allTags.find(t => t.code === extracted.tagCode)
    if (tag && extracted.confidence >= 0.7) {
      matchedTagIds.add(tag.id)
      
      // 3. 关联推断 - 添加父标签
      let parent = tag.parent
      while (parent) {
        matchedTagIds.add(parent.id)
        parent = allTags.find(t => t.id === parent.parentId)?.parent
      }
    }
  }
  
  return Array.from(matchedTagIds)
}
```

### 5.3 图谱节点匹配实现

```typescript
async function matchGraphNodesForNews(
  matchedTagIds: string[]
): Promise<Array<{nodeId: string, relevance: number}>> {
  
  // 查询关联这些标签的所有节点
  const nodeTagLinks = await prisma.graphNodeTag.findMany({
    where: { tagId: { in: matchedTagIds } },
    include: { node: true, tag: true }
  })
  
  // 按节点分组并计算相关度
  const nodeScores = new Map<string, number>()
  
  for (const link of nodeTagLinks) {
    const currentScore = nodeScores.get(link.nodeId) || 0
    nodeScores.set(
      link.nodeId,
      currentScore + link.relevance
    )
  }
  
  // 排序并返回
  return Array.from(nodeScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([nodeId, relevance]) => ({
      nodeId,
      relevance: Math.min(relevance, 1.0) // 归一化到0-1
    }))
}
```

---

## 六、实施阶段规划

### Phase 1: 数据模型与标签体系（Week 1-2）

#### 任务清单
- [ ] 创建数据库迁移文件
  - [ ] Tag 表
  - [ ] NewsArticleTag 表
  - [ ] GraphNodeTag 表
  - [ ] DomainTag 表
  - [ ] GraphNodeETF 表
- [ ] 编写数据迁移脚本
  - [ ] Domain → Tag 迁移
  - [ ] GraphNode.metadata.trackingETFs → GraphNodeETF 迁移
- [ ] 创建标签管理API
  - [ ] `POST /api/tags` - 创建标签
  - [ ] `PUT /api/tags/:id` - 更新标签
  - [ ] `DELETE /api/tags/:id` - 删除标签
  - [ ] `GET /api/tags/tree` - 获取标签树
- [ ] 创建ETF绑定管理API
  - [ ] `POST /api/graph/nodes/:id/etfs` - 绑定ETF
  - [ ] `DELETE /api/graph/nodes/:id/etfs/:etfCode` - 解绑ETF
  - [ ] `GET /api/graph/nodes/:id/etfs` - 查询节点的ETF

#### 验收标准
- 数据库迁移成功执行，无数据丢失
- 标签树API返回正确的层级结构
- 现有Domain功能不受影响

### Phase 2: 新闻实时关联（Week 2-3）

#### 任务清单
- [ ] 扩展新闻AI分析服务
  - [ ] 修改 prompt 增加标签提取
  - [ ] 解析AI返回的标签和节点信息
- [ ] 实现标签匹配逻辑
  - [ ] `matchTagsForNews()` 函数
  - [ ] 标签关联创建（NewsArticleTag）
- [ ] 实现图谱节点匹配逻辑
  - [ ] `matchGraphNodesForNews()` 函数
  - [ ] 节点关联创建（NewsGraphLink）
- [ ] 实现节点统计更新
  - [ ] `updateNodeNewsStats()` 函数
  - [ ] Redis防抖机制
  - [ ] 定时校准任务
- [ ] 前端展示增强
  - [ ] 新闻详情页显示关联的标签
  - [ ] 新闻详情页显示关联的图谱节点
  - [ ] 图谱节点页显示最新相关新闻

#### 验收标准
- 新闻入库后5秒内完成标签和节点关联
- 节点统计数据实时更新
- 新闻详情页可见关联的标签和节点

### Phase 3: 市场数据展示（Week 3-4）

#### 任务清单
- [ ] 实现子图市场数据聚合API
  - [ ] `GET /api/market/subgraph-overview`
  - [ ] 查询逻辑实现
  - [ ] 数据聚合和统计
- [ ] 市场数据页面UI开发
  - [ ] 领域市场看板组件
  - [ ] 子图卡片组件
  - [ ] ETF列表组件
  - [ ] 热门节点列表组件
- [ ] 交互功能实现
  - [ ] 点击跳转到图谱详情
  - [ ] 点击查看ETF详情
  - [ ] 点击查看节点新闻
- [ ] 图谱页面增强
  - [ ] 节点详情显示绑定的ETF
  - [ ] ETF实时涨跌数据
  - [ ] 点击跳转到市场数据页

#### 验收标准
- 市场数据页面显示所有活跃子图
- ETF涨跌数据实时准确
- 统计数据（新闻数、情感分）正确
- 交互跳转流畅

### Phase 4: 优化与完善（Week 4+）

#### 任务清单
- [ ] 性能优化
  - [ ] 数据库索引优化
  - [ ] Redis缓存策略
  - [ ] 查询SQL优化
- [ ] 数据质量监控
  - [ ] 标签匹配准确率统计
  - [ ] AI分析失败率监控
  - [ ] 统计数据一致性检查
- [ ] 历史数据处理
  - [ ] 批量为历史新闻打标签
  - [ ] 批量建立新闻-节点关联
  - [ ] 回填节点统计数据
- [ ] 文档完善
  - [ ] API文档更新
  - [ ] 使用手册编写
  - [ ] 运维指南编写

#### 验收标准
- API响应时间 < 500ms
- 标签匹配准确率 > 85%
- 历史数据全部处理完成

---

## 七、技术实现要点

### 7.1 数据库索引优化

```sql
-- 高频查询索引
CREATE INDEX idx_news_article_tag_tag_created 
  ON NewsArticleTag(tagId, createdAt);

CREATE INDEX idx_graph_node_tag_tag 
  ON GraphNodeTag(tagId);

CREATE INDEX idx_graph_node_etf_etf 
  ON GraphNodeETF(etfCode);

CREATE INDEX idx_graph_node_etf_node 
  ON GraphNodeETF(nodeId);

CREATE INDEX idx_news_graph_link_node_created 
  ON NewsGraphLink(nodeId, createdAt);

CREATE INDEX idx_tag_parent_active 
  ON Tag(parentId, isActive);

CREATE INDEX idx_tag_code 
  ON Tag(code);
```

### 7.2 缓存策略

**Redis缓存键设计**:
```
tag:tree              -> 标签树（TTL: 1小时）
tag:by-code:{code}    -> 标签详情（TTL: 1小时）
node:stats:{nodeId}   -> 节点统计（TTL: 5分钟）
market:subgraph       -> 子图市场数据（TTL: 5分钟）
node:update-lock:{id} -> 节点更新锁（TTL: 1分钟）
```

**缓存更新策略**:
- 标签树：写入时主动失效
- 节点统计：更新后主动失效
- 市场数据：定时失效（5分钟）
- 更新锁：防抖用，自动过期

### 7.3 异步处理

**消息队列任务**:
```typescript
// 新闻AI分析任务
interface NewsAnalysisJob {
  newsId: string
  priority: 'high' | 'normal' | 'low'
}

// 节点统计更新任务
interface NodeStatsUpdateJob {
  nodeId: string
  reason: 'news_added' | 'news_deleted' | 'scheduled'
}
```

**处理流程**:
1. 新闻入库 → 发送 `NewsAnalysisJob` 到队列
2. Worker消费任务 → AI分析 → 创建关联
3. 关联创建 → 发送 `NodeStatsUpdateJob` 到队列
4. Worker消费任务 → 更新统计（带防抖）

### 7.4 防抖机制

```typescript
async function updateNodeStatsWithDebounce(nodeId: string) {
  const lockKey = `node:update-lock:${nodeId}`
  
  // 尝试获取锁（60秒TTL）
  const locked = await redis.set(lockKey, '1', 'EX', 60, 'NX')
  
  if (!locked) {
    // 已有更新任务在执行，跳过
    return
  }
  
  try {
    await updateNodeNewsStats(nodeId)
    
    // 清除缓存
    await redis.del(`node:stats:${nodeId}`)
  } finally {
    // 释放锁（提前）
    await redis.del(lockKey)
  }
}
```

---

## 八、数据迁移方案

### 8.1 Domain → Tag 迁移

```typescript
async function migrateDomainToTags() {
  const domains = await prisma.domain.findMany({
    where: { isActive: true }
  })
  
  console.log(`开始迁移 ${domains.length} 个领域...`)
  
  for (const domain of domains) {
    // 创建一级标签
    const tag = await prisma.tag.create({
      data: {
        name: domain.name,
        code: domain.code,
        type: 'domain',
        level: 1,
        keywords: domain.keywords,
        description: domain.description,
        isActive: domain.isActive
      }
    })
    
    // 建立桥接关系
    await prisma.domainTag.create({
      data: {
        domainId: domain.id,
        tagId: tag.id
      }
    })
    
    console.log(`✓ 迁移领域: ${domain.name} -> 标签: ${tag.id}`)
  }
  
  console.log('领域迁移完成！')
}
```

### 8.2 GraphNode.metadata.trackingETFs → GraphNodeETF 迁移

```typescript
async function migrateETFBindings() {
  const nodes = await prisma.graphNode.findMany()
  
  let migratedCount = 0
  
  for (const node of nodes) {
    if (!node.metadata) continue
    
    try {
      const metadata = JSON.parse(node.metadata)
      
      if (metadata.trackingETFs && Array.isArray(metadata.trackingETFs)) {
        for (const etf of metadata.trackingETFs) {
          await prisma.graphNodeETF.create({
            data: {
              nodeId: node.id,
              etfCode: etf.code || etf.ticker,
              etfName: etf.name,
              bindType: 'tracking',
              weight: etf.weight || 1.0
            }
          })
        }
        
        migratedCount++
        console.log(`✓ 迁移节点: ${node.name} (${metadata.trackingETFs.length} 个ETF)`)
      }
    } catch (error) {
      console.error(`✗ 迁移失败: ${node.name}`, error)
    }
  }
  
  console.log(`ETF绑定迁移完成！共迁移 ${migratedCount} 个节点`)
}
```

### 8.3 历史新闻批量打标签

```typescript
async function batchTagHistoricalNews(batchSize = 50) {
  const untaggedNews = await prisma.newsArticle.findMany({
    where: {
      NOT: {
        tags: { some: {} }
      }
    },
    take: batchSize,
    orderBy: { publishTime: 'desc' }
  })
  
  console.log(`处理 ${untaggedNews.length} 条历史新闻...`)
  
  for (const news of untaggedNews) {
    try {
      // 调用AI分析服务
      const analysis = await analyzeNewsWithAI(news)
      
      // 创建标签关联
      for (const tag of analysis.tags) {
        await prisma.newsArticleTag.create({
          data: {
            newsId: news.id,
            tagId: tag.tagId,
            confidence: tag.confidence
          }
        })
      }
      
      // 创建节点关联
      for (const node of analysis.relatedNodes) {
        await prisma.newsGraphLink.create({
          data: {
            newsId: news.id,
            nodeId: node.nodeId,
            relevance: node.relevance,
            sentiment: analysis.sentimentLabel,
            impactType: 'direct'
          }
        })
        
        // 更新节点统计
        await updateNodeStatsWithDebounce(node.nodeId)
      }
      
      console.log(`✓ 处理新闻: ${news.title}`)
      
    } catch (error) {
      console.error(`✗ 处理失败: ${news.title}`, error)
    }
  }
}
```

---

## 九、向后兼容性

### 9.1 保留现有功能

**Domain 表**:
- 继续保留，不删除
- 通过 DomainTag 桥接到新标签系统
- 现有使用 domainId 的代码继续工作

**GraphNode.metadata**:
- 继续保留 metadata 字段
- trackingETFs 数据迁移后不删除（保持冗余）
- 优先使用 GraphNodeETF 表，降级使用 metadata

**现有API**:
- 不做破坏性变更
- 新增新的API端点（如 `/api/tags`, `/api/market/subgraph-overview`）
- 现有API返回格式保持不变

### 9.2 渐进式升级路径

**阶段1**: Tag系统与Domain并存
- 新功能使用Tag
- 老功能继续使用Domain
- 通过DomainTag保持同步

**阶段2**: 逐步迁移老功能到Tag
- 一个模块一个模块迁移
- 充分测试后上线
- 保持回滚能力

**阶段3**: 清理Domain（可选，长期）
- 所有功能完全迁移到Tag
- Domain表标记为deprecated
- 未来版本可考虑删除

---

## 十、监控与质量保障

### 10.1 关键指标

**性能指标**:
- 新闻AI分析耗时（目标: < 3秒）
- 标签匹配耗时（目标: < 500ms）
- 节点统计更新耗时（目标: < 1秒）
- API响应时间（目标: < 500ms）

**质量指标**:
- 标签匹配准确率（目标: > 85%）
- AI分析成功率（目标: > 95%）
- 节点关联覆盖率（目标: > 90%）
- 统计数据一致性（目标: > 99%）

**业务指标**:
- 新闻处理延迟（目标: < 10秒端到端）
- 每日处理新闻数
- 标签系统使用率
- 市场看板访问量

### 10.2 监控方案

**日志记录**:
```typescript
// 新闻处理日志
logger.info('news.analysis.start', { newsId, title })
logger.info('news.analysis.tags', { newsId, tags: extractedTags })
logger.info('news.analysis.nodes', { newsId, nodes: matchedNodes })
logger.info('news.analysis.complete', { newsId, duration })

// 错误日志
logger.error('news.analysis.failed', { newsId, error, stack })
logger.error('node.stats.update.failed', { nodeId, error })
```

**指标收集**:
```typescript
// Prometheus metrics
const newsProcessingDuration = new Histogram({
  name: 'news_processing_duration_seconds',
  help: 'News processing duration in seconds'
})

const tagMatchAccuracy = new Gauge({
  name: 'tag_match_accuracy',
  help: 'Tag matching accuracy rate'
})

const nodeStatsUpdateCounter = new Counter({
  name: 'node_stats_updates_total',
  help: 'Total number of node stats updates'
})
```

### 10.3 数据质量检查

**定时任务**:
```typescript
// 每日凌晨3点执行
async function dailyDataQualityCheck() {
  // 1. 检查统计数据一致性
  const inconsistentNodes = await checkNodeStatsConsistency()
  if (inconsistentNodes.length > 0) {
    logger.warn('node.stats.inconsistent', { count: inconsistentNodes.length })
    // 自动修复
    for (const nodeId of inconsistentNodes) {
      await updateNodeNewsStats(nodeId)
    }
  }
  
  // 2. 检查未关联标签的新闻
  const untaggedNews = await prisma.newsArticle.count({
    where: {
      aiProcessed: true,
      NOT: { tags: { some: {} } }
    }
  })
  logger.info('data.quality.untagged-news', { count: untaggedNews })
  
  // 3. 检查未绑定ETF的活跃节点
  const nodesWithoutETF = await prisma.graphNode.count({
    where: {
      level: { lte: 3 },
      NOT: { etfBindings: { some: {} } }
    }
  })
  logger.info('data.quality.nodes-without-etf', { count: nodesWithoutETF })
}
```

---

## 十一、风险与依赖

### 11.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| AI标签提取准确率不足 | 中 | 充分测试，优化prompt，人工审核机制 |
| 大量新闻实时处理性能瓶颈 | 高 | 异步队列，限流，批量处理 |
| 统计数据不一致 | 中 | 定时校准，事务保证，一致性检查 |
| Redis缓存失效影响性能 | 低 | 降级到数据库，缓存预热 |
| 数据库查询性能下降 | 中 | 索引优化，查询优化，读写分离 |

### 11.2 依赖条件

**外部依赖**:
- Claude API 额度充足（每日约1000-2000次调用）
- 数据服务稳定运行（市场数据获取）
- Redis服务可用（缓存和锁）

**内部依赖**:
- 现有新闻采集流程稳定
- 图谱节点数据完整
- ETF数据实时同步

### 11.3 回滚方案

**Phase 1 回滚**:
- 删除新增的表（保留数据库备份）
- 恢复原有Schema

**Phase 2 回滚**:
- 停用新闻AI分析的标签提取部分
- 继续使用旧的分类方式
- 保留已创建的关联数据

**Phase 3 回滚**:
- 隐藏市场数据页面的新模块
- 恢复原有展示方式

---

## 十二、总结

### 12.1 核心价值

1. **统一标签体系**: 打通新闻、图谱、市场数据的标签壁垒
2. **实时联动**: 新闻入库即关联图谱，统计数据实时更新
3. **全景视图**: 市场数据页面提供领域级别的综合视角
4. **数据闭环**: 新闻→标签→图谱→市场数据形成完整闭环

### 12.2 交付成果

- ✅ 统一的多层级标签系统
- ✅ 新闻与图谱节点的实时关联
- ✅ 图谱节点与ETF的多对多绑定
- ✅ 市场数据页面的领域看板
- ✅ 完整的数据迁移方案
- ✅ 性能优化和监控体系

### 12.3 后续扩展

**短期（1-2个月）**:
- 标签推荐系统（基于用户行为）
- 自定义标签关注
- 标签热度趋势分析

**中期（3-6个月）**:
- 跨标签关联发现
- 标签网络可视化
- 智能标签修正

**长期（6个月+）**:
- 标签演化追踪
- 知识图谱自动扩展
- 预测性标签推断

---

**设计完成日期**: 2026-08-01  
**预计开始日期**: 2026-08-05  
**预计完成日期**: 2026-09-01
