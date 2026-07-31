# Phase 2 功能使用指南

## 新闻图谱关联

### 手动触发单个新闻关联

```bash
# API调用
curl -X POST http://localhost:3000/api/news/{newsId}/link-graph

# 返回示例
{
  "success": true,
  "data": {
    "newsId": "clxxx123",
    "matchCount": 2,
    "matches": [
      {
        "nodeId": "node-ai-chip",
        "nodeName": "AI芯片设计",
        "relevance": 0.9,
        "sentiment": "positive",
        "impactType": "direct",
        "keyMentions": ["AI芯片需求激增", "订单量创新高"],
        "reasoning": "新闻直接提到AI芯片设计公司订单增长"
      },
      {
        "nodeId": "node-semiconductor",
        "nodeName": "半导体制造",
        "relevance": 0.7,
        "sentiment": "positive",
        "impactType": "indirect",
        "keyMentions": ["上游供应链"],
        "reasoning": "AI芯片需求增长将带动半导体制造"
      }
    ],
    "tokensUsed": 2150,
    "durationMs": 2340
  }
}
```

### 批量关联历史新闻

```bash
# 关联最近50条未处理的新闻
curl -X POST http://localhost:3000/api/news/batch-link-graph \
  -H "Content-Type: application/json" \
  -d '{
    "unlinkedOnly": true,
    "limit": 50
  }'

# 返回示例
{
  "success": true,
  "data": {
    "total": 50,
    "success": 48,
    "failed": 2,
    "totalTokens": 103450,
    "totalDuration": 125000
  }
}
```

### 关联指定新闻列表

```bash
curl -X POST http://localhost:3000/api/news/batch-link-graph \
  -H "Content-Type: application/json" \
  -d '{
    "newsIds": ["news-1", "news-2", "news-3"]
  }'
```

## 事件影响分析

### 分析单个事件的产业链影响

```bash
curl -X POST http://localhost:3000/api/events/analyze-impact \
  -H "Content-Type: application/json" \
  -d '{
    "eventDescription": "NVIDIA发布新一代H200 AI芯片，性能提升2倍",
    "sourceNodeIds": ["node-nvidia", "node-ai-chip-design"],
    "impactDirection": "positive",
    "magnitude": 5,
    "maxDepth": 4
  }'

# 返回示例
{
  "success": true,
  "data": {
    "trigger": {
      "event": "NVIDIA发布新一代H200 AI芯片，性能提升2倍",
      "sourceNodes": [
        { "id": "node-nvidia", "name": "NVIDIA", "type": "stock" },
        { "id": "node-ai-chip-design", "name": "AI芯片设计", "type": "sub_sector" }
      ],
      "impactDirection": "positive",
      "magnitude": 5
    },
    "propagationPaths": [
      {
        "path": ["node-ai-chip-design", "node-semiconductor", "node-etf-chip"],
        "edges": [
          {
            "sourceId": "node-ai-chip-design",
            "targetId": "node-semiconductor",
            "relation": "supply_chain",
            "weight": 0.8,
            "direction": "positive",
            "lag": "1-2个月"
          }
        ],
        "totalLag": "1-2个月",
        "finalImpact": {
          "nodeId": "node-etf-chip",
          "nodeName": "半导体ETF",
          "impactScore": 4.2,
          "confidence": 0.85,
          "reasoning": "AI芯片需求增长将带动半导体产业链，考虑传导衰减"
        }
      }
    ],
    "affectedSectors": [
      {
        "sectorName": "sub_sector",
        "impactScore": 4.5,
        "affectedNodes": ["node-ai-chip-design", "node-semiconductor"],
        "timeHorizon": "1-3个月"
      }
    ],
    "affectedETFs": [],
    "visualizationData": {
      "highlightedNodes": ["node-nvidia", "node-ai-chip-design", "node-semiconductor"],
      "highlightedEdges": ["node-ai-chip-design-node-semiconductor"],
      "heatmap": {
        "node-nvidia": 5.0,
        "node-ai-chip-design": 4.8,
        "node-semiconductor": 4.2
      }
    }
  }
}
```

### 参数说明

- `eventDescription`: 事件描述（详细、清晰）
- `sourceNodeIds`: 源节点ID数组（事件直接影响的节点）
- `impactDirection`: 影响方向
  - `positive`: 利好
  - `negative`: 利空
- `magnitude`: 影响强度（1-5，5为最强）
- `maxDepth`: 最大传导深度（默认4，建议2-6）

## 图谱状态更新

### 更新所有节点状态

```bash
curl -X POST http://localhost:3000/api/graph/update-state \
  -H "Content-Type: application/json" \
  -d '{}'

# 返回示例
{
  "success": true,
  "data": {
    "total": 45,
    "updated": 45,
    "failed": 0,
    "updates": [
      {
        "nodeId": "node-ai-chip",
        "oldMomentum": 30,
        "newMomentum": 65,
        "oldCyclePos": "neutral",
        "newCyclePos": "upturn",
        "reasoning": "7天内15条新闻, 情绪偏正面(0.60), 动量65, 周期上升期"
      }
    ]
  }
}
```

