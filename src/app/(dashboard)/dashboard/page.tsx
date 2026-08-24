'use client'

import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  AlertCircle,
  Clock,
  BarChart3,
} from 'lucide-react'
import { useMarketContext } from '@/contexts/MarketContext'
import { GraphInsightsSection } from '@/components/dashboard/GraphInsightsSection'
import { MarketIndexGrid } from '@/components/market/MarketIndexGrid'
import { DataSourceBadge, MarketStatusBadge } from '@/components/market/MarketMetaBadges'

export default function DashboardPage() {
  const { indices, isLoading, error, format, marketMeta, refetch } = useMarketContext()

  return (
    <div className="animate-rise space-y-8">
      {/* 页面标题 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">研究工作台</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">仪表盘</h1>
          <p className="mt-1 text-muted-foreground">
            市场概览与知识图谱洞察
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* 市场状态 */}
            {format.statusBadge.label && (
              <MarketStatusBadge statusBadge={format.statusBadge} isRealtime={marketMeta?.isRealtime} />
            )}
            {/* 数据来源 */}
            <DataSourceBadge sourceDisplay={format.sourceDisplay} />
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
          className="self-start"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
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

      {/* 市场指数概览 */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold">市场指数</h2>
          </div>
          {marketMeta && !marketMeta.isRealtime && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              非交易时间，显示{marketMeta.lastTradingDate}收盘数据
            </span>
          )}
        </div>
        <MarketIndexGrid indices={indices} isLoading={isLoading} />
      </section>

      {/* Knowledge Graph Insights Section */}
      <section className="mt-8">
        <GraphInsightsSection />
      </section>
    </div>
  )
}
