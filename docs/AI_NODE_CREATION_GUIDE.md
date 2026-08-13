# AI智能节点创建系统 - 使用指南

## 📖 概述

AI智能节点创建系统通过Claude AI自动完成以下工作：
1. **匹配相关ETF和指数** - 自动识别与节点最相关的市场标的
2. **推断层级位置** - 分析节点在知识图谱中的合理位置
3. **创建关系连接** - 自动识别并创建与其他节点的关系边
4. **接入市场数据** - 自动配置市场数据增强

---

## 🚀 快速开始

### 方式1: 通过API创建单个节点

```bash
curl -X POST http://localhost:3000/api/graph/ai/create-node \
  -H "Content-Type: application/json" \
  -d '{
    "name": "液冷散热",
    "description": "用于AI服务器的液冷散热解决方案",
    "context": "随着AI算力需求增长，液冷技术成为数据中心的重要解决方案"
  }'
```

### 方式2: 在代码中调用

```typescript
import { aiNodeCreationService } from '@/lib/services/ai-node-creation.service'

const result = await aiNodeCreationService.createNodeWithAI({
  name: '液冷散热',
  description: '用于AI服务器的液冷散热解决方案',
  context: '随着AI算力需求增长，液冷技术成为数据中心的重要解决方案'
})

if (result.success) {
  console.log('节点创建成功:', result.node)
  console.log('匹配的ETF:', result.matchedETFs)
  console.log('建议的关系:', result.suggestedEdges)
}
```

---

## 🎯 核心功能详解

### 1. 自动匹配ETF和指数

**工作原理：**
- AI分析节点名称和描述中的关键词
- 与预定义的ETF/指数关键词库进行语义匹配
- 计算相关度评分(0-1)
- 返回最相关的ETF和指数列表

**支持的ETF：**
- `515070` - AI ETF (关键词: AI, 人工智能, 算力, GPU)
- `512480` - 半导体ETF (关键词: 半导体, 芯片, 集成电路)
- `159995` - 芯片ETF (关键词: 芯片, 芯片设计, 芯片制造)
- `515880` - 通信ETF (关键词: 通信, 通信设备, 5G, 光模块)

**支持的指数：**
- `930713` - 中证人工智能主题指数
- `931865` - 中证全指半导体指数
- `931160` - 中证全指通信设备指数

**返回示例：**
```json
{
  "matchedETFs": [
    {
      "ticker": "515070",
      "name": "AI ETF",
      "relevance": 0.92,
      "reason": "液冷散热是AI算力基础设施的核心组件"
    }
  ],
  "matchedIndices": [
    {
      "code": "930713",
      "name": "中证人工智能主题指数",
      "relevance": 0.88,
      "reason": "液冷技术直接服务于AI算力需求"
    }
  ]
}
```

---

### 2. 自动推断层级位置

**节点类型层级：**

```
Level 0: ai_index (AI算力指数)
  │
  ├─ Level 1: ai_l1 (一级分类)
  │    │
  │    └─ Level 2: ai_l2 (二级分类)
  │         │
  │         └─ Level 3: 具体领域
  │              ├─ chip_design (芯片设计)
  │              ├─ memory (存储)
  │              ├─ server (服务器)
  │              ├─ cooling (散热)
  │              ├─ data_center (数据中心)
  │              ├─ optical_module (光模块)
  │              └─ networking (网络设备)
```

**AI分析维度：**
1. **节点性质** - 是技术、产品、服务还是基础设施
2. **产业链位置** - 上游、中游还是下游
3. **与现有节点的关系** - 最适合放在哪个父节点下
4. **专业度** - 通用概念还是具体细分

**示例：**
- "液冷散热" → `cooling` (Level 3) → 父节点：散热技术
- "HBM存储" → `memory` (Level 3) → 父节点：存储芯片
- "CPO光模块" → `optical_module` (Level 3) → 父节点：光通信

---

### 3. 自动创建关系边

**支持的关系类型：**

