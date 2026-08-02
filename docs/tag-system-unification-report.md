# 指数、ETF标签系统统一方案

## 📊 一、底层数据接口检查结果

### ✅ 1.1 市场指数接口 - **可用**

**接口**: `http://localhost:8000/api/market/overview`

**测试结果**:
```json
{
  "success": true,
  "data": {
    "indices": [
      {"code": "sh000001", "name": "上证指数", "price": 3832.26, "changePct": 0.72},
      {"code": "sh000300", "name": "沪深300", "price": 4588.20, "changePct": 0.85},
      {"code": "sh000688", "name": "科创50", "price": 1635.96, "changePct": 2.99},
      {"code": "sz399001", "name": "深证成指", "price": 13578.93, "changePct": 2.21},
      {"code": "sz399006", "name": "创业板指", "price": 3343.96, "changePct": 3.06}
    ],
    "source": "unified",
    "timestamp": "2026-07-31"
  }
}
```

**数据质量**: ✅ 实时数据，价格非模拟值  
**降级策略**: Python数据服务 → Yahoo Finance → 本地缓存  
**可靠性**: 高

---

### ✅ 1.2 ETF列表接口 - **可用**

**接口**: `http://localhost:8000/api/etf/list`

**测试结果**:
```json
{
  "success": true,
  "data": [
    {"ticker": "510300", "name": "沪深300ETF", "trackingIndex": "沪深300"},
    {"ticker": "588000", "name": "科创50ETF", "trackingIndex": "科创50"},
    {"ticker": "512480", "name": "半导体ETF", "trackingIndex": "中证全指半导体"},
    {"ticker": "515070", "name": "AI ETF", "trackingIndex": "中证人工智能"},
    {"ticker": "159995", "name": "芯片ETF", "trackingIndex": "国证芯片"},
    {"ticker": "515880", "name": "通信ETF", "trackingIndex": "中证全指通信设备"},
    {"ticker": "159853", "name": "光通信ETF", "trackingIndex": "中证光通信"},
    {"ticker": "159888", "name": "算力ETF", "trackingIndex": "中证算力"}
  ]
}
```

**覆盖范围**: 11个ETF产品，涵盖科技、AI、芯片等领域  
**关键信息**: ticker、name、trackingIndex  
**可靠性**: 高

---

### ✅ 1.3 ETF详情接口 - **可用**

**接口**: `/api/etf/detail?code={code}`  
**实现**: 通过 `proxyToDataService` 代理  
**降级**: 提供fallback模拟数据

---

## 🏗️ 二、当前标签系统架构分析

### 2.1 数据库现状

**Tag表统计**:
- 总标签数: 9个
- 类型分布: domain (7个), tech (2个)
- 层级分布: Level 1 (7个), Level 2 (1个), Level 3 (1个)

**标签模型**:
```typescript
model Tag {
  id          String   @id
  name        String   // 标签名称
  code        String   @unique // 英文代码
  type        String   // domain/tech/company/concept
  level       Int      // 层级: 1-4
  parentId    String?  // 父标签ID
  description String?
  keywords    String?  // JSON关键词
  isActive    Boolean
  sortOrder   Int
}
```

### 2.2 标签关联方式

现有三种标签关联表：

| 关联表 | 用途 | 字段 | 使用场景 |
|--------|------|------|---------|
| **NewsArticleTag** | 资讯分类 | confidence (置信度) | 资讯流 |
| **GraphNodeTag** | 图谱节点 | relevance (相关度) | 图谱探索 |
| **DomainTag** | 领域关联 | - | 领域管理 |

### 2.3 核心问题

❌ **标签系统分散**:
- 资讯流和图谱探索各自为政
- 没有统一的指数、ETF标签
- 标签类型不支持金融产品

❌ **层级设计局限**:
- 当前只有 1-4 级
- 无法合理放置指数/ETF

❌ **缺少市场数据关联**:
- Tag表与市场数据割裂
- 无法从标签快速查询对应ETF/指数

---

## 🎯 三、统一标签系统设计方案

### 3.1 标签类型扩展

**现有类型**: `domain`, `tech`, `company`, `concept`  
**新增类型**: `index`, `etf`

