'use client'

import { SegmentCard } from './SegmentCard'
import type { Stage } from '@/types/industry-graph'

interface StageColumnProps {
  stage: Stage
  onCompanyClick?: (companyId: string) => void
}

export function StageColumn({ stage, onCompanyClick }: StageColumnProps) {
  return (
    <div className="flex-shrink-0 w-[320px] space-y-4">
      {/* Stage Header */}
      <div className="sticky top-0 z-10 bg-background pb-4">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg p-4 shadow-md">
          <h3 className="text-lg font-bold mb-1">{stage.name}</h3>
          {stage.description && (
            <p className="text-sm text-blue-50 opacity-90">
              {stage.description}
            </p>
          )}
          <div className="mt-2 text-xs text-blue-100">
            {stage.segments.length} 个环节
          </div>
        </div>
      </div>

      {/* Segments */}
      <div className="space-y-4">
        {stage.segments.map((segment) => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            onCompanyClick={onCompanyClick}
          />
        ))}
      </div>
    </div>
  )
}
