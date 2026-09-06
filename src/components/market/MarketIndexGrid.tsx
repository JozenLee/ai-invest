import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { IndexData } from '@/types/market'

function formatNumber(value: number | undefined | null, decimals = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '0.00'
  return value.toFixed(decimals)
}

export function MarketIndexGrid({
  indices,
  isLoading = false,
}: {
  indices: IndexData[]
  isLoading?: boolean
}) {
  if (isLoading && indices.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className="min-w-0">
            <CardHeader className="space-y-2 pb-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (indices.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <div className="text-center text-muted-foreground">
            <TriangleAlert className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
            <p className="font-medium">暂无指数数据</p>
            <p className="mt-1 text-xs">请前往数据订阅更新指数数据</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {indices.map((index) => {
        const isUp = index.changePct > 0
        const isDown = index.changePct < 0
        const tone = isUp ? 'text-red-500' : isDown ? 'text-green-500' : 'text-muted-foreground'
        const TrendIcon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus
        const trendLabel = isUp ? '上涨' : isDown ? '下跌' : '平盘'

        return (
          <Card
            key={index.code}
            className="min-w-0 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 truncate text-sm font-medium">{index.name}</CardTitle>
              <TrendIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="tabular-nums font-mono text-xl font-semibold tracking-tight sm:text-2xl">
                {formatNumber(index.price)}
              </div>
              <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${tone}`}>
                <span>{Number.isFinite(index.changePct) ? trendLabel : '涨跌未知'}</span>
                <span className="tabular-nums">{Number.isFinite(index.changePct) ? `${formatNumber(Math.abs(index.changePct))}%` : '—'}</span>
                <span className="text-muted-foreground">({Number.isFinite(index.change) ? formatNumber(Math.abs(index.change)) : '—'})</span>
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
