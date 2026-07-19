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
  sentiment?: number
  impact?: number
  sectors?: string[]
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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [sentimentFilter, setSentimentFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('publishTime')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')

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

  // 获取新闻数据
  const fetchNews = useCallback(async () => {
    setIsLoading(true)
    try {
      let url = '/api/events/feed?limit=50'
      if (selectedCategoryId) url += `&categoryId=${selectedCategoryId}`
      if (selectedDomainId && selectedDomainId !== 'all') url += `&domainId=${selectedDomainId}`
      if (sentimentFilter && sentimentFilter !== 'all') url += `&sentiment=${sentimentApiMap[sentimentFilter] || sentimentFilter}`
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
  }, [selectedCategoryId, selectedDomainId, sentimentFilter, sortBy, keyword])

  useEffect(() => {
    fetchCategories()
    fetchDomains()
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
    setSelectedCategoryId(null)
    setSelectedDomainId(null)
    setSentimentFilter('all')
    setSortBy('publishTime')
    setKeyword('')
    setSearchInput('')
    setExpandedCategory(null)
  }

  const getSentimentInfo = (sentiment?: number) => {
    if (!sentiment || Math.abs(sentiment) <= 0.2) {
      return sentimentConfig.neutral
    }
    return sentiment > 0 ? sentimentConfig.bullish : sentimentConfig.bearish
  }

  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor(diff / (1000 * 60))

      if (hours > 24) {
        return `${Math.floor(hours / 24)}${EVENTS_TEXT.time.daysAgo}`
      } else if (hours > 0) {
        return `${hours}${EVENTS_TEXT.time.hoursAgo}`
      } else if (minutes > 0) {
        return `${minutes}${EVENTS_TEXT.time.minutesAgo}`
      } else {
        return EVENTS_TEXT.time.justNow
      }
    } catch {
      return timeStr
    }
  }

  const toggleCategory = (categoryId: string) => {
    if (expandedCategory === categoryId) {
      setExpandedCategory(null)
    } else {
      setExpandedCategory(categoryId)
    }
  }

  const selectCategory = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId)
  }

  // 查找分类名称（包括子分类）
  const findCategoryName = (categoryId: string): string => {
    // 先在一级分类中查找
    const topCategory = categories.find(c => c.id === categoryId)
    if (topCategory) return topCategory.name

    // 在子分类中查找
    for (const cat of categories) {
      if (cat.children) {
        const subCategory = cat.children.find(c => c.id === categoryId)
        if (subCategory) return subCategory.name
      }
    }

    return categoryId
  }

  // 获取所有分类选项（包括子分类）
  const getCategoryOptions = () => {
    const options: Array<{ value: string; label: string; group?: string }> = []

    categories.forEach(cat => {
      if (cat.children && cat.children.length > 0) {
        // 有子分类的父分类
        cat.children.forEach(subCat => {
          options.push({
            value: subCat.id,
            label: subCat.name,
            group: cat.name
          })
        })
      } else {
        // 没有子分类的独立分类
        options.push({
          value: cat.id,
          label: cat.name
        })
      }
    })

    return options
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

          {/* 情感和排序筛选 */}
          <div className="flex flex-wrap gap-3">
            <Select value={sentimentFilter} onValueChange={(value) => setSentimentFilter(value || 'all')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue>
                  {sentimentDisplayMap[sentimentFilter]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{EVENTS_TEXT.feed.filter.sentimentAll}</SelectItem>
                <SelectItem value="bullish">{EVENTS_TEXT.feed.filter.sentimentBullish}</SelectItem>
                <SelectItem value="neutral">{EVENTS_TEXT.feed.filter.sentimentNeutral}</SelectItem>
                <SelectItem value="bearish">{EVENTS_TEXT.feed.filter.sentimentBearish}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedDomainId || 'all'} onValueChange={(value) => setSelectedDomainId(value === 'all' ? null : value)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={`${EVENTS_TEXT.common.all}领域`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{EVENTS_TEXT.common.all}领域</SelectItem>
                {domains.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id}>
                    {domain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value || 'publishTime')}>
              <SelectTrigger className="w-[160px]">
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

          {/* 分类标签 - 使用Select逻辑 */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategoryId === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategoryId(null)}
            >
              {EVENTS_TEXT.common.all}
            </Button>
            {categories.map((cat) => {
              if (cat.children && cat.children.length > 0) {
                // 有子分类，使用Select组件
                const isChildSelected = cat.children.some(c => c.id === selectedCategoryId)
                return (
                  <Select
                    key={cat.id}
                    value={selectedCategoryId || 'none'}
                    onValueChange={(value) => setSelectedCategoryId(value === 'none' ? null : value)}
                  >
                    <SelectTrigger className={`h-9 px-3 ${isChildSelected ? 'border-primary bg-primary text-primary-foreground' : ''}`}>
                      <SelectValue>{cat.name}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {cat.children.map((subCat) => (
                        <SelectItem key={subCat.id} value={subCat.id}>
                          {subCat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              } else {
                // 没有子分类，普通按钮
                return (
                  <Button
                    key={cat.id}
                    variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategoryId(cat.id)}
                  >
                    {cat.name}
                  </Button>
                )
              }
            })}
          </div>

          {/* 当前筛选条件 */}
          {(selectedCategoryId || (selectedDomainId && selectedDomainId !== 'all') || sentimentFilter !== 'all' || keyword) && (
            <div className="flex flex-wrap items-center gap-2 text-sm pt-2 border-t">
              <span className="text-muted-foreground">当前筛选：</span>
              {selectedCategoryId && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedCategoryId(null)}>
                  分类: {findCategoryName(selectedCategoryId)} ×
                </Badge>
              )}
              {selectedDomainId && selectedDomainId !== 'all' && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedDomainId(null)}>
                  领域: {domains.find(d => d.id === selectedDomainId)?.name || selectedDomainId} ×
                </Badge>
              )}
              {sentimentFilter !== 'all' && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setSentimentFilter('all')}>
                  情感: {sentimentDisplayMap[sentimentFilter] || sentimentFilter} ×
                </Badge>
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
