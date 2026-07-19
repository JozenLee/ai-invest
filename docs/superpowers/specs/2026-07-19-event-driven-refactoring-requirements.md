# 事件驱动系统重构需求分析报告

**生成日期**: 2026-07-19  
**分析范围**: 数据源层、事件输入层、AI清洗层、存储管理层、UI层  
**项目**: AI投资分析系统 (ai-invest)

---

## 目录

1. [系统架构概览](#系统架构概览)
2. [现状评估](#现状评估)
3. [功能缺口分析](#功能缺口分析)
4. [重构需求清单](#重构需求清单)
5. [实施优先级](#实施优先级)

---

## 系统架构概览

当前事件驱动系统的五层架构：

```
┌─────────────────────────────────────────────────────────────┐
│                         UI层                                 │
│  sources/page.tsx (数据源管理)                                │
│  feed/page.tsx (资讯流展示)                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    存储管理层                                 │
│  Prisma Schema: DataSource, NewsArticle, NewsCategory       │
│  event.service.ts (本地存储 + Python服务降级)                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     AI清洗层                                 │
│  news.py: categorize_news(), extract_sectors()              │
│  content_analyzer.py: Claude API情感分析                     │
│  claude.ts: 前端事件分析                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    事件输入层                                 │
│  scheduler_service.py: APScheduler定时任务                   │
│  influencers.py: 大V动态采集API                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    数据源层                                  │
│  DataSource表 (数据库定义)                                   │
│  providers/base.py: 抽象接口                                 │
│  AKShareProvider, SinaProvider, XueqiuProvider              │
│  social_provider.py: 微博/B站/小红书/RSS                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 现状评估

### 1. 数据源层 (70% 完成)

**已实现功能**:
- ✅ DataSource表设计 (id, name, type, provider, config, updateFrequency, isActive, lastFetchAt)
- ✅ DataProvider抽象基类 (providers/base.py)
- ✅ ProviderRegistry降级调度机制
- ✅ 多数据源实现: AKShare, Tushare, 雪球, 新浪
- ✅ 社交媒体Provider框架 (social_provider.py)
- ✅ 两级缓存 (内存 + 文件)

**存在问题**:
- ❌ DataSource表与实际providers未关联 (数据库配置与代码实现脱节)
- ❌ 社交媒体Provider仅有框架，无实际爬虫实现
- ❌ RSS Provider未实现
- ❌ 缺少Provider健康检查和状态监控
- ❌ 数据源配置全部硬编码在route.ts中，未使用数据库
- ❌ 无数据源CRUD管理API

**完成度**: 70%

---

### 2. 事件输入层 (40% 完成)

**已实现功能**:
- ✅ SchedulerService基础框架 (APScheduler)
- ✅ 添加/删除/暂停/恢复任务API
- ✅ 任务状态查询
- ✅ 定时任务在main.py中启动

**存在问题**:
- ❌ **无实际采集任务注册** (调度器启动但没有配置任何job)
- ❌ 缺少DataSource → SchedulerJob的自动映射
- ❌ 无采集任务执行日志 (DataSourceLog表未使用)
- ❌ 无失败重试机制
- ❌ 无采集结果统计和监控
- ❌ influencers.py路由存在但功能未完善
- ❌ 大V监控未与调度器集成

**完成度**: 40%

---

### 3. AI清洗层 (50% 完成)

**已实现功能**:
- ✅ 基础分类逻辑 (news.py: categorize_news)
- ✅ 板块提取 (extract_sectors)
- ✅ content_analyzer.py框架 (Claude API集成)
- ✅ 情感分析接口
- ✅ 主题提取接口
- ✅ 前端Claude客户端 (claude.ts)

**存在问题**:
- ❌ **分类逻辑过于简单** (仅基于关键词匹配)
- ❌ 新分类体系 (NewsCategory表) 未与AI清洗集成
- ❌ Domain领域匹配未使用
- ❌ 情感分析未自动化执行 (需手动调用)
- ❌ AI清洗未嵌入采集流程 (采集后数据未清洗直接存储)
- ❌ 无批量处理机制
- ❌ Claude API调用无错误处理和降级
- ❌ 前后端AI逻辑重复 (claude.ts vs content_analyzer.py)

**完成度**: 50%

---

### 4. 存储管理层 (60% 完成)

**已实现功能**:
- ✅ NewsArticle表完整定义
- ✅ NewsCategory层级分类表
- ✅ Domain领域表
- ✅ Influencer/InfluencerPost表
- ✅ DataSource/DataSourceLog表
- ✅ event.service.ts读取逻辑
- ✅ 滚动存储机制 (cleanupExpiredNews)

**存在问题**:
- ❌ **NewsArticle.categoryId/domainId/sourceId基本为空** (未在采集时填充)
- ❌ 数据库与Python采集服务未打通 (采集数据未持久化到本地)
- ❌ DataSourceLog表未使用
- ❌ 无自动归档机制
- ❌ 无数据质量监控
- ❌ InfluencerPost表有定义但未使用
- ❌ 缺少全文搜索索引

**完成度**: 60%

---

### 5. UI层 (75% 完成)

**已实现功能**:
- ✅ sources/page.tsx数据源管理页面
- ✅ 调度器状态展示
- ✅ 手动触发采集
- ✅ feed/page.tsx资讯流页面
- ✅ 多维筛选 (分类/领域/情感/关键词)
- ✅ 实时刷新
- ✅ 统计卡片展示

**存在问题**:
- ❌ 数据源配置页面为只读 (无法新增/编辑/删除)
- ❌ 调度器离线时功能大量失效
- ❌ 无采集日志查看功能
- ❌ 无数据源健康度可视化
- ❌ feed页面依赖Python服务，本地数据未优先使用
- ❌ 无大V动态展示页面
- ❌ 情感分析结果展示不完整

**完成度**: 75%

---

## 功能缺口分析

### 核心缺口

#### 1. **数据采集未真正自动化** (Critical)
**问题**: 调度器运行但无任务，数据源配置与采集逻辑脱节
**影响**: 系统无法自动获取新闻数据，完全依赖手动触发和Python服务
**涉及文件**:
- `data-service/main.py` (启动时未注册采集任务)
- `data-service/services/scheduler_service.py` (调度器空转)
- `prisma/schema.prisma` (DataSource表未被使用)

#### 2. **AI清洗未集成到数据流** (Critical)
**问题**: 采集后数据未经AI分类/情感分析，直接存储或丢弃
**影响**: NewsArticle中sentiment/categoryId/domainId等字段为空，筛选和分析功能失效
**涉及文件**:
- `data-service/routers/news.py` (采集逻辑未调用AI清洗)
- `data-service/services/content_analyzer.py` (独立存在但未集成)

#### 3. **本地存储与Python服务未打通** (High)
**问题**: Python采集的数据未持久化到本地数据库，每次重启数据丢失
**影响**: 前端完全依赖Python服务，离线后无数据
**涉及文件**:
- `src/lib/services/event.service.ts` (有存储逻辑但未调用)
- `data-service/routers/news.py` (无数据库写入逻辑)

#### 4. **数据源管理缺失** (High)
**问题**: UI展示的数据源为硬编码，无法动态管理
**影响**: 无法新增自定义数据源，扩展性差
**涉及文件**:
- `src/app/api/datasources/route.ts` (返回硬编码数据)
- DataSource表未被CRUD API使用

---

### 次要缺口

#### 5. **社交媒体采集未实现** (Medium)
- 微博/B站/小红书Provider仅有接口定义
- 无实际爬虫逻辑
- 未配置API密钥和认证

#### 6. **大V监控功能不完整** (Medium)
- Influencer表有设计但未使用
- influencers.py路由功能不完整
- UI层无大V动态展示

#### 7. **监控和日志缺失** (Medium)
- DataSourceLog表未记录采集日志
- 无采集成功率统计
- 无数据源健康检查

#### 8. **重复代码和架构混乱** (Low)
- claude.ts (前端) vs content_analyzer.py (后端) 功能重复
- 分类逻辑分散 (news.py vs claude.ts)
- 缓存逻辑重复 (registry.py vs data_service.py)

---

## 重构需求清单

### P0 - 核心功能补全 (必须立即实施)

#### R1: 实现自动化采集任务
**目标**: 调度器自动从DataSource表读取配置，定时执行采集
**任务**:
1. 在main.py启动时注册财联社新闻采集任务
2. DataSource → Provider → SchedulerJob 映射逻辑
3. 采集任务执行函数实现 (fetch_and_store)
4. 采集结果写入DataSourceLog

**涉及文件**:
- `data-service/main.py`
- `data-service/services/scheduler_service.py`
- `data-service/routers/news.py`

**验收标准**:
- 调度器启动后每小时自动采集财联社新闻
- 采集日志记录到DataSourceLog表
- UI可查看采集状态

---

#### R2: AI清洗流程集成
**目标**: 采集后数据自动经过分类/情感分析/领域匹配
**任务**:
1. 创建NewsProcessor服务 (整合content_analyzer)
2. 在采集函数中调用AI清洗
3. 清洗结果填充到NewsArticle (categoryId, domainId, sentiment, impact)
4. 批量处理优化 (避免逐条调用Claude API)

**涉及文件**:
- `data-service/services/news_processor.py` (新建)
- `data-service/services/content_analyzer.py`
- `data-service/routers/news.py`

**验收标准**:
- 新采集的新闻自动分类和情感分析
- NewsArticle表中categoryId/sentiment字段有值
- feed页面筛选功能正常工作

---

#### R3: 数据持久化到本地数据库
**目标**: Python采集的数据写入SQLite，前端优先读取本地
**任务**:
1. Python服务集成Prisma Client (或直接SQL)
2. 采集后数据写入NewsArticle表
3. 前端event.service.ts优先读取本地数据
4. 实现滚动刷新 (7天数据保留)

**涉及文件**:
- `data-service/routers/news.py`
- `src/lib/services/event.service.ts`
- `prisma/schema.prisma`

**验收标准**:
- Python服务重启后数据不丢失
- 前端可离线展示历史数据
- 数据库自动清理7天前数据

---

#### R4: 数据源动态管理API
**目标**: 数据源配置从数据库读取，支持CRUD
**任务**:
1. 创建DataSource CRUD API (GET/POST/PUT/DELETE)
2. UI支持新增/编辑数据源
3. 调度器动态加载DataSource配置
4. 数据源启用/禁用切换

**涉及文件**:
- `src/app/api/datasources/route.ts`
- `src/app/(dashboard)/events/sources/page.tsx`
- `data-service/main.py`

**验收标准**:
- UI可新增自定义RSS数据源
- 禁用数据源后不再采集
- 配置变更后调度器自动更新

---

### P1 - 功能增强 (短期优化)

#### R5: 采集日志和监控
**任务**:
1. DataSourceLog表记录每次采集详情
2. UI展示采集历史和成功率
3. 数据源健康度评分
4. 失败重试机制

**涉及文件**:
- `data-service/services/scheduler_service.py`
- `src/app/(dashboard)/events/sources/page.tsx`

---

#### R6: 分类体系与AI清洗集成
**任务**:
1. NewsCategory树形分类与AI分类结果映射
2. Domain领域关键词匹配优化
3. 分类置信度评分
4. 人工审核和修正接口

**涉及文件**:
- `data-service/services/content_analyzer.py`
- `src/app/api/events/categories/route.ts`

---

#### R7: 大V监控功能完善
**任务**:
1. 实现WeiboProvider/BilibiliProvider爬虫
2. Influencer数据采集任务
3. InfluencerPost存储和展示
4. 大V动态页面UI

**涉及文件**:
- `data-service/providers/social_provider.py`
- `data-service/routers/influencers.py`
- `src/app/(dashboard)/events/influencers/page.tsx` (新建)

---

### P2 - 架构优化 (长期重构)

#### R8: 前后端AI逻辑统一
**任务**:
1. 将claude.ts的分析逻辑迁移到Python
2. 前端仅保留API调用
3. 统一Prompt管理
4. 缓存AI分析结果

**涉及文件**:
- `src/lib/ai/claude.ts`
- `data-service/services/content_analyzer.py`

---

#### R9: 数据源插件化架构
**任务**:
1. Provider动态加载机制
2. 插件配置Schema验证
3. Provider沙箱执行
4. 社区插件市场

**涉及文件**:
- `data-service/providers/` (整体重构)

---

#### R10: 全文搜索和高级筛选
**任务**:
1. SQLite FTS5全文索引
2. 多条件组合搜索
3. 搜索结果高亮
4. 搜索历史和推荐

**涉及文件**:
- `prisma/schema.prisma`
- `src/lib/services/event.service.ts`

---

## 实施优先级

### Phase 1: 核心补全 (1-2周)
**目标**: 让系统真正自动化运行
- [P0-R1] 自动化采集任务
- [P0-R2] AI清洗流程集成
- [P0-R3] 数据持久化

**预期成果**:
- 系统每小时自动采集并清洗新闻
- 数据本地存储，重启不丢失
- feed页面展示完整分类和情感数据

---

### Phase 2: 管理增强 (1周)
**目标**: 提升可管理性和可观测性
- [P0-R4] 数据源动态管理
- [P1-R5] 采集日志和监控
- [P1-R6] 分类体系集成

**预期成果**:
- UI可动态管理数据源
- 采集过程透明可监控
- 分类准确度提升

---

### Phase 3: 功能扩展 (2-3周)
**目标**: 完善大V监控和社交数据
- [P1-R7] 大V监控功能
- [P2-R9] 数据源插件化

**预期成果**:
- 支持微博/B站数据采集
- 大V动态实时监控
- 用户可自定义数据源

---

### Phase 4: 架构优化 (持续)
**目标**: 代码质量和用户体验提升
- [P2-R8] 前后端逻辑统一
- [P2-R10] 全文搜索
- 性能优化和代码重构

---

## 附录

### 关键文件清单

**数据源层**:
- `prisma/schema.prisma` (DataSource表)
- `data-service/providers/base.py` (抽象接口)
- `data-service/providers/registry.py` (降级调度)
- `data-service/providers/akshare_provider.py`
- `data-service/providers/social_provider.py`

**事件输入层**:
- `data-service/services/scheduler_service.py`
- `data-service/main.py` (调度器启动)
- `data-service/routers/influencers.py`

**AI清洗层**:
- `data-service/routers/news.py` (分类逻辑)
- `data-service/services/content_analyzer.py` (Claude API)
- `src/lib/ai/claude.ts` (前端分析)

**存储管理层**:
- `prisma/schema.prisma` (NewsArticle, NewsCategory, Domain)
- `src/lib/services/event.service.ts`

**UI层**:
- `src/app/(dashboard)/events/sources/page.tsx`
- `src/app/(dashboard)/events/feed/page.tsx`
- `src/app/api/datasources/route.ts`
- `src/app/api/events/scheduler/*/route.ts`

### 技术栈
- **后端**: FastAPI + AKShare + APScheduler + Anthropic SDK
- **前端**: Next.js 16 + React 19 + TypeScript
- **数据库**: SQLite + Prisma ORM
- **调度**: APScheduler (asyncio)
- **AI**: Claude Sonnet 4

---

**报告结束**
