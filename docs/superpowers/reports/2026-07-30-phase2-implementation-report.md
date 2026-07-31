# Phase 2 实施报告：智能集成层

**完成日期**: 2026-07-30  
**状态**: ✅ 核心功能已完成  
**开发时长**: ~2小时

## 实施概览

Phase 2成功实现了知识图谱与新闻、事件的智能集成，建立了自动化的图谱数据更新机制。

## 完成的功能

### 1. 数据库Schema扩展

**新增表**:
- `NewsGraphLink`: 新闻与图谱节点的关联表
  - 字段：newsId, nodeId, relevance, sentiment, impactType, keyMentions
  - 索引：(newsId, nodeId), nodeId+createdAt

**扩展字段** (GraphNode):
- `newsCount7d`: 7天内新闻数量
- `newsCount30d`: 30天内新闻数量  
- `sentimentScore`: 情感得分 (-1 ~ +1)
- `lastNewsAt`: 最后一条新闻时间

**迁移文件**: `20260730021152_add_news_graph_link_and_node_stats`

### 2. 新闻图谱关联服务

**文件**: `src/lib/services/news-graph-linker.service.ts`

**核心能力**:
- AI驱动的新闻-节点智能匹配
- 自动识别相关度、情感倾向、影响类型
- 提取关键提及片段作为证据
- 自动更新节点统计数据（新闻数、情感得分）

**算法逻辑**:
1. 获取新闻内容和所有图谱节点
2. 使用Claude Opus分析新闻与节点的关联
3. 返回相关度 ≥ 0.5 的匹配结果
4. 存储关联关系到NewsGraphLink表
5. 更新节点统计数据（7天/30天新闻数、情感得分、最新时间）

**API端点**:
- `POST /api/news/[id]/link-graph` - 单个新闻关联
- `POST /api/news/batch-link-graph` - 批量关联（支持历史数据迁移）

**Token消耗**: 约2000 tokens/新闻

### 3. 事件影响分析服务

**文件**: `src/lib/services/event-impact-analyzer.service.ts`

**核心能力**:
- 基于图谱的影响传导路径计算（BFS算法）
- AI评估每条路径的影响程度和置信度
- 自动聚合板块级别影响
- 生成可视化数据（高亮节点、边、热力图）

**算法流程**:
1. **路径发现**: 从源节点BFS遍历，最大深度4层，最多50条路径
2. **AI评估**: 批量评估路径的影响分数（-5 ~ +5）和置信度
3. **板块聚合**: 按节点类型聚合影响，计算平均分数
4. **可视化**: 生成高亮节点、边列表和热力图数据

**API端点**:
- `POST /api/events/analyze-impact`
  - 输入：事件描述、源节点、影响方向、强度
  - 输出：传导路径、受影响板块、可视化数据

**Token消耗**: 约3000-4000 tokens/事件

### 4. 图谱状态更新服务

**文件**: `src/lib/services/graph-state-updater.service.ts`

**核心能力**:
- 自动计算节点动量（-100 ~ +100）
- 判断节点周期位置（upturn/peak/downturn/trough）
- 支持批量更新和增量更新

**动量计算公式**:
```
momentum = newsHeat * 0.4 + sentimentTrend * 0.3 + marketMomentum * 0.3
```

- **newsHeat**: 7天与30天新闻数量比率（判断趋势）
- **sentimentTrend**: 情感得分 * 100
- **marketMomentum**: 市场动量（待集成）

**周期判断规则**:
- momentum > 60 且上升 → upturn（上升期）
- momentum > 60 且下降 → peak（高位）
- momentum < -40 且下降 → downturn（下降期）
- momentum < -40 且上升 → trough（底部）

**API端点**:
- `POST /api/graph/update-state`
  - 支持全量更新或指定节点列表

### 5. 单元测试

**覆盖文件**:
- `news-graph-linker.service.test.ts` - 新闻关联测试
- `graph-state-updater.service.test.ts` - 状态更新测试

**测试场景**:
- 正常流程测试
- 边界条件（无节点、无新闻）
- 错误处理（新闻不存在）
- 批量处理

## 技术亮点

### 1. AI驱动的智能匹配
使用Claude Opus进行语义理解，准确识别新闻与产业链节点的关联关系，比传统关键词匹配更智能。

