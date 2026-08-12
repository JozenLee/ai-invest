import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatRelativeTime } from '@/lib/time-utils'

interface NewsArticle {
  id: string
  title: string
  source: string
  publishTime: string
  url?: string
  sentiment?: number
  categoryName?: string
}

interface RelatedNewsSectionProps {
  news: NewsArticle[]
}

/**
 * 相关新闻列表区块组件
 * 展示用于分析的新闻列表
 */
export function RelatedNewsSection({ news }: RelatedNewsSectionProps) {
  const getSentimentInfo = (sentiment?: number) => {
    if (!sentiment || Math.abs(sentiment) <= 0.2) {
      return { icon: Minus, label: '中性', color: 'text-gray-600' }
    }
    return sentiment > 0
      ? { icon: TrendingUp, label: '利好', color: 'text-green-600' }
      : { icon: TrendingDown, label: '利空', color: 'text-red-600' }
  }

  if (!news || news.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm">
        <div className="border-b p-6">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">相关新闻列表</h2>
          </div>
        </div>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无相关新闻数据
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <div className="border-b p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">相关新闻列表</h2>
          </div>
          <Badge variant="secondary">{news.length}条</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          用于本次趋势分析的新闻数据
        </p>
      </div>
      <CardContent className="p-6">
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {news.map((article) => {
            const sentimentInfo = getSentimentInfo(article.sentiment)
            const SentimentIcon = sentimentInfo.icon

            return (
              <div
                key={article.id}
                className="p-4 rounded-lg border hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  {/* Sentiment Icon */}
                  <div className={`p-1.5 rounded-full bg-muted mt-0.5`}>
                    <SentimentIcon className={`h-3.5 w-3.5 ${sentimentInfo.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-sm leading-tight line-clamp-2">
                        {article.title}
                      </h3>
                      {article.url && (
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {article.source}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {sentimentInfo.label}
                      </Badge>
                      {article.categoryName && (
                        <Badge variant="outline" className="text-xs">
                          {article.categoryName}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(article.publishTime)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
