# 知识图谱优化 - 快速开始

## 前提条件

1. 数据库已迁移到最新版本
2. 环境变量配置完整（`ANTHROPIC_API_KEY`）
3. 图谱基础数据已导入

## 1. 验证数据库迁移

```bash
npm run db:migrate dev
```

应该看到：
```
Already in sync, no schema change or pending migration was found.
```

## 2. 测试新闻图谱关联

### 方式1: API测试

```bash
# 假设你有一个新闻ID: news-123
curl -X POST http://localhost:3000/api/news/news-123/link-graph
```

### 方式2: 代码测试

```typescript
import { newsGraphLinkerService } from '@/lib/services/news-graph-linker.service'

// 关联单个新闻
const result = await newsGraphLinkerService.linkNewsToGraph('news-123')
console.log(`关联了 ${result.matches.length} 个节点`)
console.log(`使用了 ${result.tokensUsed} tokens`)

// 批量关联
const batchResult = await newsGraphLinkerService.batchLinkNews(
  ['news-1', 'news-2', 'news-3'],
  3 // 并发数
)
console.log(`成功: ${batchResult.success}/${batchResult.total}`)
```

## 3. 测试事件影响分析

```typescript
import { eventImpactAnalyzerService } from '@/lib/services/event-impact-analyzer.service'

const impact = await eventImpactAnalyzerService.analyzeEventImpact(
  'NVIDIA发布新一代H200 AI芯片，性能提升2倍',
  ['node-ai-chip-design'], // 源节点ID（需要真实的节点ID）
  'positive',
  5,
  4 // 最大深度
)

console.log(`找到 ${impact.propagationPaths.length} 条传导路径`)
console.log(`影响 ${impact.affectedSectors.length} 个板块`)
```

## 4. 更新图谱状态

```typescript
import { graphStateUpdaterService } from '@/lib/services/graph-state-updater.service'

// 更新所有节点
const result = await graphStateUpdaterService.updateAllNodeStates()
console.log(`更新了 ${result.updated}/${result.total} 个节点`)

// 查看更新详情
result.updates.forEach(update => {
  console.log(`${update.nodeId}: 动量 ${update.oldMomentum} → ${update.newMomentum}`)
})
```

## 5. 使用新的可视化组件

### 分层布局

```typescript
import { hierarchicalLayout } from '@/components/graph/layouts/hierarchical-layout'

const nodes = [...] // 从API获取
const edges = [...] // 从API获取

const positioned = hierarchicalLayout(nodes, edges, {
  width: 1200,
  height: 800,
  levelSpacing: 150,
  nodeSpacing: 80
})

// positioned 包含计算好的 x, y 坐标
```

### 图谱工具栏

```tsx
import { GraphToolbar } from '@/components/graph/GraphToolbar'

function MyGraphPage() {
  const [currentView, setCurrentView] = useState<GraphView>('full')
  const [showFilters, setShowFilters] = useState(false)

  return (
    <div>
      <GraphToolbar
        currentView={currentView}
        onViewChange={setCurrentView}
        onRefresh={handleRefresh}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        onToggleFilters={() => setShowFilters(!showFilters)}
        showFilters={showFilters}
        filterCount={activeFilterCount}
      />
      {/* 图谱渲染 */}
    </div>
  )
}
```

### 筛选面板

```tsx
import { GraphFilters } from '@/components/graph/GraphFilters'

function MyGraphPage() {
  const [filters, setFilters] = useState<GraphFilters>({
    nodeTypes: [],
    momentumRange: [-100, 100],
    cyclePositions: [],
    hasRecentNews: false,
    minNewsCount: 0
  })

  return (
    <GraphFilters
      filters={filters}
      onChange={setFilters}
      onReset={() => setFilters(initialFilters)}
      availableTypes={['industry_l1', 'industry_l2', 'sub_sector']}
    />
  )
}
```

### 路径探索

```tsx
import { PathExplorer } from '@/components/graph/PathExplorer'

function MyGraphPage() {
  const [sourceNode, setSourceNode] = useState(null)
  const [targetNode, setTargetNode] = useState(null)
  const [paths, setPaths] = useState([])

  // 当用户选择两个节点时，查找路径
  useEffect(() => {
    if (sourceNode && targetNode) {
      findPaths(sourceNode.id, targetNode.id).then(setPaths)
    }
  }, [sourceNode, targetNode])

  return (
    <PathExplorer
      sourceNode={sourceNode}
      targetNode={targetNode}
      paths={paths}
      onClose={() => {
        setSourceNode(null)
        setTargetNode(null)
      }}
      onPathHover={handlePathHover}
      onPathClick={handlePathClick}
    />
  )
}
```

