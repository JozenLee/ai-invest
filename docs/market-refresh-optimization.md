# 市场数据刷新机制优化

## 概述
优化市场数据的刷新策略，实现智能刷新频率控制和全量数据同步更新。

## 需求
1. **交易时间**: 1分钟刷新一次
2. **非交易时间**: 5分钟刷新一次
3. **同步更新**: 每次刷新同时更新指数、资金流向、板块资金流向

## 实现方案

### 1. 前端刷新策略 (MarketContext)

**文件**: `src/contexts/MarketContext.tsx`

**关键修改**:
```typescript
// 自动刷新定时器
const refreshInterval = marketMeta?.isOpen ? 60 * 1000 : 5 * 60 * 1000
// 交易时段: 60秒 (1分钟)
// 非交易时段: 300秒 (5分钟)
```

**同步更新三类数据**:
```typescript
const [overviewRes, capitalRes, sectorRes] = await Promise.all([
  fetch(`/api/market/overview${refreshParam}`),
  fetch(`/api/market/capital-flow${refreshParam}`),
  fetch(`/api/market/sectors${refreshParam}`),
])
```

### 2. 后端缓存策略

#### 指数数据API (`/api/market/overview`)
```typescript
const CACHE_TTL_TRADING = 30  // 交易中缓存30秒
const CACHE_TTL_CLOSED = 120  // 非交易时段缓存2分钟
```

#### 资金流向API (`/api/market/capital-flow`)
```typescript
const CACHE_TTL_TRADING = 30  // 交易中缓存30秒
const CACHE_TTL_CLOSED = 120  // 非交易时段缓存2分钟
```

#### 板块资金流向API (`/api/market/sectors`)
- 新增缓存机制
- 支持 `?refresh=true` 强制刷新参数
- 动态TTL：根据交易状态自动调整

```typescript
const CACHE_TTL_TRADING = 30  // 交易中缓存30秒
const CACHE_TTL_CLOSED = 120  // 非交易时段缓存2分钟
```

### 3. 刷新时序图

```
前端定时器触发 (交易: 1分钟 | 休市: 5分钟)
    ↓
MarketContext.fetchData()
    ↓
并发请求三个API (Promise.all)
    ├─→ GET /api/market/overview
    ├─→ GET /api/market/capital-flow
    └─→ GET /api/market/sectors
    ↓
后端检查缓存 (交易: 30秒 | 休市: 2分钟)
    ↓
    ├─ 缓存命中 → 立即返回
    └─ 缓存未命中 → 请求数据服务 → 缓存结果
    ↓
前端更新状态
    ├─ indices (指数数据)
    ├─ capitalFlow (资金流向)
    ├─ northbound (北向资金)
    ├─ sentiment (市场情绪)
    └─ marketMeta (交易状态)
```

## 性能优化

### 1. 缓存层次
- **前端定时器**: 减少不必要的请求频率
- **API缓存**: 避免重复调用数据服务
- **文件缓存**: 服务重启后快速恢复数据

### 2. 并发请求
使用 `Promise.all` 并发请求三个API，而非顺序请求：
- **顺序请求**: 3 × 响应时间
- **并发请求**: max(响应时间)

### 3. 动态TTL
根据交易状态自动调整缓存时间：
- **交易时段**: 短缓存(30秒)保证数据新鲜度
- **非交易时段**: 长缓存(2分钟)减少服务器负载

## 交易状态判断

系统通过 `marketMeta.isOpen` 判断当前交易状态：

```typescript
interface MarketMeta {
  isOpen: boolean      // 市场是否开盘
  isRealtime: boolean  // 是否为实时数据
  statusText: string   // 状态文本 (如: "09:30-15:00")
}
```

**判断逻辑** (由数据服务提供):
- **交易日 9:30-11:30, 13:00-15:00**: `isOpen = true`
- **其他时间**: `isOpen = false`

## 测试验证

运行测试脚本验证刷新机制：

```bash
bash scripts/test-market-refresh.sh
```

**测试项目**:
1. ✅ 数据服务状态检查
2. ✅ Next.js服务状态检查
3. ✅ 指数数据API测试
4. ✅ 资金流向API测试
5. ✅ 板块资金流向API测试
6. ✅ 强制刷新功能测试
7. ✅ 缓存机制验证
8. ✅ 交易状态判断验证

## 监控指标

在开发模式下，控制台会输出详细日志：

```
[MarketContext] 开始获取数据... { forceRefresh: false }
[MarketContext] API 请求完成 (245ms)
  - overview: 200
  - capital-flow: 200
  - sectors: 200
[MarketContext] 刷新间隔: 1分钟 (交易状态: 开盘)
[MarketContext] 板块资金流向已更新: 成功
```

## 用户体验改进

### 1. 智能刷新
- **交易时段**: 1分钟刷新保证数据及时性
- **非交易时段**: 5分钟刷新节省带宽和服务器资源

### 2. 手动刷新
用户可以点击刷新按钮立即更新数据，`forceRefresh=true` 绕过所有缓存

### 3. 状态指示
界面显示当前交易状态和最后更新时间：
- 🟢 **交易中** - 实时数据，1分钟自动刷新
- ⚪ **已收盘** - 收盘数据，5分钟自动刷新

## 注意事项

### 1. 缓存一致性
- 前端刷新间隔 > 后端缓存TTL，确保每次前端刷新都能获取较新的数据
- 交易时段: 60秒刷新 vs 30秒缓存
- 非交易时段: 300秒刷新 vs 120秒缓存

### 2. 数据服务依赖
- 三个API都依赖Python数据服务
- 数据服务不可用时会降级到缓存数据或错误状态
- 不会返回假数据

### 3. 并发控制
- 使用 `AbortSignal.timeout(15000)` 防止请求卡死
- 单个API失败不影响其他API的数据更新

## 配置参数汇总

| 参数 | 交易时段 | 非交易时段 | 说明 |
|------|---------|-----------|------|
| 前端刷新间隔 | 60秒 | 300秒 | MarketContext定时器 |
| 后端缓存TTL | 30秒 | 120秒 | API缓存时间 |
| 请求超时 | 15秒 | 15秒 | AbortSignal超时 |

## 未来优化建议

1. **WebSocket推送**: 交易时段使用WebSocket实时推送，减少轮询
2. **增量更新**: 只传输变化的数据，减少带宽消耗
3. **智能预加载**: 在刷新前几秒预加载数据，用户刷新时立即显示
4. **离线支持**: Service Worker缓存历史数据，离线也能查看

## 相关文件

- `src/contexts/MarketContext.tsx` - 前端数据管理和刷新逻辑
- `src/app/api/market/overview/route.ts` - 指数数据API
- `src/app/api/market/capital-flow/route.ts` - 资金流向API
- `src/app/api/market/sectors/route.ts` - 板块资金流向API
- `scripts/test-market-refresh.sh` - 刷新机制测试脚本
