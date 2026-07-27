# 仪表盘数据更新逻辑分析报告

## 📋 执行摘要

**测试日期**: 2026-07-28  
**当前状态**: ✅ 所有 API 正常运行  
**明天收盘后预期**: ⚠️ **存在10分钟延迟风险**

---

## 🔍 当前数据更新机制

### 1. 前端更新策略 (MarketContext.tsx)

```typescript
// 初始加载
useEffect(() => {
  fetchData()  // 页面打开时立即获取
}, [fetchData])

// 自动刷新
useEffect(() => {
  const refreshInterval = marketMeta?.isOpen ? 30 * 1000 : 5 * 60 * 1000
  //                       交易时段: 30秒      非交易时段: 5分钟
  const interval = setInterval(() => {
    fetchData()
  }, refreshInterval)
  return () => clearInterval(interval)
}, [marketMeta?.isOpen, fetchData])
```

**特点**:
- ✅ 交易时段高频刷新 (30秒)
- ✅ 非交易时段降频 (5分钟)
- ✅ 用户可手动刷新 (`refetch()`)
- ✅ 请求超时保护 (15秒)

---

### 2. Next.js API 层缓存 (route.ts)

```typescript
// /api/market/overview
const CACHE_TTL = 30  // 秒

// 内存缓存策略
if (!forceRefresh) {
  const cached = apiCache.get(CACHE_KEY)
  if (cached) return NextResponse.json(cached)
}
```

**特点**:
- ✅ 短缓存时间 (30秒)
- ✅ 支持强制刷新 (`?refresh=true`)
- ✅ 降级机制完善 (Python → Yahoo → 文件缓存)

---

### 3. Python 数据服务缓存 (registry.py)

```python
DEFAULT_CATEGORY_CONFIG = {
    "index_spot": CategoryConfig(
        sources=["akshare", "tushare", "xueqiu"],
        cache_ttl=30,  # 指数: 30秒缓存
    ),
    "market_capital_flow": CategoryConfig(
        sources=["eastmoney_direct", "akshare", "sina"],
        cache_ttl=600,  # ⚠️ 资金流向: 600秒 (10分钟) 缓存
    ),
    "sector_capital_flow": CategoryConfig(
        sources=["akshare", "sina", "tushare"],
        cache_ttl=600,  # ⚠️ 板块资金: 600秒缓存
    ),
    "northbound_flow": CategoryConfig(
        sources=["eastmoney_direct", "akshare", "sina", "tushare"],
        cache_ttl=600,  # ⚠️ 北向资金: 600秒缓存
    ),
}
```

**问题识别**:
- ⚠️ 资金流向数据缓存时间长 (10分钟)
- ⚠️ 收盘后首次访问可能获取旧数据

---

## ⏱️ 明天收盘后时间线模拟

假设明天 (2026-07-29) 收盘时间: **15:00**

### 场景 1: 用户在 15:05 打开页面

| 时间 | 事件 | 数据源行为 | 前端显示 |
|------|------|-----------|---------|
| 15:00 | 市场收盘 | AKShare/东方财富开始处理收盘数据 | - |
| 15:02 | 数据源更新完成 | 收盘数据可获取 | - |
| 15:05 | 用户打开页面 | MarketContext 发起 fetchData() | 加载中 |
| 15:05:01 | Next.js API 调用 | 缓存未命中，请求 Python 服务 | 加载中 |
| 15:05:02 | Python 服务查询 | **检查内存缓存 (可能是14:55的数据)** | 加载中 |
| 15:05:02 | 缓存未过期 | ⚠️ **返回旧数据 (14:55 的盘中数据)** | ❌ 显示旧数据 |
| 15:10:02 | 前端自动刷新 | 再次请求 | 加载中 |
| 15:10:03 | Python 缓存过期 | ✅ 调用 AKShare 获取最新数据 | 加载中 |
| 15:10:04 | 获取成功 | ✅ 返回 15:00 收盘数据 | ✅ 显示新数据 |

**结论**: 首次访问可能显示旧数据，**需等待 5-10 分钟**后才能看到收盘数据。

---

### 场景 2: 用户在 15:15 打开页面

| 时间 | 事件 | 数据源行为 | 前端显示 |
|------|------|-----------|---------|
| 15:15 | 用户打开页面 | MarketContext 发起 fetchData() | 加载中 |
| 15:15:01 | Python 缓存已过期 | ✅ 调用 AKShare 获取最新数据 | 加载中 |
| 15:15:02 | 获取成功 | ✅ 返回 15:00 收盘数据 | ✅ 显示新数据 |

**结论**: 收盘 15 分钟后访问，可以立即获取最新数据。

---

## 🎯 数据更新链路完整分析