## 6. 集成到新闻采集流程

在新闻处理完成后自动关联：

```typescript
// src/lib/services/news.service.ts

import { newsGraphLinkerService } from './news-graph-linker.service'

async function processNews(news: NewsArticle) {
  // 1. AI分析
  await aiAnalyzer.analyze(news)
  
  // 2. 关联到图谱（异步，不阻塞主流程）
  newsGraphLinkerService.linkNewsToGraph(news.id)
    .catch(error => {
      console.error(`Failed to link news ${news.id}:`, error)
      // 记录到日志，但不影响主流程
    })
}
```

## 7. 配置定时任务

创建脚本 `scripts/update-graph-state.ts`:

```typescript
import { graphStateUpdaterService } from '@/lib/services/graph-state-updater.service'

async function main() {
  console.log('开始更新图谱状态...')
  
  const result = await graphStateUpdaterService.updateAllNodeStates()
  
  console.log(`✅ 更新完成`)
  console.log(`   成功: ${result.updated}`)
  console.log(`   失败: ${result.failed}`)
  console.log(`   总计: ${result.total}`)
  
  // 可选：记录到数据库
  // await saveUpdateLog(result)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ 更新失败:', error)
    process.exit(1)
  })
```

在 `package.json` 添加脚本：

```json
{
  "scripts": {
    "update-graph-state": "tsx scripts/update-graph-state.ts"
  }
}
```

配置cron（每日凌晨2点）：

```bash
# 编辑crontab
crontab -e

# 添加
0 2 * * * cd /path/to/ai-invest && npm run update-graph-state >> /var/log/graph-update.log 2>&1
```

## 8. 监控和日志

### 查看关联统计

```sql
-- 每个节点的新闻数量
SELECT 
  n.name,
  g.newsCount7d,
  g.newsCount30d,
  g.sentimentScore,
  g.momentum,
  g.cyclePos
FROM GraphNode g
LEFT JOIN (
  SELECT nodeId, COUNT(*) as linkCount
  FROM NewsGraphLink
  GROUP BY nodeId
) l ON g.id = l.nodeId
ORDER BY g.newsCount7d DESC
LIMIT 20;

-- 情感分布
SELECT 
  sentiment,
  COUNT(*) as count,
  AVG(relevance) as avgRelevance
FROM NewsGraphLink
GROUP BY sentiment;

-- 高相关度利好新闻
SELECT 
  n.title,
  g.name as nodeName,
  l.relevance,
  l.sentiment,
  l.keyMentions
FROM NewsGraphLink l
JOIN NewsArticle n ON l.newsId = n.id
JOIN GraphNode g ON l.nodeId = g.id
WHERE l.relevance >= 0.8
  AND l.sentiment = 'positive'
ORDER BY n.publishTime DESC
LIMIT 10;
```

### Token使用监控

建议添加监控服务记录每次AI调用：

```typescript
// 在服务中添加
private async trackTokenUsage(operation: string, tokens: number) {
  await prisma.tokenUsageLog.create({
    data: {
      operation,
      tokens,
      timestamp: new Date()
    }
  })
}

// 查询每日使用量
const dailyUsage = await prisma.tokenUsageLog.aggregate({
  where: {
    timestamp: {
      gte: startOfDay(new Date()),
      lt: endOfDay(new Date())
    }
  },
  _sum: { tokens: true }
})
```

## 常见问题

### Q: 迁移失败？
A: 确保数据库连接正常，检查 `prisma/schema.prisma` 语法

### Q: AI调用超时？
A: 检查网络连接，或增加超时时间配置

### Q: 新闻没有关联到节点？
A: 检查图谱节点是否存在，新闻内容是否完整

### Q: 路径探索没有结果？
A: 检查图谱边数据，确保节点间有连接关系

## 下一步

- [ ] 完成剩余UI组件
- [ ] 性能测试和优化
- [ ] 添加监控dashboard
- [ ] 编写端到端测试

## 参考资料

- [Phase 2 使用指南](../phase2-usage-guide.md)
- [实施报告](./superpowers/reports/2026-07-30-phase2-implementation-report.md)
- [开发总结](./superpowers/reports/2026-07-30-development-summary.md)