```typescript
type TagType = 
  | 'domain'      // 领域（AI、新能源、医药）
  | 'tech'        // 技术（GPU、芯片、光模块）
  | 'company'     // 公司（英伟达、AMD）
  | 'concept'     // 概念（算力、智能驾驶）
  | 'index'       // 🆕 市场指数
  | 'etf'         // 🆕 ETF产品
```

### 3.2 层级体系设计

```
Level 1: 市场大类
  └─ 科技、消费、医药、能源...

Level 2: 一级行业/领域
  └─ 人工智能、半导体、新能源汽车...

Level 3: 二级细分
  └─ AI算力、AI应用、GPU、存储芯片...

Level 4: 三级技术/概念
  └─ 训练芯片、推理芯片、HBM内存...

Level 5: 公司/产品
  └─ 英伟达、AMD、台积电...

Level 6: 🆕 市场指数/ETF
  └─ 科创50、AI ETF、芯片ETF...
```

**优势**:
- 清晰的层级递进关系
- 指数/ETF作为最底层，直接关联投资标的
- 支持从宏观到微观的标签筛选

### 3.3 数据模型扩展

#### 方案A: 扩展现有Tag表（推荐）

```typescript
model Tag {
  // ... 现有字段
  type        String   // 添加 'index' | 'etf'
  level       Int      // 扩展到 1-6
  
  // 🆕 新增字段
  marketCode  String?  // 市场代码（指数code或ETF ticker）
  metadata    String?  // JSON: 扩展元数据
  
  // 关联关系
  newsArticles NewsArticleTag[]
  graphNodes   GraphNodeTag[]
  etfBindings  GraphNodeETF[]  // 🆕 关联ETF
}
```

**metadata 示例**:
```json
// 指数标签
{
  "source": "market",
  "exchange": "SH",
  "category": "综合指数"
}

// ETF标签
{
  "source": "market",
  "ticker": "515070",
  "trackingIndex": "sh000300",
  "fundCompany": "国泰基金",
  "sector": "ai",
  "listingDate": "2019-08-26"
}
```

#### 方案B: 新建独立表（不推荐）

创建 `MarketTag` 表单独管理指数/ETF，但会增加系统复杂度。

### 3.4 标签树结构示例

```
科技 (domain, L1)
├─ 人工智能 (domain, L2)
│  ├─ AI算力 (tech, L3)
│  │  ├─ GPU (concept, L4)
│  │  │  ├─ 英伟达 (company, L5)
│  │  │  └─ 科创50 (index, L6) ← 包含英伟达概念股
│  │  └─ 算力ETF (etf, L6) ← 跟踪算力指数
│  ├─ AI应用 (tech, L3)
│  └─ AI ETF (etf, L6) ← 跟踪AI指数
└─ 半导体 (domain, L2)
   ├─ 芯片设计 (tech, L3)
   └─ 芯片ETF (etf, L6)
```

---

## 🔄 四、数据同步方案

### 4.1 指数数据同步

**数据源**: `/api/market/overview`

**同步脚本**: `scripts/sync-index-tags.ts`

```typescript
// 伪代码
async function syncIndexTags() {
  const response = await fetch('http://localhost:8000/api/market/overview')
  const { indices } = response.data
  
  for (const index of indices) {
    await tagService.createOrUpdateTag({
      code: index.code,
      name: index.name,
      type: 'index',
      level: 6,
      marketCode: index.code,
      metadata: JSON.stringify({
        source: 'market',
        exchange: index.code.startsWith('sh') ? 'SH' : 'SZ',
        category: getIndexCategory(index.code)
      })
    })
  }
}
```

### 4.2 ETF数据同步

**数据源**: `/api/etf/list`

**同步脚本**: `scripts/sync-etf-tags.ts`

```typescript
async function syncETFTags() {
  const response = await fetch('http://localhost:8000/api/etf/list')
  const etfs = response.data
  
  for (const etf of etfs) {
    // 1. 创建ETF标签
    const tag = await tagService.createOrUpdateTag({
      code: etf.ticker,
      name: etf.name,
      type: 'etf',
      level: 6,
      marketCode: etf.ticker,
      metadata: JSON.stringify({
        source: 'market',
        ticker: etf.ticker,
        trackingIndex: etf.trackingIndex,
        sector: inferSector(etf.name)
      })
    })
    
    // 2. 自动关联到领域标签
    const domainTag = await findDomainByName(etf.name)
    if (domainTag) {
      await tagService.updateTag(tag.id, { parentId: domainTag.id })
    }
  }
}
```

