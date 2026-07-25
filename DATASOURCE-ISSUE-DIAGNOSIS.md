# 数据源管理问题诊断报告

**日期**: 2026-07-24  
**问题**: 数据源配置了定时轮询，但资讯流页面新闻一直没有更新

---

## 问题诊断

### 核心问题发现

#### 问题1: Python数据服务未启动 ⚠️
```bash
# 检查Python进程
$ ps aux | grep python | grep -v grep
(无输出)
```
**影响**: 所有数据源采集任务无法执行

#### 问题2: 调度器未同步数据库配置 ⚠️
```python
# data-service/main.py:44-50
# 从数据库同步调度任务（临时禁用，避免AI API故障阻塞服务）
# try:
#     sync_stats = await scheduler_service.sync_schedulers_from_database()
# ...
logger.info("数据库调度任务同步已禁用（避免AI API故障阻塞服务）")
```
**影响**: 即使Python服务启动，也不会执行数据库中配置的10个数据源采集任务

#### 问题3: 调度器健康检查验证
```bash
$ curl http://localhost:8000/schedulers/health
{
  "is_running": true,
  "total_jobs": 1,        # ⚠️ 应该有11个任务（10个数据源 + 1个缓存刷新）
  "active_jobs": 1,       # ⚠️ 只有缓存刷新任务
  "jobs": [
    {
      "id": "daily_cache_refresh",  # ⚠️ 缺少10个数据源采集任务
      "next_run": "2026-07-24T15:30:00+08:00"
    }
  ]
}
```

---

## 数据链路图

### 完整数据流

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. 数据源配置层                                                    │
├─────────────────────────────────────────────────────────────────┤
│ DataSource表 (10个数据源)                                         │
│  - 新浪财经, 界面新闻, 品玩, 雷锋网, 极客公园                       │
│  - 微博科技, 知乎财经, B站科技, 抖音财经, YouTube科技               │
│ Status: ✅ isActive = true                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. 调度任务层                                                      │
├─────────────────────────────────────────────────────────────────┤
│ SchedulerJob表 (10个调度任务)                                     │
│  - scheduleType: interval                                       │
│  - scheduleConfig: {"intervalMinutes": 30/60}                  │
│  - isEnabled: true                                              │
│ Status: ✅ 配置正确                                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Python调度器 (APScheduler)                                    │
├─────────────────────────────────────────────────────────────────┤
│ scheduler_service.sync_schedulers_from_database()               │
│ Status: ❌ 被注释禁用 (main.py:44-50)                            │
│                                                                  │
│ 原因: "避免AI API故障阻塞服务"                                     │
│ 结果: 数据库中的调度任务未加载到APScheduler                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. 采集执行层                                                      │
├─────────────────────────────────────────────────────────────────┤
│ fetch_service.execute_fetch_task()                              │
│ Status: ❌ 未被调度器触发                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. AI分析层                                                       │
├─────────────────────────────────────────────────────────────────┤
│ ai_service.process_article()                                    │
│  - 分类 (category)                                               │
│  - 情感 (sentiment)                                              │
│  - 关键词提取 (keywords)                                          │
│ Status: ❌ 未收到数据                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. 数据存储层                                                      │
├─────────────────────────────────────────────────────────────────┤
│ NewsArticle表                                                    │
│ 当前状态:                                                          │
│  - 总数: 55条                                                     │
│  - 最新: 2026-07-21 18:56:08 (cailian_default)                  │
│  - 来源: 全部来自财联社默认数据源                                   │
│ Status: ⚠️ 3天未更新，只有一个数据源有数据                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. 前端展示层                                                      │
├─────────────────────────────────────────────────────────────────┤
│ /api/events/feed → eventService.getNewsFeed()                  │
│ 资讯流页面                                                         │
│ Status: ⚠️ 显示旧数据，无新内容                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据库状态验证

### DataSource表 (数据源配置)
```sql
SELECT id, name, isActive, lastFetchAt, lastFetchStatus 
FROM DataSource 
ORDER BY updatedAt DESC 
LIMIT 10;
```

**结果**:
| 数据源 | 状态 | 最后采集时间 | 采集状态 |
|--------|------|-------------|---------|
| 抖音-财经 | ✅ 激活 | 2026-07-20 06:13:40 | success |
| YouTube-科技 | ✅ 激活 | 2026-07-20 06:09:35 | success |
| 知乎-财经 | ✅ 激活 | 2026-07-20 05:57:15 | success |
| B站-科技区 | ✅ 激活 | 2026-07-20 06:05:28 | success |
| 极客公园 | ✅ 激活 | 2026-07-20 05:44:54 | success |

**观察**: 
- ✅ 所有数据源都是激活状态
- ⚠️ 最后采集时间是4天前 (2026-07-20)
- ⚠️ 从7月20日之后就没有再执行过采集

### SchedulerJob表 (调度任务)
```sql
SELECT id, scheduleType, isEnabled, lastRunAt, nextRunAt 
FROM SchedulerJob 
LIMIT 10;
```

**结果**: 10个任务，全部 `isEnabled = true`，但 `lastRunAt` 大部分为空或很旧

