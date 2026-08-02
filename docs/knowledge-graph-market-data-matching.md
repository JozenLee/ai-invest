# 知识图谱节点与市场数据匹配流程分析报告

生成时间：2026-08-01

## 📋 目录
1. [完整匹配流程](#完整匹配流程)
2. [数据源详解](#数据源详解)
3. [当前问题分析](#当前问题分析)
4. [已实施的修复](#已实施的修复)
5. [后续改进建议](#后续改进建议)

---

## 完整匹配流程

### 1. 触发时机
用户在知识图谱页面（`/graph/explore`）点击节点时触发：

```typescript
// 文件：src/app/(dashboard)/graph/explore/page.tsx:214-233
const handleNodeClick = async (node: any) => {
  setSelectedNode(node)
  
  if (node?.id && showMarketData) {
    setLoadingMarketData(true)
    const response = await fetch(`/api/graph/nodes/${node.id}/market-data`)
    const result = await response.json()
    if (result.success && result.data?.marketData) {
      setSelectedNodeMarketData(result.data.marketData)
    }
  }
}
```

### 2. API 处理流程
```
用户点击节点
    ↓
GET /api/graph/nodes/{id}/market-data
    ↓
调用 graphService.getNode(id) 获取节点基础数据
    ↓
调用 graphMarketDataService.enhanceNode(node)
    ↓
依次尝试6种数据源匹配
    ↓
返回增强后的节点数据（包含 marketData）
    ↓
前端渲染市场数据面板
```

### 3. 核心服务
**文件**：`src/lib/services/graph-market-data.service.ts`

`enhanceNode()` 方法按以下顺序匹配数据：

---

## 数据源详解

### 数据源 1：指数表现数据 (indexPerformance)

**匹配条件**：
- `node.type === 'index'` 或
- `node.metadata.relatedIndex` 存在

**匹配逻辑**：
```typescript
// 1. 如果是指数类型节点，通过硬编码映射
const indexMapping = {
  '沪深300': '000300',
  '科创50': '000688',
  '中证半导体': '931865',
  '中证人工智能': '930713',
  '中证通信设备': '931160',
}

// 2. 从 metadata 提取指数代码
const metadata = JSON.parse(node.metadata)
const indexCode = metadata.relatedIndex

// 3. 查询数据库
const records = await prisma.indexDaily.findMany({
  where: { code: indexCode },
  orderBy: { date: 'desc' },
  take: 30
})

// 4. 计算涨跌幅
return {
  code: indexCode,
  name: latest.name,
  changePct1d: latest.changePct,
  changePct5d: (latest.close - day5.close) / day5.close * 100,
  changePct30d: (latest.close - day30.close) / day30.close * 100,
  volume: latest.volume,
}
```

**当前状态**：
- ❌ `indexDaily` 表为空（0条数据）
- ⚠️ 硬编码映射只覆盖5个指数
- ⚠️ 大部分节点没有 `metadata.relatedIndex`

---

### 数据源 2：ETF 跟踪数据 (etfTracking)

**匹配条件**：
- `node.metadata.trackingETFs` 存在

**匹配逻辑**：
```typescript
// 1. 从 metadata 提取 ETF 列表
const metadata = JSON.parse(node.metadata)
const etfTickers = metadata.trackingETFs.map(etf => etf.ticker)

// 2. 查询每个 ETF 的数据
const etfData = await Promise.all(
  etfTickers.map(async (ticker) => {
    const records = await prisma.eTFDaily.findMany({
      where: { ticker },
      orderBy: { date: 'desc' },
      take: 30
    })
    
    return {
      ticker,
      name: latest.name,
      changePct1d: (latest.close - day1.close) / day1.close * 100,
      changePct5d: (latest.close - day5.close) / day5.close * 100,
      premium: latest.premium,
      totalAssets: latest.shares * latest.close / 10000,
      inflow5d: records.slice(0,5).reduce((sum, r) => sum + r.amount, 0) / 100000000
    }
  })
)
```

**当前状态**：
- ✅ `eTFDaily` 表有88条数据
- ⚠️ 只有37个节点（29.8%）有 metadata
- ⚠️ 有 metadata 的节点中，不是所有都有 `trackingETFs`

---

### 数据源 3：资金流向数据 (capitalFlow)

**匹配条件**：
- 节点类型能映射到板块名称

**匹配逻辑**：
```typescript
// 1. 映射节点类型到板块名称
const sectorName = this.mapNodeToSector(node)

// 2. 查询板块资金流向
const flows = await prisma.sectorCapitalFlow.findMany({
  where: { sector: sectorName },
  orderBy: { date: 'desc' },
  take: 5
})

// 3. 计算资金指标
return {
  mainForceNet1d: latest.mainForceNet,
  mainForceNet5d: flows.reduce((sum, f) => sum + f.mainForceNet, 0),
  retailNet1d: latest.retailNet,
  sentiment: this.calculateSentiment(flows),
  consecutiveDays: latest.consecutiveDays,
}
```

**当前状态（修复前）**：
- ❌ 原映射表只支持8种类型
- ❌ 实际节点类型（ai_index, nev_l2等）完全不匹配
- ❌ 0个节点能映射到板块

**当前状态（修复后）**：
- ✅ 已扩展映射表，支持所有节点类型
- ✅ 添加基于名称的模糊匹配
- ⚠️ `sectorCapitalFlow` 表只有7条数据

---

### 数据源 4：新闻热度数据 (newsHeat)

**匹配条件**：
- 节点在 `newsGraphLink` 表中有关联

**匹配逻辑**：
```typescript
// 1. 读取节点的新闻统计字段
const count7d = node.newsCount7d || 0
const count30d = node.newsCount30d || 0

// 2. 查询关联新闻
const recentNews = await prisma.newsGraphLink.findMany({
  where: {
    nodeId: node.id,
    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  },
  include: { news: true },
  take: 50
})

// 3. 计算情感得分
const sentiments = recentNews.map(link => link.news.sentiment).filter(s => s !== null)
const sentimentScore = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length

// 4. 判断是否热点
const trending = count7d > 10 && (count7d / (count30d / 30 * 7)) > 1.5

return {
  count7d,
  count30d,
  sentimentScore,
  sentimentLabel: sentimentScore > 0.3 ? 'bullish' : sentimentScore < -0.3 ? 'bearish' : 'neutral',
  trending,
  topKeywords: extractTopKeywords(recentNews),
}
```

**当前状态**：
- ✅ `newsGraphLink` 表有111条关联
- ✅ 至少10个节点有新闻数据
- ✅ 这是目前**最有效**的数据源

---

### 数据源 5：市场认知指标 (marketCognition)

**匹配条件**：
- 任何节点（基于新闻数量估算）

**匹配逻辑**：
```typescript
// 简化实现：基于新闻数量估算
return {
  institutionalAttention: Math.min(100, (node.newsCount30d || 0) * 2),
  retailAttention: Math.min(100, (node.newsCount7d || 0) * 5),
  analystCoverage: undefined,  // 需要第三方数据
  searchIndex: undefined,       // 需要搜索引擎API
  socialMentions: undefined,    // 需要社交媒体API
}
```

**当前状态**：
- ⚠️ 这是**估算值**，不是真实数据
- ⚠️ 需要集成第三方数据源才能获取真实数据

---

### 数据源 6：AI算力特定指标 (aiComputeMetrics)

**匹配条件**：
```typescript
const aiComputeTypes = [
  'chip_design', 'memory', 'server', 'cooling', 'data_center',
  'networking', 'optical_module', 'cpo', 'pcb', 'power'
]
return aiComputeTypes.includes(node.type) ||
       node.name.includes('AI') ||
       node.name.includes('算力') ||
       node.name.includes('GPU')
```

**匹配逻辑**：
```typescript
// 1. 查询节点相关新闻（30日内）
const recentNews = await prisma.newsGraphLink.findMany({
  where: {
    nodeId: node.id,
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  },
  include: { news: true },
  take: 100
})

// 2. 基于关键词分析新闻内容
const supplyKeywords = ['缺货', '供不应求', '紧缺', '涨价', '抢购']
const supplyMentions = recentNews.filter(link =>
  supplyKeywords.some(kw => link.news.content.includes(kw) || link.news.title.includes(kw))
).length

return {
  gpuSupplyTightness: Math.min(100, supplyMentions * 10),
  hbmSupplyStatus: 'tight',  // 硬编码
  nvidiaCycle: this.inferNvidiaCycle(recentNews),
  hyperscalerDemand: 'strong',  // 硬编码
}
```

**当前状态**：
- ⚠️ 基于**启发式方法**，不是精确数据
- ⚠️ 部分值是硬编码的
- ⚠️ 依赖新闻关键词分析，准确性有限

---

## 当前问题分析

### 📊 数据覆盖统计

| 指标 | 数值 | 说明 |
|------|------|------|
| 节点总数 | 124 | 全部知识图谱节点 |
| 有 metadata 的节点 | 37 (29.8%) | ⚠️ 覆盖率低 |
| 可映射到板块的节点（修复前） | 0 (0%) | ❌ 完全无法匹配 |
| 可映射到板块的节点（修复后） | ~124 (100%) | ✅ 已修复 |
| 有新闻关联的节点 | ~10 | ✅ 部分有效 |
| indexDaily 数据 | 0 条 | ❌ 表为空 |
| eTFDaily 数据 | 88 条 | ✅ 有数据 |
| sectorCapitalFlow 数据 | 7 条 | ⚠️ 数据很少 |
| newsGraphLink 关联 | 111 条 | ✅ 有关联 |

### 🔴 关键问题列表

#### 问题1：indexDaily 表为空 ⚠️ 高优先级
- **影响**：所有节点都无法获取指数表现数据
- **原因**：数据采集任务未运行或失败
- **解决方案**：
  - 检查 `scripts/fetch-index-data.ts`（如果存在）
  - 运行数据采集任务填充 `indexDaily` 表
  - 设置定时任务每日更新

#### 问题2：节点 metadata 覆盖率低 ⚠️ 高优先级
- **影响**：70% 的节点无法匹配 ETF 和指数
- **原因**：节点创建时未填充 metadata
- **解决方案**：
  - 创建脚本批量补充 metadata
  - 修改节点创建流程，强制填充 metadata

#### 问题3：sectorCapitalFlow 数据太少 ⚠️ 中优先级
- **影响**：大部分板块无法获取资金流向
- **原因**：数据采集不完整
- **解决方案**：
  - 扩展数据采集范围，覆盖所有板块
  - 检查数据源API是否正常

#### 问题4：节点类型映射不全 ✅ 已修复
- **影响**：0个节点能映射到板块
- **原因**：硬编码映射表只支持8种类型
- **解决方案**：✅ 已扩展映射表到70+种类型，添加模糊匹配

---

## 已实施的修复

### ✅ 修复1：扩展节点类型到板块的映射

**文件**：`src/lib/services/graph-market-data.service.ts`

**修改内容**：
1. 扩展 `typeMapping` 从 8 种类型到 70+ 种类型
2. 添加基于节点名称的模糊匹配（正则表达式）
3. 支持从 `metadata.sector` 读取自定义板块

**效果**：
- ✅ 覆盖率从 0% 提升到 ~100%
- ✅ 所有节点类型都能映射到板块
- ✅ 支持未来新增节点类型（通过名称匹配）

**示例**：
```typescript
// 修复前
const mapping = {
  'chip_design': '芯片',
  'memory': '存储芯片',
  // ... 只有8种
}
// 结果：ai_index, nev_l2 等类型 → null

// 修复后
const typeMapping = {
  'chip_design': '芯片',
  'ai_index': '人工智能',
  'nev_l2': '汽车',
  // ... 70+ 种类型
}
// + 模糊匹配
if (/芯片|半导体|GPU/.test(node.name)) return '芯片'
// 结果：所有节点都能匹配到板块
```

---

## 后续改进建议

### 🚀 短期改进（1-2周）

#### 1. 填充 indexDaily 表数据 ⚠️ 最高优先级
```bash
# 创建数据采集任务
npm run fetch:index-data

# 设置定时任务（每日收盘后）
cron: 0 16 * * 1-5  # 周一到周五下午4点
```

#### 2. 批量补充节点 metadata
创建脚本 `scripts/enrich-node-metadata.ts`：
```typescript
// 为所有节点补充 metadata.relatedIndex 和 metadata.trackingETFs
const nodesToEnrich = await prisma.graphNode.findMany({
  where: { metadata: null }
})

for (const node of nodesToEnrich) {
  // 根据节点类型和名称推断指数和ETF
  const metadata = inferMetadata(node)
  await prisma.graphNode.update({
    where: { id: node.id },
    data: { metadata }
  })
}
```

#### 3. 扩展 sectorCapitalFlow 数据采集
```typescript
// 确保覆盖所有板块
const allSectors = [
  '芯片', '存储芯片', '服务器', '散热', '数据中心',
  '光模块', '光通信', '通信设备', '人工智能', '医药生物',
  '电子', '电力设备', '汽车', '机械设备', '国防军工', '基础化工',
  // ... 更多板块
]
```

### 🎯 中期改进（1-2月）

#### 4. 集成真实的市场认知数据
- 接入百度指数API（搜索热度）
- 接入雪球/东方财富API（社交提及数）
- 接入Wind/同花顺API（分析师覆盖）

#### 5. 优化 AI 算力指标算法
- 使用 NLP 模型提取关键信息（替代关键词匹配）
- 集成行业报告数据源
- 建立指标历史趋势分析

#### 6. 添加数据缓存机制
```typescript
// 市场数据不需要每次都实时查询
const cacheKey = `market-data:${node.id}`
const cached = await redis.get(cacheKey)
if (cached) return JSON.parse(cached)

const marketData = await this.fetchMarketData(node)
await redis.setex(cacheKey, 300, JSON.stringify(marketData)) // 缓存5分钟
```

### 🔮 长期改进（3-6月）

#### 7. 建立数据质量监控
- 监控各数据源的覆盖率
- 监控数据更新时效性
- 异常数据告警

#### 8. 个性化推荐算法
- 根据用户浏览历史推荐节点
- 基于市场数据变化推送热点节点

#### 9. 多维度数据可视化
- 时间序列图表（指数走势）
- 资金流向桑基图
- 节点重要性热力图

---

## 检查工具

### 运行覆盖率检查
```bash
# 检查市场数据覆盖情况
npx tsx scripts/check-market-data-coverage.ts

# 输出示例：
# ✅ 可映射到板块的节点: 124/124 (100%)
# ⚠️ indexDaily 表为空
# ✅ 有新闻关联: 10 个节点
```

### 测试单个节点
```bash
# 测试节点市场数据匹配
curl http://localhost:3000/api/graph/nodes/{nodeId}/market-data
```

---

## 相关文件

### 核心代码
- `src/lib/services/graph-market-data.service.ts` - 市场数据服务
- `src/app/api/graph/nodes/[id]/market-data/route.ts` - API路由
- `src/app/(dashboard)/graph/explore/page.tsx` - 前端页面
- `src/components/graph/MarketDataPanel.tsx` - 市场数据面板组件

### 工具脚本
- `scripts/check-market-data-coverage.ts` - 覆盖率检查
- `scripts/test-graph-market-data.ts` - 测试脚本（如果存在）

### 数据库表
- `GraphNode` - 节点表
- `indexDaily` - 指数日行情
- `eTFDaily` - ETF日行情
- `sectorCapitalFlow` - 板块资金流向
- `newsGraphLink` - 新闻-节点关联表

---

## 总结

### 修复前的状态
- ❌ 0% 的节点能获取资金流向数据
- ❌ 0% 的节点能获取指数表现数据
- ⚠️ 只有 ~30% 的节点能获取 ETF 数据
- ✅ ~8% 的节点能获取新闻热度数据

### 修复后的状态
- ✅ 100% 的节点能映射到板块（资金流向匹配前置条件满足）
- ❌ 0% 的节点能获取指数表现数据（indexDaily 表为空）
- ⚠️ 只有 ~30% 的节点能获取 ETF 数据（metadata 覆盖不足）
- ✅ ~8% 的节点能获取新闻热度数据

### 最关键的下一步
1. **填充 indexDaily 表** - 解锁指数表现数据
2. **批量补充 metadata** - 提升 ETF 数据覆盖率
3. **扩展 sectorCapitalFlow 数据** - 让资金流向真正生效

---

**文档维护**：请在修复问题或添加新功能后更新此文档
