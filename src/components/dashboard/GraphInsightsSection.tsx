// src/components/dashboard/GraphInsightsSection.tsx

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TopRisingNodesTable } from './TopRisingNodesTable'
import { SubGraphHealthCards } from './SubGraphHealthCards'
import { GraphInsightsData } from '@/types/scoring'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'

export function GraphInsightsSection() {
  const [data, setData] = useState<GraphInsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/dashboard/graph-insights')
      if (!response.ok) {
        throw new Error('Failed to fetch insights')
      }
      const data = await response.json()
      setData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // This effect owns the initial data fetch for the client-only dashboard section.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInsights()
  }, [fetchInsights])

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="正在加载图谱洞察">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Card>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
          </CardContent>
        </Card>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          加载图谱洞察数据...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">图谱洞察暂时无法加载</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInsights}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            重新加载
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
          <AlertCircle className="h-7 w-7" aria-hidden="true" />
          <p className="font-medium">暂无图谱洞察</p>
          <p className="text-sm">完成评分计算后，这里会展示热度节点和子图健康度。</p>
          <Button variant="outline" size="sm" onClick={fetchInsights} className="mt-2">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            再试一次
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">知识图谱洞察</h2>
        <p className="text-muted-foreground">
          基于评分系统的市场热度分析
        </p>
      </div>

      {/* Top Rising Nodes */}
      <Card>
        <CardHeader>
          <CardTitle>热度上升 TOP10</CardTitle>
          <CardDescription>
            评分 &gt; 60 且趋势向上的节点
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TopRisingNodesTable nodes={data.topRisingNodes} />
        </CardContent>
      </Card>

      {/* Subgraph Health */}
      <Card>
        <CardHeader>
          <CardTitle>子图健康度总览</CardTitle>
          <CardDescription>
            10个行业子图的整体表现
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubGraphHealthCards subGraphs={data.subGraphHealth} />
        </CardContent>
      </Card>

      {/* Last Updated */}
      <div className="text-sm text-muted-foreground text-right">
        最后更新: {new Date(data.lastUpdated).toLocaleString('zh-CN')}
      </div>
    </div>
  )
}
