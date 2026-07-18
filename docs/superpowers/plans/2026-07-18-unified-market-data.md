# 统一市场数据架构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一仪表盘、市场概览、资金流向三个页面的数据源，确保数据一致性和联动性。

**Architecture:** 通过 React Context + 扩展 useMarketData hook 实现全局数据共享，所有页面从同一个 Provider 获取数据。

**Tech Stack:** React 19, Next.js 16, TypeScript, React Context

## Global Constraints

- Next.js 16 App Router + React 19
- shadcn/ui + Tailwind CSS v4
- 现有 API 端点保持不变，仅重构前端数据获取层
- 保持现有数据源降级逻辑

---

## File Structure

| 文件路径 | 职责 |
|----------|------|
| `src/contexts/MarketContext.tsx` | 全局市场数据 Context Provider |
| `src/hooks/useMarketData.ts` | 重构为 Context consumer |
| `src/types/market.ts` | 统一数据类型定义 |
| `src/app/(dashboard)/dashboard/page.tsx` | 使用 Context |
| `src/app/(dashboard)/market/overview/page.tsx` | 使用 Context |
| `src/app/(dashboard)/market/capital/page.tsx` | 使用 Context |
| `src/app/(dashboard)/layout.tsx` | 添加 Provider |

---

### Task 1: 创建统一数据类型定义

**Files:**
- Create: `src/types/market.ts`

**Interfaces:**
- Produces: `IndexData`, `NorthboundData`, `SectorFlow`, `CapitalFlowData`, `MarketMeta`, `MarketContextValue`, `SOURCE_MAP`

- [ ] **Step 1: 创建类型定义文件**

```typescript
// src/types/market.ts

export interface IndexData {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume?: number
  amount?: number
}

export interface NorthboundData {
  net: number          // 净流入（亿元）
  shConnect: number    // 沪股通（亿元）
  szConnect: number    // 深股通（亿元）
  stale: boolean       // 是否为历史数据
  dataDate: string     // 数据日期
  source: string       // 数据来源
}

export interface SectorFlow {
  sector: string
  netFlow: number      // 净流入（亿元）
  changePct: number    // 涨跌幅
}

export interface CapitalFlowData {
  market: {
    institutionalNet: number
    institutionalPct: number
    retailNet: number
    retailPct: number
    totalNet: number
    sentiment: number
  }
  northbound: NorthboundData
  topInflowSectors: SectorFlow[]
  topOutflowSectors: SectorFlow[]
  source?: string
  dataDate?: string
  dataQuality?: 'realtime' | 'estimated' | 'unknown' | 'unavailable'
}

export interface MarketMeta {
  isOpen: boolean
  isPreMarket: boolean
  isPostMarket: boolean
  status: string
  statusText: string
  lastTradingDate: string
  isRealtime: boolean
  staleReason?: string | null
  dataDate?: string
}

export interface MarketContextValue {
  indices: IndexData[]
  capitalFlow: CapitalFlowData | null
  northbound: NorthboundData | null
  sentiment: number
  marketMeta: MarketMeta | null
  isLoading: boolean
  error: string | null
  source: string
  lastUpdate: Date | null
  refetch: () => void
  format: {
    sourceDisplay: SourceDisplay
    timeDisplay: string
    statusBadge: StatusBadge
    sentimentDisplay: SentimentDisplay
  }
}

export interface SourceDisplay {
  text: string
  icon: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
}

export interface StatusBadge {
  icon: string
  label: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
}

export interface SentimentDisplay {
  score: number
  label: string
  color: string
}

export const SOURCE_MAP: Record<string, SourceDisplay> = {
  'akshare_realtime': { text: 'AKShare实时', icon: '📊', variant: 'default' },
  'akshare': { text: 'AKShare', icon: '📊', variant: 'default' },
  'realtime': { text: '实时数据', icon: '📊', variant: 'default' },
  'cached': { text: '缓存数据', icon: '📋', variant: 'secondary' },
  'yahoo': { text: 'Yahoo Finance', icon: '🌐', variant: 'outline' },
  'unavailable': { text: '数据暂不可用', icon: '⚠️', variant: 'destructive' },
  'loading': { text: '加载中...', icon: '⏳', variant: 'outline' },
}

export const SENTIMENT_THRESHOLDS = {
  HIGH_BULLISH: 75,
  BULLISH: 60,
  NEUTRAL_HIGH: 50,
  NEUTRAL_LOW: 40,
  BEARISH: 25,
} as const
```

- [ ] **Step 2: Commit**

```bash
git add src/types/market.ts
git commit -m "feat: add unified market data type definitions"
```

---

### Task 2: 创建 MarketContext Provider

**Files:**
- Create: `src/contexts/MarketContext.tsx`
- Read: `src/hooks/useMarketData.ts` (参考现有数据获取逻辑)

**Interfaces:**
- Consumes: `src/types/market.ts` 中的所有类型
- Produces: `MarketProvider`, `useMarketContext`

- [ ] **Step 1: 创建 Context 和 Provider**

