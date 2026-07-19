# 数据源页面优化设计方案

**日期**: 2026-07-20  
**版本**: v1.0  
**状态**: 待实施

## 一、需求概述

优化数据源管理页面，实现以下目标：

1. **增加数据源**：在现有4个分类下添加更多具体数据源（财经媒体、行业媒体、社交平台等）
2. **独立调度控制**：每个数据源配备独立的调度任务，可单独启用/禁用和调整频率
3. **UI优化**：在数据源卡片上直接显示调度状态、控制调度任务
4. **全中文化**：所有技术字段（type、status、driverType等）映射为中文显示

## 二、架构设计

### 2.1 整体架构

采用**统一调度器 + 独立任务控制**方案：

- **全局调度器**：一个 APScheduler 实例负责所有任务的执行
- **独立任务**：每个数据源对应一个 SchedulerJob，可独立配置
- **灵活控制**：支持单独启用/禁用、调整频率、立即执行

```
┌─────────────────────────────────────────┐
│         前端 (Next.js)                   │
│  数据源页面 + 调度控制UI                 │
└─────────────────────────────────────────┘
              ↓ API调用
┌─────────────────────────────────────────┐
│    Next.js API Routes                   │
│  - GET /api/datasources (增强)          │
│  - POST /api/datasources/[id]/toggle    │
│  - POST /api/datasources/[id]/fetch     │
│  - PATCH /api/datasources/[id]/schedule │
│  - GET /api/datasources/[id]/logs       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│    Python数据服务 (FastAPI)             │
│  - 全局调度器 (APScheduler)              │
│  - 任务同步服务                          │
│  - 数据采集驱动                          │
└─────────────────────────────────────────┘
```

### 2.2 数据模型

#### DataSource 扩展

```prisma
model DataSource {
  id              String   @id @default(cuid())
  name            String   // 中文名称
  type            String   // financial/social/video/custom
  driverType      String   // api/crawler/rss/social
  provider        String   // 提供商标识
  category        String   // 新增：媒体分类
  config          String   // JSON配置
  updateFrequency Int      @default(60)
  isActive        Boolean  @default(true)
  lastFetchAt     DateTime?
  lastFetchStatus String?
  errorMessage    String?
  
  schedulerJobs   SchedulerJob[]
  articles        NewsArticle[]
  logs            DataSourceLog[]
}
```

**新增字段**：
- `category`: 媒体分类（综合财经媒体、行业专业媒体、政策与监管、国际视角）

#### SchedulerJob（已存在）

```prisma
model SchedulerJob {
  id             String    @id
  sourceId       String
  scheduleType   String    // interval/cron
  scheduleConfig String    // JSON配置
  isEnabled      Boolean   @default(true)
  lastRunAt      DateTime?
  nextRunAt      DateTime?
  
  source         DataSource @relation(fields: [sourceId], references: [id])
}
```

## 三、数据源分类与示例数据

### 3.1 分类结构

保留现有4个分类，每个分类下添加典型数据源：

#### 综合财经媒体
- 财联社 (API接口, 30分钟)
- 东方财富 (网页爬虫, 60分钟)
- 新浪财经 (RSS订阅, 60分钟)
- 证券时报 (网页爬虫, 120分钟)
- 第一财经 (RSS订阅, 60分钟)

#### 行业专业媒体
- 36氪 (API接口, 60分钟)
- 钛媒体 (网页爬虫, 120分钟)
- 雷峰网 (RSS订阅, 120分钟)
- 机器之心 (RSS订阅, 180分钟)
- 量子位 (网页爬虫, 120分钟)

#### 政策与监管
- 证监会公告 (网页爬虫, 360分钟)
- 发改委通知 (网页爬虫, 360分钟)
- 工信部动态 (RSS订阅, 360分钟)

#### 国际视角
- Reuters科技 (RSS订阅, 120分钟)
- Bloomberg AI (API接口, 120分钟)
- TechCrunch (RSS订阅, 180分钟)

### 3.2 中文映射表

所有技术字段统一映射为中文：

