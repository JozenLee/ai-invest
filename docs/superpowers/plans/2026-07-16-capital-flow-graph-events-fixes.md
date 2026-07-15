# 资金流向、知识图谱、事件资讯修复与优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复资金流向数据问题，合并板块轮动和资金流向页面，修复知识图谱传导路径中文显示，实现事件资讯定时采集和排序

**Architecture:** 修改Python数据服务的资金流向数据源（从行业汇总改为大盘专用接口），修复传导路径的节点ID→名称映射，合并两个页面为一个带Tab的资金流向页面，添加定时新闻采集机制

**Tech Stack:** Python FastAPI + AKShare, Next.js App Router, Prisma/SQLite, React 19

## Global Constraints

- 所有金额单位统一为"亿元"（前端显示）
- Python数据服务端口8000，Next.js端口3000
- AKShare接口调用需带重试和缓存降级
- 知识图谱节点name字段存中文，type字段存英文枚举
- 新闻数据保留7天滚动窗口

---

### Task 1: 修复Python数据服务的大盘资金流向数据

**问题根因:** `akshare_client.py` 的 `get_market_capital_flow()` 使用 `ak.stock_fund_flow_industry`（行业资金流向）汇总大盘数据，但该接口只有行业维度的流入/流出/净额，没有主力/散户的分单数据。代码用 `retail_net = -main_net * 0.3` 硬编码估算散户，导致：1) 机构和散户数据比例固定；2) 当接口失败时全部为0。

**修复方案:** 改用 `ak.stock_market_fund_flow`（沪深A股大盘资金流向），该接口直接返回主力/散户的净流入数据。

**Files:**
- Modify: `data-service/services/akshare_client.py:207-249`

**Interfaces:**
- Produces: `get_market_capital_flow()` 返回包含 `"主力净流入-净额"`, `"主力净流入-净占比"`, `"中单净流入-净额"`, `"小单净流入-净额"` 的Dict

- [ ] **Step 1: 修改 `get_market_capital_flow` 方法，改用大盘资金流向接口**

将 `data-service/services/akshare_client.py` 的 `get_market_capital_flow` 方法（207-249行）替换为：

```python
def get_market_capital_flow(self) -> Dict:
    """获取大盘资金流向

    降级策略：
    1. 东方财富 stock_market_fund_flow()（大盘资金流向，含主力/散户分单）
    2. 东方财富 stock_fund_flow_industry()（行业资金流向汇总，估算）
    3. 返回缓存数据
    """
    cache_key = "market_capital_flow"

    # 优先尝试大盘资金流向接口（有真实的主力/散户分单数据）
    try:
        df = self._retry_call(ak.stock_market_fund_flow)
        if not df.empty:
            # 取最新一行数据
            latest = df.iloc[-1]
            # 字段映射：该接口返回 "主力净流入-净额", "主力净流入-净占比",
            # "小单净流入-净额", "小单净流入-净占比", "中单净流入-净额", "中单净流入-净占比"
            # 数值单位已经是"元"
            main_net = float(latest.get("主力净流入-净额", 0))
            main_pct = float(latest.get("主力净流入-净占比", 0))
            mid_net = float(latest.get("中单净流入-净额", 0))
            small_net = float(latest.get("小单净流入-净额", 0))

            data = {
                "主力净流入-净额": main_net,
                "主力净流入-净占比": main_pct,
                "中单净流入-净额": mid_net,
                "小单净流入-净额": small_net,
                "日期": str(latest.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                "source": "market_fund_flow",
            }
            self._set(cache_key, data, memory_ttl=600)
            return data
    except Exception as e:
        print(f"大盘资金流向接口失败，尝试降级: {e}")

    # 降级：尝试行业资金流向汇总
    try:
        df = self._retry_call(ak.stock_fund_flow_industry)
        if not df.empty:
            total_inflow = df['流入资金'].astype(float).sum()
            total_outflow = df['流出资金'].astype(float).sum()
            total_net = df['净额'].astype(float).sum()

            main_net = total_net * 1e8  # 亿→元
            retail_net = -main_net * 0.3

            data = {
                "主力净流入-净额": main_net,
                "主力净流入-净占比": round(total_net / (total_inflow + total_outflow) * 100, 2) if (total_inflow + total_outflow) > 0 else 0,
                "中单净流入-净额": retail_net * 0.6,
                "小单净流入-净额": retail_net * 0.4,
                "日期": datetime.now().strftime("%Y-%m-%d"),
                "source": "fund_flow_industry_fallback",
            }
            self._set(cache_key, data, memory_ttl=600)
            return data
    except Exception as e:
        print(f"行业资金流向汇总也失败: {e}")

    # 降级：返回缓存
    cached = self._get(cache_key)
    if cached:
        print("使用缓存的大盘资金流向数据")
        return cached

    return {}
```

