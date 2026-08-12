'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import {
  Newspaper,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Radio,
} from 'lucide-react'
import { NewsCategory, Domain } from '@/types/event'
import { EVENTS_TEXT } from '@/constants/events-text'
import { PageHeader } from '@/components/events/PageHeader'
import { StatCard } from '@/components/events/StatCard'
import { StatCardGrid } from '@/components/events/StatCardGrid'
import { MultiSelect } from '@/components/events/MultiSelect'
import { formatLocalTimeString } from '@/lib/time-utils'
import { useNewsStream } from '@/hooks/useNewsStream'
import { ETF_DOMAINS, getDomainByCode } from '@/config/etf-domains'
import { NewsTags } from '@/components/news/NewsTags'
import { IndustrySegmentTags } from '@/components/news/IndustrySegmentTags'

interface NewsArticle {
  id: string
  title: string
  content: string
  summary?: string
  source: string
  url?: string
  publishTime: string
  category: string
  categoryId?: string
  categoryName?: string
  domainId?: string
  domainIds?: string[]
  domainName?: string
  sourceId?: string
  sentiment?: number | null
  sentimentLabel?: string | null
  impact?: number
  sectors?: string[]
  tags?: Array<{
    id: string
    confidence: number
    tag: {
      id: string
      name: string
      code: string
      type: string
    }
  }>
  // 知识图谱关联信息 - 新增
  industrySegments?: Array<{
    industry_code: string
    industry_name: string
    segment_code: string
    segment_name: string
  }>
}

interface DataSource {
  id: string
  name: string
  category: string
}

interface Industry {
  id: string
  code: string
  name: string
  description?: string
}

interface Segment {
  stage_name: string
  stage_code: string
  segment_code: string
  segment_name: string
  description: string
}

const sentimentConfig = {
  bullish: { label: '利好', color: 'default', icon: TrendingUp },
  bearish: { label: '利空', color: 'destructive', icon: TrendingDown },
  neutral: { label: '中性', color: 'secondary', icon: Minus },
}

const sentimentApiMap: Record<string, string> = {
  'bullish': 'bullish',
  'neutral': 'neutral',
  'bearish': 'bearish',
}

const sentimentDisplayMap: Record<string, string> = {
  'all': EVENTS_TEXT.feed.filter.sentimentAll,
  'bullish': EVENTS_TEXT.feed.filter.sentimentBullish,
  'neutral': EVENTS_TEXT.feed.filter.sentimentNeutral,
  'bearish': EVENTS_TEXT.feed.filter.sentimentBearish,
}

const sortApiMap: Record<string, string> = {
  'publishTime': 'publishTime',
  'sentiment': 'sentiment',
  'impact': 'impact',
}

const sortDisplayMap: Record<string, string> = {
  'publishTime': EVENTS_TEXT.feed.filter.sortByTime,
  'sentiment': EVENTS_TEXT.feed.filter.sortBySentiment,
  'impact': EVENTS_TEXT.feed.filter.sortByImpact,
}

