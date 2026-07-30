# 跨行业知识图谱与评分系统设计方案

## 文档信息

- **创建日期**: 2026-07-31
- **版本**: v1.0
- **状态**: Phase 1 设计完成

## 1. 项目背景

### 1.1 现状

当前系统已建立AI算力产业链的知识图谱，包含芯片设计、封装测试、服务器等细分领域。但仅覆盖单一产业链，无法满足多元化投资需求。

### 1.2 目标

构建横跨10个热门行业的知识图谱系统，结合市场数据和新闻舆情，建立综合评分机制，为投资决策提供量化洞察。

### 1.3 核心价值

- **全景视野**: 覆盖市场关注度最高的10个方向
- **量化评估**: 三维评分体系（市场+新闻+图谱结构）
- **智能推荐**: 自动生成投资信号和关注建议
- **传导分析**: 发现跨行业联动机会

## 2. 系统架构

### 2.1 架构模式：独立子图

采用独立子图模式，而非单一大图：

```
子图1: AI算力
子图2: 新能源汽车
子图3: 创新药/医疗器械
...
子图10: 消费

跨行业边: 少量精选的供需关系边
```

**优势**:
- 降低复杂度，每个子图可独立维护
- 提升查询性能，避免全图遍历
- 支持不同行业采用不同粒度
- 便于增量扩展

### 2.2 10个热门方向

基于市场关注度（交易量、新闻热度、散户关注）选择：

1. **AI算力** - AI芯片、服务器、数据中心（已有，需扩展）
2. **新能源汽车** - 整车、动力电池、智能驾驶
3. **创新药/医疗器械** - CXO、创新药、医疗设备
4. **消费电子** - 手机、AR/VR、消费芯片
5. **军工航天** - 军工电子、航空航天、北斗
6. **储能/电力设备** - 储能系统、特高压、电网
7. **机器人/自动化** - 工业机器人、人形机器人、减速器
8. **数字经济** - 云计算、网络安全、数据中心
9. **先进材料** - 第三代半导体、新材料、特种化工
10. **消费** - 食品饮料、零售、服务

### 2.3 子图结构设计

**设计原则**: 按行业特点 + 聚焦投资标的

**复杂产业链**（4-5层，15-30节点）:
```
AI算力、新能源汽车、创新药/医疗器械

示例（新能源汽车）:
Level 0: 新能源汽车指数
Level 1: 整车制造 | 动力电池 | 智能驾驶 | 充电桩
Level 2: 正极材料、负极材料、电解液、隔膜...
Level 3: 龙头企业节点
```

**简化结构**（2-3层，10-20节点）:
```
消费、数字经济

示例（消费）:
Level 0: 消费主题
Level 1: 食品饮料 | 零售 | 餐饮服务
Level 2: 白酒、啤酒、乳制品...
```

**映射到投资标的**: 每个L1/L2节点尽量关联到可投资的ETF代码

## 3. 评分系统设计

### 3.1 评分公式

```
总分(0-100) = 市场基本面(50分) + 新闻舆情面(30分) + 图谱结构面(20分)
```

### 3.2 各维度计算逻辑

#### 3.2.1 市场基本面 (50分)

**资金流向 (30分)**

```typescript
// 主力净流入占比得分 (0-20分)
mainFlowScore = normalize(主力净流入 / 总成交额) * 20

// 连续流入天数加成 (0-10分)
consecutiveDaysScore = min(连续流入天数 / 5, 1) * 10

资金流向得分 = mainFlowScore + consecutiveDaysScore
```

数据源: `SectorCapitalFlow` 表

**板块表现 (20分)**

```typescript
// 近5日涨跌幅排名 (0-10分)
// 按全市场板块涨跌幅排序，前10%得10分，后10%得0分
rankScore = (1 - 排名百分位) * 10

// 相对大盘超额收益 (0-10分)
excessReturn = (板块涨跌幅 - 沪深300涨跌幅) / 10% * 10
excessScore = clamp(excessReturn, 0, 10)

板块表现得分 = rankScore + excessScore
```

数据源: `ETFDaily`, `IndexDaily` 表

#### 3.2.2 新闻舆情面 (30分)

**新闻热度 (15分)**

