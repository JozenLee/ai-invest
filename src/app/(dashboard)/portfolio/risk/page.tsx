'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  PieChart,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'

interface Holding {
  id: string
  ticker: string
  name: string
  quantity: number
  avgCost: number
  currentPrice: number | null
}

interface Portfolio {
  id: string
  name: string
  isDefault: boolean
  holdings: Holding[]
}

interface SectorGroup {
  sector: string
  holdings: { name: string; ticker: string; value: number }[]
  totalValue: number
  pct: number
}

// ETF sector classification based on ticker/name
function classifySector(ticker: string, name: string): string {
  if (name.includes('300') || name.includes('沪深300')) return '宽基指数'
  if (name.includes('50') && (name.includes('科创') || name.includes('创业板'))) return '成长指数'
  if (name.includes('半导体') || name.includes('芯片')) return '半导体'
  if (name.includes('通信') || name.includes('5G')) return '通信'
  if (name.includes('AI') || name.includes('人工智能')) return '人工智能'
  if (name.includes('新能源') || name.includes('光伏') || name.includes('锂')) return '新能源'
  if (name.includes('医药') || name.includes('医疗') || name.includes('生物')) return '医药健康'
  if (name.includes('消费') || name.includes('白酒') || name.includes('食品')) return '消费'
  if (name.includes('金融') || name.includes('银行') || name.includes('证券')) return '金融'
  if (name.includes('军工') || name.includes('国防')) return '军工'
  if (name.includes('地产') || name.includes('房地产')) return '房地产'
  return '其他'
}

