# 事件驱动框架重构 - 快速参考

## 文档索引

1. **需求分析** (生成中): `2026-07-19-event-driven-refactoring-requirements.md`
2. **架构设计** (已完成): `2026-07-19-event-driven-architecture-design.md`
3. **实施计划** (生成中): `2026-07-19-event-driven-implementation-plan.md`

## 五层架构速览

```
Layer 5: UI交互层 → 数据源管理、调度配置、清洗规则、存储策略、事件展示
Layer 4: 存储管理层 → 统一存储接口、生命周期管理、自动清理、归档策略
Layer 3: AI清洗层 → 情感分析、自动分类、实体识别、领域匹配、筛选规则
Layer 2: 事件输入层 → 调度器、采集任务、队列管理、重试机制、并行处理
Layer 1: 数据源层 → 驱动抽象、API驱动、爬虫驱动、RSS驱动、数据源注册表
```

## 核心改进点

### 1. 数据源层 (Layer 1)
**现状**: 只支持固定的数据提供者（AKShare、Tushare等）
**改进**: 
- ✨ 用户可自定义数据源
- ✨ 可插拔驱动系统（API/Crawler/RSS/Social）
- ✨ 配置Schema驱动UI生成
- ✨ 数据源注册表和生命周期管理

**关键文件**:
```
data-service/drivers/
├── base_driver.py          # 驱动抽象基类
├── api_driver.py           # API驱动实现
├── crawler_driver.py       # 爬虫驱动实现
├── rss_driver.py           # RSS驱动实现
└── social_driver.py        # 社交媒体驱动

data-service/registry/
└── source_registry.py      # 数据源注册表
```

### 2. 事件输入层 (Layer 2)
**现状**: 基础的定时任务调度
**改进**:
- ✨ 灵活的调度配置（Cron/Interval/Webhook）
- ✨ 多数据源并行采集
- ✨ 任务队列和重试机制
- ✨ 采集任务管理和监控

**关键文件**:
```
data-service/services/
├── scheduler_service.py    # 增强的调度器服务
└── fetch_service.py        # 采集任务管理 (新增)
```

### 3. AI清洗层 (Layer 3)
**现状**: 简单的规则分类和情感分析
**改进**:
- ✨ Claude API深度集成
- ✨ 智能情感分析（置信度）
- ✨ 自动分类到多级分类体系
- ✨ 实体识别和关键词提取
- ✨ 领域智能匹配
- ✨ 可配置的筛选规则引擎

**关键文件**:
```
data-service/services/
├── ai_analyzer.py          # AI分析服务 (新增)
├── content_analyzer.py     # 内容分析器 (已存在，待增强)
└── filter_engine.py        # 筛选规则引擎 (新增)
```

### 4. 存储管理层 (Layer 4)
**现状**: 简单的数据持久化
**改进**:
- ✨ 统一的存储接口
- ✨ 自动化生命周期管理（默认7天可配置）
- ✨ 定期清理过期数据
- ✨ 数据归档策略
- ✨ 存储统计和监控

**关键文件**:
```
data-service/services/
└── storage_manager.py      # 存储管理服务 (新增)

src/lib/config/
└── storage-config.ts       # 存储配置 (新增)
```

### 5. UI交互层 (Layer 5)
**现状**: 基础的展示页面
**改进**:
- ✨ 数据源创建向导（驱动选择 → 配置 → 测试）
- ✨ 调度器配置和监控界面
- ✨ AI清洗规则配置页面
- ✨ 存储策略管理页面
- ✨ 增强的事件筛选和展示

**关键页面**:
```
src/app/(dashboard)/events/
├── sources/page.tsx        # 数据源管理 (增强)
├── scheduler/page.tsx      # 调度器配置 (新增)
├── ai-rules/page.tsx       # AI规则配置 (新增)
├── storage/page.tsx        # 存储策略 (新增)
└── feed/page.tsx           # 事件流 (优化)
```

## 数据库Schema关键变更

### 新增表
```prisma
model SchedulerJob {
  // 调度任务表
  scheduleType: cron/interval/webhook
  scheduleConfig: JSON配置
}

model FilterRule {
  // 筛选规则表
  config: JSON配置
  priority: 优先级
}

model StorageConfig {
  // 存储配置表（单例）
  retentionDays: 保留天数
  maxArticles: 最大文章数
}
```

