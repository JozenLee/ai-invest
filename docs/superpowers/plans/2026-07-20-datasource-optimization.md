# 数据源页面优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化数据源管理页面，实现独立调度控制、添加示例数据源、UI增强和全中文化

**Architecture:** 统一调度器 + 独立任务控制。前端通过 Next.js API Routes 与后端通信，后端使用 Prisma ORM 管理数据库，Python FastAPI 服务负责调度和数据采集。

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, SQLite, FastAPI, APScheduler

## Global Constraints

- Node.js >= 18
- TypeScript strict mode
- 使用 Prisma ORM 访问数据库
- 所有 API 响应使用 `{ success: boolean, data?: any, error?: string }` 格式
- 所有用户可见文本必须中文化
- 遵循项目现有的组件结构和样式约定
- 每个任务完成后必须提交 git commit

---

## 文件结构映射

### 新增文件
- `prisma/migrations/YYYYMMDDHHMMSS_add_datasource_category/migration.sql` - 添加 category 字段
- `prisma/seed-datasources.ts` - 种子数据脚本
- `src/lib/constants/datasource-labels.ts` - 中文映射常量
- `src/app/api/datasources/[id]/toggle/route.ts` - 切换数据源状态
- `src/app/api/datasources/[id]/fetch/route.ts` - 立即执行采集
- `src/app/api/datasources/[id]/schedule/route.ts` - 更新调度配置
- `src/components/events/DataSourceCard.tsx` - 增强的数据源卡片组件
- `src/components/events/SchedulerDrawer.tsx` - 调度器设置抽屉
- `data-service/routers/datasources.py` - Python 数据源路由

### 修改文件
- `prisma/schema.prisma:185` - 添加 category 字段到 DataSource 模型
- `src/app/api/datasources/route.ts:14-80` - 增强 GET 接口，返回调度信息和中文标签
- `src/app/(dashboard)/events/sources/page.tsx:33-466` - 重构页面，集成新组件
- `data-service/services/scheduler_service.py:17-189` - 扩展调度器服务

---

### Task 1: 数据库迁移 - 添加 category 字段

**Files:**
- Modify: `prisma/schema.prisma:185`
- Create: `prisma/migrations/YYYYMMDDHHMMSS_add_datasource_category/migration.sql`

**Interfaces:**
- Consumes: 无
- Produces: DataSource.category 字段 (String)

- [ ] **Step 1: 修改 Prisma Schema**

在 `prisma/schema.prisma` 的 DataSource 模型中添加 category 字段：

```prisma
model DataSource {
  id              String   @id @default(cuid())
  name            String
  type            String
  driverType      String   @default("api")
  provider        String
  category        String   @default("综合财经媒体") // 新增字段
  config          String
  configSchema    String?
  updateFrequency Int      @default(60)
  isActive        Boolean  @default(true)
  lastFetchAt     DateTime?
  lastFetchStatus String?
  errorMessage    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @default(now()) @updatedAt

  articles      NewsArticle[]
  logs          DataSourceLog[]
  schedulerJobs SchedulerJob[]
}
```

- [ ] **Step 2: 创建数据库迁移**

Run: `npx prisma migrate dev --name add_datasource_category`
Expected: 迁移文件已创建，数据库已更新

- [ ] **Step 3: 验证迁移**

Run: `npx prisma db push`
Expected: "The database is already in sync with the Prisma schema."

- [ ] **Step 4: 提交更改**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add category field to DataSource model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 创建种子数据脚本

**Files:**
- Create: `prisma/seed-datasources.ts`

**Interfaces:**
- Consumes: DataSource.category (String)
- Produces: 15个示例数据源记录

- [ ] **Step 1: 创建种子数据脚本文件**

创建 `prisma/seed-datasources.ts` 包含15个示例数据源

- [ ] **Step 2: 运行种子数据脚本**

Run: `npx tsx prisma/seed-datasources.ts`
Expected: "数据源种子数据添加完成！"

- [ ] **Step 3: 验证数据**

Run: `npx prisma studio`
Expected: DataSource 表中有15条记录，SchedulerJob 表中有对应的15条记录

- [ ] **Step 4: 提交更改**

