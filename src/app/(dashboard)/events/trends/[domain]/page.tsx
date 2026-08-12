'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TrendHeader } from '@/components/trends/TrendHeader'
import { AIInsightSection } from '@/components/trends/AIInsightSection'
import { RelatedDomainsSection } from '@/components/trends/RelatedDomainsSection'
import { RelatedNewsSection } from '@/components/trends/RelatedNewsSection'
import { ContentSection } from '@/components/events/ContentSection'
import { StatCardGrid } from '@/components/events/StatCardGrid'
import { StatCard } from '@/components/events/StatCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DomainTrendDetail, TrendAnalysisResponse } from '@/types/trend'
import { getDomainByCode } from '@/config/etf-domains'

const trendConfig = {
  bullish: {
    label: '看涨',
    icon: TrendingUp,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
  },
  neutral: {
    label: '中性',
    icon: Minus,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
  },
  bearish: {
    label: '看跌',
    icon: TrendingDown,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
  },
}

export default function TrendDetailPage() {
  const params = useParams()
  const domain = params.domain as string

  // 从URL参数或localStorage读取newsCount，确保与概览页面一致
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const urlNewsCount = searchParams.get('newsCount')
  const storedNewsCount = typeof window !== 'undefined' ? localStorage.getItem('trendNewsCount') : null
  const initialNewsCount = urlNewsCount ? parseInt(urlNewsCount) : (storedNewsCount ? parseInt(storedNewsCount) : 50)

  const [newsCount] = useState(initialNewsCount)
  const [trend, setTrend] = useState<DomainTrendDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('news')

  // Fetch trend detail
  const fetchTrendDetail = useCallback(async (showLoader = true, includeAI = false) => {
    if (showLoader) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)

    try {
      const url = `/api/events/trends/analysis?domain=${encodeURIComponent(domain)}&newsCount=${newsCount}&includeAI=${includeAI}`
      console.log('[趋势详情] 请求URL:', url)

      const response = await fetch(url)
      console.log('[趋势详情] 响应状态:', response.status)

      const data: TrendAnalysisResponse = await response.json()
      console.log('[趋势详情] 响应数据:', { success: data.success, hasData: !!data.data, error: data.error })

      if (data.success && data.data) {
        setTrend(data.data)
        // 如果数据标记为noData，设置友好提示
        if ((data.data as any).noData) {
          setError(`${data.data.domainName}领域近期没有相关新闻数据`)
        }
      } else {
        const errorMsg = data.error || '获取趋势分析失败'
        console.error('[趋势详情] 设置错误:', errorMsg)
        setError(errorMsg)
      }
    } catch (err) {
      console.error('[趋势详情] 异常:', err)
      setError('网络错误，请稍后重试')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [domain, newsCount])

  useEffect(() => {
    fetchTrendDetail(true, false) // 初始加载不包含AI分析
  }, [fetchTrendDetail])

  const handleRefresh = async () => {
    // Clear cache first
    try {
      await fetch('/api/events/trends/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
    } catch (err) {
      console.error('清除缓存失败:', err)
    }

    fetchTrendDetail(false, false)
  }

  const handleGenerateAI = async () => {
    setIsGeneratingAI(true)
    try {
      const response = await fetch(
        `/api/events/trends/analysis?domain=${encodeURIComponent(domain)}&newsCount=${newsCount}&includeAI=true`
      )
      const data: TrendAnalysisResponse = await response.json()

      if (data.success && data.data) {
        setTrend(data.data)
      } else {
        setError(data.error || '生成AI分析失败')
      }
    } catch (err) {
      console.error('生成AI分析失败:', err)
      setError('生成AI分析时发生错误，请稍后重试')
    } finally {
      setIsGeneratingAI(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-6 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !trend) {
    // 尝试从配置中获取领域中文名称
    const domainConfig = getDomainByCode(domain)
    const displayName = domainConfig?.name || domain

    // 判断是否是数据不足的情况
    const isNoDataError = error?.includes('无相关新闻') || error?.includes('不存在')

    return (
      <div className="space-y-6">
        <TrendHeader
          domainName={displayName}
          newsCount={newsCount}
        />
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
          <p className="text-lg font-medium text-red-600">
            {isNoDataError ? '暂无数据' : '加载失败'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {isNoDataError
              ? `${displayName}领域近期没有足够的相关新闻数据，请稍后再试或选择其他领域`
              : (error || '无法获取趋势数据')}
          </p>
          {!isNoDataError && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fetchTrendDetail(true, false)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          )}
        </div>
      </div>
    )
  }

  const config = trendConfig[trend.trendDirection]
  const TrendIcon = config.icon

  return (
    <div className="space-y-6">
      {/* Header */}
      <TrendHeader
        domainName={trend.domainName}
        newsCount={newsCount}
        lastUpdated={trend.lastUpdated}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Top Stats */}
      <StatCardGrid>
        <StatCard
          icon={TrendIcon}
          label="趋势方向"
          value={config.label}
          variant={trend.trendDirection === 'bullish' ? 'success' : trend.trendDirection === 'bearish' ? 'danger' : 'default'}
        />
        <StatCard
          icon={Activity}
          label="置信度"
          value={`${(trend.confidenceScore * 100).toFixed(0)}%`}
          variant={trend.confidenceScore >= 0.7 ? 'success' : 'default'}
        />
        <StatCard
          icon={TrendingUp}
          label="利好新闻"
          value={trend.sentimentDistribution.bullish}
          variant="success"
        />
        <StatCard
          icon={TrendingDown}
          label="利空新闻"
          value={trend.sentimentDistribution.bearish}
          variant="danger"
        />
      </StatCardGrid>

      {/* Trend Overview */}
      <ContentSection title="趋势概览">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Trend Direction */}
          <div className={`p-6 rounded-lg ${config.bgColor} border border-current/20`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-full bg-white dark:bg-gray-800`}>
                <TrendIcon className={`h-6 w-6 ${config.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">趋势方向</p>
                <p className={`text-2xl font-bold ${config.color}`}>{config.label}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              置信度：{(trend.confidenceScore * 100).toFixed(0)}%
            </p>
          </div>

          {/* Sentiment Distribution */}
          <div className="p-6 rounded-lg border">
            <h3 className="text-sm font-medium mb-4">情绪分布</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <TrendingUp className="h-5 w-5 mx-auto text-green-500 mb-1" />
                <p className="text-xl font-bold text-green-600">
                  {trend.sentimentDistribution.bullish}
                </p>
                <p className="text-xs text-muted-foreground">看涨</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
                <Minus className="h-5 w-5 mx-auto text-gray-500 mb-1" />
                <p className="text-xl font-bold text-gray-600">
                  {trend.sentimentDistribution.neutral}
                </p>
                <p className="text-xs text-muted-foreground">中性</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <TrendingDown className="h-5 w-5 mx-auto text-red-500 mb-1" />
                <p className="text-xl font-bold text-red-600">
                  {trend.sentimentDistribution.bearish}
                </p>
                <p className="text-xs text-muted-foreground">看跌</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              总计 {trend.relatedNewsCount} 条新闻
            </p>
          </div>
        </div>
      </ContentSection>

      {/* Tabbed Content Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          <TabsTrigger value="news">实时新闻</TabsTrigger>
          <TabsTrigger value="analysis">趋势分析</TabsTrigger>
          <TabsTrigger value="ai">AI解读</TabsTrigger>
        </TabsList>

        {/* News Tab */}
        <TabsContent value="news" className="mt-6">
          <RelatedNewsSection news={trend.relatedNews} />
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="mt-6">
          <RelatedDomainsSection relatedDomains={trend.relatedDomains} />
        </TabsContent>

        {/* AI Insight Tab */}
        <TabsContent value="ai" className="mt-6">
          <AIInsightSection
            trend={trend}
            onGenerateAI={handleGenerateAI}
            isGenerating={isGeneratingAI}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