- [ ] **Step 2: 验证修改**

运行Python数据服务并测试：
```bash
cd data-service
python -c "
from services.akshare_client import client
data = client.get_market_capital_flow()
print(data)
print('主力:', data.get('主力净流入-净额', 0) / 1e8, '亿')
print('中单:', data.get('中单净流入-净额', 0) / 1e8, '亿')
print('小单:', data.get('小单净流入-净额', 0) / 1e8, '亿')
print('source:', data.get('source'))
"
```
预期输出：主力和散户数值不同，source为 `market_fund_flow`

- [ ] **Step 3: Commit**

```bash
git add data-service/services/akshare_client.py
git commit -m "fix: use stock_market_fund_flow for accurate market capital flow data"
```

---

### Task 2: 修复Python macro端点的资金流数据处理

**问题:** `capital_flow.py` 的 `/macro` 端点计算 `totalNet` 时用 `main_net + retail_net`，当使用新接口后，这个计算方式需要适配。同时需要确保 `institutionalPct` 和 `retailPct` 使用一致的计算方法。

**Files:**
- Modify: `data-service/routers/capital_flow.py:127-209`

**Interfaces:**
- Consumes: `client.get_market_capital_flow()` 返回的Dict（Task 1修改后）
- Produces: `/api/capital-flow/macro` 返回 `{ market: { institutionalNet, institutionalPct, retailNet, retailPct, totalNet }, topInflowSectors[], topOutflowSectors[] }`

- [ ] **Step 1: 修改macro端点的资金流计算逻辑**

将 `data-service/routers/capital_flow.py` 的 `get_macro_capital_flow` 函数中146-199行的市场数据处理部分替换为：

```python
        if has_market:
            main_net = float(market_data.get("主力净流入-净额", 0))
            main_pct = float(market_data.get("主力净流入-净占比", 0))
            mid_net = float(market_data.get("中单净流入-净额", 0))
            small_net = float(market_data.get("小单净流入-净额", 0))
            retail_net = mid_net + small_net
            # 大盘总净流入 = 主力 + 散户（中单+小单）
            market_total = main_net + retail_net
            data_date = str(market_data.get("日期", datetime.now().strftime("%Y-%m-%d")))

            # 计算散户占比（与主力占比使用一致的方法）
            total_abs = abs(main_net) + abs(retail_net)
            retail_pct = round((retail_net / total_abs) * 100, 2) if total_abs > 0 else 0
        else:
            main_net = retail_net = market_total = 0
            main_pct = retail_pct = 0
            data_date = datetime.now().strftime("%Y-%m-%d")
```

然后将返回数据部分（约190-206行）的 `retailPct` 改为使用新计算的 `retail_pct`：

```python
        return {
            "success": True,
            "data": {
                "date": data_date,
                "market": {
                    "institutionalNet": round(main_net / 1e8, 2),
                    "institutionalPct": round(main_pct, 2),
                    "retailNet": round(retail_net / 1e8, 2),
                    "retailPct": round(retail_pct, 2),
                    "totalNet": round(market_total / 1e8, 2),
                },
                "topInflowSectors": inflow_sectors,
                "topOutflowSectors": outflow_sectors,
                "source": "akshare_cached" if is_cached else "akshare_realtime",
                "dataDate": data_date,
                "timestamp": datetime.now().isoformat()
            }
        }
```

注意：需要删除原来的184-185行（`total_abs = abs(main_net) + abs(retail_net) + 1` 和 `retail_pct = ...`），因为已经移到 if/else 块中了。

- [ ] **Step 2: 验证**