### 4.3 定时同步

**频率**: 每日开盘前更新（早上8:00）  
**触发方式**: 定时任务或手动刷新  
**增量更新**: 比对code，只更新变化的标签

---

## 📋 五、实施计划

### Phase 1: 数据模型升级（1天）

- [ ] 修改 `schema.prisma`，扩展Tag.type枚举
- [ ] 添加 `marketCode` 和 `metadata` 字段
- [ ] 运行数据库迁移: `npx prisma migrate dev`
- [ ] 更新 `tag.service.ts` 类型定义

### Phase 2: 数据同步脚本（1天）

- [ ] 创建 `scripts/sync-index-tags.ts`
- [ ] 创建 `scripts/sync-etf-tags.ts`
- [ ] 实现智能领域匹配逻辑
- [ ] 执行首次数据导入

### Phase 3: API接口调整（1天）

- [ ] 扩展 `/api/tags` 接口，支持按type筛选
- [ ] 添加 `/api/tags/market` 接口（返回指数+ETF）
- [ ] 更新前端标签选择器组件

### Phase 4: 资讯流集成（1天）

- [ ] 更新资讯AI分类逻辑，支持index/etf标签
- [ ] 资讯详情页展示关联的ETF/指数
- [ ] 标签筛选支持金融产品

### Phase 5: 图谱探索集成（1天）

- [ ] 图谱节点关联ETF标签
- [ ] 图谱筛选器支持按ETF/指数筛选
- [ ] 节点详情展示跟踪的ETF

---

## 🎨 六、前端展示优化

### 6.1 标签视觉区分

```typescript
const tagStyles = {
  domain:  { color: 'blue',   icon: '🏢' },
  tech:    { color: 'green',  icon: '⚙️' },
  company: { color: 'purple', icon: '🏭' },
  concept: { color: 'orange', icon: '💡' },
  index:   { color: 'red',    icon: '📈' },  // 🆕
  etf:     { color: 'gold',   icon: '💰' },  // 🆕
}
```

### 6.2 统一标签选择器

```tsx
<TagSelector
  types={['domain', 'tech', 'etf', 'index']}
  level={[1, 2, 3]}
  multiSelect={true}
  onSelect={(tags) => filterContent(tags)}
/>
```

### 6.3 标签关联展示

**资讯卡片**:
```
【标题】英伟达发布新一代GPU
🏢 AI算力  ⚙️ GPU  🏭 英伟达  💰 AI ETF  📈 科创50
```

**图谱节点**:
```
节点: 英伟达
关联ETF: 💰 AI ETF (515070), 💰 芯片ETF (159995)
跟踪指数: 📈 科创50, 📈 纳斯达克100
```

---

## ✅ 七、验收标准

1. ✅ 指数、ETF数据接口稳定可用
2. ✅ 数据库包含完整的指数、ETF标签
3. ✅ 资讯流可按ETF/指数筛选
4. ✅ 图谱探索可查看节点关联的ETF
5. ✅ 标签选择器统一，支持所有页面
6. ✅ 定时同步任务正常运行

---

## 🤔 八、待决策问题

### Q1: metadata存储格式

**选项**:
- A. JSON字符串存在Tag.metadata
- B. 独立的 TagMetadata 表（一对多）

**推荐**: A，简单高效，后续可扩展

### Q2: ETF多领域关联

一个ETF可能跨多个领域（如：AI ETF 同时关联AI、芯片、算力）

**选项**:
- A. parentId只指向主领域，通过keywords关联其他
- B. 允许多个parentId（需改数据模型）
- C. 新建 TagRelation 表管理多对多

**推荐**: A，成本最低

### Q3: 标签权重

图谱探索用relevance，资讯流用confidence，是否统一？

**选项**:
- A. 保持现状，不同场景不同语义
- B. 统一为 weight 字段

**推荐**: A，语义更清晰

---

## 📞 下一步行动

请确认以下事项，我可以立即开始实施：

1. ✅ **接口可用性已确认** - Python数据服务正常
2. ⏳ **方案是否认可** - 扩展Tag表、6级层级
3. ⏳ **是否立即开始** - Schema迁移 + 数据同步脚本
4. ⏳ **优先级确认** - 先做哪个页面（资讯流 vs 图谱探索）

**预计工时**: 5个工作日完成全部功能
