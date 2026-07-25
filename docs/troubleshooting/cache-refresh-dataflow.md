# 市场数据更新链路图

## 完整数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                          用户界面层                                    │
│  Dashboard Page (dashboard/page.tsx)                                │
│                                                                      │
│  ┌──────────────┐                                                   │
│  │ 刷新数据按钮  │ ──onClick──> refetch()                             │
│  └──────────────┘                                                   │
│         │                                                            │
│         │ 显示 loading 状态                                           │
│         ▼                                                            │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          │
┌─────────▼────────────────────────────────────────────────────────────┐
│                       Context 层                                      │
│  MarketContext (contexts/MarketContext.tsx)                          │
│                                                                      │
│  refetch() {                                                         │
│    fetchData(forceRefresh = true) // 强制刷新                         │
│  }                                                                   │
│                                                                      │
│  fetchData(forceRefresh) {                                           │
│    const param = forceRefresh ? '?refresh=true' : ''                │
│    fetch(`/api/market/overview${param}`)                            │
│    fetch(`/api/market/capital-flow${param}`)                        │
│  }                                                                   │
│                                                                      │
└──────────┬───────────────────────────────────┬───────────────────────┘
           │                                   │
           │ fetch with ?refresh=true          │ fetch without refresh
           │ (手动刷新)                         │ (自动刷新)
           ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Next.js API 层                                  │
│  /api/market/overview/route.ts                                       │
│  /api/market/capital-flow/route.ts                                   │
│                                                                      │
│  GET(request) {                                                      │
│    const forceRefresh = request.url.includes('refresh=true')        │
│    ┌─────────────────────────────────────┐                          │
│    │ if (!forceRefresh) {                │                          │
│    │   cached = apiCache.get(CACHE_KEY)  │                          │
│    │   if (cached) return cached ✓       │                          │
│    │ }                                   │                          │
│    └─────────────────────────────────────┘                          │
│             │                                                        │
│             │ 缓存未命中或强制刷新                                      │
│             ▼                                                        │
│    fetch(`${DATA_SERVICE_URL}/api/market/overview`)                 │
│                                                                      │
│    apiCache.set(CACHE_KEY, data, 30秒TTL)                           │
│    return data                                                       │
│  }                                                                   │
│                                                                      │
│  ┌─────────────────────────────────────────────┐                    │
│  │ MemoryCache (lib/cache.ts)                  │                    │
│  │ - get(key): 获取缓存                         │                    │
│  │ - set(key, data, ttl): 设置缓存              │                    │
│  │ - delete(key): 删除缓存 ✨新增               │                    │
│  │ - clear(): 清空所有缓存 ✨新增                │                    │
│  └─────────────────────────────────────────────┘                    │
└──────────┬───────────────────────────────────────────────────────────┘
           │
           │ HTTP Request
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Python 数据服务层                                  │
│  FastAPI (data-service/main.py)                                      │
│  Port: 8000                                                          │
│                                                                      │
│  /api/market/overview                                                │
│  /api/capital-flow/macro                                             │
│                                                                      │
│  ┌─────────────────────────────────────────┐                        │
│  │ data_service (统一数据服务)               │                        │
│  │ - 内部缓存机制                             │                        │
│  │ - 多数据源聚合 (AKShare, Yahoo等)          │                        │
│  │ - 数据质量检测                             │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                      │
│  ┌─────────────────────────────────────────┐                        │
│  │ APScheduler 定时任务                      │                        │
│  │ Job: daily_cache_refresh                 │                        │
│  │ Cron: 每天 15:30                          │                        │
│  │                                          │                        │
│  │ 执行流程：                                 │                        │
│  │ 1. cache_service.clear()                │                        │
│  │ 2. POST localhost:3000/api/cache/clear  │                        │
│  │ 3. 预热常用数据                            │                        │
│  └─────────────────────────────────────────┘                        │
└──────────┬───────────────────────────────────────────────────────────┘
           │
           │ AKShare API Calls
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     真实数据源                                         │
│  - 东方财富 (AKShare)                                                 │
│  - Yahoo Finance                                                     │
│  - 其他金融数据API                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

## 缓存刷新策略对比

### 场景1: 用户手动点击刷新按钮

```
用户点击 → refetch(forceRefresh=true)
         ↓
fetch('/api/market/overview?refresh=true')
         ↓
API检测到 refresh=true
         ↓
跳过 apiCache.get() 检查
         ↓
直接请求 Python 服务
         ↓
获取最新数据并更新缓存
         ↓
返回给用户 ✅ 最新数据
```

**时间**: ~100-500ms  
**数据新鲜度**: ✅ 最新  
**适用场景**: 用户需要立即看到最新数据

---

### 场景2: 周期性自动刷新