```bash
cd data-service
python -c "
import asyncio
from services.akshare_client import client
from routers.capital_flow import get_macro_capital_flow
result = asyncio.run(get_macro_capital_flow())
m = result['data']['market']
print(f'机构: {m[\"institutionalNet\"]}亿 ({m[\"institutionalPct\"]}%)')
print(f'散户: {m[\"retailNet\"]}亿 ({m[\"retailPct\"]}%)')
print(f'大盘: {m[\"totalNet\"]}亿')
print(f'流入板块: {len(result[\"data\"][\"topInflowSectors\"])}')
print(f'流出板块: {len(result[\"data\"][\"topOutflowSectors\"])}')
"
```

- [ ] **Step 3: Commit**

```bash
git add data-service/routers/capital_flow.py
git commit -m "fix: improve capital flow percentage calculation consistency"
```

---

### Task 3: 合并板块轮动和资金流向页面

**问题:** 板块轮动页面(`/market/sectors`)数据为空，且与资金流向页面(`/market/capital`)功能重叠。需要合并为一个页面。

**修复方案:** 将板块轮动的内容作为新Tab添加到资金流向页面中，删除板块轮动独立页面，更新侧边栏导航。

**Files:**
- Modify: `src/app/(dashboard)/market/capital/page.tsx` — 添加板块轮动Tab
- Modify: `src/components/layout/sidebar.tsx` — 移除板块轮动菜单项
- Delete: `src/app/(dashboard)/market/sectors/page.tsx` — 删除独立页面

**Interfaces:**
- Consumes: `GET /api/market/sectors` 返回的板块数据
- Consumes: `GET /api/market/capital-flow` 返回的资金流数据

- [ ] **Step 1: 修改资金流向页面，添加板块轮动Tab**

将 `src/app/(dashboard)/market/capital/page.tsx` 完整替换为以下内容（合并了板块轮动的数据获取和展示逻辑）：

```tsx
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
} from 'lucide-react'

interface MarketFlow {
  institutionalNet: number
  institutionalPct: number
  retailNet: number
  retailPct: number
  totalNet: number
}

interface SectorFlowItem {
  sector: string
  netFlow: number
  changePct: number
}

interface CapitalFlowData {
  date?: string
  market: MarketFlow
  topInflowSectors: SectorFlowItem[]
  topOutflowSectors: SectorFlowItem[]
  source?: string
  dataDate?: string
}

interface MacroData {
  date: string
  market: { totalMainNet: number; retailNet: number }
  institutional: { northboundNet: number }
}

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
  const [capitalFlow, setCapitalFlow] = useState<CapitalFlowData | null>(null)
  const [macroData, setMacroData] = useState<MacroData | null>(null)
  const [etfList, setEtfList] = useState<ETFItem[]>([])
  const [sectors, setSectors] = useState<SectorBasic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('loading')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [capitalRes, macroRes, etfRes, sectorsRes] = await Promise.allSettled([
        fetch('/api/market/capital-flow'),
        fetch('/api/macro/capital-flow'),
        fetch('/api/etf/list'),
        fetch('/api/market/sectors'),
      ])

      // Main capital flow
      if (capitalRes.status === 'fulfilled' && capitalRes.value.ok) {
        const data = await capitalRes.value.json()
        if (data.success && data.data) {
          setCapitalFlow(data.data)
          setSource(data.data?.source || data.source || 'unknown')
        }
      }

      // Macro data (northbound, etc.)
      if (macroRes.status === 'fulfilled' && macroRes.value.ok) {
        const data = await macroRes.value.json()
        if (data.success && data.data) {
          setMacroData(data.data)
        }
      }

      // ETF list
      if (etfRes.status === 'fulfilled' && etfRes.value.ok) {
        const data = await etfRes.value.json()
        if (data.success && data.data) {
          setEtfList(Array.isArray(data.data) ? data.data : data.data.etfs || [])
        }
      }

      // Sector basic data
      if (sectorsRes.status === 'fulfilled' && sectorsRes.value.ok) {
        const data = await sectorsRes.value.json()
        if (data.success && data.data?.sectors) {
          setSectors(data.data.sectors)
        }
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.error('Fetch capital flow failed:', err)
      setError('Failed to load capital flow data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  const fmt = (n: number, d = 2) => n.toFixed(d)
  const color = (v: number) => (v >= 0 ? 'text-red-500' : 'text-green-500')
  const sign = (v: number) => (v >= 0 ? '+' : '')
  const trendBg = (v: number) => v >= 0 ? 'bg-red-500/10' : 'bg-green-500/10'

  // Northbound net from macro data
  const northboundNet = macroData?.institutional?.northboundNet ?? 0
  const northboundDate = macroData?.date ?? ''

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
              {source === 'loading' ? '加载中...' : source}
            </Badge>
            {capitalFlow?.dataDate && (
              <span className="text-xs text-muted-foreground">
                数据日期: {capitalFlow.dataDate}
              </span>
            )}
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                {lastUpdate.toLocaleTimeString('zh-CN')} 更新
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
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
            <div className={`text-2xl font-bold ${color(northboundNet)}`}>
              {sign(northboundNet)}{fmt(Math.abs(northboundNet))}亿
            </div>
            <p className="text-xs text-muted-foreground">
              {northboundDate || '暂无日期'}
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
              ) : !isLoading ? (
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
                      <TableHead>板块</TableHead>
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
                        <TableCell className="font-medium">{s.sector}</TableCell>
                        <TableCell className="text-right font-medium text-red-500">
                          +{fmt(Math.abs(s.netFlow))}
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
                      <TableHead>板块</TableHead>
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
                        <TableCell className="font-medium">{s.sector}</TableCell>
                        <TableCell className="text-right font-medium text-green-500">
                          {fmt(s.netFlow)}
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

        {/* 板块轮动（原sectors页面内容） */}
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
              ) : !isLoading ? (
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
              ) : !isLoading ? (
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

- [ ] **Step 2: 更新侧边栏导航，移除板块轮动独立菜单项**

将 `src/components/layout/sidebar.tsx` 的 children 数组（28-31行）修改为：

```tsx
    children: [
      { name: '市场概览', href: '/market/overview' },
      { name: '资金流向', href: '/market/capital' },
    ],