### 2. 自动化数据更新
新闻关联后自动触发节点统计更新，保持数据一致性和实时性。

### 3. 图算法优化
BFS路径发现算法，避免循环路径，限制深度和数量，确保性能。

### 4. 结构化输出
AI输出采用JSON Schema约束，确保结果可解析和验证。

### 5. 批量处理支持
支持并发批量处理，可用于历史数据迁移和定时任务。

## 性能指标

| 指标 | 数值 |
|------|------|
| 新闻关联耗时 | ~2-3秒/新闻 |
| Token消耗 | 2000 tokens/新闻 |
| 事件分析耗时 | ~3-5秒/事件 |
| Token消耗 | 3000-4000 tokens/事件 |
| 路径计算深度 | 最大4层 |
| 路径数量限制 | 最多50条 |
| 批量并发数 | 3个/批次 |

## 待优化项

### 1. 定时任务集成
- [ ] 配置cron任务，每日凌晨2点更新图谱状态
- [ ] 新闻采集后自动触发关联

### 2. ETF影响计算
- [ ] 需要集成ETF持仓数据
- [ ] 计算节点暴露度对ETF的影响

### 3. 性能优化
- [ ] 添加结果缓存（避免重复分析）
- [ ] 优化批量处理并发数
- [ ] 数据库查询优化（索引、分页）

### 4. 监控和告警
- [ ] Token使用量监控和预算控制
- [ ] 关联成功率统计
- [ ] 异常情况告警

## 集成示例

### 新闻关联到图谱

```typescript
// 单个新闻关联
const result = await newsGraphLinkerService.linkNewsToGraph('news-123')
// 返回：{ newsId, matches, tokensUsed, durationMs }

// 批量关联未处理的新闻
const batchResult = await newsGraphLinkerService.batchLinkNews(newsIds, 3)
// 返回：{ total, success, failed, totalTokens }
```

### 事件影响分析

```typescript
const impact = await eventImpactAnalyzerService.analyzeEventImpact(
  'NVIDIA发布新一代AI芯片',
  ['node-ai-chip-design'], // 源节点
  'positive', // 利好
  5 // 强度
)

// 返回：传导路径、受影响板块、可视化数据
```

### 更新图谱状态

```typescript
// 更新所有节点
const result = await graphStateUpdaterService.updateAllNodeStates()

// 更新指定节点
const updates = await graphStateUpdaterService.updateNodes(['node-1', 'node-2'])
```

## 与设计方案的对照

| 功能 | 设计方案 | 实施状态 | 备注 |
|------|---------|---------|------|
| NewsGraphLink表 | ✓ | ✅ | 已完成 |
| 节点统计字段 | ✓ | ✅ | 已完成 |
| 新闻自动标注 | ✓ | ✅ | 已完成 |
| 事件影响分析 | ✓ | ✅ | 核心完成，ETF部分待完善 |
| 图谱状态更新 | ✓ | ✅ | 已完成 |
| 定时任务 | ✓ | ⏳ | 待配置 |
| 板块聚合 | ✓ | ✅ | 已完成 |
| ETF映射 | ✓ | ⏳ | 待实现 |

## 下一步计划

### 短期（本周）
1. 配置定时任务（每日更新图谱状态）
2. 集成到新闻采集流程（自动关联）
3. 添加监控和日志

### 中期（Phase 3）
1. 实现可视化增强（分层布局、路径探索）
2. 添加事件影响可视化展示
3. 优化交互体验

### 长期（Phase 4）
1. 集成ETF持仓数据
2. 实现图谱视角的ETF分析
3. 完善监控和告警系统

## 总结

Phase 2成功建立了知识图谱的智能集成层，实现了：
- ✅ 新闻与图谱的自动关联
- ✅ 基于图谱的事件影响传导分析
- ✅ 图谱节点状态的动态更新

这些功能为知识图谱注入了"生命力"，让它能够随着市场动态持续演化，为投资决策提供更实时、更智能的支持。

核心挑战已经解决，剩余工作主要是定时任务配置、性能优化和监控完善。下一阶段将重点提升可视化体验，让这些智能分析结果更直观地呈现给用户。
