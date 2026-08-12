'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { StageColumn } from './StageColumn'
import type { SwimLaneData } from '@/types/industry-graph'

interface MatchDetail {
  nodeId: string
  nodeName: string
  etfCount: number
  indexCount: number
  success: boolean
  etfs?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
  indices?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
}

interface SwimLaneGraphProps {
  data: SwimLaneData | null
  isLoading: boolean
  error: string | null
  onRefetch?: () => void
  onCompanyClick?: (companyId: string) => void
  matchResults?: Record<string, MatchDetail>
}

export function SwimLaneGraph({
  data,
  isLoading,
  error,
  onRefetch,
  onCompanyClick,
  matchResults = {}
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
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {data.industry.name}
            </h2>
            <div className="flex gap-6 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">产业链阶段:</span>
                <span className="font-semibold text-blue-600">{sortedStages.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">产业环节:</span>
                <span className="font-semibold text-blue-600">
                  {sortedStages.reduce((sum, stage) => sum + stage.segments.length, 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">相关企业:</span>
                <span className="font-semibold text-blue-600">{totalCompanies}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Swim Lane Container */}
      <div className="relative">
        <div
          className="grid gap-4 items-start"
          style={{ gridTemplateColumns: `repeat(${sortedStages.length}, minmax(320px, 1fr))` }}
        >
          {sortedStages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              onCompanyClick={onCompanyClick}
              matchResults={matchResults}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