```

- [ ] **Step 3: 删除板块轮动独立页面**

```bash
rm -rf src/app/\(dashboard\)/market/sectors
```

- [ ] **Step 4: 验证页面合并**

```bash
npm run typecheck
```
预期：无类型错误

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: merge sector rotation into capital flow page"
```

---

### Task 4: 修复知识图谱传导路径显示中文名称

**问题根因:** `graph.service.ts` 的 `analyzePropagation` 方法中：
1. `identifySourceNode()` 返回英文type代码如 `chip_design`
2. `bfsPaths()` 的 `path.nodes` 数组存储的是节点ID（cuid），不是名称
3. 前端直接渲染 `path.nodes` 中的字符串，显示为乱码ID

**修复方案:** 修改后端 `analyzePropagation` 方法，在返回结果前将节点ID解析为中文名称。

**Files:**
- Modify: `src/lib/services/graph.service.ts:184-220` — 修改 analyzePropagation 方法
- Modify: `src/lib/services/graph.service.ts:423-471` — 修改 identifySourceNode 和 bfsPaths

**Interfaces:**
- Consumes: `prisma.graphNode.findMany()` 查询节点名称
- Produces: `PropagationPath.paths[].nodes` 改为存储中文名称而非ID

- [ ] **Step 1: 修改 `identifySourceNode` 返回节点ID而非type代码**

将 `src/lib/services/graph.service.ts` 的 `identifySourceNode` 方法（423-438行）替换为：

```typescript
  private async identifySourceNode(event: string): Promise<string> {
    const eventLower = event.toLowerCase()

    // 关键词到节点type的映射
    const typeMapping: Record<string, string> = {
      'gpu': 'chip_design',
      'nvidia': 'chip_design',
      'ai芯片': 'chip_design',
      '芯片': 'chip_design',
      'hbm': 'memory',
      '存储': 'memory',
      '服务器': 'server',
      '算力': 'server',
      '光模块': 'optical_module',
      '光通信': 'optical_comm',
      '液冷': 'cooling',
      '散热': 'cooling',
    }

    let matchedType = 'chip_design' // 默认
    for (const [keyword, type] of Object.entries(typeMapping)) {
      if (eventLower.includes(keyword)) {
        matchedType = type
        break
      }
    }

    // 查找该type对应的节点ID
    const node = await prisma.graphNode.findFirst({
      where: { type: matchedType },
      select: { id: true }
    })

    return node?.id || matchedType
  }
```

- [ ] **Step 2: 修改 `bfsPaths` 使其正确使用节点ID**

将 `src/lib/services/graph.service.ts` 的 `bfsPaths` 方法（441-471行）替换为：