export default function EventsFeedPage() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<NewsCategory[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedDomainCodes, setSelectedDomainCodes] = useState<string[]>([]) // 改用code而非id
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [selectedSentiments, setSelectedSentiments] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<string>('publishTime')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [updateCount, setUpdateCount] = useState(0)

  // 知识图谱筛选 - 新增
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedIndustryId, setSelectedIndustryId] = useState<string>('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegmentCodes, setSelectedSegmentCodes] = useState<string[]>([])
  const [isLoadingSegments, setIsLoadingSegments] = useState(false)

  // 今日统计数据（不受筛选影响）
  const [todayStats, setTodayStats] = useState({
    total: 0,
    bullish: 0,
    bearish: 0,
  })

  // SSE实时更新
  const { isConnected, lastEvent } = useNewsStream({
    onUpdate: useCallback((data: any) => {
      console.log('收到SSE更新:', data)
      setUpdateCount(prev => prev + 1)
      // 自动刷新新闻列表和统计数据
      if (data.type === 'batch_completed' || data.type === 'news_updated') {
        // 延迟刷新，避免频繁请求
        setTimeout(() => {
          fetchNews()
          fetchTodayStats()
        }, 500)
      }
    }, [])
  })

  // 分类分组配置（排除分组名本身）
  const categoryGroups = [
    {
      name: '科技类',
      categories: ['cat_ai', 'cat_chip', 'cat_internet', 'cat_breakthrough', 'cat_product']
    },
    {
      name: '财经类',
      categories: ['cat_capital', 'cat_macro', 'cat_earnings']
    },
    {
      name: '产业类',
      categories: ['cat_supply', 'cat_capacity', 'cat_competition', 'cat_new_energy', 'cat_medical']
    },
    {
      name: '政策类',
      categories: ['cat_policy', 'cat_regulation', 'cat_government']
    },
    {
      name: '国际类',
      categories: ['cat_geopolitics', 'cat_global_market', 'cat_trade']
    },
    {
      name: '其他',
      categories: ['cat_society', 'cat_event', 'cat_consume', 'cat_merger']
    }
  ]

  // 根据分组获取分类选项
  const getCategoriesByGroup = (groupCodes: string[]) => {
    return categories
      .filter(cat => groupCodes.includes(cat.id))
      .map(cat => ({
        value: cat.id,
        label: cat.name
      }))
  }

  // 获取分类数据
  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/events/categories')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setCategories(data.data)
        }
      }
    } catch (error) {
      console.error('获取分类失败:', error)
    }
  }

  // 获取领域数据
  const fetchDomains = async () => {
    // 使用新的ETF领域配置，不再从API获取
    // API的Domain表可能还没有同步更新
  }

  // 获取产业列表 - 新增
  const fetchIndustries = async () => {
    try {
      const response = await fetch('/api/graph/industries')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setIndustries(data.data)
        }
      }
    } catch (error) {
      console.error('获取产业列表失败:', error)
    }
  }

  // 获取产业的Segment列表 - 新增
  const fetchSegments = async (industryId: string) => {
    if (!industryId) {
      setSegments([])
      return
    }

    setIsLoadingSegments(true)
    try {
      const response = await fetch(`/api/graph/industries/${industryId}/segments`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.segments) {
          setSegments(data.data.segments)
        }
      }
    } catch (error) {
      console.error('获取Segment列表失败:', error)
    } finally {
      setIsLoadingSegments(false)
    }
  }

  // 当选择产业时，加载其Segment列表
  useEffect(() => {
    if (selectedIndustryId) {
      fetchSegments(selectedIndustryId)
    } else {
      setSegments([])
      setSelectedSegmentCodes([])
    }
  }, [selectedIndustryId])

  // 获取数据源列表
  const fetchDataSources = async () => {
    try {
      const response = await fetch('/api/datasources')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setDataSources(data.data)
        }
      }
    } catch (error) {
      console.error('获取数据源失败:', error)
    }
  }

  // 获取今日统计数据（不受筛选影响）
  const fetchTodayStats = async () => {
    try {
      // 获取大量新闻（假设今天不会超过1000条）
      const response = await fetch('/api/events/feed?limit=1000&sortBy=publishTime')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.items) {
          // 在客户端过滤出今天的新闻
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          const todayNews = data.data.items.filter((article: NewsArticle) => {
            const publishDate = new Date(article.publishTime)
            return publishDate >= today
          })

          const bullish = todayNews.filter((article: NewsArticle) =>
            article.sentiment && article.sentiment > 0.2
          ).length

          const bearish = todayNews.filter((article: NewsArticle) =>
            article.sentiment && article.sentiment < -0.2
          ).length

          setTodayStats({
            total: todayNews.length,
            bullish,
            bearish,
          })
        }
      }
    } catch (error) {
      console.error('获取今日统计失败:', error)
    }
  }

  // 获取新闻数据
  const fetchNews = useCallback(async () => {
    setIsLoading(true)
    try {
      let url = '/api/events/feed?limit=50'
      if (selectedCategoryIds.length > 0) {
        // 多个分类用逗号分隔，后端需要支持OR查询
        url += `&categoryIds=${selectedCategoryIds.join(',')}`
      }
      if (selectedDomainCodes.length > 0) {
        // 使用领域code而非id
        url += `&domainIds=${selectedDomainCodes.join(',')}`
      }
      if (selectedSourceIds.length > 0) {
        url += `&sourceIds=${selectedSourceIds.join(',')}`
      }
      if (selectedSentiments.length > 0) {
        const mappedSentiments = selectedSentiments.map(s => sentimentApiMap[s] || s)
        url += `&sentiments=${mappedSentiments.join(',')}`
      }
      if (sortBy) url += `&sortBy=${sortApiMap[sortBy] || sortBy}`
      if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`

      // 知识图谱筛选 - 新增
      if (selectedIndustryId) {
        url += `&industryId=${selectedIndustryId}`
        if (selectedSegmentCodes.length > 0) {
          url += `&segmentCodes=${selectedSegmentCodes.join(',')}`
        }
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.items) {
          setNews(data.data.items)
        }
      }
    } catch (error) {
      console.error('获取新闻失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [selectedCategoryIds, selectedDomainCodes, selectedSourceIds, selectedSentiments, sortBy, keyword, selectedIndustryId, selectedSegmentCodes])

  useEffect(() => {
    fetchCategories()
    fetchDomains()
    fetchDataSources()
    fetchTodayStats()
    fetchIndustries() // 新增
  }, [])

  useEffect(() => {
    fetchNews()
  }, [fetchNews])

  const handleSearch = () => {
    setKeyword(searchInput)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const clearFilters = () => {
    setSelectedCategoryIds([])
    setSelectedDomainCodes([])
    setSelectedSourceIds([])
    setSelectedSentiments([])
    setSortBy('publishTime')
    setKeyword('')
    setSearchInput('')
    // 清除知识图谱筛选 - 新增
    setSelectedIndustryId('')
    setSelectedSegmentCodes([])
  }

  const getSentimentInfo = (sentiment?: number | null) => {
    if (sentiment === null || sentiment === undefined || Math.abs(sentiment) <= 0.2) {
      return sentimentConfig.neutral
    }
    return sentiment > 0 ? sentimentConfig.bullish : sentimentConfig.bearish
  }

  const formatTime = (timeStr: string) => {
    // 直接格式化时间字符串，避免时区转换
    // 数据库存储的时间已经是北京时间
    return formatLocalTimeString(timeStr, 'full')
  }

  // 查找分类名称
  const findCategoryName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId)
    return category ? category.name : categoryId
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <PageHeader
        title={EVENTS_TEXT.feed.title}
        description={EVENTS_TEXT.feed.description}
        actions={
          <div className="flex items-center gap-3">
            {/* SSE连接状态 */}
            <div className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>
              <Radio className={`h-4 w-4 ${isConnected ? 'animate-pulse' : ''}`} />
              <span>{isConnected ? '实时连接' : '离线模式'}</span>
              {updateCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {updateCount}
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={fetchNews} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {EVENTS_TEXT.common.refresh}
            </Button>
          </div>
        }
      />

      {/* 统计卡片 */}
      <StatCardGrid>
        <StatCard
          icon={Newspaper}
          label={EVENTS_TEXT.feed.stats.todayNews}
          value={todayStats.total}
          variant="default"
        />
        <StatCard
          icon={TrendingUp}
          label={EVENTS_TEXT.feed.stats.bullishEvents}
          value={todayStats.bullish}
          variant="success"
        />
        <StatCard
          icon={TrendingDown}
          label={EVENTS_TEXT.feed.stats.bearishEvents}
          value={todayStats.bearish}
          variant="danger"
        />
      </StatCardGrid>

      {/* 筛选栏 */}
      <Card>
        <CardContent className="p-4 space-y-4 overflow-visible">
          {/* 搜索和基础筛选 */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={EVENTS_TEXT.feed.filter.searchPlaceholder}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSearch} size="sm">
                {EVENTS_TEXT.common.search}
              </Button>
              <Button variant="outline" onClick={clearFilters} size="sm">
                清除筛选
              </Button>
            </div>
          </div>

          {/* 产业和数据源筛选 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 产业筛选 */}
            <Select
              value={selectedIndustryId}
              onValueChange={(value) => {
                setSelectedIndustryId(value || '')
                setSelectedSegmentCodes([]) // 切换产业时清空Segment选择
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择产业">
                  {selectedIndustryId
                    ? industries.find(i => i.id === selectedIndustryId)?.name
                    : '选择产业'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部产业</SelectItem>
                {industries.map((industry) => (
                  <SelectItem key={industry.id} value={industry.id}>
                    {industry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Segment筛选（当选择了产业时显示） */}
            {selectedIndustryId && (
              <MultiSelect
                value={selectedSegmentCodes}
                onChange={setSelectedSegmentCodes}
                options={segments.map(seg => ({
                  value: seg.segment_code,
                  label: `${seg.stage_name} - ${seg.segment_name}`,
                }))}
                placeholder={isLoadingSegments ? "加载中..." : "选择细分领域"}
                title="选择细分领域"
                className="w-full"
                disabled={isLoadingSegments}
              />
            )}

            {/* 数据源筛选 */}
            <MultiSelect
              value={selectedSourceIds}
              onChange={setSelectedSourceIds}
              options={dataSources.map(source => ({
                value: source.id,
                label: source.name,
              }))}
              placeholder="数据源筛选"
              title="选择数据源"
              className="w-full"
            />
          </div>

          {/* 分类筛选 - 移除旧的树形选择器 */}

          {/* 当前筛选条件 */}
          {(selectedCategoryIds.length > 0 || selectedDomainCodes.length > 0 || selectedSourceIds.length > 0 || selectedSentiments.length > 0 || keyword || selectedIndustryId || selectedSegmentCodes.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-sm pt-2 border-t">
              <span className="text-muted-foreground">当前筛选：</span>
              {/* 产业筛选标签 - 新增 */}
              {selectedIndustryId && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer bg-purple-100 text-purple-800"
                  onClick={() => setSelectedIndustryId('')}
                >
                  产业: {industries.find(i => i.id === selectedIndustryId)?.name} ×
                </Badge>
              )}
              {/* Segment筛选标签 - 新增 */}
              {selectedSegmentCodes.length > 0 && (
                <>
                  {selectedSegmentCodes.map((segmentCode) => {
                    const segment = segments.find(s => s.segment_code === segmentCode)
                    return (
                      <Badge
                        key={segmentCode}
                        variant="secondary"
                        className="cursor-pointer bg-indigo-100 text-indigo-800"
                        onClick={() => setSelectedSegmentCodes(prev => prev.filter(code => code !== segmentCode))}
                      >
                        {segment?.segment_name || segmentCode} ×
                      </Badge>
                    )
                  })}
                </>
              )}
              {selectedCategoryIds.length > 0 && (
                <>
                  {selectedCategoryIds.map((categoryId) => (
                    <Badge
                      key={categoryId}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => setSelectedCategoryIds(prev => prev.filter(id => id !== categoryId))}
                    >
                      {findCategoryName(categoryId)} ×
                    </Badge>
                  ))}
                </>
              )}
              {selectedDomainCodes.length > 0 && (
                <>
                  {selectedDomainCodes.map((domainCode) => {
                    const domain = getDomainByCode(domainCode)
                    return (
                      <Badge
                        key={domainCode}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setSelectedDomainCodes(prev => prev.filter(code => code !== domainCode))}
                      >
                        {domain?.name || domainCode} ×
                      </Badge>
                    )
                  })}
                </>
              )}
              {selectedSourceIds.length > 0 && (
                <>
                  {selectedSourceIds.map((sourceId) => {
                    const source = dataSources.find(s => s.id === sourceId)
                    return (
                      <Badge
                        key={sourceId}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setSelectedSourceIds(prev => prev.filter(id => id !== sourceId))}
                      >
                        {source?.name || sourceId} ×
                      </Badge>
                    )
                  })}
                </>
              )}
              {selectedSentiments.length > 0 && (
                <>
                  {selectedSentiments.map((sentiment) => (
                    <Badge
                      key={sentiment}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => setSelectedSentiments(prev => prev.filter(s => s !== sentiment))}
                    >
                      {sentimentDisplayMap[sentiment] || sentiment} ×
                    </Badge>
                  ))}
                </>
              )}
              {keyword && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => { setKeyword(''); setSearchInput('') }}>
                  关键词: {keyword} ×
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新闻列表 */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : news.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{EVENTS_TEXT.feed.empty.title}</p>
              <p className="text-sm text-muted-foreground">{EVENTS_TEXT.feed.empty.description}</p>
            </CardContent>
          </Card>
        ) : (
          news.map((article) => {
            const sentimentInfo = getSentimentInfo(article.sentiment)
            const SentimentIcon = sentimentInfo.icon

            return (
              <Card key={article.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    {/* 情感标识 */}
                    <div
                      className={`p-2 rounded-full ${
                        sentimentInfo.color === 'default'
                          ? 'bg-red-100 text-red-600'
                          : sentimentInfo.color === 'destructive'
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <SentimentIcon className="h-4 w-4" />
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-lg leading-tight">{article.title}</h3>
                        {article.url && (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>

                      {article.summary && (
                        <p className="text-muted-foreground text-sm">{article.summary}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {article.source}
                        </Badge>

                        {/* 检查是否为无影响新闻 */}
                        {article.domainIds?.includes('irrelevant') ? (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                            无影响
                          </Badge>
                        ) : (
                          <>
                            {/* 情感标签 - 仅当不是irrelevant时显示 */}
                            {article.sentimentLabel && (
                              <Badge
                                variant="outline"
                                className={
                                  sentimentInfo.color === 'default'
                                    ? 'bg-red-100 text-red-700 border-red-300'
                                    : sentimentInfo.color === 'destructive'
                                    ? 'bg-green-100 text-green-700 border-green-300'
                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                                }
                              >
                                {sentimentInfo.label}
                              </Badge>
                            )}
                          </>
                        )}

                        {article.impact && article.impact >= 4 && (
                          <Badge variant="default">重大影响</Badge>
                        )}
                      </div>

                      {/* 产业图谱标签 - 新增 */}
                      {article.industrySegments && article.industrySegments.length > 0 && (
                        <IndustrySegmentTags tags={article.industrySegments} maxDisplay={3} />
                      )}

                      {/* 发布时间 - 单独一行 */}
                      <div className="text-xs text-muted-foreground">
                        {formatTime(article.publishTime)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
