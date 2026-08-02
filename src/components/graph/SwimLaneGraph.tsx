'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { StageColumn } from './StageColumn'
import type { SwimLaneData } from '@/types/industry-graph'

interface SwimLaneGraphProps {
  data: SwimLaneData | null
  isLoading: boolean
  error: string | null
  onRefetch?: () => void
  onCompanyClick?: (companyId: string) => void
}

export function SwimLaneGraph({
  data,
  isLoading,
  error,
  onRefetch,
  onCompanyClick
}: SwimLaneGraphProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="text-sm text-muted-foreground">加载泳道图数据...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          {onRefetch && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefetch}
              className="ml-4"
            >
              <RefreshCw className="h-3 w-3 mr-2" />
              重试
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  // No data state
  if (!data || !data.stages || data.stages.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          暂无泳道图数据
        </AlertDescription>
      </Alert>
    )
  }

  // Sort stages by order
  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order)

  // Calculate total companies
  const totalCompanies = sortedStages.reduce(
    (sum, stage) =>
      sum +
      stage.segments.reduce(
        (segSum, segment) => segSum + segment.companies.length,
        0
      ),
    0
  )

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg p-4 border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {data.industry.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              产业代码: {data.industry.code} | 版本: {data.industry.version}
            </p>
          </div>
          <div className="text-right space-y-1">
            <div className="text-2xl font-bold text-blue-600">
              {totalCompanies}
            </div>
            <div className="text-xs text-muted-foreground">
              家企业
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">阶段:</span>
            <span className="ml-2 font-medium">{sortedStages.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">环节:</span>
            <span className="ml-2 font-medium">
              {sortedStages.reduce((sum, stage) => sum + stage.segments.length, 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Swim Lane Container with horizontal scroll */}
      <div className="relative">
        <div
          className="flex gap-6 overflow-x-auto pb-4 px-1"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9'
          }}
        >
          {sortedStages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              onCompanyClick={onCompanyClick}
            />
          ))}
        </div>

        {/* Scroll hint for large datasets */}
        {sortedStages.length > 3 && (
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent pointer-events-none" />
        )}
      </div>
    </div>
  )
}