```typescript
  private bfsPaths(edges: GraphEdge[], startNodeId: string, maxDepth: number): Array<{
    nodes: string[]
    edges: GraphEdge[]
  }> {
    const paths: Array<{ nodes: string[]; edges: GraphEdge[] }> = []
    const queue: Array<{ node: string; path: string[]; edgePath: GraphEdge[] }> = [
      { node: startNodeId, path: [startNodeId], edgePath: [] }
    ]

    while (queue.length > 0) {
      const { node, path, edgePath } = queue.shift()!

      if (path.length > maxDepth) continue

      // 匹配：sourceId === nodeId 或 source.type === nodeType
      const outEdges = edges.filter(e =>
        e.sourceId === node || e.source?.type === node
      )

      for (const edge of outEdges) {
        const nextNode = edge.targetId || ''
        if (!nextNode || path.includes(nextNode)) continue

        const newPath = [...path, nextNode]
        const newEdgePath = [...edgePath, edge]

        paths.push({ nodes: newPath, edges: newEdgePath })

        queue.push({ node: nextNode, path: newPath, edgePath: newEdgePath })
      }
    }

    return paths
  }
```

- [ ] **Step 3: 修改 `analyzePropagation` 方法，将节点ID解析为中文名称**

将 `src/lib/services/graph.service.ts` 的 `analyzePropagation` 方法（184-220行）替换为：

```typescript
  async analyzePropagation(
    triggerEvent: string,
    sourceNodeId?: string,
    maxDepth: number = 4
  ): Promise<PropagationPath> {
    const edges = await this.getEdges()
    const sourceNode = sourceNodeId || await this.identifySourceNode(triggerEvent)
    const paths = this.bfsPaths(edges, sourceNode, maxDepth)

    const scoredPaths = paths
      .map(path => ({
        ...path,
        score: this.scorePath(path, triggerEvent)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    // 收集所有路径中涉及的节点ID，批量查询中文名称
    const allNodeIds = new Set<string>()
    for (const p of scoredPaths) {
      for (const nodeId of p.nodes) {
        allNodeIds.add(nodeId)
      }
    }

    const nodes = await prisma.graphNode.findMany({
      where: { id: { in: Array.from(allNodeIds) } },
      select: { id: true, name: true, type: true }
    })

    const nodeIdToName = new Map<string, string>()
    for (const n of nodes) {
      nodeIdToName.set(n.id, n.name)
    }

    // 将路径中的节点ID替换为中文名称
    const resolvedPaths = scoredPaths.map(p => ({
      ...p,
      nodes: p.nodes.map(id => nodeIdToName.get(id) || id)
    }))

    return {
      trigger: {
        event: triggerEvent,
        sourceNode: nodeIdToName.get(sourceNode) || sourceNode
      },
      paths: resolvedPaths.map(p => ({
        nodes: p.nodes,
        edges: p.edges,
        totalLag: this.calculateTotalLag(p.edges),
        finalImpact: {
          node: p.nodes[p.nodes.length - 1],
          direction: 'positive',
          magnitude: Math.min(5, Math.round(p.score / 20)),
          confidence: Math.min(1, p.score / 100)
        },
        explanation: this.generateExplanation(p, triggerEvent)
      })),
      affectedStocks: this.identifyAffectedStocks(resolvedPaths)
    }
  }
```

- [ ] **Step 4: 修改 `generateExplanation` 使用已解析的名称**

`generateExplanation` 方法（493-501行）当前尝试从 `edge.source?.name` 获取名称。由于路径中的nodes已经是中文名称了，需要调整逻辑：

```typescript
  private generateExplanation(path: { nodes: string[]; edges: GraphEdge[] }, event: string): string {
    const steps = path.edges.map((edge, i) => {
      const source = path.nodes[i]
      const target = path.nodes[i + 1]
      return `${source} → ${target}（${edge.description || edge.relation}）`
    })

    return `传导路径：${steps.join(' → ')}`
  }
```

- [ ] **Step 5: 验证传导路径**

```bash
npm run typecheck
```