| 关系类型 | 说明 | 示例 |
|---------|------|------|
| `contain` | 包含关系 | AI算力 → 芯片设计 |
| `supply_chain` | 供应链关系 | HBM存储 → GPU芯片 |
| `demand_driver` | 需求驱动 | AI训练 → 算力需求 |
| `technology_driver` | 技术驱动 | CPO技术 → 光模块升级 |
| `complementary` | 互补关系 | 液冷散热 ↔ 高性能服务器 |
| `upstream` | 上游关系 | 晶圆制造 → 芯片封装 |
| `downstream` | 下游关系 | GPU → AI应用 |

**AI创建边的逻辑：**
1. 分析现有图谱结构
2. 识别语义相似的节点
3. 推断产业链上下游关系
4. 计算关系强度和置信度
5. 只创建高置信度(>0.7)的关系

**返回示例：**
```json
{
  "suggestedEdges": [
    {
      "targetNodeId": "node_abc123",
      "targetNodeName": "AI服务器",
      "relation": "complementary",
      "direction": "positive",
      "weight": 0.9,
      "evidence": "液冷散热是AI服务器的关键配套技术"
    },
    {
      "targetNodeId": "node_def456",
      "targetNodeName": "数据中心",
      "relation": "supply_chain",
      "direction": "positive",
      "weight": 0.85,
      "evidence": "液冷方案应用于数据中心基础设施"
    }
  ]
}
```

---

### 4. 自动接入市场数据

**自动配置的数据：**

创建节点时，AI会在节点的 `metadata` 字段中保存：

```json
{
  "trackingETFs": [
    {"ticker": "515070", "name": "AI ETF", "relevance": 0.92}
  ],
  "relatedIndex": "930713",
  "aiGenerated": true,
  "createdAt": "2026-08-01T12:00:00Z"
}
```

**前端自动展示：**
- 图谱探索页面点击节点后，自动显示关联的ETF和指数数据
- 市场数据面板自动获取配置的ETF/指数行情
- 资金流向自动匹配相关板块

---

## 📊 API接口文档

### POST /api/graph/ai/create-node

创建单个智能节点

**请求体：**
```typescript
{
  name: string         // 必填：节点名称
  description?: string // 可选：节点描述
  context?: string     // 可选：额外上下文信息
}
```

**响应：**
```typescript
{
  success: boolean
  data?: {
    node: {
      id: string
      type: string
      name: string
      description: string
      level: number
      parentId?: string
    }
    matchedETFs: Array<{
      ticker: string
      name: string
      relevance: number
      reason: string
    }>
    matchedIndices: Array<{
      code: string
      name: string
      relevance: number
      reason: string
    }>
    suggestedEdges: Array<{
      targetNodeId: string
      targetNodeName: string
      relation: string
      direction: string
      weight: number
      evidence: string
    }>
    reasoning: string  // AI的推理过程
  }
  error?: string
}
```

### PUT /api/graph/ai/batch-create

批量创建智能节点

**请求体：**
```typescript
{
  nodes: Array<{
    name: string
    description?: string
    context?: string
  }>
}
```

**响应：**
```typescript
{
  success: boolean
  data?: {
    total: number
    succeeded: number
    failed: number
    results: Array<AINodeCreationResult>
  }
  error?: string
}
```

---

## 💡 使用建议

### 最佳实践

1. **提供足够的上下文**
   ```typescript
   // ❌ 不好
   { name: "光模块" }
   
   // ✅ 好
   {
     name: "800G光模块",
     description: "支持800Gbps传输速率的数据中心光模块",
     context: "用于AI集群内部高速互连"
   }
   ```

2. **使用专业术语**
   - AI会识别行业术语并提高匹配准确度
   - 例如："HBM3E"比"高速内存"更精确

3. **描述应用场景**
   - 有助于AI判断节点在产业链中的位置
   - 例如："用于AI训练集群的..."

4. **分批创建相关节点**
   - 先创建上层概念节点
   - 再创建细分节点，AI能更好地建立关系

### 常见问题

**Q: AI为什么没有匹配到ETF？**
A: 可能原因：
- 节点过于细分，与现有ETF关联度不高
- 描述信息不足，AI无法判断相关性
- 解决方案：提供更多context信息

