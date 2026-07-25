'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, TrendingUp, CheckCircle, Activity } from 'lucide-react'
import { formatBeijingTime } from '@/lib/time-utils'

interface DashboardStats {
  articles: {
    total: number
    today: number
    aiProcessed: number
    bySource: Array<{ source: string; count: number }>
  }
  dataSources: {
    total: number
    active: number
    lastFetch: string | null
  }
  sentiment: {
    bullish: number
    neutral: number
    bearish: number
  }
}

export function StatsOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats/dashboard')
      const data = await response.json()

      if (data.success) {
        setStats(data.data)
      }
    } catch (error) {
      console.error('获取统计数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-20 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const sentimentTotal = stats.sentiment.bullish + stats.sentiment.neutral + stats.sentiment.bearish
  const sentimentPercentages = {
    bullish: sentimentTotal > 0 ? (stats.sentiment.bullish / sentimentTotal * 100).toFixed(0) : 0,
    neutral: sentimentTotal > 0 ? (stats.sentiment.neutral / sentimentTotal * 100).toFixed(0) : 0,
    bearish: sentimentTotal > 0 ? (stats.sentiment.bearish / sentimentTotal * 100).toFixed(0) : 0
  }

  return (
    <div className="space-y-4">
      {/* 主要统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 文章总数 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              文章总数
            </CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.articles.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              今日新增: {stats.articles.today}
            </p>
          </CardContent>
        </Card>

        {/* AI处理率 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI处理率
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.articles.total > 0
                ? ((stats.articles.aiProcessed / stats.articles.total) * 100).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              已处理: {stats.articles.aiProcessed.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* 数据源状态 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              数据源
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.dataSources.active}/{stats.dataSources.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.dataSources.lastFetch
                ? `最后采集: ${formatBeijingTime(stats.dataSources.lastFetch, 'short')}`
                : '暂无采集记录'}
            </p>
          </CardContent>
        </Card>

        {/* 市场情绪 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              市场情绪
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-green-600">
                {sentimentPercentages.bullish}%
              </span>
              <span className="text-sm text-muted-foreground">利好</span>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 h-2 bg-green-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600"
                  style={{ width: `${sentimentPercentages.bullish}%` }}
                />
              </div>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-600"
                  style={{ width: `${sentimentPercentages.neutral}%` }}
                />
              </div>
              <div className="flex-1 h-2 bg-red-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600"
                  style={{ width: `${sentimentPercentages.bearish}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 数据源分布 */}
      {stats.articles.bySource.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">数据源分布（Top 5）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.articles.bySource.slice(0, 5).map((source, index) => {
                const percentage = ((source.count / stats.articles.total) * 100).toFixed(1)
                return (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-24 text-sm truncate">{source.source}</div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="w-20 text-right text-sm text-muted-foreground">
                      {source.count} ({percentage}%)
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