然后手动测试：启动服务后访问传导路径页面，输入"NVIDIA发布新GPU"，验证路径节点显示为中文名称。

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/graph.service.ts
git commit -m "fix: resolve node IDs to Chinese names in propagation paths"
```

---

### Task 5: 修复事件资讯按时间排序

**问题:** Python新闻路由 `news.py` 的 `/feed` 端点使用 `df.head(limit)` 取前N条，没有按 `publishTime` 排序。AKShare返回的数据顺序不确定。

**Files:**
- Modify: `data-service/routers/news.py:39-93` — 添加排序逻辑

**Interfaces:**
- Produces: `/api/news/feed` 返回按发布时间倒序排列的新闻列表

- [ ] **Step 1: 修改新闻feed端点，添加时间排序**

将 `data-service/routers/news.py` 的 `get_news_feed` 函数（39-93行）替换为：

```python
@router.get("/feed")
async def get_news_feed(
    category: Optional[str] = Query(default=None, description="新闻分类"),
    limit: int = Query(default=20, ge=1, le=100, description="返回数量"),
    offset: int = Query(default=0, ge=0, description="偏移量")
):
    """获取新闻资讯流（按发布时间倒序）"""
    try:
        news_list = []

        try:
            df = await asyncio.to_thread(ak.stock_news_em, "财联社")
            if not df.empty:
                # 按发布时间倒序排列
                if "发布时间" in df.columns:
                    df = df.sort_values(by="发布时间", ascending=False)

                for _, row in df.iterrows():
                    title = str(row.get("新闻标题", ""))
                    is_ai_related = any(kw in title for kw in AI_HARDWARE_KEYWORDS)

                    news_list.append({
                        "id": f"cls_{len(news_list)}",
                        "title": title,
                        "content": str(row.get("新闻内容", "")),
                        "summary": title[:100] + "..." if len(title) > 100 else title,
                        "source": "财联社",
                        "url": str(row.get("新闻链接", "")),
                        "publishTime": str(row.get("发布时间", datetime.now().isoformat())),
                        "category": categorize_news(title),
                        "sentiment": None,
                        "impact": None,
                        "entities": None,
                        "sectors": extract_sectors(title),
                        "isAiRelated": is_ai_related
                    })
        except Exception as e:
            print(f"获取财联社新闻失败: {e}")

        if not news_list:
            return {
                "success": False,
                "error": "无法获取新闻数据，AKShare 接口未返回有效数据",
                "data": None
            }

        if category:
            news_list = [n for n in news_list if n.get("category") == category]

        return {
            "success": True,
            "data": {
                "total": len(news_list),
                "items": news_list[offset:offset + limit],
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 2: Commit**

```bash
git add data-service/routers/news.py
git commit -m "fix: sort news feed by publishTime descending"
```

---

### Task 6: 实现事件资讯定时采集机制

**问题:** 新闻数据目前只在用户访问时实时从AKShare获取，没有定时采集和本地缓存。需要实现定时采集机制。

**修复方案:**
1. 在Python数据服务中添加 `/api/news/fetch` 端点，触发新闻采集并存储到SQLite
2. 修改 `/api/news/feed` 端点优先从本地数据库读取
3. 在Next.js中添加定时任务调用采集接口

**Files:**
- Modify: `data-service/routers/news.py` — 添加采集端点，修改feed端点
- Modify: `src/lib/services/event.service.ts` — 添加定时采集调用
- Create: `src/app/api/events/cron/route.ts` — 定时任务API端点

**Interfaces:**
- Produces: `POST /api/news/fetch` — 触发新闻采集
- Produces: `GET /api/events/cron` — 定时任务入口

- [ ] **Step 1: 在Python news路由中添加采集端点**

在 `data-service/routers/news.py` 文件末尾（`extract_sectors` 函数之后）添加：

```python
@router.post("/fetch")
async def fetch_and_store_news(limit: int = Query(default=50, ge=1, le=200)):
    """采集新闻并存储（定时任务调用）"""
    try:
        df = await asyncio.to_thread(ak.stock_news_em, "财联社")
        if df.empty:
            return {"success": False, "error": "AKShare未返回数据"}

        # 按发布时间倒序
        if "发布时间" in df.columns:
            df = df.sort_values(by="发布时间", ascending=False)

        stored = 0
        for _, row in df.head(limit).iterrows():
            title = str(row.get("新闻标题", ""))
            publish_time = str(row.get("发布时间", datetime.now().isoformat()))

            news_list.append({
                "id": f"cls_{hash(title) % 10000000}",
                "title": title,
                "content": str(row.get("新闻内容", "")),
                "source": "财联社",
                "url": str(row.get("新闻链接", "")),
                "publishTime": publish_time,
                "category": categorize_news(title),
                "sectors": extract_sectors(title),
                "isAiRelated": any(kw in title for kw in AI_HARDWARE_KEYWORDS),
            })
            stored += 1

        return {
            "success": True,
            "data": {
                "fetched": stored,
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

注意：这个端点只负责采集和返回数据，实际存储由Next.js端通过 `eventService.saveNewsWithRollingRefresh` 完成。

- [ ] **Step 2: 创建Next.js定时任务API端点**

创建 `src/app/api/events/cron/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { eventService } from '@/lib/services/event.service'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

// GET /api/events/cron — 定时采集新闻
// 可通过外部cron服务（如Vercel Cron、GitHub Actions）或系统crontab调用
export async function GET(request: NextRequest) {
  // 简单的密钥验证（防止滥用）
  const authKey = request.headers.get('x-cron-key') || request.nextUrl.searchParams.get('key')
  const expectedKey = process.env.CRON_SECRET_KEY || 'ai-invest-cron-2024'

  if (authKey !== expectedKey) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. 从Python数据服务获取最新新闻
    const response = await fetch(`${DATA_SERVICE_URL}/api/news/feed?limit=50`, {
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`Python数据服务响应异常: ${response.status}`)
    }

    const data = await response.json()
    if (!data.success || !data.data?.items) {
      return NextResponse.json({
        success: false,
        error: '无法获取新闻数据',
      })
    }

    // 2. 保存到本地数据库（滚动刷新）
    const articles = data.data.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      content: item.content || '',
      summary: item.summary,
      source: item.source || '财联社',
      url: item.url,
      publishTime: item.publishTime,
      category: item.category || 'market',
      sentiment: item.sentiment,
      impact: item.impact,
      entities: item.entities,
      sectors: item.sectors,
    }))

    const result = await eventService.saveNewsWithRollingRefresh(articles, 7)

    return NextResponse.json({
      success: true,
      data: {
        fetched: articles.length,
        saved: result.saved,
        deleted: result.deleted,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('定时新闻采集失败:', error)
    return NextResponse.json({
      success: false,
      error: `采集失败: ${error instanceof Error ? error.message : '未知错误'}`,
    })
  }
}
```

- [ ] **Step 3: 修改事件服务的 `getNewsFeed` 方法，优先从本地数据库读取**

将 `src/lib/services/event.service.ts` 的 `getNewsFeed` 方法（50-75行）替换为：

```typescript
  async getNewsFeed(params: {
    category?: string
    limit?: number
    offset?: number
  }): Promise<{ total: number; items: NewsArticle[] }> {
    const { category, limit = 20, offset = 0 } = params

    // 优先从本地数据库读取（定时采集的数据）
    try {
      const where: any = {}
      if (category) where.category = category

      const [total, articles] = await Promise.all([
        prisma.newsArticle.count({ where }),
        prisma.newsArticle.findMany({
          where,
          orderBy: { publishTime: 'desc' },
          skip: offset,
          take: limit,
        }),
      ])

      if (total > 0) {
        return {
          total,
          items: articles.map(a => ({
            id: a.id,
            title: a.title,
            content: a.content || '',
            summary: a.summary || undefined,
            source: a.source || '财联社',
            url: a.url || undefined,
            publishTime: a.publishTime?.toISOString() || new Date().toISOString(),
            category: a.category || 'market',
            sentiment: a.sentiment || undefined,
            impact: a.impact || undefined,
            entities: a.entities ? JSON.parse(a.entities as string) : undefined,
            sectors: a.sectors ? JSON.parse(a.sectors as string) : undefined,
          })),
        }
      }
    } catch (error) {
      console.log('本地数据库无数据，从Python服务获取:', error)
    }

    // 降级：从Python数据服务获取
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/news/feed?limit=${limit}&offset=${offset}${category ? `&category=${category}` : ''}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(30000) }
    )

    if (!response.ok) {
      throw new Error(`Python数据服务响应异常: ${response.status}`)
    }

    const data = await response.json()
    if (!data.success || !data.data) {
      throw new Error(data.error || '无法获取新闻数据')
    }

    return {
      total: data.data.total || 0,
      items: data.data.items || []
    }
  }
