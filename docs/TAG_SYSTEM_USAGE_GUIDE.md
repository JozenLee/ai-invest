# 市场数据、资讯流与知识图谱联动系统 - 使用指南

## 快速开始

### 1. 环境配置

确保已安装依赖：
```bash
npm install
```

配置环境变量（可选，用于AI标签提取）：
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

### 2. 数据库迁移

如果是已有项目，运行标签关联迁移脚本：
```bash
npm run migrate:tags
```

### 3. 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test src/lib/services/__tests__/tag.service.test.ts
```

---

## API使用

### Tag管理

#### 获取标签树
```bash
curl http://localhost:3000/api/tags/tree
```

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "name": "AI算力",
      "code": "ai_compute",
      "type": "domain",
      "level": 1,
      "children": [...]
    }
  ]
}
```

#### 创建标签
```bash
curl -X POST http://localhost:3000/api/tags \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI芯片",
    "code": "ai_chip",
    "type": "tech",
    "level": 2,
    "parentId": "parent_tag_id",
    "description": "AI专用芯片技术"
  }'
```

#### 更新标签
```bash
curl -X PUT http://localhost:3000/api/tags/{tagId} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI芯片（更新）",
    "description": "新的描述"
  }'
```

#### 删除标签（软删除）
```bash
curl -X DELETE http://localhost:3000/api/tags/{tagId}
```

---

### ETF绑定管理

#### 查询节点的ETF绑定
```bash
curl http://localhost:3000/api/graph/nodes/{nodeId}/etfs
```

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "nodeId": "...",
      "etfCode": "515790",
      "etfName": "半导体ETF",
      "bindType": "tracking",
      "weight": 0.8,
      "isActive": true
    }
  ]
}
```

#### 添加ETF绑定
```bash
curl -X POST http://localhost:3000/api/graph/nodes/{nodeId}/etfs \
  -H "Content-Type: application/json" \
  -d '{
    "etfCode": "515790",
    "etfName": "半导体ETF",
    "bindType": "tracking",
    "weight": 0.8,
    "description": "跟踪半导体行业"
  }'
```

#### 删除ETF绑定
```bash
curl -X DELETE http://localhost:3000/api/graph/nodes/{nodeId}/etfs/{etfCode}
```

---

## 服务层使用

### TagService

```typescript
import { tagService } from '@/lib/services/tag.service'

// 获取标签树
const tree = await tagService.getTagTree()

// 创建标签
const tag = await tagService.createTag({
  name: 'GPU技术',
  code: 'gpu_tech',
  type: 'tech',
  level: 3,
  parentId: 'parent_id'
})

// 查询标签
const tag = await tagService.getTagByCode('ai_compute')

// 获取祖先链
const ancestors = await tagService.getTagAncestors(tagId)
// 返回: [根标签, 父标签, ..., 当前标签]

// 更新标签
await tagService.updateTag(tagId, {
  description: '新描述'
})

// 删除标签
await tagService.deleteTag(tagId)
```

### TagCacheService

```typescript
import { tagCacheService } from '@/lib/services/tag-cache.service'

// 获取缓存的标签树（推荐在API中使用）
const tree = await tagCacheService.getCachedTagTree()

// 获取缓存的标签
const tag = await tagCacheService.getCachedTagByCode('ai_compute')

// 手动失效缓存（写操作会自动失效）
await tagCacheService.invalidateTagCache()

// 预热缓存（应用启动时）
await tagCacheService.warmupCache()
```

### NewsAnalysisService

```typescript
import { newsAnalysisService } from '@/lib/ai/news-analysis.service'

// 分析新闻并提取标签
const analysis = await newsAnalysisService.analyzeNewsWithTags(
  '英伟达发布新一代AI芯片',
  '英伟达今日发布了最新的...'
)

// 返回结果
console.log(analysis.tags)          // 提取的标签列表
console.log(analysis.relatedNodes)   // 相关图谱节点
console.log(analysis.sentiment)      // 情感分数
console.log(analysis.sentimentLabel) // 情感标签
```

**注意**: 需要配置 `ANTHROPIC_API_KEY` 环境变量

---

## 维护工具

### 标签关联验证

检查新闻的 `segmentCodes` 与 Tag 关联是否完整：

```bash
npx tsx scripts/verify-tag-linking.ts
```

输出内容：
- Tag系统统计（总数、活跃、孤立等）
- NewsArticleTag统计
- GraphNodeTag统计
- GraphNodeETF统计
- DomainTag桥接完整性

### 端到端关联测试

验证标签创建、关联和重复处理逻辑：

```bash
npx tsx scripts/test-tag-linking.ts
```

---

## 数据结构

### Tag层级结构

```
Level 1: 一级领域
├─ Level 2: 二级细分
   ├─ Level 3: 三级技术
      └─ Level 4: 公司/概念
