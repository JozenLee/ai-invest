'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Minus, Users, Lightbulb } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

type TimeWindow = '3d' | '7d' | '30d'

type Stance = 'bullish' | 'neutral' | 'bearish'

interface StanceDistribution {
  bullish: number
  neutral: number
  bearish: number
}

interface OpinionData {
  postId: string
  influencerName: string
  opinionSummary: string
  stance: Stance
  compositeScore: number
  publishTime: string
  confidence: number
  sentiment: number
  credibility: number
}

interface ConsensusPoint {
  theme: string
  supportingCount: number
  keywords: string[]
  avgConfidence: number
  relatedPostIds: string[]
}

interface Statistics {
  totalOpinions: number
  avgConfidence: number
  avgSentiment: number
  avgCredibility: number
  stanceDistribution: StanceDistribution
  timeWindow: string
}

interface KOLOpinionsData {
  statistics: Statistics
  topOpinions: OpinionData[]
  consensusPoints: ConsensusPoint[]
}

interface KOLOpinionsSectionProps {
  domain: string
}

const stanceConfig = {
  bullish: {
    label: '看多',
    icon: TrendingUp,
    color: 'text-green-600',
    variant: 'default' as const,
  },
  neutral: {
    label: '中性',
    icon: Minus,
    color: 'text-gray-600',
    variant: 'secondary' as const,
  },
  bearish: {
    label: '看空',
    icon: TrendingDown,
    color: 'text-red-600',
    variant: 'destructive' as const,
  },
}

export function KOLOpinionsSection({ domain }: KOLOpinionsSectionProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('7d')
  const [data, setData] = useState<KOLOpinionsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchOpinions()
  }, [domain, timeWindow])

  const fetchOpinions = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/influencers/opinions/${domain}?timeWindow=${timeWindow}`)
      const result = await response.json()

      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || '获取大V观点失败')
      }
    } catch (err) {
      console.error('获取大V观点失败:', err)
      setError('网络错误，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}天前`
    if (hours > 0) return `${hours}小时前`
    return '刚刚'
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium text-red-600">加载失败</p>
        <p className="text-sm text-muted-foreground mt-2">
          {error || '无法获取大V观点数据'}
        </p>
        <Button onClick={fetchOpinions} className="mt-4" variant="outline">
          重试
        </Button>
      </div>
    )
  }

  const { statistics, topOpinions, consensusPoints } = data

  return (
    <div className="space-y-6">
      {/* Time Window Selector */}
      <div className="flex gap-2">
        <Button
          variant={timeWindow === '3d' ? 'default' : 'outline'}
          onClick={() => setTimeWindow('3d')}
          size="sm"
        >
          3天
        </Button>
        <Button
          variant={timeWindow === '7d' ? 'default' : 'outline'}
          onClick={() => setTimeWindow('7d')}
          size="sm"
        >
          7天
        </Button>
        <Button
          variant={timeWindow === '30d' ? 'default' : 'outline'}
          onClick={() => setTimeWindow('30d')}
          size="sm"
        >
          30天
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-muted-foreground">总观点数</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statistics.totalOpinions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-muted-foreground">平均置信度</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {(statistics.avgConfidence * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-muted-foreground">平均情绪</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {statistics.avgSentiment > 0.1 ? '看多' : statistics.avgSentiment < -0.1 ? '看空' : '中性'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-muted-foreground">平均可信度</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {(statistics.avgCredibility * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stance Distribution */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">观点立场分布</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <TrendingUp className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold text-green-600">
                {statistics.stanceDistribution.bullish}
              </p>
              <p className="text-sm text-muted-foreground mt-1">看多</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
              <Minus className="h-6 w-6 mx-auto text-gray-500 mb-2" />
              <p className="text-2xl font-bold text-gray-600">
                {statistics.stanceDistribution.neutral}
              </p>
              <p className="text-sm text-muted-foreground mt-1">中性</p>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <TrendingDown className="h-6 w-6 mx-auto text-red-500 mb-2" />
              <p className="text-2xl font-bold text-red-600">
                {statistics.stanceDistribution.bearish}
              </p>
              <p className="text-sm text-muted-foreground mt-1">看空</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Opinions */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">高质量观点</h3>
          <p className="text-sm text-muted-foreground">综合评分最高的观点</p>
        </CardHeader>
        <CardContent>
          {topOpinions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无观点数据</p>
          ) : (
            <div className="space-y-4">
              {topOpinions.map((opinion) => {
                const config = stanceConfig[opinion.stance]
                const StanceIcon = config.icon

                return (
                  <div
                    key={opinion.postId}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{opinion.influencerName}</span>
                      </div>
                      <Badge variant={config.variant} className="gap-1">
                        <StanceIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed mb-3">{opinion.opinionSummary}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex gap-3">
                        <span>评分: {opinion.compositeScore.toFixed(2)}</span>
                        <span>置信度: {(opinion.confidence * 100).toFixed(0)}%</span>
                        <span>可信度: {(opinion.credibility * 100).toFixed(0)}%</span>
                      </div>
                      <span>{formatTime(opinion.publishTime)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consensus Points */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            <h3 className="text-lg font-semibold">共识观点</h3>
          </div>
          <p className="text-sm text-muted-foreground">多位大V共同关注的主题</p>
        </CardHeader>
        <CardContent>
          {consensusPoints.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无共识观点</p>
          ) : (
            <div className="space-y-4">
              {consensusPoints.map((point, index) => (
                <div key={index} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold mb-2">{point.theme}</h4>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {point.supportingCount} 位大V支持
                    </span>
                    <span>
                      置信度: {(point.avgConfidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {point.keywords.map((keyword, idx) => (
                      <Badge key={idx} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
