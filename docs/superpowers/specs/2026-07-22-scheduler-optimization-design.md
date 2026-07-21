# 调度器优化与领域筛选设计

## 概述

本设计文档描述了数据源调度器系统的优化方案，包括：
1. 为AKShare和NewsNow补齐调度器配置
2. 简化调度器类型，移除Cron和Webhook
3. 添加领域筛选功能
4. 修复调度器可靠性问题
5. 修正新闻时间显示逻辑

## 目标

- 所有数据源都有完整的调度器配置
- 简化用户配置界面，提升易用性
- 支持基于领域的内容筛选
- 确保调度任务稳定可靠执行
- 新闻按发布时间排序和显示

## 架构设计

### 1. 数据模型

#### SchedulerJob 配置结构

```typescript
interface ScheduleConfig {
  intervalMinutes: number          // 轮询间隔（分钟）
  domainFilter?: {
    enabled: boolean                // 是否启用领域筛选
    domainIds: string[]            // 选中的领域ID列表
    mode: 'include' | 'exclude'    // 包含或排除模式
  }
}
```

### 2. 组件设计

#### 2.1 数据库层

**新增调度器记录：**
- 为所有缺少调度器的数据源创建 SchedulerJob
- 默认配置：
  - NewsNow: 30分钟间隔
  - AKShare: 60分钟间隔
  - 初始状态：已启用

**实现文件：** `scripts/add-missing-schedulers.ts`

#### 2.2 后端服务层

**Python调度器服务增强：**

文件：`data-service/services/scheduler_service.py`

新增功能：
- `sync_schedulers_from_database()` - 启动时从数据库加载调度器
- `execute_fetch_with_tracking()` - 带状态追踪的任务执行
- 健康检查端点

**数据采集服务增强：**

文件：`data-service/services/fetch_service.py`

新增功能：
- `apply_domain_filter()` - 应用领域筛选逻辑
- 支持混合筛选策略（API层+处理层）

**Provider层时间处理：**

所有Provider确保：
- 正确解析原始发布时间
- 不使用采集时间替代发布时间
- 时间格式统一为ISO 8601

#### 2.3 API层

**新增端点：**

```typescript
GET /api/domains
// 返回所有领域列表，供UI筛选使用

GET /api/datasources/schedulers/health
// 调度器健康检查，返回活跃任务状态
```

**更新端点：**

```typescript
PATCH /api/datasources/[id]/schedule
// 支持新的scheduleConfig结构，包含领域筛选
```

#### 2.4 前端UI层

**SchedulerDialog 组件重构：**

文件：`src/components/events/SchedulerDialog.tsx`

变更：
- 移除调度类型选择（删除Cron、Webhook选项）
- 简化为单一"定时轮询"配置
- 添加领域筛选区域：
  - 启用开关
  - 领域多选组件
  - 筛选模式切换（包含/排除）

**NewsCard 时间显示修正：**

确保所有显示组件使用 `publishTime` 而非 `createdAt`

### 3. 数据流设计

#### 3.1 调度器初始化流程

```
Python服务启动
  ↓
scheduler_service.start()
  ↓
sync_schedulers_from_database()
  ↓
查询所有启用的SchedulerJob
  ↓
为每个Job注册APScheduler任务
  ↓
任务开始定时执行
```

#### 3.2 数据采集与筛选流程

```
定时任务触发
  ↓
execute_fetch_with_tracking()
  ↓
更新调度器状态（lastRunAt）
  ↓
调用Provider获取原始数据
  ↓
AI分类和情感分析
  ↓
检查scheduleConfig.domainFilter
  ↓
应用领域筛选（如果启用）
  ↓
保存到数据库（NewsArticle）
  ↓
更新调度器状态（nextRunAt）
  ↓
记录执行日志（DataSourceLog）
```

#### 3.3 领域筛选策略（混合模式）

**收集层（Provider）：**
- 如果API支持分类参数 → 在请求时过滤
- 如果不支持 → 获取全量数据

**处理层（FetchService）：**
- AI分类后，检查domainFilter配置
- 应用包含/排除逻辑
- 只保存符合条件的文章

### 4. 可靠性保障

#### 4.1 任务状态追踪

