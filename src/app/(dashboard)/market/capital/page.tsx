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

  // Fetch page-specific extra data (ETF list and sectors)
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

  // Northbound data from context
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
      {/* Page header */}
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

      {/* Data quality notice */}
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

      {/* Overview cards */}
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

      {/* Detailed tabs */}
      <Tabs defaultValue="sectors">
        <TabsList>
          <TabsTrigger value="sectors">板块排名</TabsTrigger>
          <TabsTrigger value="inflow">资金流入</TabsTrigger>
          <TabsTrigger value="outflow">资金流出</TabsTrigger>
          <TabsTrigger value="rotation">板块轮动</TabsTrigger>
          <TabsTrigger value="etf">ETF资金</TabsTrigger>
        </TabsList>

        {/* Sector ranking */}
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

        {/* Capital inflow */}
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

        {/* Capital outflow */}
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

        {/* Sector rotation */}
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

        {/* ETF capital */}
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