```typescript
// src/contexts/MarketContext.tsx
'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import type {
  IndexData,
  CapitalFlowData,
  NorthboundData,
  MarketMeta,
  MarketContextValue,
  SourceDisplay,
  StatusBadge,
  SentimentDisplay,
} from '@/types/market'
import { SOURCE_MAP, SENTIMENT_THRESHOLDS } from '@/types/market'

const MarketContext = createContext<MarketContextValue | null>(null)

export function useMarketContext(): MarketContextValue {
  const context = useContext(MarketContext)
  if (!context) {
    throw new Error('useMarketContext must be used within MarketProvider')
  }
  return context
}

interface MarketProviderProps {
  children: ReactNode
}

export function MarketProvider({ children }: MarketProviderProps) {
  const [indices, setIndices] = useState<IndexData[]>([])
  const [capitalFlow, setCapitalFlow] = useState<CapitalFlowData | null>(null)
  const [northbound, setNorthbound] = useState<NorthboundData | null>(null)
  const [sentiment, setSentiment] = useState<number>(50)
  const [marketMeta, setMarketMeta] = useState<MarketMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('loading')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const clientTimeout = AbortSignal.timeout(30000)

      // 并行请求指数数据和资金流向数据
      const [overviewRes, capitalRes] = await Promise.all([
        fetch('/api/market/overview', { signal: clientTimeout }),
        fetch('/api/market/capital-flow', { signal: clientTimeout }),
      ])

      // 处理指数数据
      if (overviewRes.ok) {
        const overviewData = await overviewRes.json()
        if (overviewData.success && overviewData.data?.indices) {
          setIndices(overviewData.data.indices)
          setSource(overviewData.source || 'unknown')
          if (overviewData.data?.meta) {
            setMarketMeta(overviewData.data.meta)
          }
        } else {
          setIndices([])
          if (overviewData.error) {
            setError(overviewData.error)
          }
          if (overviewData.meta) {
            setMarketMeta(overviewData.meta)
          }
        }
      } else {
        setIndices([])
      }

      // 处理资金流向数据
      if (capitalRes.ok) {
        const capitalData = await capitalRes.json()
        if (capitalData.success && capitalData.data) {
          setCapitalFlow(capitalData.data)

          // 提取北向资金数据（统一结构）
          if (capitalData.data.northbound) {
            setNorthbound(capitalData.data.northbound)
          }

          // 提取情绪指数
          if (capitalData.data.market?.sentiment !== undefined) {
            setSentiment(capitalData.data.market.sentiment)
          }

          // 优先使用资金流向的 source（更精确）
          if (capitalData.data.source) {
            setSource(capitalData.data.source)
          } else if (capitalData.source) {
            setSource(capitalData.source)
          }

          // 优先使用资金流向的 meta（更完整）
          if (capitalData.data?.meta || capitalData.meta) {
            setMarketMeta(capitalData.data?.meta || capitalData.meta)
          }
        } else {
          setCapitalFlow(null)
          if (capitalData.error) {
            setError(capitalData.error)
          }
          if (capitalData.meta) {
            setMarketMeta(capitalData.meta)
          }
        }
      } else {
        setCapitalFlow(null)
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.error('获取市场数据失败:', err)
      setError('网络请求失败，请检查数据服务是否已启动')
      setIndices([])
      setCapitalFlow(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()

    // 交易时间内每30秒刷新，非交易时间每5分钟刷新
    const refreshInterval = marketMeta?.isOpen ? 30 * 1000 : 5 * 60 * 1000
    const interval = setInterval(fetchData, refreshInterval)

    return () => clearInterval(interval)
  }, [marketMeta?.isOpen, fetchData])

  // 格式化工具
  const format = useMemo(() => {
    const sourceDisplay: SourceDisplay = SOURCE_MAP[source] || SOURCE_MAP['loading']

    const timeDisplay = lastUpdate
      ? lastUpdate.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : ''

    const statusBadge: StatusBadge = marketMeta
      ? {
          icon: marketMeta.isRealtime ? '🟢' : '⚪',
          label: marketMeta.isRealtime ? '交易中' : marketMeta.statusText,
          variant: marketMeta.isRealtime ? 'default' : 'outline',
        }
      : { icon: '⏳', label: '获取中...', variant: 'outline' }

    const sentimentDisplay: SentimentDisplay = {
      score: sentiment,
      label:
        sentiment >= SENTIMENT_THRESHOLDS.BULLISH
          ? '偏多'
          : sentiment <= SENTIMENT_THRESHOLDS.BEARISH
            ? '偏空'
            : '中性',
      color:
        sentiment >= SENTIMENT_THRESHOLDS.BULLISH
          ? 'text-red-500'
          : sentiment <= SENTIMENT_THRESHOLDS.BEARISH
            ? 'text-green-500'
            : 'text-gray-500',
    }

    return { sourceDisplay, timeDisplay, statusBadge, sentimentDisplay }
  }, [source, lastUpdate, marketMeta, sentiment])

  const value: MarketContextValue = {
    indices,
    capitalFlow,
    northbound,
    sentiment,
    marketMeta,
    isLoading,
    error,
    source,
    lastUpdate,
    refetch: fetchData,
    format,
  }

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/MarketContext.tsx
git commit -m "feat: create MarketContext provider with unified data management"
```

---

### Task 3: 重构 useMarketData Hook

**Files:**
- Modify: `src/hooks/useMarketData.ts`

**Interfaces:**
- Consumes: `useMarketContext` from `src/contexts/MarketContext.tsx`
- Produces: 保持原有 `UseMarketDataResult` 接口不变

