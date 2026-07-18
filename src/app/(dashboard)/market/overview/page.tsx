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
            {(() => {
              const hasNorthboundData = northbound && northbound.net !== 0
              return hasNorthboundData ? (
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
                <div className="text-muted-foreground text-sm py-2">暂无</div>
              )
            })()}
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