```bash
git add prisma/seed-datasources.ts
git commit -m "feat(db): add datasource seed script with 15 sample sources

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 创建中文映射常量

**Files:**
- Create: `src/lib/constants/datasource-labels.ts`

**Interfaces:**
- Consumes: 无
- Produces: 导出函数 getTypeLabel, getDriverTypeLabel, getStatusLabel, getFetchStatusLabel, getScheduleTypeLabel

- [ ] **Step 1: 创建常量文件**

创建包含所有中文映射的常量文件

- [ ] **Step 2: 提交更改**

```bash
git add src/lib/constants/datasource-labels.ts
git commit -m "feat: add Chinese label mappings for datasource fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 增强数据源列表API

**Files:**
- Modify: `src/app/api/datasources/route.ts:14-80`

**Interfaces:**
- Consumes: 中文映射函数
- Produces: 增强的API响应，包含中文标签和调度信息

- [ ] **Step 1: 修改GET接口**

增强返回数据，添加typeLabel, driverTypeLabel, statusLabel, scheduler等字段

- [ ] **Step 2: 测试API**

Run: `npm run dev` 然后 `curl http://localhost:3000/api/datasources | jq '.data[0]'`
Expected: 返回包含中文标签的数据

- [ ] **Step 3: 提交更改**

```bash
git add src/app/api/datasources/route.ts
git commit -m "feat(api): enhance GET /api/datasources with labels and scheduler info

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 实现切换数据源状态API

**Files:**
- Create: `src/app/api/datasources/[id]/toggle/route.ts`

**Interfaces:**
- Consumes: DataSource.id, isActive
- Produces: API端点切换数据源启用/停用状态

- [ ] **Step 1: 创建toggle API路由**

实现POST方法，更新DataSource.isActive和SchedulerJob.isEnabled

- [ ] **Step 2: 测试API**

Run: `curl -X POST http://localhost:3000/api/datasources/{id}/toggle -H "Content-Type: application/json" -d '{"isActive": false}'`
Expected: `{"success": true, "message": "已停用数据源"}`

- [ ] **Step 3: 提交更改**

```bash
git add src/app/api/datasources/[id]/toggle/route.ts
git commit -m "feat(api): add POST /api/datasources/[id]/toggle endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 实现立即采集API

**Files:**
- Create: `src/app/api/datasources/[id]/fetch/route.ts`

**Interfaces:**
- Consumes: DataSource.id
- Produces: API端点立即触发数据源采集

- [ ] **Step 1: 创建fetch API路由**

实现POST方法，调用Python服务触发立即采集

- [ ] **Step 2: 测试API**

Run: `curl -X POST http://localhost:3000/api/datasources/{id}/fetch`
Expected: `{"success": true, "message": "采集任务已触发"}`

- [ ] **Step 3: 提交更改**

```bash
git add src/app/api/datasources/[id]/fetch/route.ts
git commit -m "feat(api): add POST /api/datasources/[id]/fetch endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 实现更新调度配置API

**Files:**
- Create: `src/app/api/datasources/[id]/schedule/route.ts`

**Interfaces:**
- Consumes: DataSource.id, scheduleType, updateFrequency
- Produces: API端点更新数据源调度配置

- [ ] **Step 1: 创建schedule API路由**

实现PATCH方法，更新DataSource.updateFrequency和SchedulerJob配置

- [ ] **Step 2: 测试API**

Run: `curl -X PATCH http://localhost:3000/api/datasources/{id}/schedule -H "Content-Type: application/json" -d '{"updateFrequency": 45}'`
Expected: `{"success": true, "message": "调度配置已更新"}`

- [ ] **Step 3: 提交更改**

```bash
git add src/app/api/datasources/[id]/schedule/route.ts
git commit -m "feat(api): add PATCH /api/datasources/[id]/schedule endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 扩展Python调度服务

**Files:**
- Modify: `data-service/services/scheduler_service.py:17-189`
- Create: `data-service/routers/datasources.py`

**Interfaces:**
- Consumes: source_id, updateFrequency
- Produces: 扩展的调度器服务方法

- [ ] **Step 1: 扩展SchedulerService类**

添加方法: sync_datasource_jobs, update_job_schedule, enable_source_job, disable_source_job

- [ ] **Step 2: 创建FastAPI路由**

实现 POST /datasources/{id}/fetch, PATCH /datasources/{id}/schedule

- [ ] **Step 3: 测试Python服务**

Run: `cd data-service && python main.py`，然后测试新增的API端点

- [ ] **Step 4: 提交更改**

```bash
git add data-service/services/scheduler_service.py data-service/routers/datasources.py
git commit -m "feat(backend): extend scheduler service for datasource control

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 创建增强的数据源卡片组件