```typescript
// 7日新闻数量归一化 (0-10分)
volumeScore = min(newsCount7d / 50, 1) * 10

// 重要新闻加权 (0-5分)
// impact字段: 1-5分，高影响力新闻权重更高
importanceScore = (重要新闻数 / 总新闻数) * 5

新闻热度得分 = volumeScore + importanceScore
```

数据源: `GraphNode.newsCount7d`, `NewsArticle.impact`

**情感得分 (15分)**

```typescript
// 平均sentiment (0-10分)
// sentiment字段: -1到+1，转换为0-10分
sentimentScore = (avgSentiment + 1) / 2 * 10

// 正面新闻占比 (0-5分)
positiveRatio = 正面新闻数 / 总新闻数
positiveScore = positiveRatio * 5

情感得分 = sentimentScore + positiveScore
```

数据源: `GraphNode.sentimentScore`, `NewsArticle.sentiment`

#### 3.2.3 图谱结构面 (20分)

**节点重要性 (12分)**

```typescript
// 入度得分 (0-6分)
// 入度表示被依赖程度，上游核心环节得分高
inDegreeScore = min(入度 / 5, 1) * 6

// 出度得分 (0-6分)
// 出度表示影响范围，需求驱动方得分高
outDegreeScore = min(出度 / 5, 1) * 6

节点重要性得分 = inDegreeScore + outDegreeScore
```

数据源: `GraphEdge` 表统计

**传导活跃度 (8分)**

```typescript
// 近7日作为传导路径起点/终点的次数
propagationCount = 作为源节点次数 + 作为目标节点次数
活跃度得分 = min(propagationCount / 10, 1) * 8
```

数据源: 传导分析API调用日志（需新增）

### 3.3 增量更新机制

**触发条件**:

1. **新闻接入** → 更新关联节点的新闻面评分
2. **市场数据刷新** → 每日收盘后更新市场面评分
3. **图谱结构变化** → 更新受影响节点的结构面评分
4. **传导分析执行** → 更新路径涉及节点的活跃度

**更新流程**:

```
事件触发
  ↓
识别受影响节点
  ↓
重算变化的维度（只算变化部分，避免全量重算）
  ↓
汇总总分
  ↓
检查信号阈值（是否触发投资信号）
  ↓
保存评分历史快照
  ↓
通知前端刷新
```

**性能优化**:

- 批量更新: 收集5分钟内的变更，批量处理
- 缓存策略: 市场面评分每日更新，可缓存
- 异步执行: 评分更新不阻塞主流程

## 4. 投资信号系统

### 4.1 信号类型

| 信号类型 | 触发条件 | 建议操作 | 优先级 |
|---------|---------|---------|-------|
| 强关注 | 评分从<70涨到≥80，且7日涨幅>15分 | 查看关联ETF，考虑建仓 | 高 |
| 持续热点 | 评分≥75维持5天以上 | 关注回调买入机会 | 中 |
| 降温预警 | 评分从≥80跌破70 | 考虑减仓或观望 | 中 |
| 跨行业联动 | 相关联的2个以上节点同时上涨 | 关注产业链传导机会 | 高 |

### 4.2 信号生命周期

```
触发 → 激活(active) → 用户确认(confirmed) / 忽略(dismissed) → 归档
```

- **激活**: 显示在Dashboard和信号列表
- **确认**: 用户标记已关注，可添加备注
- **忽略**: 用户认为不相关，不再提醒
- **自动过期**: 7天未操作的信号自动归档

### 4.3 信号展示位置

1. **Dashboard顶部** - "今日投资信号"卡片（最多5条）
2. **独立页面** - `/signals` 信号中心，支持筛选和历史查询
3. **侧边栏通知** - 实时推送新信号（可选）

## 5. 前端集成方案

### 5.1 新闻列表增强（打标签）

**位置**: `/events` 页面

**增强内容**:

```tsx
<NewsCard>
  <Title>{news.title}</Title>
  
  {/* 新增：图谱节点标签 */}
  <GraphNodeTags>
    <NodeTag 
      nodeName="AI服务器"
      scoreChange="+5"
      trend="up"
      onClick={() => navigateToNodeDetail(nodeId)}
    />
    <NodeTag 
      nodeName="GPU/AI芯片"
      scoreChange="+3"
      trend="up"
    />
  </GraphNodeTags>
  
  <Content>{news.summary}</Content>
</NewsCard>
```