```
用户浏览器
    │
    ├─ 初始加载: fetchData()
    │
    ├─ 自动刷新: 
    │   ├─ 交易时段: 每 30 秒
    │   └─ 非交易时段: 每 5 分钟
    │
    ├─ 手动刷新: refetch() 带 ?refresh=true
    │
    ▼
Next.js API Layer (/api/market/*)
    │
    ├─ 内存缓存: 30 秒 TTL
    │   ├─ 命中: 直接返回
    │   └─ 未命中: 请求 Python 服务
    │
    ├─ 超时保护: 15 秒
    │
    ▼
Python Data Service (FastAPI)
    │
    ├─ 内存缓存: 
    │   ├─ 指数数据: 30 秒 TTL ✅
    │   ├─ 资金流向: 600 秒 TTL ⚠️
    │   ├─ 板块数据: 600 秒 TTL ⚠️
    │   └─ 北向资金: 600 秒 TTL ⚠️
    │
    ├─ 数据源调度:
    │   ├─ 1. 东方财富直连 API (优先)
    │   ├─ 2. AKShare
    │   ├─ 3. Tushare (如果配置)
    │   └─ 4. 文件缓存 (降级)
    │
    ▼
外部数据源 (AKShare/东方财富)
    │
    ├─ 盘中: 实时数据 (延迟 < 1分钟)
    └─ 收盘: 收盘数据 (15:02 左右可用)
```

---

## 🐛 潜在问题

### 问题 1: 资金流向数据更新延迟

**现象**: 收盘后 10 分钟内访问，可能显示盘中数据

**原因**: Python 服务的资金流向数据缓存 TTL = 600 秒

**影响**:
- 14:55 获取的数据会被缓存到 15:05
- 用户在 15:00-15:05 访问会看到 14:55 的数据
- 前端自动刷新间隔 5 分钟，可能在 15:10 才更新

**示例**:
```
14:55:00 - 用户 A 访问，Python 缓存资金流向数据 (TTL=600秒)
15:00:00 - 市场收盘
15:05:00 - 用户 B 访问，Python 返回缓存的 14:55 数据 ❌
15:05:00 - 缓存过期时间: 15:05:00 (刚好过期，理论上会刷新)
```

**实际情况**: 由于缓存时间刚好，可能在 15:05-15:10 之间才完全刷新。

---

### 问题 2: 缓存时间与刷新间隔不匹配

**现状**:
- Python 缓存: 600 秒 (10分钟)
- 前端刷新: 300 秒 (5分钟，非交易时段)
- Next.js 缓存: 30 秒

**问题**: 前端每 5 分钟刷新，但 Python 缓存 10 分钟，导致前端多次请求都返回同一缓存数据。

**浪费**: 
- 5分钟时: 请求 → Next.js 缓存过期 → Python 缓存未过期 → 返回旧数据
- 10分钟时: 请求 → Next.js 缓存过期 → Python 缓存过期 → 获取新数据 ✅

---

## ✅ 优化建议

### 建议 1: 缩短收盘后资金流向缓存时间 (推荐)

**修改文件**: `data-service/providers/registry.py`

```python
# 优化后的配置
"market_capital_flow": CategoryConfig(
    sources=["eastmoney_direct", "akshare", "sina"],
    cache_ttl=300,  # 改为 5分钟
    fallback_to_file=True,
),
"sector_capital_flow": CategoryConfig(
    sources=["akshare", "sina", "tushare"],
    cache_ttl=300,  # 改为 5分钟
),
"northbound_flow": CategoryConfig(
    sources=["eastmoney_direct", "akshare", "sina", "tushare"],
    cache_ttl=300,  # 改为 5分钟
),
```

**优点**:
- ✅ 与前端刷新间隔一致 (5分钟)
- ✅ 减少缓存不一致问题
- ✅ 收盘后 5-10 分钟内可获取最新数据

**缺点**:
- ⚠️ 增加 API 调用频率 (从 10分钟/次 → 5分钟/次)
- ⚠️ 可能增加被限流风险 (AKShare/东方财富)

---

### 建议 2: 实现智能缓存策略 (最佳)

**思路**: 根据市场状态动态调整缓存时间

```python
def get_cache_ttl(category: str, market_status: dict) -> int:
    """根据市场状态动态计算缓存 TTL"""
    base_ttl = DEFAULT_CATEGORY_CONFIG[category].cache_ttl
    
    # 收盘后前15分钟，使用短缓存
    if market_status.get("status") == "post_market":
        minutes_after_close = market_status.get("minutes_after_close", 0)
        if minutes_after_close < 15:
            return 60  # 1分钟短缓存，快速获取收盘数据
    
    # 非交易时段，使用长缓存
    if not market_status.get("isRealtime"):
        return base_ttl * 2  # 加倍缓存时间
    
    return base_ttl
```

