# 事件驱动框架重构 - 综合摘要

**生成日期**: 2026-07-19  
**版本**: v1.0  
**状态**: 规划完成，待实施

---

## 📊 现状评估

### 系统整体完成度: **59%**

| 层次 | 完成度 | 核心问题 |
|------|--------|----------|
| **数据源层** | 70% | 架构完整但与数据库脱节，配置硬编码 |
| **事件输入层** | 40% | 调度器空转，无采集任务注册 |
| **AI清洗层** | 50% | 功能独立存在，未集成到数据流 |
| **存储管理层** | 60% | 表设计完整，但字段空置未使用 |
| **UI交互层** | 75% | 展示完善，但管理功能缺失 |

### 🔴 4个关键缺口 (Critical)

1. **数据采集未真正自动化**
   - 调度器运行但无任务注册
   - 数据源配置与采集逻辑脱节
   - 系统无法自动获取新闻数据

2. **AI清洗未集成到数据流**
   - 采集后数据未经AI处理直接存储
   - sentiment/categoryId/domainId字段为空
   - 筛选和分析功能失效

3. **本地存储与Python服务未打通**
   - Python采集的数据未持久化
   - 前端完全依赖Python服务
   - 每次重启数据丢失

4. **数据源管理缺失**
   - UI展示的数据源为硬编码
   - 无法动态新增自定义数据源
   - 扩展性差

---

## 🎯 重构目标

### 五层架构完整实现

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: UI交互层                                             │
│ ✨ 数据源创建向导 | 调度器配置 | AI规则管理 | 存储策略配置  │
├──────────────────────────────────────────────────────────────┤
│ Layer 4: 存储管理层                                           │
│ ✨ 统一存储接口 | 生命周期管理(7天) | 自动清理 | 归档策略   │
├──────────────────────────────────────────────────────────────┤
│ Layer 3: AI清洗层                                             │
│ ✨ Claude情感分析 | 智能分类 | 实体识别 | 领域匹配 | 筛选规则│
├──────────────────────────────────────────────────────────────┤
│ Layer 2: 事件输入层                                           │
│ ✨ 多种调度方式 | 并行采集 | 任务队列 | 重试机制 | 监控日志 │
├──────────────────────────────────────────────────────────────┤
│ Layer 1: 数据源层                                             │
│ ✨ 驱动抽象 | API/爬虫/RSS驱动 | 数据源注册表 | 动态配置    │
└──────────────────────────────────────────────────────────────┘
```

---

## 📋 实施计划

### Phase 1: 核心补全 (P0) - 1-2周

**目标**: 打通完整数据流，实现自动化采集和AI清洗

#### Week 1: 数据采集自动化
**R1: 实现自动化采集任务**
- [ ] main.py启动时注册财联社采集任务
- [ ] DataSource → Provider → SchedulerJob映射
- [ ] 采集任务执行函数 (fetch_and_store)
- [ ] 采集日志记录 (DataSourceLog)

**R2: AI清洗流程集成**
- [ ] 采集后自动调用content_analyzer
- [ ] 批量情感分析和分类
- [ ] 领域匹配逻辑实现
- [ ] AI处理状态跟踪

#### Week 2: 数据持久化
**R3: 本地数据库持久化**
- [ ] Python服务集成Prisma Client
- [ ] 采集数据写入NewsArticle表
- [ ] 关联分类、领域、数据源
- [ ] event.service.ts优先使用本地数据

**R4: 数据源管理API**
- [ ] CRUD API实现 (GET/POST/PUT/DELETE /api/datasources)
- [ ] 数据源测试连接接口
- [ ] 前端数据源管理表单

**关键文件**:
```
data-service/
├── main.py (启动时注册任务)
├── services/
│   ├── scheduler_service.py (增强)
│   ├── fetch_service.py (新增)
│   └── storage_service.py (新增)
├── routers/
│   └── news.py (集成AI清洗)

src/
├── app/api/
│   └── datasources/route.ts (CRUD实现)
└── lib/services/
    └── event.service.ts (优先本地)