```python
async def execute_fetch_with_tracking(
    source_id: str,
    scheduler_id: str,
    driver_config: dict
):
    start_time = datetime.now()
    
    try:
        # 更新开始时间
        await update_scheduler(scheduler_id, lastRunAt=start_time)
        
        # 执行采集
        await fetch_service.execute_fetch_task(source_id, driver_config)
        
        # 计算下次运行时间
        config = await get_scheduler_config(scheduler_id)
        interval = config['intervalMinutes']
        next_run = start_time + timedelta(minutes=interval)
        
        # 更新状态
        await update_scheduler(scheduler_id, nextRunAt=next_run)
        
    except Exception as e:
        logger.error(f"任务执行失败: {e}", exc_info=True)
        # 记录错误但不影响下次调度
```

#### 4.2 健康检查

```python
@router.get("/schedulers/health")
async def scheduler_health():
    active_jobs = scheduler_service.get_all_jobs()
    
    return {
        "scheduler_running": scheduler_service.is_running,
        "active_jobs_count": len(active_jobs),
        "jobs": [
            {
                "job_id": job['id'],
                "next_run": job['next_run'],
                "status": job['status']
            }
            for job in active_jobs
        ]
    }
```

### 5. 时间显示修正

#### 5.1 问题诊断检查点

1. **Provider层** - 确保提取原始发布时间
2. **保存层** - publishTime字段正确填充
3. **API层** - 返回正确字段
4. **UI层** - 使用publishTime显示

#### 5.2 修正方案

**Provider层：**
```python
def _transform_article(raw: dict) -> dict:
    return {
        'publishTime': parse_publish_time(raw['pubDate']),  # 使用原始时间
        # 其他字段...
    }
```

**UI层：**
```typescript
// 统一使用publishTime
const displayTime = formatRelativeTime(article.publishTime)

// 排序也使用publishTime
orderBy: { publishTime: 'desc' }
```

## 实现计划

### Phase 1: 数据库与脚本
- [ ] 创建 `scripts/add-missing-schedulers.ts`
- [ ] 为AKShare和NewsNow添加调度器记录
- [ ] 验证数据库状态

### Phase 2: 后端服务
- [ ] 增强 `scheduler_service.py` 启动同步逻辑
- [ ] 实现任务状态追踪包装器
- [ ] 添加领域筛选函数到 `fetch_service.py`
- [ ] 实现健康检查端点
- [ ] 修正所有Provider的时间处理

### Phase 3: API层
- [ ] 创建 `GET /api/domains` 端点
- [ ] 更新 `PATCH /api/datasources/[id]/schedule` 支持新配置
- [ ] 添加调度器健康检查端点

### Phase 4: 前端UI
- [ ] 重构 `SchedulerDialog` 组件
- [ ] 移除Cron和Webhook选项
- [ ] 添加领域筛选UI
- [ ] 修正所有时间显示组件

### Phase 5: 测试验证
- [ ] 端到端测试调度器配置
- [ ] 验证领域筛选功能
- [ ] 检查调度器执行稳定性
- [ ] 确认时间显示正确

## 技术考虑

### 安全性
- 调度器配置变更需验证数据完整性
- 领域筛选不影响原始数据采集日志
- 健康检查端点不暴露敏感信息

### 性能
- 领域筛选在AI处理后执行，避免重复分类
- 调度器状态更新使用事务确保一致性
- 健康检查查询优化，避免全表扫描

### 可维护性
- 调度器配置使用JSON Schema验证
- 日志记录详细，便于问题排查
- 组件职责清晰，便于扩展

## 成功标准

1. ✅ AKShare和NewsNow都有调度器配置
2. ✅ UI中移除了Cron和Webhook选项
3. ✅ 用户可以配置领域筛选
4. ✅ 调度器按配置时间稳定执行
5. ✅ 新闻按发布时间排序显示
6. ✅ 健康检查端点显示准确状态

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有调度器数据迁移 | 中 | 脚本支持幂等操作，可重复执行 |
| Provider时间解析失败 | 高 | 添加fallback逻辑，记录警告日志 |
| 领域筛选过滤过多内容 | 中 | 默认不启用，用户手动开启 |
| APScheduler状态丢失 | 高 | 启动时从数据库完全恢复 |

## 后续优化

1. 支持更复杂的筛选规则（关键词+领域组合）
2. 调度器执行统计和可视化
3. 智能调整采集频率（根据内容更新频率）
4. 支持调度器暂停/恢复操作

---

**设计完成时间：** 2026-07-22
**预计实施时间：** 1-2天
**影响范围：** 数据采集系统、调度器、前端UI