**Q: 创建的关系不准确怎么办？**
A: 
- AI创建的边可以手动调整
- 使用 `/api/graph/edges` 端点编辑或删除边
- 提供更详细的context可以提高准确度

**Q: 如何验证AI的判断？**
A:
- 查看返回的 `reasoning` 字段
- 检查 `matchedETFs` 和 `suggestedEdges` 的 `reason/evidence` 字段
- AI会解释其决策依据

---

## 🔧 配置与扩展

### 添加新的ETF/指数

编辑 `src/lib/services/ai-node-creation.service.ts`:

```typescript
const AVAILABLE_ETFS = [
  // 添加新的ETF
  {
    ticker: '159XXX',
    name: '新ETF名称',
    trackingIndex: '跟踪指数',
    keywords: ['关键词1', '关键词2', '关键词3']
  },
  // ...
]
```

### 添加新的节点类型

```typescript
const NODE_TYPE_HIERARCHY = {
  // 添加新类型
  'new_type': {
    level: 3,
    parent: 'ai_l2',
    description: '新类型描述'
  },
  // ...
}
```

### 调整AI模型参数

```typescript
// 在 analyzeNodeWithClaude 方法中
const response = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',  // 更换模型
  max_tokens: 4000,                       // 调整token限制
  temperature: 0.7,                       // 添加温度参数
  // ...
})
```

---

## 📈 性能与限制

### 性能指标

- **单个节点创建时间**: 3-8秒（含AI分析）
- **批量创建**: 每个节点间隔1秒，避免API限制
- **并发限制**: 建议同时最多3个请求

### 使用限制

- **Claude API限制**: 根据API层级有不同的rate limit
- **token消耗**: 每次创建约消耗1000-2000 tokens
- **批量上限**: 建议单次批量不超过10个节点

### 成本估算

基于Claude Sonnet价格：
- 单个节点创建: ~$0.01
- 批量10个节点: ~$0.10

---

## 🎓 示例场景

### 场景1: 创建新技术节点

```bash
# 创建CPO技术节点
curl -X POST http://localhost:3000/api/graph/ai/create-node \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CPO共封装光学",
    "description": "将光模块与交换芯片共同封装的新技术",
    "context": "CPO技术大幅降低数据中心互连功耗和延迟，是下一代AI集群的关键技术"
  }'

# 预期结果：
# - 类型: optical_module
# - 层级: 3
# - 匹配ETF: 通信ETF
# - 关联节点: 光模块、数据中心、网络设备
```

### 场景2: 批量创建产业链节点

```bash
curl -X PUT http://localhost:3000/api/graph/ai/batch-create \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {
        "name": "液冷散热",
        "description": "AI服务器液冷散热解决方案"
      },
      {
        "name": "HBM3E存储",
        "description": "第三代高带宽存储器"
      },
      {
        "name": "800G光模块",
        "description": "800Gbps数据中心光模块"
      }
    ]
  }'
```

---

## 🔍 调试与日志

### 查看AI分析日志

```bash
# 查看Node.js日志
tail -f .next/server-log.txt

# 关键日志：
# [AI Node Creation] 开始分析节点: xxx
# [Claude Analysis] 失败/成功
# [AI Node Creation] 节点创建成功: xxx
```

### 调试模式

在代码中添加详细日志：

```typescript
const result = await aiNodeCreationService.createNodeWithAI({
  name: '测试节点',
  // ...
})

console.log('AI分析结果:', result.reasoning)
console.log('匹配的ETF:', result.matchedETFs)
console.log('建议的边:', result.suggestedEdges)
```

---

## 📚 相关文档

- **市场数据同步**: `docs/MARKET_DATA_SYNC_GUIDE.md`
- **图谱服务API**: `src/lib/services/graph.service.ts`
- **数据库Schema**: `prisma/schema.prisma`

---

## 🆘 获取帮助

遇到问题？
1. 检查日志文件
2. 验证ANTHROPIC_API_KEY是否配置
3. 测试API端点是否可访问
4. 查看示例代码

---

**最后更新**: 2026-08-01
**版本**: 1.0.0
