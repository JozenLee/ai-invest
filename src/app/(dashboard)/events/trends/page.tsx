'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, BarChart3, TrendingUp, TrendingDown, Newspaper } from 'lucide-react'
import { PageHeader } from '@/components/events/PageHeader'
import { StatCardGrid } from '@/components/events/StatCardGrid'
import { StatCard } from '@/components/events/StatCard'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsCountSelector } from '@/components/trends/NewsCountSelector'
import { DomainTrendCard } from '@/components/trends/DomainTrendCard'
import { DomainTrendSummary, TrendSummaryResponse } from '@/types/trend'

export default function TrendsOverviewPage() {
  const [newsCount, setNewsCount] = useState(50)
  const [trends, setTrends] = useState<DomainTrendSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch trends data
  const fetchTrends = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)

    try {
      const response = await fetch(`/api/events/trends/summary?newsCount=${newsCount}`)
      const result = await response.json()

      if (result.success && result.data) {
        // 处理后端返回的嵌套结构: { data: { domains: [...] } }
        const domains = Array.isArray(result.data) ? result.data : result.data.domains || []
        setTrends(domains)
      } else {
        setError(result.error || '获取趋势数据失败')
      }
    } catch (err) {
      console.error('获取趋势失败:', err)
      setError('网络错误，请稍后重试')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [newsCount])

  useEffect(() => {
    fetchTrends(true)
  }, [fetchTrends])

  const handleRefresh = () => {
    fetchTrends(false)
  }

  const handleNewsCountChange = (count: number) => {
    setNewsCount(count)
  }

  // Calculate stats
  const stats = {
    totalDomains: trends.length,
    bullishDomains: trends.filter(t => t.trendDirection === 'bullish').length,
    bearishDomains: trends.filter(t => t.trendDirection === 'bearish').length,
    totalNews: trends.reduce((sum, t) => sum + t.relatedNewsCount, 0),
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="领域趋势概览"
        description="基于最新新闻数据，分析各领域的投资趋势和情绪变化"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      {/* Top Stats */}
      <StatCardGrid>
        <StatCard
          icon={BarChart3}
          label="监测领域"
          value={stats.totalDomains}
          variant="default"
        />
        <StatCard
          icon={TrendingUp}
          label="看涨领域"
          value={stats.bullishDomains}
          variant="success"
        />
        <StatCard
          icon={TrendingDown}
          label="看跌领域"
          value={stats.bearishDomains}
          variant="danger"
        />
        <StatCard
          icon={Newspaper}
          label="分析新闻"
          value={stats.totalNews}
          variant="default"
        />
      </StatCardGrid>

      {/* News Count Selector */}
      <div className="flex items-center justify-between">
        <NewsCountSelector
          value={newsCount}
          onChange={handleNewsCountChange}
          disabled={isLoading || isRefreshing}
        />
        <div className="text-sm text-muted-foreground">
          {trends.length > 0 && `共 ${trends.length} 个领域`}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Domain Cards Grid */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-4 p-6 border rounded-lg">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : trends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">暂无趋势数据</p>
          <p className="text-sm text-muted-foreground">请稍后刷新重试</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {trends.map((trend) => (
            <DomainTrendCard key={trend.domainCode} trend={trend} />
          ))}
        </div>
      )}
    </div>
  )
}