```

---

### Phase 2: 功能增强 (P1) - 1周

**R5: 采集日志和监控**
- [ ] DataSourceLog完整记录
- [ ] 采集成功率统计
- [ ] 数据源健康检查
- [ ] UI展示日志和统计

**R6: 分类体系集成**
- [ ] NewsCategory层级分类使用
- [ ] AI自动分类到新体系
- [ ] 前端分类筛选优化

**R7: 大V监控完善**
- [ ] Influencer采集任务
- [ ] InfluencerPost存储
- [ ] 大V动态展示页面

---

### Phase 3: 架构优化 (P2) - 持续

**R8: 前后端AI逻辑统一**
- [ ] 统一使用后端content_analyzer
- [ ] 前端claude.ts作为备用
- [ ] API接口标准化

**R9: 数据源插件化架构**
- [ ] 驱动抽象基类 (BaseDataDriver)
- [ ] API/Crawler/RSS驱动实现
- [ ] 数据源注册表 (DataSourceRegistry)
- [ ] 配置Schema驱动UI

**R10: 高级功能**
- [ ] 全文搜索索引
- [ ] 高级筛选规则引擎
- [ ] 数据归档策略
- [ ] 存储配置UI

---

## 🗂️ 数据库Schema变更

### 新增表

```prisma
// 调度任务表
model SchedulerJob {
  id             String   @id @default(cuid())
  sourceId       String
  scheduleType   String   // cron/interval/webhook
  scheduleConfig String   // JSON配置
  isEnabled      Boolean  @default(true)
  lastRunAt      DateTime?
  nextRunAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  source DataSource @relation(fields: [sourceId], references: [id])
}