**交互**:
- 点击标签跳转到节点详情页
- 鼠标悬停显示评分详情tooltip

### 5.2 综合仪表盘

**位置**: `/dashboard` 页面新增"知识图谱洞察"区块

**布局**:

```
┌─────────────────────────────────────────┐
│ 今日投资信号 (3条)                        │
├─────────────────────────────────────────┤
│ 热度上升TOP10节点                         │
│ [表格: 节点名 | 评分 | 变化 | ETF | 操作] │
├─────────────────────────────────────────┤
│ 评分变化趋势图                            │
│ [折线图: 支持多节点对比]                  │
├─────────────────────────────────────────┤
│ 跨行业传导热力图                          │
│ [矩阵: 10x10子图传导活跃度]              │
├─────────────────────────────────────────┤
│ 子图健康度总览                            │
│ [卡片网格: 10个子图的平均分和活跃节点数]  │
└─────────────────────────────────────────┘
```

### 5.3 节点详情页

**路由**: `/graph/nodes/[id]`

**内容**:

- 基本信息: 名称、子图、层级
- 评分卡片: 总分 + 三维明细
- 评分历史曲线: 30日趋势
- 关联ETF列表: 可点击跳转到ETF分析
- 相关新闻时间线: 按时间倒序
- 图谱关系: 上下游节点可视化

## 6. 数据模型

### 6.1 Schema扩展

**扩展 GraphNode 表**:

```prisma
model GraphNode {
  // ... 现有字段
  
  // 新增字段
  subGraphId       String?   // 所属子图ID: ai_compute, new_energy_vehicle等
  scoreComponents  String?   // JSON: {marketFundamental, newsSentiment, graphStructure}
  totalScore       Float     @default(0)  // 综合评分 0-100
  scoreUpdatedAt   DateTime?
  trendIndicator   String?   // up/down/stable
  
  scoreHistory     NodeScoreHistory[]
  signals          InvestmentSignal[]
}
```

**新增 SubGraph 表**:

```prisma
model SubGraph {
  id          String   @id  // ai_compute, new_energy_vehicle等
  name        String        // AI算力、新能源汽车等
  description String?
  category    String        // tech/manufacturing/consumer等
  sortOrder   Int     @default(0)
  isActive    Boolean @default(true)
  
  // 统计字段（缓存）
  nodeCount   Int     @default(0)
  avgScore    Float   @default(0)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([isActive, sortOrder])
}
```

**新增 NodeScoreHistory 表**:

```prisma
model NodeScoreHistory {
  id          String   @id @default(cuid())
  nodeId      String
  date        DateTime @default(now())
  totalScore  Float
  components  String   // JSON: 评分明细
  
  node        GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  @@unique([nodeId, date])
  @@index([nodeId, date])
}
```

**新增 InvestmentSignal 表**:

```prisma
model InvestmentSignal {
  id              String   @id @default(cuid())
  type            String   // strong_attention/sustained_hot/cooling_warning/cross_sector
  nodeId          String
  subGraphId      String
  triggeredAt     DateTime @default(now())
  currentScore    Float
  scoreChange     Float
  previousScore   Float?
  suggestedAction String
  relatedETFs     String?  // JSON array
  
  status          String   @default("active")  // active/confirmed/dismissed
  userNote        String?
  dismissedAt     DateTime?
  
  node            GraphNode @relation(fields: [nodeId], references: [id])
  
  @@index([status, triggeredAt])
  @@index([nodeId])
  @@index([type])
}
```

**扩展 GraphEdge 表**:

```prisma
model GraphEdge {
  // ... 现有字段
  
  isCrossGraph Boolean @default(false)  // 标记跨行业边
}
```

### 6.2 种子数据结构

**SubGraph 种子数据** (10个子图):

