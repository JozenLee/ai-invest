# 统一市场数据架构设计

**日期**: 2026-07-18
**状态**: 已批准
**作者**: Claude Code

## 背景

当前项目中，仪表盘、市场概览、资金流向三个页面各自独立获取和管理数据，导致：
- 数据不一致（北向资金、市场情绪、数据来源等）
- 重复请求（多个页面同时请求相同API）
- 显示格式不统一（时间、来源、状态等）
- 无法联动（一个数据更新后，其他页面无法同步）

## 目标

1. **单一数据源**: 所有页面共享同一份市场数据
2. **数据联动**: 一次刷新，所有组件同步更新
3. **显示统一**: 数据来源、时间、状态等格式一致
4. **性能优化**: 减少重复API请求

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    MarketDataProvider                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  useMarketData() - 数据获取层                        │ │
│  │  - indices (指数数据)                                │ │
│  │  - capitalFlow (资金流向)                            │ │
│  │  - northbound (北向资金)                             │ │
│  │  - sentiment (市场情绪)                              │ │
│  │  - marketMeta (市场状态)                             │ │
│  │  - source / lastUpdate                               │ │
│  └─────────────────────────────────────────────────────┘ │
│                         ↓                                │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  MarketContext                                        │ │
│  │  - 所有数据 + 统一格式化工具                          │ │
│  │  - sourceDisplay, timeDisplay, statusBadge           │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ Dashboard │        │ Overview │        │ Capital  │
   │ useMarket │        │ useMarket│        │ useMarket│
   │ Context() │        │ Context()│        │ Context()│
   └──────────┘        └──────────┘        └──────────┘
```

### 数据结构定义

```typescript
// 指数数据
interface IndexData {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume?: number
  amount?: number
}

// 北向资金（统一结构）
interface NorthboundData {
  net: number          // 净流入（亿元）
  shConnect: number    // 沪股通（亿元）
  szConnect: number    // 深股通（亿元）
  stale: boolean       // 是否为历史数据
  dataDate: string     // 数据日期
  source: string       // 数据来源
}

// 板块资金流向
interface SectorFlow {
  sector: string
  netFlow: number      // 净流入（亿元）
  changePct: number    // 涨跌幅
}

// 资金流向数据
interface CapitalFlowData {
  market: {
    institutionalNet: number   // 机构净流入（亿元）
    institutionalPct: number   // 机构占比
    retailNet: number          // 散户净流入（亿元）
    retailPct: number          // 散户占比
    totalNet: number           // 大盘总净流入（亿元）
    sentiment: number          // 市场情绪 (0-100)
  }
  northbound: NorthboundData
  topInflowSectors: SectorFlow[]
  topOutflowSectors: SectorFlow[]
}

// 市场状态元数据
interface MarketMeta {
  isOpen: boolean
  isPreMarket: boolean
  isPostMarket: boolean
  status: string            // trading/pre_market/post_market/closed/lunch_break
  statusText: string        // 中文状态描述
  lastTradingDate: string
  isRealtime: boolean
  staleReason?: string | null
  dataDate?: string
}

// Context 提供的完整数据
interface MarketContextValue {
  // 原始数据
  indices: IndexData[]
  capitalFlow: CapitalFlowData | null
  northbound: NorthboundData | null
  sentiment: number
  marketMeta: MarketMeta | null
  
  // 状态
  isLoading: boolean
  error: string | null
  source: string
  lastUpdate: Date | null
  
  // 操作
  refetch: () => void
  