export default function RiskAnalysisPage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [portfolioName, setPortfolioName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPortfolio = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio')
      const data = await res.json()
      if (data.success && data.data?.length > 0) {
        const p = data.data.find((p: Portfolio) => p.isDefault) ?? data.data[0]
        setPortfolioName(p.name)
        setHoldings(p.holdings ?? [])
      } else {
        setHoldings([])
      }
    } catch (err) {
      console.error('获取投资组合失败:', err)
      setError('获取投资组合数据失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPortfolio()
  }, [fetchPortfolio])

  // P&L calculations
  const calcValue = (h: Holding) => (h.currentPrice ?? h.avgCost) * h.quantity
  const totalValue = holdings.reduce((s, h) => s + calcValue(h), 0)
  const totalCost = holdings.reduce((s, h) => s + h.avgCost * h.quantity, 0)

  // Concentration analysis
  const concentration = holdings
    .map((h) => ({
      name: h.name,
      ticker: h.ticker,
      value: calcValue(h),
      pct: totalValue > 0 ? (calcValue(h) / totalValue) * 100 : 0,
      pnl: calcValue(h) - h.avgCost * h.quantity,
      pnlPct: h.avgCost * h.quantity > 0
        ? ((calcValue(h) - h.avgCost * h.quantity) / (h.avgCost * h.quantity)) * 100
        : 0,
    }))
    .sort((a, b) => b.pct - a.pct)

  // Sector distribution
  const sectorMap = new Map<string, { holdings: { name: string; ticker: string; value: number }[]; totalValue: number }>()
  for (const h of holdings) {
    const sector = classifySector(h.ticker, h.name)
    const existing = sectorMap.get(sector) ?? { holdings: [], totalValue: 0 }
    existing.holdings.push({ name: h.name, ticker: h.ticker, value: calcValue(h) })
    existing.totalValue += calcValue(h)
    sectorMap.set(sector, existing)
  }
  const sectors: SectorGroup[] = Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      holdings: data.holdings,
      totalValue: data.totalValue,
      pct: totalValue > 0 ? (data.totalValue / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct)

  // Risk metrics
  const maxSinglePct = concentration.length > 0 ? concentration[0].pct : 0
  const hhi = concentration.reduce((s, c) => s + c.pct * c.pct, 0) // Herfindahl index
  const numSectors = sectors.length
  const topSectorPct = sectors.length > 0 ? sectors[0].pct : 0

  const getRiskLevel = () => {
    if (maxSinglePct > 50 || hhi > 3000) return { level: '高', color: 'text-red-500', bg: 'bg-red-500' }
    if (maxSinglePct > 35 || hhi > 2000) return { level: '中高', color: 'text-orange-500', bg: 'bg-orange-500' }
    if (maxSinglePct > 25 || hhi > 1500) return { level: '中', color: 'text-yellow-500', bg: 'bg-yellow-500' }
    return { level: '低', color: 'text-green-500', bg: 'bg-green-500' }
  }
  const risk = getRiskLevel()

  // Generate a color palette for sectors
  const sectorColors = [
    'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-green-500',
    'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500',
  ]

  const formatMoney = (n: number) =>
    n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (holdings.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <PieChart className="h-10 w-10 mx-auto mb-3" />
            <p className="text-lg font-medium">暂无持仓数据</p>
            <p className="text-sm mt-1">请先在持仓总览页面添加持仓</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">风险分析</h1>
          <p className="text-muted-foreground">
            {portfolioName} · 持仓集中度与行业分布
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPortfolio} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Risk Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">风险等级</CardTitle>
            <ShieldCheck className={`h-4 w-4 ${risk.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${risk.color}`}>{risk.level}</div>
            <p className="text-xs text-muted-foreground">
              HHI指数 {hhi.toFixed(0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">最大单只占比</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${maxSinglePct > 40 ? 'text-red-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${maxSinglePct > 40 ? 'text-red-500' : ''}`}>
              {maxSinglePct.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {concentration.length > 0 ? concentration[0].name : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">行业数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{numSectors}</div>
            <p className="text-xs text-muted-foreground">
              {numSectors < 3 ? '行业集中，建议分散' : '行业分布较均衡'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">第一大行业占比</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${topSectorPct > 50 ? 'text-red-500' : ''}`}>
              {topSectorPct.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {sectors.length > 0 ? sectors[0].sector : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Concentration Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              持仓集中度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {concentration.map((c) => (
                <div key={c.ticker} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">{c.ticker}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={c.pnl >= 0 ? 'text-red-500' : 'text-green-500'}>
                        {c.pnl >= 0 ? (
                          <TrendingUp className="inline h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="inline h-3 w-3 mr-1" />
                        )}
                        {c.pnlPct >= 0 ? '+' : ''}{c.pnlPct.toFixed(1)}%
                      </span>
                      <span className="font-medium w-14 text-right">{c.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        c.pct > 40 ? 'bg-red-500' : c.pct > 25 ? 'bg-orange-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(c.pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>市值 {formatMoney(c.value)}</span>
                    {c.pct > 40 && (
                      <span className="text-red-500 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        占比过高
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sector Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              行业分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sectors.map((s, i) => (
                <div key={s.sector} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${sectorColors[i % sectorColors.length]}`} />
                      <span className="font-medium">{s.sector}</span>
                      <Badge variant="outline" className="text-xs">
                        {s.holdings.length}只
                      </Badge>
                    </div>
                    <span className="font-medium">{s.pct.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${sectorColors[i % sectorColors.length]}`}
                      style={{ width: `${Math.min(s.pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.holdings.map((h) => (
                      <span key={h.ticker} className="text-xs text-muted-foreground">
                        {h.name}({formatMoney(h.value)})
                        {s.holdings.indexOf(h) < s.holdings.length - 1 ? ' · ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Warnings */}
      {(maxSinglePct > 40 || numSectors < 3 || topSectorPct > 60) && (
        <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              风险提示
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-yellow-800 dark:text-yellow-300">
              {maxSinglePct > 40 && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>单只ETF占比超过40%，集中度风险较高。建议适当分散持仓，降低单一标的波动对组合的影响。</span>
                </li>
              )}
              {numSectors < 3 && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>仅覆盖{numSectors}个行业，行业分散度不足。建议增加不同板块的ETF以分散行业风险。</span>
                </li>
              )}
              {topSectorPct > 60 && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>第一大行业占比超过60%，行业集中度过高。建议降低{sectors[0]?.sector}板块权重。</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>以上分析仅供参考，不构成投资建议。投资有风险，决策需谨慎。</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