- [ ] **Step 1: 重构为 Context consumer**

```typescript
// src/hooks/useMarketData.ts
'use client'

export { useMarketContext as useMarketData } from '@/contexts/MarketContext'
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMarketData.ts
git commit -m "refactor: redirect useMarketData to MarketContext"
```

---

### Task 4: 在 Dashboard Layout 中添加 MarketProvider

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `MarketProvider` from `src/contexts/MarketContext.tsx`

- [ ] **Step 1: 添加 MarketProvider**

```typescript
// src/app/(dashboard)/layout.tsx
import { MainLayout } from '@/components/layout/main-layout'
import { MarketProvider } from '@/contexts/MarketContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MarketProvider>
      <MainLayout>{children}</MainLayout>
    </MarketProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat: wrap dashboard layout with MarketProvider"
```

---

### Task 5: 修改 Dashboard 页面使用 Context

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useMarketContext` from `src/contexts/MarketContext.tsx`

- [ ] **Step 1: 更新 Dashboard 页面**

```typescript
// src/app/(dashboard)/dashboard/page.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Building2,
  Users,
  Globe,
  AlertCircle,
  Info,
  Clock,
} from 'lucide-react'
import { useMarketContext } from '@/contexts/MarketContext'

// 数据说明配置（保持不变）
const dataTooltips = {
  indexPrice: {
    title: '指数行情',
    description: '主要宽基指数的实时/最新收盘价格。',
    calculation: '数据来源：AKShare (东方财富)。显示最新价、涨跌额和涨跌幅百分比。',
  },
  institutional: {
    title: '机构/主力资金',
    description: '反映机构投资者的资金动向，是判断市场主力方向的重要指标。',
    calculation: '主力净流入 = 超大单净流入 + 大单净流入。占比 = 主力净流入绝对值 / (|主力净流入| + |散户净流入|) × 100%。',
  },
  retail: {
    title: '散户资金',
    description: '反映中小投资者的资金动向，与主力资金形成对比可判断市场分歧。',
    calculation: '散户净流入 = 中单净流入 + 小单净流入。散户与主力方向相反时，表示市场分歧较大。',
  },
  northbound: {
    title: '北向资金',
    description: '通过沪股通和深股通流入A股的境外资金，被称为"聪明钱"，对市场趋势有领先指示作用。',
    calculation: '北向资金净流入 = 沪股通净流入 + 深股通净流入。数据来源：东方财富互联互通数据。非交易时段显示最近交易日收盘数据。',
  },
  totalNet: {
    title: '大盘资金净流入',
    description: '沪深两市整体资金净流向，正值表示资金净流入，负值表示资金净流出。',
    calculation: '大盘资金净流入 = 主力净流入 + 散户净流入（中单+小单）。反映市场整体资金面状况。',
  },
  sentiment: {
    title: '市场情绪指数',
    description: '综合多维度指标计算的市场情绪评分，用于判断市场整体情绪。',
    calculation: '基于三个维度：主力资金流向(40%)、北向资金流向(35%)、主力散户分歧(25%)。50为中性，>60偏乐观，>75高度乐观，<40偏悲观，<25高度悲观。',
  },
  sectorInflow: {
    title: '板块资金流入排名',
    description: '当日主力资金净流入最多的行业板块，反映市场热点方向。',
    calculation: '按行业分类统计主力净流入金额，取Top10。数据来源：东方财富行业资金流向。',
  },
  sectorOutflow: {
    title: '板块资金流出排名',
    description: '当日主力资金净流出最多的行业板块，反映市场回避方向。',
    calculation: '按行业分类统计主力净流出金额，取Top10。数据来源：东方财富行业资金流向。',
  },
}

