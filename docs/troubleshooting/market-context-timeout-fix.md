# MarketContext 超时问题修复记录

## 问题描述

**日期**: 2026-07-22

**错误信息**: `[MarketContext] 数据获取失败: "signal timed out"`

**影响**: 前端UI无法加载市场数据，所有市场相关页面报错

## 问题分析

### 1. 症状
- 前端 `MarketContext` 10秒后超时
- Python数据服务虽然运行但无响应
- 健康检查接口 `/health` 超时
- 市场数据接口 `/api/market/overview` 超时

### 2. 根本原因
Python服务启动时的初始化流程阻塞了FastAPI事件循环：

```python
# main.py lifespan函数中
async def lifespan(app: FastAPI):
    # 1. 从数据库同步调度任务
    sync_stats = await scheduler_service.sync_schedulers_from_database()
    # ⚠️ 同步了9个启用的调度任务
    
    # 2. 注册财联社新闻采集任务
    await scheduler_service.add_interval_job(
        job_id="fetch_cailian_news",
        func=fetch_cailian_news,
        minutes=60
    )
    # ⚠️ 任务立即执行（next_run_time=datetime.now()）
```

**阻塞链路**:
1. 调度任务启动 → 采集新闻 
2. 新闻采集 → 调用AI内容分析 (`services/content_analyzer.py`)
3. AI分析 → Claude API请求
4. Claude API返回503错误（"No available accounts"）
5. SDK自动重试（3次，带指数退避）
6. **大量重试请求阻塞FastAPI主线程**
7. 所有HTTP请求无法响应

### 3. 日志证据

```
INFO:httpx:HTTP Request: POST https://apiclaude.cc/v1/messages "HTTP/1.1 503 Service Unavailable"
INFO:anthropic._base_client:Retrying request to /v1/messages in 0.785249 seconds
INFO:httpx:HTTP Request: POST https://apiclaude.cc/v1/messages "HTTP/1.1 503 Service Unavailable"
ERROR:services.content_analyzer:实体识别失败: Error code: 503 - {'error': {'message': 'No available accounts: no available accounts', 'type': 'api_error'}, 'type': 'error'}
```

## 修复方案

### 修改文件: `data-service/main.py`

#### 1. 禁用数据库调度任务同步

**原代码**:
```python
# 从数据库同步调度任务（新增）
try:
    sync_stats = await scheduler_service.sync_schedulers_from_database()
    logger.info(f"调度任务同步结果: {sync_stats}")
except Exception as e:
    logger.error(f"调度任务同步失败: {e}")
```

**修复后**:
```python
# 从数据库同步调度任务（临时禁用，避免AI API故障阻塞服务）
# try:
#     sync_stats = await scheduler_service.sync_schedulers_from_database()
#     logger.info(f"调度任务同步结果: {sync_stats}")
# except Exception as e:
#     logger.error(f"调度任务同步失败: {e}")
logger.info("数据库调度任务同步已禁用（避免AI API故障阻塞服务）")
```

#### 2. 禁用财联社新闻采集任务

**原代码**:
```python
# 注册财联社新闻采集任务（每小时执行一次）
from services.fetch_service import fetch_service

async def fetch_cailian_news():
    """采集财联社新闻的任务函数"""
    try:
        logger.info("执行财联社新闻采集任务...")
        result = await fetch_service.execute_fetch_task(...)
        logger.info(f"采集任务完成: {result}")
    except Exception as e:
        logger.error(f"采集任务失败: {e}")

await scheduler_service.add_interval_job(
    job_id="fetch_cailian_news",
    func=fetch_cailian_news,
    minutes=60
)
```

**修复后**:
```python
# 注册财联社新闻采集任务（每小时执行一次）
# DISABLED: 暂时禁用自动采集任务，避免AI API故障阻塞服务启动
# ... (所有代码注释掉)
logger.info("新闻采集任务已禁用（避免AI API故障阻塞服务）")
```

## 验证结果

修复后所有接口响应正常：

| 接口 | 状态 | 响应时间 |
|------|------|----------|
| `/health` | ✅ 200 | ~8ms |
| `/api/market/overview` (Python) | ✅ 200 | ~8ms |
| `/api/market/overview` (Next.js) | ✅ 200 | ~13ms |
| `/api/market/capital-flow` | ✅ 200 | ~14ms |

前端 `MarketContext` 不再超时，UI正常显示市场数据。

## 后续建议

### 短期方案（已实施）
- ✅ 禁用启动时的自动任务执行
- ✅ 服务快速启动，优先保证核心功能

### 长期方案（待实施）

1. **任务执行隔离**
   - 将新闻采集和AI分析放入后台工作队列（Celery/RQ）
   - 避免阻塞FastAPI主线程

2. **AI API容错**
   ```python
   # 在 content_analyzer.py 中添加快速失败
   try:
       response = await anthropic_client.messages.create(
           timeout=httpx.Timeout(10.0, connect=5.0)  # 短超时
       )
   except Exception as e:
       # 快速失败，不重试
       logger.warning(f"AI分析失败，跳过: {e}")
       return None  # 返回空值，不阻塞流程
   ```

3. **调度任务优化**
   - 启动时不立即执行任务（`next_run_time` 延迟5分钟）
   - 添加任务执行超时保护
   - 失败任务不影响其他任务

4. **监控告警**
   - 添加服务响应时间监控
   - Claude API可用性检查
   - 调度任务执行状态监控

## 相关文件

- `data-service/main.py` - 服务启动配置
- `data-service/services/scheduler_service.py` - 调度器服务
- `data-service/services/content_analyzer.py` - AI内容分析
- `data-service/services/fetch_service.py` - 新闻采集服务
- `src/contexts/MarketContext.tsx` - 前端数据Context

## 经验教训

1. **启动流程不应执行长耗时操作**
   - 初始化应快速完成（<5秒）
   - 后台任务应异步执行，不阻塞启动

2. **外部依赖应快速失败**
   - AI API调用应设置短超时
   - 失败不应影响核心功能

3. **超时配置应一致**
   - 客户端超时（10s）< API路由超时（15s）< 服务超时（20s）
   - 形成超时梯度，避免级联超时

4. **定时任务应独立运行**
   - 不应与Web服务共享进程
   - 失败不应影响服务可用性