**Files:**
- Create: `src/components/events/DataSourceCard.tsx`

**Interfaces:**
- Consumes: DataSource对象（包含scheduler信息和中文标签）
- Produces: 带调度控制的数据源卡片组件

- [ ] **Step 1: 创建DataSourceCard组件**

组件包含：基本信息展示、调度状态显示、启用/禁用开关、立即采集按钮、设置按钮

- [ ] **Step 2: 测试组件渲染**

Run: `npm run dev`，访问数据源页面查看卡片显示

- [ ] **Step 3: 提交更改**

```bash
git add src/components/events/DataSourceCard.tsx
git commit -m "feat(ui): create enhanced DataSourceCard component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: 创建调度器设置抽屉组件

**Files:**
- Create: `src/components/events/SchedulerDrawer.tsx`

**Interfaces:**
- Consumes: DataSource.id, 当前配置
- Produces: 调度器设置抽屉组件，支持修改频率和查看历史

- [ ] **Step 1: 创建SchedulerDrawer组件**

使用shadcn/ui的Sheet组件，包含：基本信息、调度配置表单、运行历史列表

- [ ] **Step 2: 集成API调用**

实现保存配置时调用PATCH /api/datasources/[id]/schedule

- [ ] **Step 3: 测试组件功能**

打开抽屉、修改频率、保存配置，验证API调用和UI更新

- [ ] **Step 4: 提交更改**

```bash
git add src/components/events/SchedulerDrawer.tsx
git commit -m "feat(ui): create SchedulerDrawer component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: 重构数据源页面

**Files:**
- Modify: `src/app/(dashboard)/events/sources/page.tsx:33-466`

**Interfaces:**
- Consumes: DataSourceCard, SchedulerDrawer组件
- Produces: 完整的数据源管理页面

- [ ] **Step 1: 重构页面组件**

替换旧的卡片实现为新的DataSourceCard组件，添加SchedulerDrawer

- [ ] **Step 2: 实现分类筛选**

支持按category筛选，使用增强的API

- [ ] **Step 3: 测试页面功能**

测试：加载数据、分类筛选、启用/禁用、立即采集、调度设置

- [ ] **Step 4: 验证中文化**

检查所有显示文本是否已中文化

- [ ] **Step 5: 提交更改**

```bash
git add src/app/(dashboard)/events/sources/page.tsx
git commit -m "feat(ui): refactor datasources page with enhanced components

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: 集成测试

**Files:**
- 无新增文件

**Interfaces:**
- Consumes: 所有已实现的功能
- Produces: 验证所有功能正常工作

- [ ] **Step 1: 启动所有服务**

Run: `npm run dev` (Next.js) 和 `cd data-service && python main.py` (Python)

- [ ] **Step 2: 测试数据源启用/禁用**

在UI中切换数据源状态，验证数据库和调度器同步更新

- [ ] **Step 3: 测试立即采集**

点击"立即采集"按钮，观察Python服务日志

- [ ] **Step 4: 测试频率调整**

修改数据源采集频率，验证SchedulerJob更新

- [ ] **Step 5: 验证中文化**

检查所有页面显示，确保无英文参数直接展示

- [ ] **Step 6: 创建测试报告**

```bash
git add .
git commit -m "test: complete integration testing for datasource optimization

All features verified:
- 15 sample datasources added
- Individual scheduler control working
- UI showing Chinese labels
- Toggle, fetch, schedule APIs functional

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验收清单

完成所有任务后，验证以下功能：

### 数据层
- [ ] DataSource表包含category字段
- [ ] 数据库中有15个示例数据源
- [ ] 每个数据源有对应的SchedulerJob记录

### API层
- [ ] GET /api/datasources 返回中文标签和调度信息
- [ ] POST /api/datasources/[id]/toggle 正常工作
- [ ] POST /api/datasources/[id]/fetch 正常工作
- [ ] PATCH /api/datasources/[id]/schedule 正常工作

### UI层
- [ ] 数据源卡片显示调度状态
- [ ] 可以在卡片上直接启用/禁用数据源
- [ ] 可以立即触发采集
- [ ] 调度器设置抽屉功能完整
- [ ] 所有文本已中文化

### 系统集成
- [ ] 前端操作与数据库状态同步
- [ ] Python调度器响应配置变更
- [ ] 错误处理完善，有降级提示