```typescript
// 数据源类型
TYPE_LABELS = {
  financial: '财经媒体',
  social: '社交媒体',
  video: '视频平台',
  custom: '自定义'
}

// 驱动类型
DRIVER_TYPE_LABELS = {
  api: 'API接口',
  crawler: '网页爬虫',
  rss: 'RSS订阅',
  social: '社交平台'
}

// 运行状态
STATUS_LABELS = {
  active: '运行中',
  inactive: '已停止',
  paused: '已暂停'
}

// 采集状态
FETCH_STATUS_LABELS = {
  success: '成功',
  failed: '失败',
  running: '采集中',
  pending: '等待中'
}

// 调度类型
SCHEDULE_TYPE_LABELS = {
  interval: '间隔执行',
  cron: '定时执行',
  manual: '手动触发'
}
```

## 四、UI设计

### 4.1 页面布局

```
┌────────────────────────────────────────┐
│  📊 数据源管理              [刷新]     │
│  管理和监控所有数据采集源              │
├────────────────────────────────────────┤
│  统计卡片                              │
│  [总数: 15] [运行中: 12] [已停止: 3] │
├────────────────────────────────────────┤
│  ⚙️ 全局调度器状态                     │
│  ● 运行中 | 12个活跃任务               │
├────────────────────────────────────────┤
│  筛选器: [全部类型 ▼]                 │
├────────────────────────────────────────┤
│  数据源卡片网格 (按分类分组)           │
└────────────────────────────────────────┘
```

### 4.2 数据源卡片设计

每个卡片包含：

**顶部**：
- 图标 + 数据源名称 + 提供商
- 状态徽章（运行中/已停止）

**调度信息**（核心新增）：
- 运行状态指示器（●绿色/⭘灰色）
- 下次运行时间：`下次: 14:30`
- 最后采集状态：`最后: 成功`
- 更新频率：`频率: 30分钟`

**标签区域**：
- 分类徽章：`综合财经媒体`
- 驱动类型：`API接口`

**操作区域**：
- 启用/禁用开关
- 立即采集按钮
- 设置按钮（打开配置抽屉）

### 4.3 调度器设置抽屉

点击"设置"按钮弹出，包含：

1. **基本信息**：名称、类型、驱动
2. **调度配置**：
   - 调度方式（间隔/定时）
   - 更新频率（分钟）
   - 立即执行首次
3. **采集配置**：API地址、参数等
4. **运行历史**：最近10次执行记录

## 五、API接口设计

### 5.1 获取数据源列表（增强）

```
GET /api/datasources?category=综合财经媒体&isActive=true

Response: {
  success: true,
  data: [{
    id: "xxx",
    name: "财联社",
    category: "综合财经媒体",
    type: "financial",
    typeLabel: "财经媒体",
    driverType: "api",
    driverTypeLabel: "API接口",
    isActive: true,
    statusLabel: "运行中",
    updateFrequency: 30,
    lastFetchAt: "2026-07-20T14:00:00Z",
    lastFetchStatus: "success",
    lastFetchStatusLabel: "成功",
    scheduler: {
      isEnabled: true,
      nextRunAt: "2026-07-20T14:30:00Z",
      lastRunAt: "2026-07-20T14:00:00Z",
      scheduleType: "interval",
      scheduleTypeLabel: "间隔执行"
    },
    stats: {
      articlesCount: 1250,
      todayCount: 45,
      successRate: 98.5
    }
  }]
}
```

### 5.2 切换数据源状态

```
POST /api/datasources/[id]/toggle
Body: { isActive: true }

Response: {
  success: true,
  message: "已启用数据源"
}
```

### 5.3 立即执行采集

```
POST /api/datasources/[id]/fetch

Response: {
  success: true,
  message: "采集任务已触发",
  jobId: "xxx"
}
```

### 5.4 更新调度配置

```
PATCH /api/datasources/[id]/schedule
Body: {
  scheduleType: "interval",
  updateFrequency: 30
}

Response: {
  success: true,
  message: "调度配置已更新"
}
```

### 5.5 获取执行历史

```
GET /api/datasources/[id]/logs?limit=10

Response: {
  success: true,
  data: [{
    id: "xxx",
    status: "success",
    statusLabel: "成功",
    fetchedCount: 15,
    processedCount: 15,
    failedCount: 0,
    duration: 2340,
    createdAt: "2026-07-20T14:00:00Z",
    errorDetail: null
  }]
}
```

## 六、Python调度服务增强

### 6.1 调度器服务扩展

