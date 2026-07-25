import { Button } from '@/components/ui/button'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatRelativeTime } from '@/lib/time-utils'

interface TrendHeaderProps {
  domainName: string
  newsCount: number
  lastUpdated?: string
  onRefresh?: () => void
  isRefreshing?: boolean
}

/**
 * 趋势详情页面头部组件
 * 包含返回按钮、标题、基本信息和刷新按钮
 */
export function TrendHeader({
  domainName,
  newsCount,
  lastUpdated,
  onRefresh,
  isRefreshing = false,
}: TrendHeaderProps) {
  const router = useRouter()

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {domainName}领域深度分析
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>基于最近{newsCount}条新闻</span>
            {lastUpdated && (
              <>
                <span>•</span>
                <span>最后更新：{formatRelativeTime(lastUpdated)}</span>
              </>
            )}
          </div>
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新分析
          </Button>
        )}
      </div>
    </div>
  )
}
