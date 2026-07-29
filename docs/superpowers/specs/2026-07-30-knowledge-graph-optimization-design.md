# 知识图谱优化设计方案

**日期**: 2026-07-30  
**状态**: 待审核  
**优先级**: P0

## 1. 背景与目标

### 1.1 现状问题

当前知识图谱系统存在以下问题：

1. **数据质量问题**
   - 节点关系权重、传导方向标注不准确
   - 缺乏自动化数据来源，完全依赖手动维护

2. **集成不足**
   - 与新闻流脱节，无法自动关联新闻到图谱节点
   - 与事件分析脱节，无法基于图谱进行影响传导分析
   - 与ETF分析脱节，缺少产业链视角

3. **可视化体验差**
   - 布局算法不理想，节点重叠、层次不清
   - 交互功能不足，缺少筛选、路径探索等
   - 信息展示单一，无法看到实时状态和趋势
   - 缺少多视角切换

### 1.2 优化目标

按优先级排序：

1. **P0 - 数据准确性和自动化构建**：建立AI辅助的图谱构建pipeline
2. **P1 - 智能集成**：新闻自动标注、事件影响分析
3. **P2 - 可视化增强**：改进布局、增强交互、多视角
4. **P3 - ETF集成**：图谱视角的ETF分析

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Knowledge Graph System                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Phase 1: Graph Builder Pipeline                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ Data Sources │──>│  Extractors  │──>│   Reviewers  │    │
│  │ • 研报       │   │ • AI抽取     │   │ • 审核队列   │    │
│  │ • 新闻       │   │ • 规则引擎   │   │ • 批量应用   │    │
│  │ • 市场数据   │   │ • 多源融合   │   │              │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│                                                               │
│  Phase 2: Intelligence Layer                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ News Linker  │   │Event Analyzer│   │State Updater │    │
│  │ 新闻自动标注 │   │事件影响分析  │   │状态动态更新  │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│                                                               │
│  Phase 3: Visualization                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ Layout Engine│   │ Interactions │   │ Multi-Views  │    │
│  │ 分层布局     │   │ 路径探索     │   │ 多视角切换   │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│                                                               │
│  Phase 4: ETF Integration                                    │
│  ┌──────────────┐   ┌──────────────┐                        │
│  │ ETF Mapper   │   │Graph Analysis│                        │
│  │ 持仓映射     │   │产业链评估    │                        │
│  └──────────────┘   └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## 3. Phase 1: 图谱构建Pipeline（2-3周）

### 3.1 AI抽取器

**技术方案**: 使用Claude Opus 5进行文本分析和实体关系抽取

**核心接口**:

```typescript
interface ExtractionInput {
  text: string
  type: 'report' | 'news' | 'article'
  metadata?: {
    title?: string
    source?: string
    publishDate?: Date
  }
}

interface ExtractedEntity {
  name: string
  type: NodeType
  description?: string
  confidence: number
  evidence: string[]
}

interface ExtractedRelation {
  source: string
  target: string
  relation: RelationType
  weight: number
  direction: 'positive' | 'negative'
  confidence: number
  evidence: string[]
  lag?: string
}

interface ExtractionResult {
  entities: ExtractedEntity[]
  relations: ExtractedRelation[]
  summary: string
}
```

**实现要点**:
- 使用结构化输出（JSON Schema）确保结果一致性
- Temperature设为0.3，降低随机性
- 要求AI提供置信度和支撑证据
- 每次抽取记录token使用量和耗时

### 3.2 多数据源适配器

**支持的数据源**:

1. **行业研报抓取器** (`data-service/extractors/report_extractor.py`)
   - PDF转文本
   - 章节分割
   - 关键段落识别

2. **市场数据融合器** (`src/lib/services/market-data-fusion.service.ts`)
   - 价格相关性分析 → 调整边权重
   - 资金流联动性 → 调整边权重
   - 新闻热度统计 → 更新节点动量

3. **专家规则引擎** (`src/lib/services/graph-rule-engine.service.ts`)
   - Validation规则：检查数据一致性
   - Inference规则：推断间接关系
   - Constraint规则：强制约束

**规则示例**:

```typescript
const RULES: GraphRule[] = [
  {
    id: 'rule_001',
    name: '供应链传导方向检查',
    type: 'validation',
    condition: 'edge.relation === "supply_chain" && edge.direction === "negative"',
    action: 'reject',
    priority: 10
  },
  {
    id: 'rule_002',
    name: '自动推断间接关系',
    type: 'inference',
    condition: 'existsPath(A, B) && existsPath(B, C) && !existsEdge(A, C)',
    action: 'suggestEdge(A, C, {relation: "indirect_supply", confidence: 0.6})',
    priority: 5
  }
]
```

### 3.3 审核工作流

**数据模型扩展**:

```prisma
model GraphSuggestion {
  id          String   @id @default(cuid())
  type        String   // add_node, update_node, add_edge, update_edge
  targetType  String   // node, edge
  targetId    String?
  
  data        String   // JSON: 建议的数据内容
  confidence  Float
  
  source      String   // ai_extraction, rule_inference, market_data
  sourceRef   String?
  evidence    String?  // JSON
  
  status      String   @default("pending")
  reviewedBy  String?
  reviewedAt  DateTime?
  reviewNote  String?
  appliedAt   DateTime?
  
  createdAt   DateTime @default(now())
  
  @@index([status, createdAt])
}

model GraphExtractionJob {
  id            String   @id @default(cuid())
  sourceType    String
  sourceId      String?
  sourceUrl     String?
  sourceText    String?
  
  status        String   @default("pending")
  extractedData String?
  suggestionsCreated Int @default(0)
  
  tokensUsed    Int?
  durationMs    Int?
  errorMessage  String?
  
  createdAt     DateTime @default(now())
  completedAt   DateTime?
  
  @@index([status, createdAt])
}
```

**API端点**:

- `GET /api/graph/suggestions` - 获取待审核建议列表
- `POST /api/graph/suggestions/batch` - 批量审核
- `PATCH /api/graph/suggestions/[id]` - 单个审核
- `POST /api/graph/extract` - 触发抽取任务

**UI组件**: `/graph/review` 审核工作台

### 3.4 工作流程

```
数据源 → AI抽取 → 规则验证 → 生成建议 → 人工审核 → 应用到图谱
  ↓        ↓         ↓          ↓          ↓           ↓
研报     Claude    规则引擎   Suggestion  Web界面   GraphNode/Edge
新闻     分析      验证推理   pending状态  批量操作   + ChangeLog
市场数据
```

## 4. Phase 2: 智能集成层（2周）

### 4.1 新闻自动标注

**功能**: 新闻采集后自动识别涉及的图谱节点

**数据模型**:

```prisma
model NewsGraphLink {
  id          String   @id @default(cuid())
  newsId      String
  nodeId      String
  relevance   Float    // 0-1
  sentiment   String   // positive, neutral, negative
  impactType  String   // direct, indirect
  keyMentions String?  // JSON
  createdAt   DateTime @default(now())
  
  news        NewsArticle @relation(fields: [newsId], references: [id], onDelete: Cascade)
  node        GraphNode   @relation(fields: [nodeId], references: [id])
  
  @@unique([newsId, nodeId])
  @@index([nodeId, createdAt])
}

// 扩展 GraphNode
model GraphNode {
  // ... 现有字段
  
  newsCount7d    Int      @default(0)
  newsCount30d   Int      @default(0)
  sentimentScore Float?   // -1~+1
  lastNewsAt     DateTime?
  
  newsLinks      NewsGraphLink[]
}
```

**处理流程**:

1. 新闻采集后触发 `NewsGraphLinker.linkNewsToGraph(newsId)`
2. AI分析新闻涉及的产业链环节（直接、间接）
3. 匹配图谱节点，计算相关度和情绪
4. 存储关联关系到 `NewsGraphLink`
5. 更新节点统计字段（newsCount7d等）

### 4.2 事件影响分析增强

**功能**: 基于图谱传导路径，分析事件影响范围

**核心能力**:

1. **传导路径计算**: 从起始节点BFS扩展，最大深度4
2. **AI增强分析**: 评估每条路径的合理性和影响程度
3. **板块聚合**: 将节点级影响聚合到板块
4. **ETF映射**: 计算对ETF的影响
5. **可视化数据**: 生成高亮节点、边、热力图