```python
class SchedulerService:
    
    async def sync_datasource_jobs(self):
        """从数据库同步数据源的调度任务"""
        # 1. 查询所有启用的数据源
        # 2. 为每个数据源创建/更新调度任务
        # 3. 移除已删除数据源的任务
        
    async def update_job_schedule(self, source_id: str, frequency: int):
        """更新指定数据源的调度频率"""
        job_id = f"fetch_{source_id}"
        # 移除旧任务，创建新任务
        
    async def enable_source_job(self, source_id: str):
        """启用数据源任务"""
        job_id = f"fetch_{source_id}"
        await self.resume_job(job_id)
        
    async def disable_source_job(self, source_id: str):
        """禁用数据源任务"""
        job_id = f"fetch_{source_id}"
        await self.pause_job(job_id)
        
    def get_source_job_status(self, source_id: str):
        """获取数据源的任务状态"""
        job_id = f"fetch_{source_id}"
        return self.get_job_status(job_id)
```

### 6.2 FastAPI路由扩展

```python
# 新增路由
@router.post("/datasources/{source_id}/toggle")
async def toggle_datasource(source_id: str, body: dict):
    """切换数据源启用状态"""
    
@router.post("/datasources/{source_id}/fetch")
async def fetch_datasource_now(source_id: str):
    """立即执行数据源采集"""
    
@router.patch("/datasources/{source_id}/schedule")
async def update_datasource_schedule(source_id: str, body: dict):
    """更新数据源调度配置"""
```

## 七、实施计划

### Phase 1: 数据库和种子数据
1. 添加 DataSource.category 字段迁移
2. 创建种子数据脚本，添加15个示例数据源
3. 为每个数据源自动创建 SchedulerJob

### Phase 2: 后端API开发
1. 增强 GET /api/datasources，返回调度信息和中文标签
2. 实现 POST /api/datasources/[id]/toggle
3. 实现 POST /api/datasources/[id]/fetch
4. 实现 PATCH /api/datasources/[id]/schedule
5. 实现 GET /api/datasources/[id]/logs

### Phase 3: Python调度服务
1. 扩展 SchedulerService 类
2. 添加数据源任务同步逻辑
3. 实现任务启用/禁用/频率调整
4. 添加 FastAPI 路由

### Phase 4: 前端UI开发
1. 创建中文映射常量文件
2. 重构数据源卡片组件，添加调度信息显示
3. 实现卡片内的调度控制（启用/禁用/立即执行）
4. 创建调度器设置抽屉组件
5. 实现执行历史查看功能

### Phase 5: 集成测试
1. 测试数据源的启用/禁用
2. 测试立即执行功能
3. 测试频率调整
4. 测试全局调度器与独立任务的协同
5. 验证所有中文化显示

## 八、技术要点

### 8.1 一致性保证

- DataSource.isActive 与 SchedulerJob.isEnabled 保持同步
- 频率修改时，同步更新数据库和调度器
- 立即执行不影响原定调度计划

### 8.2 错误处理

- 调度器离线时，UI显示降级提示
- 采集失败时，记录详细错误信息
- 频率调整失败时，回滚数据库更改

### 8.3 性能优化

- 数据源列表支持分页（后续扩展）
- 调度状态使用缓存减少查询
- 批量操作支持（后续扩展）

## 九、后续扩展方向

1. **数据源管理UI**：通过界面添加/编辑/删除数据源
2. **高级调度**：支持 Cron 表达式、条件触发
3. **监控告警**：采集失败时发送通知
4. **性能分析**：统计各数据源的质量和效率
5. **智能调度**：根据数据活跃度动态调整频率

## 十、验收标准

### 功能验收
- ✅ 15个示例数据源已添加并分类展示
- ✅ 每个数据源可独立启用/禁用
- ✅ 可调整单个数据源的采集频率
- ✅ 立即执行功能正常工作
- ✅ 调度器设置抽屉显示完整信息
- ✅ 执行历史准确记录

### UI验收
- ✅ 所有技术字段已中文化
- ✅ 调度状态实时显示
- ✅ 卡片布局清晰美观
- ✅ 操作响应及时，有加载状态

### 技术验收
- ✅ 全局调度器与独立任务协同正常
- ✅ 数据库与调度器状态一致
- ✅ 错误处理完善
- ✅ API接口返回正确的中文标签

---

**设计完成日期**: 2026-07-20  
**设计者**: Claude (Kiro)
