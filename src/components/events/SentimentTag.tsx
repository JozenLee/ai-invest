import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from 'lucide-react'
import type { SentimentLabel } from '@/types/event'

export interface SentimentTagProps {
  sentiment: SentimentLabel
  score?: number
  className?: string
  showIcon?: boolean
  variant?: 'default' | 'compact'
}

const sentimentConfig: Record<
  SentimentLabel,
  {
    label: string
    shortLabel: string
    icon: typeof TrendingUp
    bgClass: string
    textClass: string
  }
> = {
  very_bullish: {
    label: '重大利好',
    shortLabel: '重大利好',
    icon: ArrowUp,
    bgClass: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/20',
    textClass: 'text-green-600 dark:text-green-500',
  },
  bullish: {
    label: '利好',
    shortLabel: '利好',
    icon: TrendingUp,
    bgClass: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/20',
    textClass: 'text-green-600 dark:text-green-500',
  },
  neutral: {
    label: '中性',
    shortLabel: '中性',
    icon: Minus,
    bgClass: 'bg-gray-500/10 hover:bg-gray-500/20 border-gray-500/20',
    textClass: 'text-gray-600 dark:text-gray-400',
  },
  bearish: {
    label: '利空',
    shortLabel: '利空',
    icon: TrendingDown,
    bgClass: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20',
    textClass: 'text-red-600 dark:text-red-500',
  },
  very_bearish: {
    label: '重大利空',
    shortLabel: '重大利空',
    icon: ArrowDown,
    bgClass: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20',
    textClass: 'text-red-600 dark:text-red-500',
  },
}

export function SentimentTag({
  sentiment,
  score,
  className,
  showIcon = true,
  variant = 'default',
}: SentimentTagProps) {
  const config = sentimentConfig[sentiment]
  const Icon = config.icon
  const label = variant === 'compact' ? config.shortLabel : config.label

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 border',
        config.bgClass,
        config.textClass,
        className
      )}
    >
      {showIcon && <Icon className="size-3" />}
      {label}
      {score !== undefined && variant !== 'compact' && (
        <span className="opacity-70">
          ({score > 0 ? '+' : ''}{(score * 100).toFixed(0)}%)
        </span>
      )}
    </Badge>
  )
}

export function getSentimentFromScore(score: number): SentimentLabel {
  if (score >= 0.5) return 'very_bullish'
  if (score >= 0.15) return 'bullish'
  if (score <= -0.5) return 'very_bearish'
  if (score <= -0.15) return 'bearish'
  return 'neutral'
}