```typescript
const subGraphs = [
  {
    id: 'ai_compute',
    name: 'AI算力',
    description: 'AI芯片、服务器、数据中心产业链',
    category: 'tech',
    sortOrder: 1
  },
  {
    id: 'new_energy_vehicle',
    name: '新能源汽车',
    description: '整车、动力电池、智能驾驶产业链',
    category: 'manufacturing',
    sortOrder: 2
  },
  // ... 其余8个
]
```

**Phase 1 重点构建3个子图**:

1. **AI算力** - 扩展现有节点，补充缺失环节
2. **新能源汽车** - 全新构建
3. **消费** - 全新构建（简化结构）

## 7. API设计

### 7.1 评分相关

**获取节点评分详情**:

```
GET /api/graph/nodes/[id]/score

Response:
{
  nodeId: string
  nodeName: string
  subGraphId: string
  totalScore: number
  scoreComponents: {
    marketFundamental: number
    newsSentiment: number
    graphStructure: number
  }
  trendIndicator: 'up' | 'down' | 'stable'
  scoreHistory: Array<{date: string, score: number}>
  relatedETFs: Array<{ticker: string, name: string}>
}
```

**获取评分排行榜**:

```
GET /api/graph/scores/ranking
Query: ?subGraphId=ai_compute&limit=10&sortBy=totalScore&trend=up

Response:
{
  nodes: Array<NodeScoreDTO>
  total: number
}
```

**触发评分更新（内部API）**:

```
POST /api/graph/scores/update
Body:
{
  nodeIds: string[]
  trigger: 'news' | 'market' | 'structure'
}
```

### 7.2 投资信号相关

**获取投资信号列表**:

```
GET /api/signals
Query: ?status=active&type=strong_attention&limit=20

Response:
{
  signals: Array<{
    id: string
    type: string
    nodeId: string
    nodeName: string
    subGraphId: string
    triggeredAt: string
    currentScore: number
    scoreChange: number
    suggestedAction: string
    relatedETFs: string[]
    status: string
  }>
  total: number
}
```

**确认/忽略信号**:

```
PATCH /api/signals/[id]
Body:
{
  status: 'confirmed' | 'dismissed'
  userNote?: string
}
```

### 7.3 仪表盘数据聚合

**获取图谱洞察数据**:

```
GET /api/dashboard/graph-insights

Response:
{
  topRisingNodes: Array<NodeScoreDTO>
  subGraphHealth: Array<{
    subGraphId: string
    name: string
    avgScore: number
    activeNodeCount: number
    signalCount: number
  }>
  crossSectorHeatmap: Array<{
    sourceGraph: string
    targetGraph: string
    propagationCount: number
  }>
  activeSignals: Array<SignalDTO>
}
```

## 8. 核心服务设计

### 8.1 ScoreCalculator 服务

```typescript
class ScoreCalculatorService {
  // 计算市场基本面评分
  async calculateMarketScore(nodeId: string): Promise<number>
  
  // 计算新闻舆情面评分
  async calculateNewsScore(nodeId: string): Promise<number>
  
  // 计算图谱结构面评分
  async calculateGraphScore(nodeId: string): Promise<number>
  
  // 计算总分
  async calculateTotalScore(nodeId: string): Promise<ScoreComponents>
}
```

### 8.2 ScoreUpdater 服务

```typescript
class ScoreUpdaterService {
  // 增量更新节点评分
  async updateNodeScore(nodeId: string, trigger: TriggerType): Promise<void>
  
  // 批量更新节点评分
  async batchUpdateScores(nodeIds: string[], trigger: TriggerType): Promise<void>
  
  // 保存评分历史快照
  async saveScoreSnapshot(nodeId: string, score: ScoreComponents): Promise<void>
  
  // 检查并生成投资信号
  async checkAndGenerateSignals(nodeId: string, oldScore: number, newScore: number): Promise<void>
}
```

### 8.3 SignalGenerator 服务

```typescript
class SignalGeneratorService {
  // 检测强关注信号
  detectStrongAttention(node: GraphNode, scoreHistory: ScoreHistory[]): Signal | null
  
  // 检测持续热点信号
  detectSustainedHot(node: GraphNode, scoreHistory: ScoreHistory[]): Signal | null
  
  // 检测降温预警信号
  detectCoolingWarning(node: GraphNode, scoreHistory: ScoreHistory[]): Signal | null
  
  // 检测跨行业联动信号
  detectCrossSectorLinkage(nodes: GraphNode[]): Signal | null
}
```