```
定时器触发 (30秒/5分钟)
         ↓
fetchData(forceRefresh=false)
         ↓
fetch('/api/market/overview') // 无 refresh 参数
         ↓
API检查 apiCache.get(CACHE_KEY)
         ↓
┌────────┴────────┐
│                 │
▼                 ▼
缓存存在          缓存过期 (>30s)
返回缓存 ⚡       请求 Python 服务
                  ↓
                  更新缓存
                  ↓
                  返回最新数据 ✅
```

**时间**: 
- 缓存命中: ~5ms ⚡
- 缓存未命中: ~100-500ms

**数据新鲜度**: 
- 可能有最多30秒延迟
- 适合后台自动刷新

**适用场景**: 减少服务器压力，平滑更新

---

### 场景3: 每日定时任务

```
每天 15:30 (收盘后)
         ↓
scheduler_service.add_cron_job()
         ↓
async daily_cache_refresh()
         ↓
┌────────┴────────┐
│                 │
▼                 ▼
清理Python缓存     通知Next.js清理缓存
cache_service     POST /api/cache/clear
.clear()          apiCache.clear()
         │                 │
         └────────┬────────┘
                  ↓
            预热常用数据
         (get_index_spot, etc)
                  ↓
          等待下次请求到来 ✅
```

**执行时间**: 每天15:30  
**影响范围**: 清空所有缓存  
**好处**: 
- 确保每日数据不会过期24小时以上
- 收盘后清理，不影响交易时段性能
- 预热缓存，首次访问速度更快

---

## 缓存层级关系

```
┌─────────────────────────────────────────────────┐
│ Layer 1: Next.js API Cache (apiCache)           │
│ - TTL: 30秒                                      │
│ - 范围: 单个 Node.js 进程                         │
│ - 清理: apiCache.clear() 或 TTL 自动过期          │
│ - 目的: 减少对 Python 服务的请求                   │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│ Layer 2: Python Service Cache                   │
│ - TTL: 根据数据类型不同                           │
│ - 范围: Python 进程内存                           │
│ - 清理: cache_service.clear() 或定时任务          │
│ - 目的: 减少对外部 API 的请求                      │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│ Layer 3: File Cache (.cache/market_overview.json)│
│ - TTL: 24小时                                    │
│ - 范围: 磁盘文件，跨进程持久化                      │
│ - 清理: 手动删除或超过24小时判定为过期              │
│ - 目的: 降级方案，所有服务不可用时返回缓存数据       │
└─────────────┬───────────────────────────────────┘
              │
              ▼
       External APIs
    (AKShare, Yahoo Finance)
```

## 关键代码位置

```
市场数据更新相关代码分布：

前端 UI
├── src/app/(dashboard)/dashboard/page.tsx (L154-162)
│   └── 刷新按钮: onClick={refetch}

Context 层
├── src/contexts/MarketContext.tsx
│   ├── fetchData(forceRefresh) (L41-168)
│   └── refetch() (L170-172)

API 层
├── src/app/api/market/overview/route.ts (L55-65)
│   └── 检查 refresh 参数，决定是否使用缓存
├── src/app/api/market/capital-flow/route.ts (L9-25)
│   └── 同上
└── src/app/api/cache/clear/route.ts (L4-17)
    └── 清空所有缓存

缓存实现
└── src/lib/cache.ts
    └── MemoryCache 类 (L9-35)
        ├── get() - 获取缓存
        ├── set() - 设置缓存
        ├── delete() - 删除单个缓存 ✨新增
        └── clear() - 清空所有缓存 ✨新增

Python 服务
├── data-service/main.py (L82-120)
│   └── daily_cache_refresh() 定时任务
└── data-service/services/scheduler_service.py
    └── APScheduler 实现
```

## 测试检查清单

- [x] 手动刷新按钮能立即获取最新数据
- [x] 刷新时显示 loading 动画
- [x] 缓存在30秒内有效（相同时间戳）
- [x] ?refresh=true 参数绕过缓存
- [x] /api/cache/clear 清空所有缓存
- [x] Python 定时任务正确注册
- [x] 定时任务能调用 Next.js 清理接口
- [x] TypeScript 编译无错误
- [x] 自动化测试脚本全部通过

## 监控建议

### 关键指标
1. **缓存命中率**: `cache_service.get_stats()` - 应该 > 70%
2. **API响应时间**: 
   - 缓存命中: < 10ms
   - 缓存未命中: < 500ms
3. **定时任务执行状态**: `/api/scheduler/status`
4. **数据新鲜度**: 检查 `lastUpdate` 时间戳

### 监控命令
```bash
# 查看缓存统计
curl http://localhost:8000/api/cache/stats | jq '.'

# 查看调度器状态
curl http://localhost:8000/api/scheduler/status | jq '.'

# 测试刷新功能
bash test-cache-refresh.sh
```