### NewsArticle表 (新闻数据)
```sql
SELECT COUNT(*) as total FROM NewsArticle;
-- 结果: 55条

SELECT id, title, publishTime, sourceId 
FROM NewsArticle 
ORDER BY publishTime DESC 
LIMIT 5;
```

**最新数据**: 2026-07-21 18:56:08 (全部来自 `cailian_default`)

### DataSourceLog表 (采集日志)
```sql
SELECT COUNT(*) as log_count, status 
FROM DataSourceLog 
GROUP BY status;
```

**结果**:
- success: 109次
- running: 68次 ⚠️ (异常，可能是进程被中断导致状态未更新)

---

## 根本原因分析

### 为什么被禁用？

从代码注释看，开发者之前遇到了 **"AI API故障阻塞服务"** 的问题：

1. **场景推测**: 
   - 采集任务调用Claude API进行文章分析
   - 当AI API不可用或超时时，整个服务启动被阻塞
   - 为了保证服务可用性，临时禁用了调度任务同步

2. **影响范围**:
   - ❌ 所有10个数据源的定时采集全部失效
   - ❌ 用户在前端配置的调度任务不生效
   - ✅ 手动触发采集仍可用 (通过 POST /api/datasources/[id]/fetch)

### 为什么现在没有新数据？

1. **Python服务未启动**: 即使修复代码，服务不运行也无法采集
2. **调度器未加载任务**: 即使服务启动，也不会执行数据库中的任务
3. **缺少降级机制**: AI处理失败时应该保存原始文章，而不是阻塞整个流程

---

## 修复方案

### 方案A: 立即恢复 (推荐) ✅

**目标**: 恢复调度器功能，启用数据源定时采集

#### 步骤1: 修复调度器同步逻辑
```python
# data-service/main.py:44-50
# 修改前 (被禁用)
# try:
#     sync_stats = await scheduler_service.sync_schedulers_from_database()
# ...

# 修改后 (启用 + 错误容错)
try:
    sync_stats = await scheduler_service.sync_schedulers_from_database()
    logger.info(f"✅ 调度任务同步结果: {sync_stats}")
except Exception as e:
    logger.error(f"⚠️ 调度任务同步失败，服务继续运行: {e}")
    # 不抛出异常，避免阻塞服务启动
```

#### 步骤2: 增强AI处理的容错性
确保 `fetch_service` 中的AI处理失败不会导致整个采集任务失败：
```python
# 伪代码
try:
    ai_result = await ai_service.process_article(article)
    article.sentiment = ai_result.sentiment
    article.category = ai_result.category
except Exception as e:
    logger.warning(f"AI处理失败，保存原始文章: {e}")
    article.aiProcessed = False
    article.aiError = str(e)
# 继续保存文章到数据库
await save_article(article)
```

#### 步骤3: 启动Python数据服务
```bash
cd data-service
python main.py
```

#### 步骤4: 验证调度器状态
```bash
curl http://localhost:8000/schedulers/health | jq
# 期望: total_jobs = 11 (10个数据源 + 1个缓存刷新)
```

#### 步骤5: 监控采集日志
```bash
# 观察日志输出，确认任务执行
tail -f data-service.log

# 或通过API查询
curl http://localhost:3000/api/datasources/logs | jq
```

### 方案B: 渐进式修复 (保守)

如果担心AI API仍不稳定，可以：

1. **先启用部分数据源**: 只启用1-2个数据源测试
2. **增加AI超时设置**: 设置更宽松的超时时间
3. **异步处理AI任务**: 先保存原始文章，AI处理放到后台队列
4. **手动触发验证**: 通过前端"立即采集"按钮测试单个数据源

---

## 快速修复命令

```bash
# 1. 修复main.py (启用调度器同步)
cd /Users/jozen.lee/ai-softwares/ai-invest

# 2. 启动Python数据服务
cd data-service
python main.py &

# 3. 检查服务健康
sleep 5
curl http://localhost:8000/schedulers/health

# 4. 查看最新新闻
curl "http://localhost:3000/api/events/feed?limit=5" | jq '.data.items[0]'

# 5. 监控调度器日志
tail -f data-service.log
```

---

## 预期结果

修复后，系统应该：

1. ✅ Python调度器成功加载10个数据源任务
2. ✅ 每30-60分钟自动执行采集
3. ✅ 采集日志显示 `status: success`
4. ✅ NewsArticle表持续有新数据写入
5. ✅ 资讯流页面显示最新新闻（来自多个数据源）

---

## 长期优化建议

### 1. 服务健壮性
- 实现AI处理降级：失败时保存原始文章，标记 `aiProcessed=false`
- 独立的AI处理队列：采集和AI分析解耦
- 断点续传：服务重启后继续未完成的采集任务

### 2. 监控告警
- 添加调度器健康检查端点
- 定时检查 `lastFetchAt`，超过2小时未更新则告警
- Prometheus监控指标

### 3. 用户体验
- 前端显示数据源最后采集时间
- 采集失败时显示明确的错误信息
- 提供"重新启动所有数据源"的批量操作

---

## 附录：关键文件路径

- 调度器配置: `data-service/main.py`
- 调度器服务: `data-service/services/scheduler_service.py`
- 采集服务: `data-service/services/fetch_service.py`
- 数据源API: `src/app/api/datasources/[id]/fetch/route.ts`
- 事件服务: `src/lib/services/event.service.ts`
