'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react'

interface SectorTrend {
  sector: string
  period: string
  eventSummary: {
    totalEvents: number
    sentimentDistribution: {
      bullish: number
      neutral: number
      bearish: number
    }
  }
  trendAssessment: {
    currentStatus: string
    shortTermOutlook: string
    mediumTermOutlook: string
    keyDrivers: string[]
    keyRisks: string[]
    confidenceLevel: number
  }
}

const sectors = ['半导体', '光通信', '服务器', '存储', '散热', 'PCB']

export default function TrendsPage() {
  const [trends, setTrends] = useState<Record<string, SectorTrend>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSector, setSelectedSector] = useState('半导体')

  const fetchTrends = async () => {
    setIsLoading(true)
    try {
      // 获取各板块趋势
      const trendData: Record<string, SectorTrend> = {}

      for (const sector of sectors) {
        try {
          const response = await fetch(`/api/events/trends/${sector}`)
          if (response.ok) {
            const data = await response.json()
            if (data.success && data.data) {
              trendData[sector] = data.data
            }
          }
        } catch (e) {
          console.error(`获取${sector}趋势失败:`, e)
        }

        // 如果没有获取到数据，跳过
        if (!trendData[sector]) {
          // 不填充模拟数据
        }
      }

      setTrends(trendData)
    } catch (error) {
      console.error('获取趋势失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTrends()
  }, [])

  const currentTrend = trends[selectedSector]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">领域趋势</h1>
          <p className="text-muted-foreground">
            AI硬件产业链各板块趋势分析
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTrends}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 板块选择 */}
      <div className="flex flex-wrap gap-2">
        {sectors.map(sector => (
          <Button
            key={sector}
            variant={selectedSector === sector ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedSector(sector)}
          >
            {sector}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : currentTrend ? (
        <div className="grid gap-6 md:grid-cols-2">
          {/* 趋势概览 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {selectedSector}板块趋势
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{currentTrend.trendAssessment.currentStatus}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  置信度: {(currentTrend.trendAssessment.confidenceLevel * 100).toFixed(0)}%
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">短期展望</h4>
                  <p className="text-sm">{currentTrend.trendAssessment.shortTermOutlook}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">中期展望</h4>
                  <p className="text-sm">{currentTrend.trendAssessment.mediumTermOutlook}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 事件统计 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                事件统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold">{currentTrend.eventSummary.totalEvents}</p>
                  <p className="text-sm text-muted-foreground">{currentTrend.period}事件总数</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <TrendingUp className="h-5 w-5 mx-auto text-green-500 mb-1" />
                    <p className="text-lg font-bold text-green-600">
                      {currentTrend.eventSummary.sentimentDistribution.bullish}
                    </p>
                    <p className="text-xs text-muted-foreground">利好</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
                    <Minus className="h-5 w-5 mx-auto text-gray-500 mb-1" />
                    <p className="text-lg font-bold text-gray-600">
                      {currentTrend.eventSummary.sentimentDistribution.neutral}
                    </p>
                    <p className="text-xs text-muted-foreground">中性</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <TrendingDown className="h-5 w-5 mx-auto text-red-500 mb-1" />
                    <p className="text-lg font-bold text-red-600">
                      {currentTrend.eventSummary.sentimentDistribution.bearish}
                    </p>
                    <p className="text-xs text-muted-foreground">利空</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 驱动因素 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                核心驱动因素
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {currentTrend.trendAssessment.keyDrivers.map((driver, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-sm">{driver}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* 风险提示 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                主要风险因素
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {currentTrend.trendAssessment.keyRisks.map((risk, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                    <span className="text-sm">{risk}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">暂无趋势数据</p>
          </CardContent>
        </Card>
      )}

      {/* 全板块概览 */}
      <Card>
        <CardHeader>
          <CardTitle>全板块趋势概览</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {sectors.map(sector => {
              const trend = trends[sector]
              if (!trend) return null

              const bullish = trend.eventSummary.sentimentDistribution.bullish
              const bearish = trend.eventSummary.sentimentDistribution.bearish
              const netSentiment = bullish - bearish

              return (
                <div
                  key={sector}
                  className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                    selectedSector === sector ? 'border-primary' : ''
                  }`}
                  onClick={() => setSelectedSector(sector)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{sector}</h3>
                    <Badge variant={netSentiment > 0 ? 'default' : netSentiment < 0 ? 'destructive' : 'secondary'}>
                      {netSentiment > 0 ? '偏多' : netSentiment < 0 ? '偏空' : '中性'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {trend.trendAssessment.currentStatus}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{trend.eventSummary.totalEvents}条事件</span>
                    <span>•</span>
                    <span>置信度{(trend.trendAssessment.confidenceLevel * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