```

示例：
```
AI算力 (level 1, domain)
├─ 芯片设计 (level 2, tech)
   ├─ GPU/AI芯片 (level 3, tech)
      └─ 英伟达 (level 4, company)
```

### Tag类型

- `domain`: 一级领域（AI算力、新能源等）
- `tech`: 技术细分（芯片设计、算力基础设施等）
- `company`: 公司（英伟达、AMD等）
- `concept`: 概念（HBM、CPO等）

---

## 最佳实践

### 1. 使用缓存服务

在API路由中使用缓存服务而非直接调用TagService：

```typescript
// ✓ 推荐
import { tagCacheService } from '@/lib/services/tag-cache.service'
const tree = await tagCacheService.getCachedTagTree()

// ✗ 不推荐（每次都查数据库）
import { tagService } from '@/lib/services/tag.service'
const tree = await tagService.getTagTree()
```

### 2. 标签命名规范

- `name`: 中文名称，简洁明了
- `code`: 英文代码，小写+下划线，如 `ai_compute`
- `type`: 根据层级选择合适类型
- `level`: 严格遵循层级定义

### 3. ETF绑定管理

- `bindType`: 使用 `tracking`（跟踪型）或 `thematic`（主题型）
- `weight`: 0-1之间，表示相关度
- 同一节点可以绑定多个ETF
- 使用软删除保留历史数据

### 4. 新闻标签提取

- 批量处理时控制API调用频率（建议1-2秒/篇）
- 使用 `confidence` 字段过滤低置信度标签
- 定期运行数据质量检查

### 5. 性能优化

- 应用启动时预热缓存：`tagCacheService.warmupCache()`
- 定期运行标签关联验证：`scripts/verify-tag-linking.ts`
- 监控API响应时间
- 考虑生产环境使用Redis替代内存缓存

---

## 故障排查

### Tag创建失败

**问题**: `Tag code already exists`

**解决**: code必须全局唯一，检查是否已存在

---

**问题**: `Parent tag not found`

**解决**: 确保parentId存在且为活跃标签

---

**问题**: `Child level must be greater than parent level`

**解决**: 子标签level必须大于父标签level

---

### ETF绑定失败

**问题**: `Node not found`

**解决**: 确保nodeId存在于GraphNode表

---

**问题**: `ETF binding already exists`

**解决**: 该节点已绑定此ETF，使用PUT更新或先删除

---

### AI分析失败

**问题**: `ANTHROPIC_API_KEY not configured`

**解决**: 
```bash
export ANTHROPIC_API_KEY="your-key"
```

---

**问题**: API调用超时或限流

**解决**: 
- 增加 `--delay` 参数
- 减小 `--batch-size`
- 检查API配额

---

## 生产部署建议

### 1. 环境变量

```bash
# 必需
DATABASE_URL="file:./prisma/prod.db"

# 可选（AI功能）
ANTHROPIC_API_KEY="sk-..."

# 推荐（生产环境）
REDIS_URL="redis://localhost:6379"
NODE_ENV="production"
```

### 2. 缓存策略

生产环境建议使用Redis：

```typescript
// 修改 src/lib/services/tag-cache.service.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// 使用Redis替代内存缓存
```

### 3. 定时任务

使用cron或任务调度器：

```bash
# 每天凌晨3点验证标签关联
0 3 * * * cd /app && npx tsx scripts/verify-tag-linking.ts
```

### 4. 监控告警

- API响应时间监控
- 缓存命中率监控
- AI调用失败率监控
- 数据质量异常告警

---

## 相关文档

- **项目说明**: `CLAUDE.md`
- **部署检查清单**: `docs/deployment-checklist.md`

---

## 技术支持

如有问题，请检查：
1. 日志输出（控制台）
2. 数据质量报告
3. 测试用例
4. 相关文档

---

**版本**: 1.0.0  
**更新日期**: 2026-08-01  
**维护者**: AI Investment System Team