function InfoButton({ tooltip }: { tooltip: keyof typeof dataTooltips }) {
  const info = dataTooltips[tooltip]
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted hover:bg-muted-foreground/20 transition-colors">
        <Info className="h-3 w-3 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-xs p-3">
        <div className="space-y-1.5">
          <p className="font-semibold text-sm">{info.title}</p>
          <p className="text-xs text-muted-foreground">{info.description}</p>
          <div className="pt-1.5 border-t border-muted-foreground/20">
            <p className="text-xs"><span className="font-medium">计算方法：</span>{info.calculation}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default function DashboardPage() {
  const { indices, capitalFlow, isLoading, error, source, lastUpdate, marketMeta, refetch, format } = useMarketContext()

  const formatNumber = (num: number, decimals = 2) => {
    return num.toFixed(decimals)
  }

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-red-500' : 'text-green-500'
  }

  const getChangeSymbol = (change: number) => {
    return change >= 0 ? '▲' : '▼'
  }

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">仪表盘</h1>
            <p className="text-muted-foreground mt-1">
              市场概览与资金流向分析
            </p>
            <div className="flex items-center gap-2 mt-2">
              {/* 市场状态 */}
              {format.statusBadge.label && (
                <Badge variant={format.statusBadge.variant} className="text-xs">
                  {format.statusBadge.icon} {format.statusBadge.label}
                  {!marketMeta?.isRealtime && ' · 收盘数据'}
                </Badge>
              )}
              {/* 数据来源 */}
              <Badge variant="outline" className="text-xs">
                {format.sourceDisplay.icon} {format.sourceDisplay.text}
              </Badge>
              {/* 最近交易日 */}
              {marketMeta?.lastTradingDate && (
                <span className="text-xs text-muted-foreground">
                  数据日期: {marketMeta.lastTradingDate}
                </span>
              )}
              {/* 更新时间 */}
              {format.timeDisplay && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format.timeDisplay} 更新
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm font-medium">数据获取失败</p>
            </div>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-xs mt-2 text-yellow-600 dark:text-yellow-400">
              请确认 Python 数据服务已启动：cd data-service && python main.py
            </p>
          </div>
        )}

        {/* 第一区域：市场指数概览 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold">📊 市场指数</h2>
            <InfoButton tooltip="indexPrice" />
            {marketMeta && !marketMeta.isRealtime && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                非交易时间，显示{marketMeta.lastTradingDate}收盘数据
              </span>
            )}
          </div>
          {indices.length > 0 ? (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {indices.map((index) => (
                <Card key={index.code} className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{index.name}</CardTitle>
                    {index.changePct >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(index.price)}</div>
                    <p className={`text-xs ${getChangeColor(index.changePct)}`}>
                      {getChangeSymbol(index.changePct)} {formatNumber(Math.abs(index.changePct))}%
                      ({formatNumber(Math.abs(index.change))})
                    </p>
                    {marketMeta && !marketMeta.isRealtime && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        收盘价
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>暂无指数数据</p>
                  <p className="text-xs mt-1">请确认数据服务已启动</p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* 第二区域：资金流向 */}
        {capitalFlow && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">💰 资金流向</h2>
              {marketMeta && !marketMeta.isRealtime && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  非交易时间，数据可能为上一交易日
                </span>
              )}
            </div>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {/* 机构资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">机构资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="institutional" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.institutionalNet)}`}>
                    {capitalFlow.market.institutionalNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.institutionalNet)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    占比 {capitalFlow.market.institutionalPct >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.institutionalPct)}%
                  </p>
                </CardContent>
              </Card>

              {/* 散户资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">散户资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="retail" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.retailNet)}`}>
                    {capitalFlow.market.retailNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailNet)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    占比 {capitalFlow.market.retailPct >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailPct)}%
                  </p>
                </CardContent>
              </Card>

              {/* 北向资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">北向资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="northbound" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.northbound?.net || 0)}`}>
                    {(capitalFlow.northbound?.net || 0) >= 0 ? '+' : ''}{formatNumber(capitalFlow.northbound?.net || 0)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    沪股通 {formatNumber(capitalFlow.northbound?.shConnect || 0)}亿 · 深股通 {formatNumber(capitalFlow.northbound?.szConnect || 0)}亿
                  </p>
                  {capitalFlow.northbound?.stale && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {capitalFlow.northbound.dataDate || '上一交易日'}收盘数据
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 大盘总资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">大盘总资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="totalNet" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.totalNet)}`}>
                    {capitalFlow.market.totalNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.totalNet)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    沪深两市资金净流向
                  </p>
                </CardContent>
              </Card>

              {/* 市场情绪 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">市场情绪</CardTitle>
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="sentiment" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${format.sentimentDisplay.color}`}>
                    {format.sentimentDisplay.score}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format.sentimentDisplay.label}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* 第三区域：板块资金流向 */}
        {capitalFlow && (capitalFlow.topInflowSectors.length > 0 || capitalFlow.topOutflowSectors.length > 0) && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">📈 板块资金流向</h2>
              {marketMeta && !marketMeta.isRealtime && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  收盘数据
                </span>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Top10 资金流入板块 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-red-500" />
                    Top10 资金流入板块
                    <InfoButton tooltip="sectorInflow" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center">排名</span>
                        <span className="w-28">板块</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="w-20 text-right">净流入(亿)</span>
                        <span className="w-16 text-right">涨跌幅</span>
                      </div>
                    </div>
                    {capitalFlow.topInflowSectors.map((sector, index) => (
                      <div key={sector.sector} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-6 text-center ${index < 3 ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="font-medium w-28 whitespace-nowrap">{sector.sector}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-medium w-20 text-right ${getChangeColor(sector.netFlow)}`}>
                            {sector.netFlow >= 0 ? '+' : ''}{formatNumber(sector.netFlow)}
                          </span>
                          <span className={`text-sm w-16 text-right ${getChangeColor(sector.changePct)}`}>
                            {getChangeSymbol(sector.changePct)}{formatNumber(Math.abs(sector.changePct))}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top10 资金流出板块 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-green-500" />
                    Top10 资金流出板块
                    <InfoButton tooltip="sectorOutflow" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center">排名</span>
                        <span className="w-28">板块</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="w-20 text-right">净流出(亿)</span>
                        <span className="w-16 text-right">涨跌幅</span>
                      </div>
                    </div>
                    {capitalFlow.topOutflowSectors.map((sector, index) => (
                      <div key={sector.sector} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-6 text-center ${index < 3 ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="font-medium w-28 whitespace-nowrap">{sector.sector}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-medium w-20 text-right ${getChangeColor(sector.netFlow)}`}>
                            {sector.netFlow >= 0 ? '+' : ''}{formatNumber(sector.netFlow)}
                          </span>
                          <span className={`text-sm w-16 text-right ${getChangeColor(sector.changePct)}`}>
                            {getChangeSymbol(sector.changePct)}{formatNumber(Math.abs(sector.changePct))}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* 无数据时的提示 */}
        {!capitalFlow && !isLoading && (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>暂无资金流向数据</p>
                <p className="text-xs mt-1">请确认数据服务已启动</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "refactor: use MarketContext in Dashboard page"
```

---

### Task 6: 修改 Market Overview 页面使用 Context

**Files:**
- Modify: `src/app/(dashboard)/market/overview/page.tsx`

**Interfaces:**
- Consumes: `useMarketContext` from `src/contexts/MarketContext.tsx`

- [ ] **Step 1: 重写 Market Overview 页面**

```typescript
// src/app/(dashboard)/market/overview/page.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Activity,
  ArrowLeftRight,
  AlertCircle,
  Gauge,
  Clock,
} from 'lucide-react'
import { useMarketContext } from '@/contexts/MarketContext'

export default function MarketOverviewPage() {
  const {
    indices,
    capitalFlow,
    northbound,
    sentiment,
    marketMeta,
    isLoading,
    error,
    lastUpdate,
    refetch,
    format,
  } = useMarketContext()

  const fmt = (n: number, d = 2) => n.toFixed(d)
  const color = (v: number) => (v >= 0 ? 'text-red-500' : 'text-green-500')
  const sign = (v: number) => (v >= 0 ? '+' : '')

  // 从 indices 计算涨跌统计（用于辅助指标）
  const upCount = indices.filter((i) => i.changePct > 0).length
  const total = indices.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">市场概览</h1>
          <p className="text-muted-foreground">
            主要指数表现、市场情绪与北向资金流向
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {format.sourceDisplay.icon} {format.sourceDisplay.text}
            </Badge>
            {format.timeDisplay && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format.timeDisplay} 更新
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm font-medium">数据获取失败</p>
          </div>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs mt-2 text-yellow-600 dark:text-yellow-400">
            请确认 Python 数据服务已启动：cd data-service && python main.py
          </p>
        </div>
      )}

      {/* 指数行情卡片 */}
      <section>
        <h2 className="text-lg font-semibold mb-3">主要指数</h2>
        {indices.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {indices.map((idx) => (
              <Card key={idx.code} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{idx.name}</CardTitle>
                  {idx.changePct >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-red-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-green-500" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmt(idx.price)}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-sm font-medium ${color(idx.changePct)}`}>
                      {sign(idx.changePct)}{fmt(Math.abs(idx.changePct))}%
                    </span>
                    <span className={`text-xs ${color(idx.change)}`}>
                      ({sign(idx.change)}{fmt(Math.abs(idx.change))})
                    </span>
                  </div>
                  {idx.amount != null && idx.amount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      成交额: {(idx.amount / 1e8).toFixed(1)}亿
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>暂无指数数据</p>
                <p className="text-xs mt-1">请确认数据服务已启动</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="py-6">
                  <div className="h-4 w-20 bg-muted rounded animate-pulse mb-3" />
                  <div className="h-8 w-32 bg-muted rounded animate-pulse mb-2" />
                  <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 市场情绪 + 北向资金 + 资金流向概览 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 市场情绪 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">市场情绪</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${format.sentimentDisplay.color}`}>
                {format.sentimentDisplay.score}%
              </div>
              <Badge variant={format.sentimentDisplay.label === '偏多' ? 'default' : format.sentimentDisplay.label === '偏空' ? 'destructive' : 'secondary'}>
                {format.sentimentDisplay.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {upCount}/{total} 个指数上涨
            </p>
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  sentiment >= 70
                    ? 'bg-red-500'
                    : sentiment >= 40
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${sentiment}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* 北向资金 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">北向资金</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {northbound ? (
              <>
                <div className={`text-3xl font-bold ${color(northbound.net)}`}>
                  {sign(northbound.net)}{fmt(Math.abs(northbound.net))}亿
                </div>
                <p className="text-xs text-muted-foreground mt-1">净流入（人民币）</p>
                {northbound.dataDate && (
                  <p className="text-xs text-muted-foreground mt-2">日期: {northbound.dataDate}</p>
                )}
                {northbound.stale && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    历史数据
                  </p>
                )}
              </>
            ) : (
              <div className="text-muted-foreground text-sm py-2">暂无北向资金数据</div>
            )}
          </CardContent>
        </Card>

        {/* 市场资金概览 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">市场资金流向</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {capitalFlow ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">机构净流入</p>
                  <p className={`text-lg font-bold ${color(capitalFlow.market.institutionalNet)}`}>
                    {sign(capitalFlow.market.institutionalNet)}{fmt(Math.abs(capitalFlow.market.institutionalNet))}亿
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">散户净流入</p>
                  <p className={`text-lg font-bold ${color(capitalFlow.market.retailNet)}`}>
                    {sign(capitalFlow.market.retailNet)}{fmt(Math.abs(capitalFlow.market.retailNet))}亿
                  </p>
                </div>
                <div className="pt-1 border-t">
                  <p className="text-xs text-muted-foreground">大盘总净流入</p>
                  <p className={`text-lg font-bold ${color(capitalFlow.market.totalNet)}`}>
                    {sign(capitalFlow.market.totalNet)}{fmt(Math.abs(capitalFlow.market.totalNet))}亿
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm py-2">暂无资金流向数据</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/market/overview/page.tsx
git commit -m "refactor: use MarketContext in Market Overview page"
```

---

### Task 7: 修改 Capital Flow 页面使用 Context

**Files:**
- Modify: `src/app/(dashboard)/market/capital/page.tsx`

**Interfaces:**
- Consumes: `useMarketContext` from `src/contexts/MarketContext.tsx`

- [ ] **Step 1: 重写 Capital Flow 页面（移除独立状态管理）**

```typescript
// src/app/(dashboard)/market/capital/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Building2,
  Users,
  Globe,
  ArrowLeftRight,
  Layers,
  BarChart3,
  Crown,
  Clock,
} from 'lucide-react'
import { useMarketContext } from '@/contexts/MarketContext'

interface ETFItem {
  ticker?: string
  code?: string
  name: string
  trackingIndex?: string
  price?: number
  changePct?: number
  change?: number
  volume?: number
}

interface SectorBasic {
  name: string
  code: string
  change: number
  leader: string
}

interface SectorFlow {
  sector: string
  mainForceNet: number
  changePct: number
  trend: 'inflow' | 'outflow'
}

export default function CapitalFlowPage() {
  const {
    capitalFlow,
    northbound,
    marketMeta,
    isLoading,
    error,
    lastUpdate,
    refetch,
    format,
  } = useMarketContext()

  const [etfList, setEtfList] = useState<ETFItem[]>([])
  const [sectors, setSectors] = useState<SectorBasic[]>([])
  const [extraLoading, setExtraLoading] = useState(true)

  // 获取额外数据（ETF和板块基础数据）
  const fetchExtraData = useCallback(async () => {
    setExtraLoading(true)
    try {
      const [etfRes, sectorsRes] = await Promise.allSettled([
        fetch('/api/etf/list'),
        fetch('/api/market/sectors'),
      ])

      if (etfRes.status === 'fulfilled' && etfRes.value.ok) {
        const data = await etfRes.value.json()
        if (data.success && data.data) {
          setEtfList(Array.isArray(data.data) ? data.data : data.data.etfs || [])
        }
      }

      if (sectorsRes.status === 'fulfilled' && sectorsRes.value.ok) {
        const data = await sectorsRes.value.json()
        if (data.success && data.data?.sectors) {
          setSectors(data.data.sectors)
        }
      }
    } catch (err) {
      console.error('Fetch extra data failed:', err)
    } finally {
      setExtraLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExtraData()
  }, [fetchExtraData])

  const fmt = (n: number, d = 2) => n.toFixed(d)
  const color = (v: number) => (v >= 0 ? 'text-red-500' : 'text-green-500')
  const sign = (v: number) => (v >= 0 ? '+' : '')
  const trendBg = (v: number) => v >= 0 ? 'bg-red-500/10' : 'bg-green-500/10'

  // 北向资金数据（统一从 Context 获取）
  const northboundNet = northbound?.net ?? 0
  const northboundDate = northbound?.dataDate ?? ''
  const northboundStale = northbound?.stale ?? true

  // All sectors combined (inflow + outflow)
  const allSectors = [
    ...(capitalFlow?.topInflowSectors.map((s) => ({ ...s, trend: 'inflow' as const })) || []),
    ...(capitalFlow?.topOutflowSectors.map((s) => ({ ...s, trend: 'outflow' as const })) || []),
  ].sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow))

  // Sector flow for rotation view
  const sectorFlow: SectorFlow[] = [
    ...(capitalFlow?.topInflowSectors.map((s) => ({
      sector: s.sector,
      mainForceNet: s.netFlow,
      changePct: s.changePct,
      trend: 'inflow' as const,
    })) || []),
    ...(capitalFlow?.topOutflowSectors.map((s) => ({
      sector: s.sector,
      mainForceNet: s.netFlow,
      changePct: s.changePct,
      trend: 'outflow' as const,
    })) || []),
  ]

  // Merge sector basic + flow data for rotation view
  const mergedSectors = sectors.map((s) => {
    const flow = sectorFlow.find(
      (f) => f.sector === s.name || f.sector.includes(s.name)
    )
    return { ...s, flow }
  })

  const gainers = [...mergedSectors].sort((a, b) => b.change - a.change)
  const losers = [...mergedSectors].sort((a, b) => a.change - b.change)
  const flowRanking = [...sectorFlow].sort(
    (a, b) => Math.abs(b.mainForceNet) - Math.abs(a.mainForceNet)
  )

  const isDataLoading = isLoading || extraLoading

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">资金流向</h1>
          <p className="text-muted-foreground">
            市场资金流向、板块轮动、北向资金与ETF资金流向
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {format.sourceDisplay.icon} {format.sourceDisplay.text}
            </Badge>
            {capitalFlow?.dataDate && (
              <span className="text-xs text-muted-foreground">
                数据日期: {capitalFlow.dataDate}
              </span>
            )}
            {format.timeDisplay && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format.timeDisplay} 更新
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isDataLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isDataLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm font-medium">数据获取失败</p>
          </div>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* 数据质量提示 */}
      {capitalFlow?.dataQuality === 'estimated' && (
        <div className="rounded-lg bg-blue-50 p-3 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">
              大盘资金流向为行业汇总估算值（主接口不可用），仅供参考
            </p>
          </div>
        </div>
      )}
      {northboundStale && (
        <div className="rounded-lg bg-orange-50 p-3 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">
              北向资金数据暂不可用（交易所未披露实时数据），显示为历史缓存
            </p>
          </div>
        </div>
      )}

      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">机构净流入</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {capitalFlow ? (
              <>
                <div className={`text-2xl font-bold ${color(capitalFlow.market.institutionalNet)}`}>
                  {sign(capitalFlow.market.institutionalNet)}{fmt(Math.abs(capitalFlow.market.institutionalNet))}亿
                </div>
                <p className="text-xs text-muted-foreground">
                  占比: {sign(capitalFlow.market.institutionalPct)}{fmt(Math.abs(capitalFlow.market.institutionalPct))}%
                </p>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">散户净流入</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {capitalFlow ? (
              <>
                <div className={`text-2xl font-bold ${color(capitalFlow.market.retailNet)}`}>
                  {sign(capitalFlow.market.retailNet)}{fmt(Math.abs(capitalFlow.market.retailNet))}亿
                </div>
                <p className="text-xs text-muted-foreground">
                  占比: {sign(capitalFlow.market.retailPct)}{fmt(Math.abs(capitalFlow.market.retailPct))}%
                </p>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">大盘总净流入</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {capitalFlow ? (
              <div className={`text-2xl font-bold ${color(capitalFlow.market.totalNet)}`}>
                {sign(capitalFlow.market.totalNet)}{fmt(Math.abs(capitalFlow.market.totalNet))}亿
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">-</div>
            )}
            <p className="text-xs text-muted-foreground">沪深两市</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">北向净流入</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${northboundStale ? 'text-muted-foreground' : color(northboundNet)}`}>
              {northboundStale ? '暂无' : `${sign(northboundNet)}${fmt(Math.abs(northboundNet))}亿`}
            </div>
            <p className="text-xs text-muted-foreground">
              {northboundStale ? '数据暂不可用' : northboundDate || '暂无日期'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 详细分区 */}
      <Tabs defaultValue="sectors">
        <TabsList>
          <TabsTrigger value="sectors">板块排名</TabsTrigger>
          <TabsTrigger value="inflow">资金流入</TabsTrigger>
          <TabsTrigger value="outflow">资金流出</TabsTrigger>
          <TabsTrigger value="rotation">板块轮动</TabsTrigger>
          <TabsTrigger value="etf">ETF资金</TabsTrigger>
        </TabsList>

        {/* 板块排名 */}
        <TabsContent value="sectors">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                板块资金流向排名
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allSectors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">排名</TableHead>
                      <TableHead>板块</TableHead>
                      <TableHead className="text-right">净流入(亿)</TableHead>
                      <TableHead className="text-right">涨跌幅</TableHead>
                      <TableHead className="text-center">趋势</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allSectors.map((s, i) => (
                      <TableRow key={s.sector}>
                        <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.sector}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${color(s.netFlow)}`}>
                            {sign(s.netFlow)}{fmt(Math.abs(s.netFlow))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={color(s.changePct)}>
                            {sign(s.changePct)}{fmt(Math.abs(s.changePct))}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={s.trend === 'inflow' ? 'default' : 'destructive'} className="text-xs">
                            {s.trend === 'inflow' ? '流入' : '流出'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : !isDataLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>暂无板块资金流向数据</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 资金流入 */}
        <TabsContent value="inflow">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-red-500" />
                Top10 资金流入板块
              </CardTitle>
            </CardHeader>
            <CardContent>
              {capitalFlow?.topInflowSectors?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">排名</TableHead>
                      <TableHead className="min-w-[120px]">板块</TableHead>
                      <TableHead className="text-right">净流入(亿)</TableHead>
                      <TableHead className="text-right">涨跌幅</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {capitalFlow.topInflowSectors.map((s, i) => (
                      <TableRow key={s.sector}>
                        <TableCell className={`font-medium ${i < 3 ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{s.sector}</TableCell>
                        <TableCell className={`text-right font-medium ${color(s.netFlow)}`}>
                          {s.netFlow >= 0 ? '+' : ''}{fmt(s.netFlow)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={color(s.changePct)}>
                            {sign(s.changePct)}{fmt(Math.abs(s.changePct))}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>暂无资金流入数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 资金流出 */}
        <TabsContent value="outflow">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-green-500" />
                Top10 资金流出板块
              </CardTitle>
            </CardHeader>
            <CardContent>
              {capitalFlow?.topOutflowSectors?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">排名</TableHead>
                      <TableHead className="min-w-[120px]">板块</TableHead>
                      <TableHead className="text-right">净流出(亿)</TableHead>
                      <TableHead className="text-right">涨跌幅</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {capitalFlow.topOutflowSectors.map((s, i) => (
                      <TableRow key={s.sector}>
                        <TableCell className={`font-medium ${i < 3 ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{s.sector}</TableCell>
                        <TableCell className={`text-right font-medium ${color(s.netFlow)}`}>
                          {s.netFlow >= 0 ? '+' : ''}{fmt(s.netFlow)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={color(s.changePct)}>
                            {sign(s.changePct)}{fmt(Math.abs(s.changePct))}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>暂无资金流出数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 板块轮动 */}
        <TabsContent value="rotation">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                板块轮动分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mergedSectors.length > 0 ? (
                <Tabs defaultValue="all-rotation">
                  <TabsList>
                    <TabsTrigger value="all-rotation">全部板块</TabsTrigger>
                    <TabsTrigger value="gainers">涨幅榜</TabsTrigger>
                    <TabsTrigger value="losers">跌幅榜</TabsTrigger>
                    <TabsTrigger value="flow-ranking">资金排名</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all-rotation">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>板块</TableHead>
                          <TableHead>代码</TableHead>
                          <TableHead className="text-right">涨跌幅</TableHead>
                          <TableHead className="text-right">资金流向(亿)</TableHead>
                          <TableHead>领涨股</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mergedSectors.map((s, i) => (
                          <TableRow key={s.code}>
                            <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{s.code}</TableCell>
                            <TableCell className="text-right">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${trendBg(s.change)} ${color(s.change)}`}>
                                {s.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {sign(s.change)}{fmt(Math.abs(s.change))}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {s.flow ? (
                                <span className={color(s.flow.mainForceNet)}>
                                  {sign(s.flow.mainForceNet)}{fmt(Math.abs(s.flow.mainForceNet))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{s.leader || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="gainers">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">排名</TableHead>
                          <TableHead>板块</TableHead>
                          <TableHead className="text-right">涨跌幅</TableHead>
                          <TableHead className="text-right">资金流向(亿)</TableHead>
                          <TableHead>领涨股</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gainers.slice(0, 10).map((s, i) => (
                          <TableRow key={s.code}>
                            <TableCell>
                              {i < 3 ? <Crown className="h-4 w-4 text-yellow-500" /> : <span className="text-muted-foreground">{i + 1}</span>}
                            </TableCell>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-medium ${color(s.change)}`}>
                                {sign(s.change)}{fmt(Math.abs(s.change))}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {s.flow ? (
                                <span className={color(s.flow.mainForceNet)}>
                                  {sign(s.flow.mainForceNet)}{fmt(Math.abs(s.flow.mainForceNet))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{s.leader || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="losers">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">排名</TableHead>
                          <TableHead>板块</TableHead>
                          <TableHead className="text-right">涨跌幅</TableHead>
                          <TableHead className="text-right">资金流向(亿)</TableHead>
                          <TableHead>领涨股</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {losers.slice(0, 10).map((s, i) => (
                          <TableRow key={s.code}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-medium ${color(s.change)}`}>
                                {sign(s.change)}{fmt(Math.abs(s.change))}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {s.flow ? (
                                <span className={color(s.flow.mainForceNet)}>
                                  {sign(s.flow.mainForceNet)}{fmt(Math.abs(s.flow.mainForceNet))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{s.leader || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="flow-ranking">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">排名</TableHead>
                          <TableHead>板块</TableHead>
                          <TableHead className="text-right">主力净流入(亿)</TableHead>
                          <TableHead className="text-right">涨跌幅</TableHead>
                          <TableHead className="text-center">趋势</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flowRanking.map((s, i) => (
                          <TableRow key={s.sector}>
                            <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{s.sector}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-medium ${color(s.mainForceNet)}`}>
                                {sign(s.mainForceNet)}{fmt(Math.abs(s.mainForceNet))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={color(s.changePct)}>
                                {sign(s.changePct)}{fmt(Math.abs(s.changePct))}%
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={s.trend === 'inflow' ? 'default' : 'destructive'} className="text-xs">
                                {s.trend === 'inflow' ? '流入' : '流出'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              ) : !isDataLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>暂无板块数据</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ETF资金 */}
        <TabsContent value="etf">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-500" />
                ETF资金流向
              </CardTitle>
            </CardHeader>
            <CardContent>
              {etfList.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>代码</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>跟踪指数</TableHead>
                      <TableHead className="text-right">价格</TableHead>
                      <TableHead className="text-right">涨跌幅</TableHead>
                      <TableHead className="text-right">成交量</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {etfList.map((etf, i) => (
                      <TableRow key={etf.ticker || etf.code}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{etf.ticker || etf.code}</TableCell>
                        <TableCell className="font-medium">{etf.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{etf.trackingIndex || '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {etf.price != null ? fmt(etf.price) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {etf.changePct != null ? (
                            <span className={color(etf.changePct)}>
                              {sign(etf.changePct)}{fmt(Math.abs(etf.changePct))}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {etf.volume != null
                            ? etf.volume >= 1e8
                              ? `${(etf.volume / 1e8).toFixed(1)}亿`
                              : etf.volume >= 1e4
                                ? `${(etf.volume / 1e4).toFixed(0)}万`
                                : etf.volume.toLocaleString()
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : !isDataLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>暂无ETF数据</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/market/capital/page.tsx
git commit -m "refactor: use MarketContext in Capital Flow page"
```

---

### Task 8: 验证和测试

**Files:**
- Run: `npm run typecheck`
- Run: `npm run build`

- [ ] **Step 1: 运行 TypeScript 类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

- [ ] **Step 2: 运行构建验证**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: 验证页面功能**

手动验证：
1. 访问仪表盘页面，确认数据正确显示
2. 访问市场概览页面，确认数据与仪表盘一致
3. 访问资金流向页面，确认数据与仪表盘一致
4. 点击刷新按钮，确认所有页面同步更新

- [ ] **Step 4: Final Commit**

```bash
git add -A
git commit -m "chore: verify unified market data implementation"
```
