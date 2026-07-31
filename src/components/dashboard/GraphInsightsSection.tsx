// src/components/dashboard/GraphInsightsSection.tsx

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TopRisingNodesTable } from './TopRisingNodesTable'
import { SubGraphHealthCards } from './SubGraphHealthCards'
import { GraphInsightsData } from '@/types/scoring'
import { Loader2 } from 'lucide-react'

export function GraphInsightsSection() {
  const [data, setData] = useState<GraphInsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchInsights()
  }, [])

  const fetchInsights = async () => {
    try {
      setLoading(true)
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
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">加载图谱洞察数据...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        加载失败: {error}
      </div>
    )
  }

  if (!data) {
    return null
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