## 9. 实施计划

### 9.1 Phase 1 交付内容

**目标**: 建立评分系统基础设施 + 3个示例子图

**任务清单**:

1. **数据库迁移** (1天)
   - 创建SubGraph表
   - 扩展GraphNode表（subGraphId, scoreComponents等）
   - 创建NodeScoreHistory表
   - 创建InvestmentSignal表
   - 扩展GraphEdge表（isCrossGraph）

2. **种子数据** (2天)
   - 创建10个SubGraph记录
   - 扩展AI算力子图（补充缺失节点）
   - 构建新能源汽车子图（25节点）
   - 构建消费子图（15节点）
   - 添加跨行业边（5-10条示例）

3. **评分系统核心服务** (3天)
   - ScoreCalculatorService实现
   - ScoreUpdaterService实现
   - 市场面评分逻辑（对接SectorCapitalFlow）
   - 新闻面评分逻辑（对接NewsArticle）
   - 图谱结构面评分逻辑
   - 增量更新机制

4. **API接口** (2天)
   - GET /api/graph/nodes/[id]/score
   - GET /api/graph/scores/ranking
   - POST /api/graph/scores/update
   - GET /api/dashboard/graph-insights

5. **前端Dashboard集成** (2天)
   - Dashboard新增"知识图谱洞察"区块
   - 热度上升TOP10表格
   - 评分变化趋势图（简化版）
   - 子图健康度卡片

6. **测试与文档** (1天)
   - 单元测试
   - 集成测试
   - API文档
   - 使用指南

**总工期**: 约11天

### 9.2 Phase 2 计划

**目标**: 补充剩余7个子图 + AI跨行业边提取

**任务清单**:

1. 构建剩余7个子图种子数据
2. 完善跨行业边数据（目标50条）
3. 实现AI跨行业边提取功能
4. 优化评分算法（根据Phase 1反馈）

**预计工期**: 约7天

### 9.3 Phase 3 计划

**目标**: 投资信号系统 + 新闻标签集成

**任务清单**:

1. SignalGeneratorService实现
2. 投资信号API接口
3. 信号中心页面 `/signals`
4. 新闻列表节点标签集成
5. 节点详情页完善
6. 跨行业传导热力图

**预计工期**: 约8天

## 10. 成功标准

### 10.1 Phase 1 验收标准

- [ ] 数据库迁移成功，无数据丢失
- [ ] 3个子图共60+节点创建完成
- [ ] 评分系统能正确计算三维评分
- [ ] Dashboard展示TOP10节点，数据准确
- [ ] API响应时间<500ms（单节点查询）
- [ ] 评分更新延迟<5分钟（增量更新触发）

### 10.2 系统指标

- **覆盖率**: 10个子图覆盖市值占A股总市值>60%
- **准确率**: 评分与实际市场表现相关性>0.6
- **性能**: 全图评分更新<30秒
- **可用性**: 核心API可用率>99.5%

### 10.3 用户价值

- 用户能快速识别当前市场热点板块
- 评分变化能提前反映板块轮动趋势
- 投资信号准确率>70%（需历史数据验证）

## 11. 风险与缓解

### 11.1 技术风险

**风险**: 评分算法复杂，性能可能不达标

**缓解**:
- Phase 1先实现简化版算法
- 增加缓存层（Redis）
- 异步批量计算

### 11.2 数据风险

**风险**: 市场数据缺失或延迟

**缓解**:
- 使用模拟数据降级
- 评分组件支持部分数据缺失
- 标注数据质量

### 11.3 业务风险

**风险**: 评分规则不合理，与市场实际脱节

**缓解**:
- Phase 1小范围验证
- 支持权重参数调整
- 收集用户反馈快速迭代

## 12. 后续优化方向

1. **机器学习增强**: 用历史数据训练评分权重
2. **实时传导预测**: 基于图神经网络预测传导路径
3. **个性化推荐**: 根据用户持仓推荐关注节点
4. **情绪指标**: 整合社交媒体情绪数据
5. **量化回测**: 建立评分信号的回测框架

---

**文档结束**
