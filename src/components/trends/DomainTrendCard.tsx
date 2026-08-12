import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { DomainTrendSummary, TrendDirection } from '@/types/trend'
import Link from 'next/link'

interface DomainTrendCardProps {
  trend: DomainTrendSummary
  newsCount?: number
}

const trendConfig = {
  bullish: {
    label: '看涨',
    icon: TrendingUp,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
  },
  neutral: {
    label: '中性',
    icon: Minus,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    borderColor: 'border-gray-200 dark:border-gray-800',
  },
  bearish: {
    label: '看跌',
    icon: TrendingDown,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
  },
}

/**
 * 领域趋势卡片组件
 * 显示单个领域的趋势摘要信息
 */
export function DomainTrendCard({ trend, newsCount = 50 }: DomainTrendCardProps) {
  const config = trendConfig[trend.trendDirection]
  const TrendIcon = config.icon

  return (
    <Card className="hover:shadow-lg transition-all duration-200 h-full flex flex-col">
      <CardContent className="p-6 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold">{trend.domainName}</h3>
          <div className={`p-2 rounded-full ${config.bgColor}`}>
            <TrendIcon className={`h-5 w-5 ${config.color}`} />
          </div>
        </div>

        {/* Trend Direction & Confidence */}
        <div className={`p-3 rounded-lg mb-4 ${config.bgColor} border ${config.borderColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">趋势：</span>
              <Badge variant="outline" className={config.color}>
                {config.label}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              置信度：<span className="font-medium">{(trend.confidenceScore * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Sentiment Distribution */}
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span>📊</span>
            情绪分布
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
              <div className="font-semibold text-green-600">{trend.sentimentDistribution.bullish}</div>
              <div className="text-xs text-muted-foreground">看涨</div>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-900/20 rounded">
              <div className="font-semibold text-gray-600">{trend.sentimentDistribution.neutral}</div>
              <div className="text-xs text-muted-foreground">中性</div>
            </div>
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
              <div className="font-semibold text-red-600">{trend.sentimentDistribution.bearish}</div>
              <div className="text-xs text-muted-foreground">看跌</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2 text-center">
            相关新闻：{trend.relatedNewsCount}条
          </div>
        </div>

        {/* Key Drivers */}
        {trend.keyDrivers && trend.keyDrivers.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              关键驱动
            </h4>
            <ul className="space-y-1.5">
              {trend.keyDrivers.map((driver, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span className="flex-1">{driver}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Risks */}
        {trend.keyRisks && trend.keyRisks.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              关键风险
            </h4>
            <ul className="space-y-1.5">
              {trend.keyRisks.map((risk, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-yellow-500 mt-0.5">•</span>
                  <span className="flex-1">{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Short-term Outlook */}
        <div className="mb-4 flex-1">
          <h4 className="text-sm font-medium mb-2">短期展望</h4>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {trend.shortTermOutlook}
          </p>
        </div>

        {/* View Details Button */}
        <Link
          href={`/events/trends/${trend.domainCode}?newsCount=${newsCount}`}
          onClick={() => {
            // 保存到localStorage作为备用
            if (typeof window !== 'undefined') {
              localStorage.setItem('trendNewsCount', newsCount.toString())
            }
          }}
        >
          <Button variant="outline" className="w-full group">
            查看详情
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
