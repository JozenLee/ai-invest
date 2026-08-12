'use client'

import { SegmentCard } from './SegmentCard'
import type { Stage } from '@/types/industry-graph'

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

interface StageColumnProps {
  stage: Stage
  onCompanyClick?: (companyId: string) => void
  matchResults?: Record<string, MatchDetail>
}

export function StageColumn({ stage, onCompanyClick, matchResults = {} }: StageColumnProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Stage Header */}
      <div className="mb-4">
        <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 text-white rounded-xl p-5 shadow-lg border border-blue-400/20">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2">{stage.name}</h3>
              {stage.description && (
                <p className="text-sm text-blue-50/90 line-clamp-2 leading-relaxed">
                  {stage.description}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-blue-400/30">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-200"></div>
              <span className="text-sm text-blue-100 font-medium">
                {stage.segments.length} 个产业环节
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Segments */}
      <div className="space-y-3 flex-1">
        {[...stage.segments]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((segment) => (
            <SegmentCard
              key={segment.id}
              segment={segment}
              onCompanyClick={onCompanyClick}
              initialMatchResult={matchResults[segment.id]}
            />
          ))}
      </div>
    </div>
  )
}