**API端点**:

- `POST /api/events/analyze-impact` - 分析事件影响
- `GET /api/events/[id]/impact` - 获取已分析的影响结果

**输出结构**:

```typescript
interface ImpactAnalysisResult {
  trigger: {
    event: string
    sourceNodes: GraphNode[]
    impactDirection: 'positive' | 'negative'
    magnitude: number
  }
  
  propagationPaths: Array<{
    path: string[]
    edges: GraphEdge[]
    totalLag: string
    finalImpact: {
      nodeId: string
      nodeName: string
      impactScore: number  // -5 ~ +5
      confidence: number
      reasoning: string
    }
  }>
  
  affectedSectors: Array<{
    sectorName: string
    impactScore: number
    affectedNodes: string[]
    timeHorizon: string
  }>
  
  affectedETFs: Array<{
    ticker: string
    name: string
    exposure: number
    impactScore: number
    reasoning: string
  }>
  
  visualizationData: {
    highlightedNodes: string[]
    highlightedEdges: string[]
    heatmap: Record<string, number>
  }
}
```

### 4.3 图谱状态动态更新

**功能**: 定期更新节点的动量和周期位置

**计算逻辑**:

```typescript
// 动量计算 (-100 ~ +100)
momentum = 
  newsHeat * 0.4 +           // 新闻热度变化
  sentimentTrend * 0.3 +      // 情绪趋势
  marketMomentum * 0.3        // 市场动量（如有）

// 周期位置判断
if (momentum > 60 && increasing) → upturn
if (momentum > 60 && decreasing) → peak
if (momentum < 40 && decreasing) → downturn
if (momentum < 40 && increasing) → trough
```

**定时任务**: 每天凌晨2点执行

## 5. Phase 3: 可视化升级（1-2周）

### 5.1 改进布局算法

**方案**: 分层布局 + 力导向微调

**步骤**:

1. 按节点level分层
2. 每层内按type聚类
3. 计算初始位置（层间距均匀、层内间距合理）
4. 应用轻度力导向优化（100次迭代）

**实现**: `src/components/graph/layouts/hierarchical-layout.ts`

### 5.2 增强交互功能

**新增功能**:

1. **节点筛选**
   - 按类型筛选
   - 按动量范围筛选
   - 按周期位置筛选
   - 只显示有最近新闻的节点

2. **路径探索**
   - 点击两个节点，显示它们之间的所有路径
   - 路径高亮，显示传导关系

3. **邻居聚焦**
   - 选中节点后，只显示N度邻居
   - 其他节点淡化

4. **事件影响可视化**
   - 选择事件，自动高亮受影响节点
   - 热力图着色（影响程度）

### 5.3 信息叠加层

**在节点上叠加显示**:

- 动量指示器（颜色和数值）
- 新闻热度气泡（7天新闻数）
- 资金流向箭头（如有市场数据）
- 趋势图标（↑↓→）

### 5.4 多视角切换

**预定义视角**:

1. **全景视图**: 完整产业链，分层布局
2. **热点视图**: 只显示有新闻的节点，按热度着色
3. **周期视图**: 按周期位置分组，圆形布局
4. **动量视图**: 按动量排序，颜色渐变
5. **供应链视图**: 只显示供应链关系

## 6. Phase 4: ETF集成（1周）

### 6.1 ETF持仓映射

**功能**: 将ETF持仓映射到图谱节点

**步骤**:

1. 获取ETF持仓（个股 + 权重）
2. 查询 `GraphStock` 表，找到个股对应的节点
3. 按节点聚合权重：`nodeExposure = Σ(stockWeight * stockRelevance)`
4. 生成映射结果

### 6.2 图谱视角的ETF分析

**增强维度**:

1. **产业链覆盖度**: 覆盖多少节点，是否均衡
2. **周期风险**: 各周期位置的暴露度
3. **上下游平衡**: 是否过于集中在某个环节
4. **动量聚合**: 加权平均节点动量
5. **AI洞察**: 基于图谱视角的投资建议

**API集成**: 在现有 `/api/analysis/etf` 中增加 `graphPerspective` 字段

## 7. 数据库迁移

### 7.1 新增表