// 筛选规则表
model FilterRule {
  id          String   @id @default(cuid())
  name        String
  description String?
  config      String   // JSON配置
  isActive    Boolean  @default(true)
  priority    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// 存储配置表（单例）
model StorageConfig {
  id               String   @id @default(cuid())
  retentionDays    Int      @default(7)
  maxArticles      Int      @default(10000)
  archiveEnabled   Boolean  @default(false)
  archiveAfterDays Int      @default(30)
  cleanupSchedule  String   @default("0 2 * * *")
  lastCleanupAt    DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

### 增强现有表

```prisma
model DataSource {
  // 新增字段
  driverType      String   // api/crawler/rss/social
  configSchema    String?  // JSON Schema
  lastFetchStatus String?  // success/failed/running
  errorMessage    String?  // 错误信息
  
  // 新增关联
  schedulerJobs   SchedulerJob[]
}

model NewsArticle {
  // 新增AI处理字段
  categoryConfidence    Float?    @default(0)
  domainIds             String?   // JSON: 多领域
  sentimentLabel        String?   // bullish/neutral/bearish
  sentimentConfidence   Float?    @default(0)
  keywords              String?   // JSON: 关键词
  aiProcessed           Boolean   @default(false)
  aiProcessedAt         DateTime?
  aiError               String?
  expiresAt             DateTime? // 过期时间
  
  // 新增索引
  @@index([aiProcessed])
  @@index([expiresAt])
  @@index([sentimentLabel])
}

model DataSourceLog {
  // 新增字段
  jobId          String?
  processedCount Int      @default(0)
  failedCount    Int      @default(0)
  errorDetail    String?
  
  // 新增索引
  @@index([status])
}
```

---

## 🔌 API路由设计

### 数据源管理
```
GET    /api/datasources              # 列表（支持数据库查询）
POST   /api/datasources              # 创建
PUT    /api/datasources/:id          # 更新
DELETE /api/datasources/:id          # 删除
POST   /api/datasources/:id/test     # 测试连接
GET    /api/datasources/drivers      # 可用驱动列表
```

### 调度器管理
```
GET    /api/scheduler/jobs           # 任务列表
POST   /api/scheduler/jobs           # 创建任务
PUT    /api/scheduler/jobs/:id       # 更新任务
DELETE /api/scheduler/jobs/:id       # 删除任务
POST   /api/scheduler/jobs/:id/run   # 手动执行
GET    /api/scheduler/jobs/:id/logs  # 任务日志
```

### 事件采集（增强现有）
```
GET    /api/events/feed              # 优先使用本地数据库
POST   /api/events/analyze           # 调用后端AI分析
GET    /api/events/stats             # 数据统计
```

---

## 📁 关键文件清单

### 新增文件 (15个)

**Python后端**:
```
data-service/
├── drivers/
│   ├── base_driver.py           # 驱动抽象基类
│   ├── api_driver.py            # API驱动
│   ├── crawler_driver.py        # 爬虫驱动
│   └── rss_driver.py            # RSS驱动
├── registry/
│   └── source_registry.py       # 数据源注册表
└── services/
    ├── fetch_service.py         # 采集任务管理
    ├── storage_service.py       # 存储管理
    └── filter_engine.py         # 筛选规则引擎
```

**TypeScript前端**:
```
src/
├── app/(dashboard)/events/
│   ├── scheduler/page.tsx       # 调度器配置页面
│   ├── ai-rules/page.tsx        # AI规则配置
│   └── storage/page.tsx         # 存储策略
├── app/api/
│   ├── scheduler/               # 调度器API
│   ├── ai-rules/                # AI规则API
│   └── storage/                 # 存储API
├── components/events/
│   ├── DataSourceForm.tsx       # 数据源表单
│   └── SchedulerJobList.tsx     # 调度任务列表
└── lib/config/
    └── storage-config.ts        # 存储配置
```

### 修改文件 (10个)

```
data-service/
├── main.py                       # 启动时注册任务
├── routers/news.py               # 集成AI清洗
└── services/
    ├── scheduler_service.py      # 增强任务管理
    └── content_analyzer.py       # 批量处理

src/
├── app/api/datasources/route.ts  # 实现CRUD
├── app/api/events/feed/route.ts  # 优先本地数据
├── app/(dashboard)/events/
│   ├── sources/page.tsx          # 增加编辑功能
│   └── feed/page.tsx             # 优化筛选
├── lib/services/event.service.ts # 存储逻辑
└── prisma/schema.prisma          # Schema变更
```

---

## ⚠️ 风险评估

### 技术风险

1. **Python-Prisma集成** (Medium)
   - 风险: Python中使用Prisma Client可能遇到类型不匹配
   - 缓解: 使用prisma-client-py官方库，做好类型转换

2. **调度器稳定性** (Low)
   - 风险: 大量并发任务可能导致资源耗尽
   - 缓解: 限制并发数，使用任务队列

3. **AI API限流** (Medium)
   - 风险: Claude API调用频繁可能触发限流
   - 缓解: 批量处理，添加重试和降级逻辑

### 实施风险

1. **数据迁移** (Low)
   - 风险: Schema变更可能导致现有数据丢失
   - 缓解: 使用Prisma migration，保留旧字段

2. **向后兼容** (Low)
   - 风险: API变更影响现有功能
   - 缓解: 渐进式重构，保留旧API

---

## ✅ 验收标准

### Phase 1 验收标准

- [ ] 调度器自动执行财联社采集任务（每小时）
- [ ] 采集的新闻自动经过AI情感分析和分类
- [ ] 新闻数据持久化到本地SQLite数据库
- [ ] 前端优先展示本地数据，Python服务离线后仍可用
- [ ] 可通过UI创建、编辑、删除数据源
- [ ] DataSourceLog记录完整的采集日志
- [ ] 运行`npm run dev`和`python main.py`后系统全自动运行

### Phase 2 验收标准

- [ ] UI展示采集日志和成功率统计
- [ ] 新闻自动分类到NewsCategory体系
- [ ] 大V动态采集和展示功能可用

### Phase 3 验收标准

- [ ] 用户可通过UI添加自定义数据源（选择驱动类型）
- [ ] 数据7天后自动清理
- [ ] 全文搜索功能可用
- [ ] 完整的测试覆盖

---

## 📚 相关文档

1. **需求分析**: `2026-07-19-event-driven-refactoring-requirements.md`
2. **架构设计**: `2026-07-19-event-driven-architecture-design.md`
3. **实施计划**: `2026-07-19-event-driven-implementation-plan.md` (生成中)
4. **快速参考**: `2026-07-19-event-driven-quick-reference.md`

---

## 🚀 快速开始

### 1. 查看详细文档
```bash
cd docs/superpowers/specs
ls -la 2026-07-19-event-driven-*
```

### 2. 开始Phase 1实施

#### Step 1: 数据库迁移
```bash
# 修改 prisma/schema.prisma 添加新字段和表
npm run db:migrate -- --name add_event_driven_phase1
```

#### Step 2: Python依赖
```bash
cd data-service
pip install prisma-client-py
# 生成Prisma Client
prisma generate
```

#### Step 3: 实现采集任务
编辑文件：
- `data-service/main.py`
- `data-service/services/fetch_service.py` (新建)
- `data-service/routers/news.py`

#### Step 4: 测试
```bash
# 启动服务
npm run dev
cd data-service && python main.py

# 验证采集任务
curl http://localhost:8000/api/scheduler/jobs
```

### 3. 监控进度
```bash
# 查看调度器日志
tail -f data-service/logs/scheduler.log

# 查看数据库
npm run db:studio
```

---

**最后更新**: 2026-07-19  
**下一步**: 等待实施计划文档完成，开始Phase 1实施