```

- [ ] **Step 4: 验证定时采集**

```bash
npm run typecheck
```

手动测试：
```bash
# 启动Python数据服务
cd data-service && python main.py &

# 启动Next.js
npm run dev &

# 触发定时采集
curl "http://localhost:3000/api/events/cron?key=ai-invest-cron-2024"

# 验证本地数据库有数据
curl "http://localhost:3000/api/events/feed?limit=5"
```

- [ ] **Step 5: Commit**

```bash
git add data-service/routers/news.py src/lib/services/event.service.ts src/app/api/events/cron/route.ts
git commit -m "feat: implement scheduled news fetching with local DB storage"
```

---

### Task 7: 配置定时任务调度

**问题:** 需要配置定时任务来自动触发新闻采集。

**修复方案:** 在 `package.json` 中添加定时任务脚本，使用系统crontab或外部服务调度。

**Files:**
- Modify: `package.json` — 添加定时任务脚本
- Create: `scripts/fetch-news.ts` — 新闻采集脚本

**Interfaces:**
- Produces: `npm run cron:news` — 手动触发新闻采集

- [ ] **Step 1: 创建新闻采集脚本**

创建 `scripts/fetch-news.ts`：

```typescript
// 新闻定时采集脚本
// 用法: npx tsx scripts/fetch-news.ts
// 建议crontab: */15 9-15 * * 1-5 npx tsx /path/to/scripts/fetch-news.ts