```sql
-- GraphSuggestion 表
CREATE TABLE GraphSuggestion (...)

-- GraphExtractionJob 表
CREATE TABLE GraphExtractionJob (...)

-- NewsGraphLink 表
CREATE TABLE NewsGraphLink (...)
```

### 7.2 扩展现有表

```sql
-- GraphNode 增加统计字段
ALTER TABLE GraphNode ADD COLUMN newsCount7d INTEGER DEFAULT 0;
ALTER TABLE GraphNode ADD COLUMN newsCount30d INTEGER DEFAULT 0;
ALTER TABLE GraphNode ADD COLUMN sentimentScore REAL;
ALTER TABLE GraphNode ADD COLUMN lastNewsAt DATETIME;
```

## 8. API端点清单

### 8.1 新增端点

**Phase 1 - 图谱构建**:
- `POST /api/graph/extract` - 触发AI抽取任务
- `GET /api/graph/suggestions` - 获取建议列表
- `POST /api/graph/suggestions/batch` - 批量审核
- `PATCH /api/graph/suggestions/[id]` - 单个审核
- `GET /api/graph/extraction-jobs` - 获取抽取任务列表

**Phase 2 - 智能集成**:
- `POST /api/news/[id]/link-graph` - 手动触发新闻关联
- `POST /api/events/analyze-impact` - 事件影响分析
- `GET /api/events/[id]/impact` - 获取影响结果
- `POST /api/graph/update-state` - 手动触发状态更新

**Phase 3 - 可视化**:
- `POST /api/graph/find-paths` - 查找两节点间路径
- `GET /api/graph/views` - 获取预定义视角列表
- `GET /api/graph/views/[id]` - 应用特定视角

**Phase 4 - ETF集成**:
- `GET /api/etf/[ticker]/graph-mapping` - ETF持仓映射

### 8.2 修改现有端点

- `POST /api/analysis/etf` - 增加 `graphPerspective` 字段

## 9. 前端组件清单

### 9.1 新增页面

- `/graph/review` - 审核工作台
- `/graph/extraction` - 抽取任务管理

### 9.2 新增组件

**Phase 1**:
- `<SuggestionList />` - 建议列表
- `<SuggestionDetail />` - 建议详情
- `<SuggestionBatchActions />` - 批量操作
- `<ExtractionJobMonitor />` - 任务监控

**Phase 3**:
- `<GraphToolbar />` - 工具栏（筛选、视角切换）
- `<GraphFilters />` - 筛选面板
- `<PathExplorer />` - 路径探索
- `<NodeOverlay />` - 节点信息叠加
- `<GraphViewSwitcher />` - 视角切换器
- `<HierarchicalLayout />` - 分层布局组件

### 9.3 修改现有组件

- `<ForceGraph />` - 增加高亮、热力图支持
- `src/app/(dashboard)/graph/explore/page.tsx` - 集成新交互功能

## 10. 实施顺序与里程碑

### Week 1-2: Phase 1 核心（图谱构建Pipeline）

**里程碑**: 能够从研报中自动抽取实体和关系，生成审核建议

- [ ] 数据库迁移：新增表
- [ ] AI抽取器服务
- [ ] 规则引擎基础框架
- [ ] 审核API端点
- [ ] 审核工作台UI（基础版）

### Week 3: Phase 1 完善 + Phase 2 开始

**里程碑**: 审核流程完整可用，新闻开始自动关联图谱

- [ ] 多数据源适配器（研报抓取）
- [ ] 市场数据融合逻辑
- [ ] 新闻图谱关联服务
- [ ] NewsGraphLink数据模型
- [ ] 自动关联trigger集成

### Week 4: Phase 2 完成

**里程碑**: 事件影响分析可用，图谱状态每日更新

- [ ] 事件影响分析API
- [ ] 图谱状态更新服务
- [ ] 定时任务配置
- [ ] 影响分析结果展示UI

### Week 5: Phase 3 布局和交互

**里程碑**: 可视化体验显著提升

- [ ] 分层布局算法
- [ ] 节点筛选功能
- [ ] 路径探索功能
- [ ] 邻居聚焦功能

### Week 6: Phase 3 完善

**里程碑**: 多视角和信息叠加完成

- [ ] 信息叠加层
- [ ] 多视角切换
- [ ] 事件影响可视化集成