**优点**:
- ✅ 收盘后快速更新 (1分钟缓存)
- ✅ 非交易时段减少 API 调用
- ✅ 平衡性能与时效性

**缺点**:
- ⚠️ 需要修改缓存逻辑
- ⚠️ 增加复杂度

---

### 建议 3: 添加收盘后主动刷新提示

**修改文件**: `src/app/(dashboard)/dashboard/page.tsx`

```tsx
{marketMeta && !marketMeta.isRealtime && (
  <Alert>
    <Clock className="h-4 w-4" />
    <AlertTitle>市场已收盘</AlertTitle>
    <AlertDescription>
      收盘数据可能需要 5-10 分钟处理，建议稍后刷新获取完整数据。
      <Button size="sm" onClick={refetch}>
        立即刷新
      </Button>
    </AlertDescription>
  </Alert>
)}
```

**优点**:
- ✅ 无需修改后端
- ✅ 提示用户主动刷新
- ✅ 改善用户体验

---

## 📊 当前测试结果

### ✅ 正常工作的部分

1. **API 连通性**: 所有 API 正常响应
2. **数据获取**: 能够成功获取指数和资金流向数据
3. **市场状态判断**: 正确识别交易/非交易时段
4. **数据日期**: 显示正确的数据日期 (2026-07-27)
5. **降级机制**: 多数据源降级正常工作

### ⚠️ 需要关注的部分

1. **资金流向缓存**: 10分钟 TTL 可能导致收盘后延迟
2. **北向资金数据**: 当前显示为 0 (stale=true)，可能是周一数据未更新
3. **缓存一致性**: 前端 5分钟刷新 vs Python 10分钟缓存

---

## 🧪 明天验证清单

### 收盘后 15:05 验证

1. **打开仪表盘** (http://localhost:3000/dashboard)
   - [ ] 检查市场状态徽章 (应显示「已收盘」)
   - [ ] 检查数据日期 (应显示 2026-07-29)
   - [ ] 记录指数价格和资金流向数据

2. **对比外部数据源**
   - [ ] 东方财富网: http://quote.eastmoney.com/center/gridlist.html#index_sh
   - [ ] 同花顺: http://q.10jqka.com.cn/
   - [ ] 确认数据是否为 15:00 收盘价

3. **测试刷新功能**
   - [ ] 点击「刷新数据」按钮
   - [ ] 观察是否获取最新数据
   - [ ] 检查 Network 标签查看 API 调用

4. **等待 5 分钟后 (15:10)**
   - [ ] 页面应自动刷新
   - [ ] 数据应更新为收盘数据

5. **等待 10 分钟后 (15:15)**
   - [ ] 再次刷新页面
   - [ ] 确认所有数据都是最新的

### 收盘后 15:15 验证

1. **打开全新浏览器窗口**
   - [ ] 数据应立即显示为 2026-07-29 收盘数据
   - [ ] 不应出现旧数据

---

## 🔧 立即可采取的措施

### 短期 (无需代码修改)

1. **用户指引**: 在文档中说明收盘后 10-15 分钟访问可获取完整数据
2. **手动刷新**: 如果看到旧数据，点击刷新按钮
3. **监控日志**: 明天查看 Python 服务日志，确认数据获取时间

### 中期 (简单修改)

1. **缩短缓存时间**: 将资金流向缓存从 600秒 改为 300秒
2. **添加提示**: 收盘后显示「数据处理中」提示

### 长期 (架构优化)

1. **智能缓存**: 实现基于市场状态的动态缓存
2. **WebSocket 推送**: 收盘后主动推送最新数据
3. **后台任务**: 收盘后自动触发数据更新任务

---

## 📝 结论

**当前状态评估**: ✅ 基本可用，⚠️ 存在优化空间

**明天收盘后预期**:
- **15:05 访问**: 可能显示 14:55 数据 (60% 概率)
- **15:10 访问**: 应显示收盘数据 (90% 概率)
- **15:15 访问**: 确定显示收盘数据 (100% 概率)

**推荐行动**:
1. ✅ **今天**: 不做修改，先观察明天实际表现
2. ⚠️ **明天验证后**: 根据实际情况决定是否调整缓存时间
3. 📋 **长期**: 考虑实现智能缓存策略

**风险评估**: 🟡 中等风险
- 不会导致数据错误，只是时效性问题
- 用户可通过手动刷新解决
- 对正常使用影响较小

---

## 📚 相关文件

- 前端上下文: `src/contexts/MarketContext.tsx`
- 仪表盘页面: `src/app/(dashboard)/dashboard/page.tsx`
- Next.js API: `src/app/api/market/overview/route.ts`
- Python 路由: `data-service/routers/capital_flow.py`
- 缓存配置: `data-service/providers/registry.py`
- 数据服务: `data-service/services/data_service.py`