const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000'
const CRON_KEY = process.env.CRON_SECRET_KEY || 'ai-invest-cron-2024'

async function fetchNews() {
  try {
    const response = await fetch(`${NEXTJS_URL}/api/events/cron?key=${CRON_KEY}`, {
      signal: AbortSignal.timeout(60000),
    })

    const data = await response.json()
    console.log(`[${new Date().toISOString()}] 新闻采集结果:`, JSON.stringify(data, null, 2))

    if (!data.success) {
      console.error('采集失败:', data.error)
      process.exit(1)
    }
  } catch (error) {
    console.error('采集脚本执行失败:', error)
    process.exit(1)
  }
}

fetchNews()
```

- [ ] **Step 2: 在 package.json 中添加脚本**

在 `package.json` 的 scripts 部分添加：

```json
    "cron:news": "tsx scripts/fetch-news.ts",
    "cron:cleanup": "tsx scripts/cleanup-news.ts"
```

- [ ] **Step 3: 验证脚本**

```bash
npm run cron:news
```

预期输出：采集结果JSON，包含 fetched/saved/deleted 数量

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-news.ts package.json
git commit -m "feat: add news fetching cron script and npm scripts"
```

---

### Task 8: 端到端验证

**目标:** 验证所有修改的端到端功能。

- [ ] **Step 1: 启动服务**

```bash
# 终端1: 启动Python数据服务
cd data-service && python main.py

# 终端2: 启动Next.js
npm run dev
```

- [ ] **Step 2: 验证资金流向数据**

```bash
# 检查大盘资金流向
curl -s http://localhost:3000/api/market/capital-flow | python3 -m json.tool | head -30
```

预期：
- `institutionalNet` 和 `retailNet` 数值不同
- `totalNet` 不为0
- `topOutflowSectors` 数组非空

- [ ] **Step 3: 验证传导路径中文显示**

在浏览器中访问 `http://localhost:3000/graph/propagation`，输入"NVIDIA发布新GPU"，验证路径节点显示为中文名称（如"芯片设计"、"存储"等）。

- [ ] **Step 4: 验证事件资讯排序**

```bash
curl -s http://localhost:3000/api/events/feed?limit=5 | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data['data']['items']:
    print(f'{item[\"publishTime\"]} | {item[\"title\"][:50]}')"
```

预期：时间戳从新到旧排列

- [ ] **Step 5: 验证板块轮动合并页面**

在浏览器中访问 `http://localhost:3000/market/capital`，验证：
- 有"板块轮动"Tab
- 板块轮动Tab下有"全部板块"、"涨幅榜"、"跌幅榜"、"资金排名"子Tab
- 侧边栏不再有独立的"板块轮动"菜单项

- [ ] **Step 6: 运行验收测试**

```bash
bash scripts/acceptance-test.sh
```

- [ ] **Step 7: Final Commit**

```bash
git add -A
git commit -m "chore: verification complete, all fixes working"
```