### Week 7: Phase 4 ETF集成

**里程碑**: ETF分析融入图谱视角

- [ ] ETF持仓映射服务
- [ ] 图谱视角ETF分析
- [ ] API集成
- [ ] UI展示

### Week 8: 测试与优化

**里程碑**: 系统稳定，性能优化完成

- [ ] 端到端测试
- [ ] 性能优化（AI调用、数据库查询）
- [ ] 文档完善
- [ ] 用户指南

## 11. 技术风险与缓解

### 11.1 AI抽取准确性

**风险**: Claude抽取结果可能不准确，导致图谱质量下降

**缓解**:
- 使用结构化输出和低temperature提高一致性
- 要求提供置信度和证据，方便审核判断
- 引入规则引擎进行二次验证
- 保留人工审核环节，不自动应用低置信度建议

### 11.2 Token成本

**风险**: 大量AI调用导致成本过高

**缓解**:
- 对长文本进行预处理，只提取关键段落
- 批量处理，避免重复分析
- 缓存抽取结果，避免重复调用
- 监控token使用量，设置每日上限

### 11.3 性能问题

**风险**: 图谱规模增大后，查询和渲染变慢

**缓解**:
- 数据库索引优化
- 图谱查询结果缓存
- 前端虚拟化渲染（只渲染可见节点）
- 分层加载（先加载核心节点，按需加载细节）

### 11.4 数据一致性

**风险**: 多数据源可能产生冲突信息

**缓解**:
- 为每个建议记录来源和置信度
- 冲突时优先采用高置信度来源
- 人工审核时显示冲突信息
- 引入专家规则裁决冲突

## 12. 成功指标

### 12.1 数据质量指标

- 图谱节点数量：从当前水平增长至 **200+ 节点**
- 图谱边数量：从当前水平增长至 **500+ 边**
- 自动化覆盖率：**≥70%** 的节点和边来自自动抽取
- 审核通过率：AI建议的审核通过率 **≥60%**

### 12.2 集成效果指标

- 新闻关联率：**≥80%** 的新闻能关联到至少1个图谱节点
- 事件分析使用率：事件分析时 **100%** 生成图谱传导路径
- 状态更新频率：节点状态 **每日更新**

### 12.3 用户体验指标

- 图谱加载时间：**<2秒**
- 交互响应时间：**<500ms**
- 路径查询时间：**<1秒**
- 用户满意度：图谱可用性评分 **≥4/5**

## 13. 后续扩展方向

### 13.1 短期（3个月内）

- 支持更多数据源（公告、研报库API）
- 引入时间维度（图谱历史版本、时间轴播放）
- 增加社区发现算法（识别产业集群）

### 13.2 中期（6个月内）

- 图数据库迁移（Neo4j）以支持更复杂的图查询
- 知识推理引擎（自动推断隐含关系）
- 多人协作编辑（类似Wiki）

### 13.3 长期（1年内）

- 跨市场图谱（A股、港股、美股产业链联动）
- 实时图谱更新（基于新闻流实时更新）
- 图谱问答系统（自然语言查询图谱）

## 14. 附录

### 14.1 主流知识图谱构建方法

**1. 自顶向下（Top-down）**
- 专家定义本体（Ontology）
- 规则驱动的信息抽取
- 优点：质量高、结构清晰
- 缺点：构建慢、难以覆盖长尾

**2. 自底向上（Bottom-up）**
- 从数据中自动发现模式
- 机器学习驱动抽取
- 优点：覆盖面广、可扩展
- 缺点：噪音多、需要清洗

**3. 混合方法（Hybrid）** ← **本方案采用**
- 专家定义核心结构
- AI辅助扩展和维护
- 人机协作审核
- 多数据源融合

### 14.2 参考资料

- [Knowledge Graph Construction: A Survey](https://arxiv.org/abs/2010.05019)
- [OpenKG: 中文开放知识图谱](http://openkg.cn/)
- [Neo4j Graph Data Science](https://neo4j.com/docs/graph-data-science/)
- [D3.js Force Layout](https://d3js.org/d3-force)

---

**设计完成日期**: 2026-07-30  
**预计开发周期**: 6-8周  
**预计人力**: 1名全栈开发 + AI集成专家

