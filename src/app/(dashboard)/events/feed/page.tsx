'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Newspaper,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
} from 'lucide-react'

interface NewsArticle {
  id: string
  title: string
  content: string
  summary?: string
  source: string
  url?: string
  publishTime: string
  category: string
  sentiment?: number
  impact?: number
  sectors?: string[]
  isAiRelated?: boolean
}

const categoryLabels: Record<string, string> = {
  policy: '政策法规',
  earnings: '财报业绩',
  product: '产品发布',
  partnership: '合作并购',
  supply: '供应链',
  tech: '技术突破',
  regulation: '监管制裁',
  market: '市场动态',
}

const sentimentConfig = {
  bullish: { label: '利好', color: 'default', icon: TrendingUp },
  bearish: { label: '利空', color: 'destructive', icon: TrendingDown },
  neutral: { label: '中性', color: 'secondary', icon: Minus },
}

export default function EventsFeedPage() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const fetchNews = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/events/feed?limit=20')
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
  }

  useEffect(() => {
    fetchNews()
  }, [])

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
        return `${Math.floor(hours / 24)}天前`
      } else if (hours > 0) {
        return `${hours}小时前`
      } else if (minutes > 0) {
        return `${minutes}分钟前`
      } else {
        return '刚刚'
      }
    } catch {
      return timeStr
    }
  }

  const filteredNews = selectedCategory
    ? news.filter(n => n.category === selectedCategory)
    : news

  const aiRelatedNews = news.filter(n =>
    n.isAiRelated || n.sectors?.some(s => ['半导体', '光通信', '服务器', '存储', '散热'].includes(s))
  )

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">事件资讯</h1>
          <p className="text-muted-foreground">
            AI硬件产业链相关新闻与事件分析
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchNews}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory(null)}
        >
          全部
        </Button>
        {Object.entries(categoryLabels).map(([key, label]) => (
          <Button
            key={key}
            variant={selectedCategory === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">全部资讯</TabsTrigger>
          <TabsTrigger value="ai-hardware">AI硬件相关</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredNews.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">暂无相关新闻</p>
              </CardContent>
            </Card>
          ) : (
            filteredNews.map((article) => {
              const sentimentInfo = getSentimentInfo(article.sentiment)
              const SentimentIcon = sentimentInfo.icon

              return (
                <Card key={article.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      {/* 情感标识 */}
                      <div className={`p-2 rounded-full ${
                        sentimentInfo.color === 'default' ? 'bg-green-100 text-green-600' :
                        sentimentInfo.color === 'destructive' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        <SentimentIcon className="h-4 w-4" />
                      </div>

                      {/* 内容 */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-lg leading-tight">
                            {article.title}
                          </h3>
                          {article.url && (
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>

                        {article.summary && (
                          <p className="text-muted-foreground text-sm">
                            {article.summary}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{article.source}</Badge>
                          <Badge variant={sentimentInfo.color as any}>
                            {sentimentInfo.label}
                          </Badge>
                          {article.category && (
                            <Badge variant="secondary">
                              {categoryLabels[article.category] || article.category}
                            </Badge>
                          )}
                          {article.sectors?.map(sector => (
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
        </TabsContent>

        <TabsContent value="ai-hardware" className="space-y-4">
          {aiRelatedNews.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">暂无AI硬件相关新闻</p>
              </CardContent>
            </Card>
          ) : (
            aiRelatedNews.map((article) => {
              const sentimentInfo = getSentimentInfo(article.sentiment)
              const SentimentIcon = sentimentInfo.icon

              return (
                <Card key={article.id} className="hover:shadow-md transition-shadow border-primary/20">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-full ${
                        sentimentInfo.color === 'default' ? 'bg-green-100 text-green-600' :
                        sentimentInfo.color === 'destructive' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        <SentimentIcon className="h-4 w-4" />
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-lg leading-tight">
                            {article.title}
                          </h3>
                          <Badge variant="default" className="shrink-0">AI硬件</Badge>
                        </div>

                        {article.summary && (
                          <p className="text-muted-foreground text-sm">
                            {article.summary}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{article.source}</Badge>
                          <Badge variant={sentimentInfo.color as any}>
                            {sentimentInfo.label}
                          </Badge>
                          {article.sectors?.map(sector => (
                            <Badge key={sector} variant="outline" className="text-xs">
                              {sector}
                            </Badge>
                          ))}
                        </div>

                        <span className="text-xs text-muted-foreground">
                          {formatTime(article.publishTime)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
