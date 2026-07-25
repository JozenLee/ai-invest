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
} from 'lucide-react'
import { NewsCategory, Domain } from '@/types/event'
import { EVENTS_TEXT } from '@/constants/events-text'
import { PageHeader } from '@/components/events/PageHeader'
import { StatCard } from '@/components/events/StatCard'
import { StatCardGrid } from '@/components/events/StatCardGrid'
import { MultiSelect } from '@/components/events/MultiSelect'
import { formatRelativeTime } from '@/lib/time-utils'

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
  domainName?: string
  sourceId?: string
  sentiment?: number
  impact?: number
  sectors?: string[]
}

interface DataSource {
  id: string
  name: string
  category: string
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
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [selectedSentiments, setSelectedSentiments] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<string>('publishTime')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')

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
    try {
      const response = await fetch('/api/events/domains')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDomains(data.data)
        }
      }
    } catch (error) {
      console.error('获取领域失败:', error)
    }
  }

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

  // 获取新闻数据
  const fetchNews = useCallback(async () => {
    setIsLoading(true)
    try {
      let url = '/api/events/feed?limit=50'
      if (selectedCategoryIds.length > 0) {
        // 多个分类用逗号分隔，后端需要支持OR查询
        url += `&categoryIds=${selectedCategoryIds.join(',')}`
      }
      if (selectedDomainIds.length > 0) {
        url += `&domainIds=${selectedDomainIds.join(',')}`
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
  }, [selectedCategoryIds, selectedDomainIds, selectedSourceIds, selectedSentiments, sortBy, keyword])

  useEffect(() => {
    fetchCategories()
    fetchDomains()
    fetchDataSources()
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
    setSelectedDomainIds([])
    setSelectedSourceIds([])
    setSelectedSentiments([])
    setSortBy('publishTime')
    setKeyword('')
    setSearchInput('')
  }

  const getSentimentInfo = (sentiment?: number) => {
    if (!sentiment || Math.abs(sentiment) <= 0.2) {
      return sentimentConfig.neutral
    }
    return sentiment > 0 ? sentimentConfig.bullish : sentimentConfig.bearish
  }

  const formatTime = (timeStr: string) => {
    // 使用统一的时间格式化工具
    return formatRelativeTime(timeStr)
  }

  // 查找分类名称
  const findCategoryName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId)
    return category ? category.name : categoryId
  }

  // 计算统计数据
  const getTodayNews = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return news.filter(article => {
      const publishDate = new Date(article.publishTime)
      return publishDate >= today
    }).length
  }

  const getBullishEvents = () => {
    return news.filter(article => article.sentiment && article.sentiment > 0.2).length
  }

  const getBearishEvents = () => {
    return news.filter(article => article.sentiment && article.sentiment < -0.2).length
  }

  const getAvgSentiment = () => {
    if (news.length === 0) return 0
    const validSentiments = news.filter(article => article.sentiment !== undefined)
    if (validSentiments.length === 0) return 0
    const sum = validSentiments.reduce((acc, article) => acc + (article.sentiment || 0), 0)
    return ((sum / validSentiments.length) * 100).toFixed(0)
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <PageHeader
        title={EVENTS_TEXT.feed.title}
        description={EVENTS_TEXT.feed.description}
        actions={
          <Button variant="outline" size="sm" onClick={fetchNews} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {EVENTS_TEXT.common.refresh}
          </Button>
        }
      />

      {/* 统计卡片 */}
      <StatCardGrid>
        <StatCard
          icon={Newspaper}
          label={EVENTS_TEXT.feed.stats.todayNews}
          value={getTodayNews()}
          variant="default"
        />
        <StatCard
          icon={TrendingUp}
          label={EVENTS_TEXT.feed.stats.bullishEvents}
          value={getBullishEvents()}
          variant="success"
        />
        <StatCard
          icon={TrendingDown}
          label={EVENTS_TEXT.feed.stats.bearishEvents}
          value={getBearishEvents()}
          variant="danger"
        />
        <StatCard
          icon={Minus}
          label={EVENTS_TEXT.feed.stats.avgSentiment}
          value={`${getAvgSentiment()}%`}
          variant="default"
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

          {/* 分类、情感、领域和排序筛选 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {/* 科技类 */}
            <MultiSelect
              value={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
              options={getCategoriesByGroup(categoryGroups[0].categories)}
              placeholder={categoryGroups[0].name}
              title={categoryGroups[0].name}
              className="w-full"
            />

            {/* 财经类 */}
            <MultiSelect
              value={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
              options={getCategoriesByGroup(categoryGroups[1].categories)}
              placeholder={categoryGroups[1].name}
              title={categoryGroups[1].name}
              className="w-full"
            />

            {/* 产业类 */}
            <MultiSelect
              value={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
              options={getCategoriesByGroup(categoryGroups[2].categories)}
              placeholder={categoryGroups[2].name}
              title={categoryGroups[2].name}
              className="w-full"
            />

            {/* 政策类 */}
            <MultiSelect
              value={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
              options={getCategoriesByGroup(categoryGroups[3].categories)}
              placeholder={categoryGroups[3].name}
              title={categoryGroups[3].name}
              className="w-full"
            />

            {/* 国际类 */}
            <MultiSelect
              value={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
              options={getCategoriesByGroup(categoryGroups[4].categories)}
              placeholder={categoryGroups[4].name}
              title={categoryGroups[4].name}
              className="w-full"
            />

            {/* 其他 */}
            <MultiSelect
              value={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
              options={getCategoriesByGroup(categoryGroups[5].categories)}
              placeholder={categoryGroups[5].name}
              title={categoryGroups[5].name}
              className="w-full"
            />

            {/* 情感筛选 */}
            <MultiSelect
              value={selectedSentiments}
              onChange={setSelectedSentiments}
              options={[
                { value: 'bullish', label: EVENTS_TEXT.feed.filter.sentimentBullish },
                { value: 'neutral', label: EVENTS_TEXT.feed.filter.sentimentNeutral },
                { value: 'bearish', label: EVENTS_TEXT.feed.filter.sentimentBearish },
              ]}
              placeholder="情感筛选"
              title="选择情感"
              className="w-full"
            />

            {/* 领域筛选 */}
            <MultiSelect
              value={selectedDomainIds}
              onChange={setSelectedDomainIds}
              options={domains.map(domain => ({
                value: domain.id,
                label: domain.name,
              }))}
              placeholder="领域筛选"
              title="选择领域"
              className="w-full"
            />

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

            {/* 排序 */}
            <Select value={sortBy} onValueChange={(value) => setSortBy(value || 'publishTime')}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {sortDisplayMap[sortBy]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="publishTime">{EVENTS_TEXT.feed.filter.sortByTime}</SelectItem>
                <SelectItem value="sentiment">{EVENTS_TEXT.feed.filter.sortBySentiment}</SelectItem>
                <SelectItem value="impact">{EVENTS_TEXT.feed.filter.sortByImpact}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 分类筛选 - 移除旧的树形选择器 */}

          {/* 当前筛选条件 */}
          {(selectedCategoryIds.length > 0 || selectedDomainIds.length > 0 || selectedSourceIds.length > 0 || selectedSentiments.length > 0 || keyword) && (
            <div className="flex flex-wrap items-center gap-2 text-sm pt-2 border-t">
              <span className="text-muted-foreground">当前筛选：</span>
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
              {selectedDomainIds.length > 0 && (
                <>
                  {selectedDomainIds.map((domainId) => {
                    const domain = domains.find(d => d.id === domainId)
                    return (
                      <Badge
                        key={domainId}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setSelectedDomainIds(prev => prev.filter(id => id !== domainId))}
                      >
                        {domain?.name || domainId} ×
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
                          ? 'bg-green-100 text-green-600'
                          : sentimentInfo.color === 'destructive'
                          ? 'bg-red-100 text-red-600'
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
                        <Badge variant="outline">{article.source}</Badge>
                        <Badge variant={sentimentInfo.color as any}>{sentimentInfo.label}</Badge>

                        {/* 分类标签 */}
                        {article.categoryName && (
                          <Badge variant="secondary">{article.categoryName}</Badge>
                        )}

                        {/* 领域标签 */}
                        {article.domainName && (
                          <Badge variant="default" className="bg-blue-100 text-blue-800">
                            {article.domainName}
                          </Badge>
                        )}

                        {article.sectors?.map((sector) => (
                          <Badge key={sector} variant="outline" className="text-xs">
                            {sector}
                          </Badge>
                        ))}

                        {article.impact && article.impact >= 4 && (
                          <Badge variant="default">重大影响</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{formatTime(article.publishTime)}</span>
                        {article.sentiment !== undefined && (
                          <span>情感: {(article.sentiment * 100).toFixed(0)}%</span>
                        )}
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
