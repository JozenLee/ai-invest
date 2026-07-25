# 市场数据缓存刷新指南

## 问题背景

市场数据在系统中使用多层缓存机制来提升性能：
- **Next.js API层缓存**: 30秒TTL，避免频繁请求Python服务
- **Python服务缓存**: 根据数据类型有不同TTL
- **文件缓存**: 持久化最近的数据，用于降级场景

在之前的实现中，用户点击"刷新数据"按钮时，由于API层缓存没有被清除，导致始终看到缓存数据。

## 解决方案

### 1. 手动刷新（立即生效）

#### 方式A：使用刷新按钮
仪表盘右上角的"刷新数据"按钮现在会：
- 自动添加 `?refresh=true` 参数绕过缓存
- 强制从Python服务获取最新数据
- 更新所有显示的市场数据

#### 方式B：使用API端点
```bash
# 强制刷新市场概览数据
curl 'http://localhost:3000/api/market/overview?refresh=true'

# 强制刷新资金流向数据
curl 'http://localhost:3000/api/market/capital-flow?refresh=true'

# 清空所有Next.js缓存
curl -X POST http://localhost:3000/api/cache/clear
```

### 2. 自动刷新（定时任务）

#### 每日自动刷新
Python数据服务已配置定时任务，每天15:30（交易日收盘后）自动执行：

1. 清理Python服务的内存缓存
2. 通知Next.js服务清理缓存
3. 预热常用数据（指数行情、资金流向等）

#### 实时自动刷新
MarketContext已配置周期性刷新：
- **交易时段**: 每30秒自动刷新（使用缓存，减少服务器压力）
- **非交易时段**: 每5分钟自动刷新

注意：周期性刷新会使用缓存机制，不会绕过30秒TTL。如需立即看到最新数据，请使用手动刷新。

## 技术实现细节

### 缓存层级

```
用户界面
  ↓
MarketContext (React)
  ↓ fetch('/api/market/overview?refresh=true')
Next.js API Route
  ↓ 检查 refresh 参数
  ↓ 如果 refresh=true，跳过缓存
  ↓ 否则检查 apiCache (30秒TTL)
Python数据服务
  ↓ 内部缓存 (AKShare数据)
真实数据源
```

### 代码改动

#### 1. MemoryCache类增强 (`src/lib/cache.ts`)
```typescript
delete(key: string): boolean  // 删除指定缓存
clear(): void                  // 清空所有缓存
```

#### 2. API路由支持force-refresh (`src/app/api/market/*/route.ts`)
```typescript
export async function GET(request: Request) {
  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('refresh') === 'true'
  
  if (!forceRefresh) {
    const cached = apiCache.get(CACHE_KEY)
    if (cached) return NextResponse.json(cached)
  }
  // ... 获取新数据
}
```

#### 3. MarketContext支持强制刷新 (`src/contexts/MarketContext.tsx`)
```typescript
const refetch = useCallback(() => {
  return fetchData(true)  // 传入 true 强制刷新
}, [fetchData])
```

#### 4. Python服务定时任务 (`data-service/main.py`)
```python
await scheduler_service.add_cron_job(
    job_id="daily_cache_refresh",
    func=daily_cache_refresh,
    hour=15,
    minute=30
)
```

## 启用定时任务

定时任务需要重启Python数据服务才能生效：

```bash
# 停止当前服务
pkill -f "python.*main.py"

# 或者使用 Ctrl+C 停止

# 重新启动
cd data-service
python main.py
```

启动后应该看到日志：
```
已注册每日缓存刷新任务 (每天15:30执行)
```

## 验证

运行测试脚本验证所有功能：

```bash
bash test-cache-refresh.sh
```

检查调度器状态：
```bash
curl http://localhost:8000/api/scheduler/status | jq '.'
```

## 故障排查

### 问题1: 刷新按钮仍然返回缓存数据
- 检查浏览器开发者工具的Network标签
- 确认请求URL包含 `?refresh=true` 参数
- 检查Next.js服务是否正常运行

### 问题2: 定时任务未运行
- 确认Python服务已重启
- 检查调度器状态: `curl http://localhost:8000/api/scheduler/status`
- 查看Python服务日志，确认任务已注册

### 问题3: 数据仍然显示旧日期
- Python服务可能正在返回非交易日的收盘数据（正常行为）
- 检查 `meta.lastTradingDate` 字段确认数据日期
- 使用 `curl http://localhost:8000/api/market/overview` 直接测试Python服务

## 环境变量

如果Next.js服务不在默认端口3000，需要设置环境变量：

```bash
# 在 data-service/.env 中添加
NEXT_JS_URL=http://localhost:3001
```

## 性能影响

- **手动刷新**: 跳过缓存，每次请求都会访问Python服务，响应时间约100-500ms
- **自动刷新**: 使用缓存，仅在TTL过期后访问Python服务
- **定时任务**: 每天执行一次，对性能无明显影响

## 未来优化方向

1. **智能刷新策略**: 根据市场开盘状态调整刷新频率
2. **WebSocket推送**: 交易时段实时推送数据变化
3. **缓存预热**: 在市场开盘前5分钟预先加载数据
4. **多级缓存**: 增加Redis等分布式缓存层
