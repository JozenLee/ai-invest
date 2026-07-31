'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { useMarketContext } from '@/contexts/MarketContext'
import { GraphInsightsSection } from '@/components/dashboard/GraphInsightsSection'

export default function DashboardPage() {
  const { indices, capitalFlow, isLoading, error, format, marketMeta, refetch } = useMarketContext()

  const formatNumber = (num: number | undefined | null, decimals = 2) => {
    if (num === undefined || num === null || isNaN(num)) return '0.00'
    return num.toFixed(decimals)
  }

  const getChangeColor = (change: number | undefined | null) => {
    if (change === undefined || change === null) return 'text-gray-500'
    return change >= 0 ? 'text-red-500' : 'text-green-500'
  }

  const getChangeSymbol = (change: number | undefined | null) => {
    if (change === undefined || change === null) return ''
    return change >= 0 ? '▲' : '▼'
  }

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">仪表盘</h1>
          <p className="text-muted-foreground mt-1">
            市场概览与知识图谱洞察
          </p>
          <div className="flex items-center gap-2 mt-2">
            {/* 市场状态 */}
            {format.statusBadge.label && (
              <Badge variant={format.statusBadge.variant} className="text-xs">
                {format.statusBadge.icon} {format.statusBadge.label}
                {!marketMeta?.isRealtime && ' · 收盘数据'}
              </Badge>
            )}
            {/* 数据来源 */}
            <Badge variant="outline" className="text-xs">
              {format.sourceDisplay.icon} {format.sourceDisplay.text}
            </Badge>
            {/* 最近交易日 */}
            {marketMeta?.lastTradingDate && (
              <span className="text-xs text-muted-foreground">
                数据日期: {marketMeta.lastTradingDate}
              </span>
            )}
            {/* 更新时间 */}
            {format.timeDisplay && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format.timeDisplay} 更新
              </span>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm font-medium">数据获取失败</p>
          </div>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs mt-2 text-yellow-600 dark:text-yellow-400">
            请确认 Python 数据服务已启动：cd data-service && python main.py
          </p>
        </div>
      )}

      {/* 市场指数概览 */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">📊 市场指数</h2>
          {marketMeta && !marketMeta.isRealtime && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              非交易时间，显示{marketMeta.lastTradingDate}收盘数据
            </span>
          )}
        </div>
        {indices.length > 0 ? (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {indices.map((index) => (
              <Card key={index.code} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{index.name}</CardTitle>
                  {index.changePct >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-red-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-green-500" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(index.price)}</div>
                  <p className={`text-xs ${getChangeColor(index.changePct)}`}>
                    {getChangeSymbol(index.changePct)} {formatNumber(Math.abs(index.changePct))}%
                    ({formatNumber(Math.abs(index.change))})
                  </p>
                  {marketMeta && !marketMeta.isRealtime && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      收盘价
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>暂无指数数据</p>
                <p className="text-xs mt-1">请确认数据服务已启动</p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Knowledge Graph Insights Section */}
      <section className="mt-8">
        <GraphInsightsSection />
      </section>
    </div>
  )
}