  // 统一格式化工具
  format: {
    sourceDisplay: { text: string; icon: string; variant: string }
    timeDisplay: string
    statusBadge: { icon: string; label: string; variant: string }
    sentimentDisplay: { score: number; label: string; color: string }
  }
}
```

### 市场情绪统一算法

```typescript
function calculateSentiment(
  mainNet: number,      // 主力净流入（亿元）
  retailNet: number,    // 散户净流入（亿元）
  northboundNet: number // 北向净流入（亿元）
): number {
  let score = 50
  
  // 主力资金 (权重 40%)
  if (Math.abs(mainNet) >= 10) score += mainNet > 0 ? 20 : -20
  else if (Math.abs(mainNet) >= 2) score += mainNet > 0 ? 10 : -10
  else score += mainNet > 0 ? 5 : -5
  
  // 北向资金 (权重 35%)
  if (Math.abs(northboundNet) >= 50) score += northboundNet > 0 ? 17.5 : -17.5
  else if (Math.abs(northboundNet) >= 10) score += northboundNet > 0 ? 10 : -10
  else score += northboundNet > 0 ? 5 : -5
  
  // 主力散户分歧 (权重 25%)
  if (mainNet !== 0 && retailNet !== 0) {
    if ((mainNet > 0 && retailNet < 0) || (mainNet < 0 && retailNet > 0)) {
      score += mainNet > 0 ? 12.5 : -12.5
    } else {
      score += mainNet > 0 ? 5 : -5
    }
  }
  
  return Math.max(0, Math.min(100, Math.round(score)))
}
```

### 数据来源统一映射

```typescript
const SOURCE_MAP: Record<string, { text: string; icon: string; variant: string }> = {
  'akshare_realtime': { text: 'AKShare实时', icon: '📊', variant: 'default' },
  'akshare': { text: 'AKShare', icon: '📊', variant: 'default' },
  'realtime': { text: '实时数据', icon: '📊', variant: 'default' },
  'cached': { text: '缓存数据', icon: '📋', variant: 'secondary' },
  'yahoo': { text: 'Yahoo Finance', icon: '🌐', variant: 'outline' },
  'unavailable': { text: '数据暂不可用', icon: '⚠️', variant: 'destructive' },
  'loading': { text: '加载中...', icon: '⏳', variant: 'outline' },
}
```

## 实现步骤

### Phase 1: 创建 MarketContext
1. 创建 `src/contexts/MarketContext.tsx`
2. 实现 `MarketDataProvider` 组件
3. 实现 `useMarketContext` hook
4. 统一数据结构和格式化工具

### Phase 2: 重构 useMarketData
1. 将数据获取逻辑移入 Context
2. 保留 `useMarketData` 作为 Context 的包装器
3. 添加数据缓存和去重逻辑

### Phase 3: 修改页面组件
1. Dashboard: 使用 Context 替代直接调用 hook
2. Market Overview: 移除独立状态管理，使用 Context
3. Capital Flow: 移除独立状态管理，使用 Context

### Phase 4: 优化 API 层
1. 合并重复的 API 端点
2. 统一缓存策略

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/contexts/MarketContext.tsx` | 新建 | Context Provider |
| `src/hooks/useMarketData.ts` | 重构 | 移入 Context |
| `src/app/(dashboard)/dashboard/page.tsx` | 修改 | 使用 Context |
| `src/app/(dashboard)/market/overview/page.tsx` | 修改 | 使用 Context |
| `src/app/(dashboard)/market/capital/page.tsx` | 修改 | 使用 Context |
| `src/app/layout.tsx` | 修改 | 添加 Provider |

## 验证标准

1. **数据一致性**: 三个页面显示的北向资金、市场情绪、数据来源完全一致
2. **联动性**: 点击任一页面的刷新按钮，所有页面数据同步更新
3. **显示统一**: 时间格式、来源显示、状态徽章样式一致
4. **性能**: 无重复 API 请求，刷新间隔合理

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Context 更新导致所有子组件重渲染 | 使用 `useMemo` 优化，拆分多个 Context |
| 数据获取失败影响所有页面 | 保留降级逻辑，单个数据源失败不影响其他 |
| 刷新间隔不一致 | 统一使用 `marketMeta.isOpen` 判断，动态调整间隔 |