### 更新指定节点

```bash
curl -X POST http://localhost:3000/api/graph/update-state \
  -H "Content-Type: application/json" \
  -d '{
    "nodeIds": ["node-ai-chip", "node-semiconductor"]
  }'
```

## 集成到业务流程

### 1. 新闻采集后自动关联

在新闻采集服务中添加：

```typescript
// src/lib/services/news.service.ts
import { newsGraphLinkerService } from './news-graph-linker.service'

async function processNews(news: NewsArticle) {
  // 1. AI分析（分类、情感等）
  await aiAnalyzer.analyze(news)
  
  // 2. 关联到知识图谱
  try {
    await newsGraphLinkerService.linkNewsToGraph(news.id)
    console.log(`News ${news.id} linked to graph`)
  } catch (error) {
    console.error(`Failed to link news ${news.id}:`, error)
    // 不影响主流程，静默失败
  }
}
```

### 2. 定时更新图谱状态

创建定时任务：

```typescript
// scripts/update-graph-state.ts
import { graphStateUpdaterService } from '@/lib/services/graph-state-updater.service'

async function main() {
  console.log('Starting graph state update...')
  
  const result = await graphStateUpdaterService.updateAllNodeStates()
  
  console.log(`Updated ${result.updated}/${result.total} nodes`)
  console.log(`Failed: ${result.failed}`)
}

main().catch(console.error)
```

配置cron任务（每日凌晨2点）：

```bash
# crontab -e
0 2 * * * cd /path/to/ai-invest && npm run update-graph-state
```

### 3. 事件分析页面集成

```typescript
// src/app/(dashboard)/events/[id]/page.tsx
'use client'

import { useState } from 'react'

export default function EventDetailPage({ params }: { params: { id: string } }) {
  const [impact, setImpact] = useState(null)
  
  const analyzeImpact = async () => {
    const response = await fetch('/api/events/analyze-impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventDescription: event.title,
        sourceNodeIds: ['node-ai-chip'], // 从事件关联节点获取
        impactDirection: event.sentiment > 0 ? 'positive' : 'negative',
        magnitude: 5
      })
    })
    
    const data = await response.json()
    setImpact(data.data)
  }
  
  return (
    <div>
      <button onClick={analyzeImpact}>分析产业链影响</button>
      {impact && <ImpactVisualization data={impact} />}
    </div>
  )
}
```

## 查询新闻-图谱关联

```typescript
// 查询某个节点的相关新闻
const links = await prisma.newsGraphLink.findMany({
  where: { nodeId: 'node-ai-chip' },
  include: { news: true },
  orderBy: { createdAt: 'desc' },
  take: 10
})

// 查询某条新闻关联的所有节点
const links = await prisma.newsGraphLink.findMany({
  where: { newsId: 'news-123' },
  include: { node: true }
})

// 查询高相关度的利好新闻
const links = await prisma.newsGraphLink.findMany({
  where: {
    nodeId: 'node-ai-chip',
    relevance: { gte: 0.7 },
    sentiment: 'positive'
  },
  include: { news: true }
})
```

## 监控和日志

### 查看关联统计

```sql
-- 每个节点的新闻数量
SELECT 
  nodeId,
  COUNT(*) as newsCount,
  AVG(relevance) as avgRelevance
FROM NewsGraphLink
GROUP BY nodeId
ORDER BY newsCount DESC;

-- 情感分布
SELECT 
  sentiment,
  COUNT(*) as count
FROM NewsGraphLink
GROUP BY sentiment;
```

### Token使用量监控

建议添加监控服务：

```typescript
// src/lib/services/token-monitor.service.ts
export class TokenMonitorService {
  private dailyUsage = 0
  private dailyLimit = 100000 // 10万tokens/天
  
  trackUsage(tokens: number) {
    this.dailyUsage += tokens
    
    if (this.dailyUsage > this.dailyLimit * 0.8) {
      console.warn(`Token usage: ${this.dailyUsage}/${this.dailyLimit}`)
    }
  }
}
```

## 常见问题

### Q: 新闻关联失败怎么办？
A: 检查日志，常见原因：
- Claude API配置错误
- 图谱节点为空
- 新闻内容格式异常

### Q: 如何提高关联准确率？
A: 
1. 确保图谱节点描述完整
2. 新闻内容质量好（标题+正文）
3. 调整相关度阈值（默认0.5）

### Q: 批量处理会很慢吗？
A: 
- 单个新闻：2-3秒
- 批量50个：约2分钟（并发3个）
- 建议分批处理，避免超时

### Q: 如何优化Token成本？
A:
1. 只处理已AI分析的新闻
2. 避免重复关联（检查已存在）
3. 设置每日限额
4. 定期清理过期数据

## 下一步

- [ ] 配置生产环境定时任务
- [ ] 添加Token使用量监控
- [ ] 集成到新闻采集流程
- [ ] 优化批量处理性能
- [ ] 添加更多监控指标