### 增强字段
```prisma
model DataSource {
  + driverType: string       # api/crawler/rss/social
  + configSchema: string     # JSON Schema
  + lastFetchStatus: string  # 最后状态
  + errorMessage: string     # 错误信息
}

model NewsArticle {
  + categoryConfidence: float        # 分类置信度
  + domainIds: string               # 多领域支持
  + sentimentLabel: string          # bullish/neutral/bearish
  + sentimentConfidence: float      # 情感置信度
  + keywords: string                # 关键词
  + aiProcessed: boolean            # AI处理状态
  + aiProcessedAt: datetime         # AI处理时间
  + expiresAt: datetime             # 过期时间
}

model DataSourceLog {
  + jobId: string           # 关联调度任务
  + processedCount: int     # 处理成功数
  + failedCount: int        # 处理失败数
  + errorDetail: string     # 错误详情
}
```

## API路由规划

### 数据源管理
```
GET    /api/datasources              # 列表
POST   /api/datasources              # 创建
PUT    /api/datasources/:id          # 更新
DELETE /api/datasources/:id          # 删除
POST   /api/datasources/:id/test     # 测试连接
GET    /api/datasources/drivers      # 可用驱动列表
```

### 调度器
```
GET    /api/scheduler/jobs           # 任务列表
POST   /api/scheduler/jobs           # 创建任务
PUT    /api/scheduler/jobs/:id       # 更新任务
DELETE /api/scheduler/jobs/:id       # 删除任务
POST   /api/scheduler/jobs/:id/run   # 手动执行
GET    /api/scheduler/jobs/:id/logs  # 任务日志
```

### AI清洗
```
GET    /api/ai-rules                 # 规则列表
POST   /api/ai-rules                 # 创建规则
PUT    /api/ai-rules/:id             # 更新规则
DELETE /api/ai-rules/:id             # 删除规则
POST   /api/ai-rules/test            # 测试规则
```

### 存储管理
```
GET    /api/storage/config           # 获取配置
PUT    /api/storage/config           # 更新配置
GET    /api/storage/stats            # 存储统计
POST   /api/storage/cleanup          # 手动清理
POST   /api/storage/archive          # 手动归档
```

## 实施优先级

### P0 - 核心功能（第1-2周）
1. 数据源层驱动抽象和注册表
2. 调度器增强和任务管理
3. AI分析服务（Claude集成）
4. 基础数据库迁移

### P1 - 重要功能（第3-4周）
1. 存储生命周期管理
2. UI增强（数据源管理、调度配置）
3. 筛选规则引擎
4. API路由实现

### P2 - 优化功能（第5-6周）
1. 高级UI功能（AI规则配置、存储管理）
2. 监控和告警
3. 性能优化
4. 完整测试覆盖

## 快速开始

### 1. 查看架构设计
```bash
cat docs/superpowers/specs/2026-07-19-event-driven-architecture-design.md
```

### 2. 开始实施（等待实施计划文档生成）
```bash
# 查看实施计划
cat docs/superpowers/specs/2026-07-19-event-driven-implementation-plan.md

# 创建第一个数据库迁移
npm run db:migrate -- --name add_event_driven_enhancements

# 启动开发环境
npm run dev              # Next.js
cd data-service && python main.py  # FastAPI
```

### 3. 测试验收
```bash
# 运行完整测试套件
bash scripts/acceptance-test.sh
```

## 技术栈

- **Backend**: FastAPI + Prisma Client (Python) + APScheduler
- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Database**: SQLite + Prisma ORM v7
- **AI**: Claude API (Anthropic SDK)
- **爬虫**: BeautifulSoup4 + httpx

## 预期成果

完成重构后，系统将具备：

✅ **灵活的数据源管理** - 用户可自定义任意数据源
✅ **智能的事件采集** - 多种调度方式和并行处理
✅ **深度的AI分析** - 情感、分类、实体、领域全方位分析
✅ **自动的数据管理** - 生命周期管理、自动清理、归档
✅ **完善的UI交互** - 完整的配置界面和实时监控

## 相关文档

- 项目说明: `CLAUDE.md`
- Prisma Schema: `prisma/schema.prisma`
- 现有实现: 
  - `data-service/providers/base.py`
  - `data-service/services/scheduler_service.py`
  - `src/app/(dashboard)/events/`

---

**更新时间**: 2026-07-19
**版本**: v1.0
**状态**: 规划中
