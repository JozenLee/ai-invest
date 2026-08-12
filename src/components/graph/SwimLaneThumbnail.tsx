'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import type { SwimLaneData } from '@/types/industry-graph'

interface SwimLaneThumbnailProps {
  industryId: string
  className?: string
}

export function SwimLaneThumbnail({ industryId, className = '' }: SwimLaneThumbnailProps) {
  const [data, setData] = useState<SwimLaneData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/graph/industries/${industryId}/graph`)
        const result = await response.json()

        if (result.success && result.data) {
          setData(result.data)
        } else {
          setError(result.error || '加载失败')
        }
      } catch (err) {
        setError('网络错误')
        console.error('获取泳道图数据失败:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [industryId])

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-lg border ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !data || !data.stages || data.stages.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-lg border ${className}`}>
        <div className="text-center text-slate-400">
          <AlertCircle className="h-6 w-6 mx-auto mb-2" />
          <p className="text-xs">暂无数据</p>
        </div>
      </div>
    )
  }

  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order)
  const maxSegments = Math.max(...sortedStages.map(s => s.segments.length))

  return (
    <div className={`bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg border p-4 ${className}`}>
      {/* 简化的泳道图可视化 */}
      <div className="flex gap-2 items-center">
        {sortedStages.slice(0, 5).map((stage, idx) => (
          <div key={stage.id} className="flex-1 space-y-1">
            {/* 阶段标题 */}
            <div className="text-[10px] font-medium text-slate-600 truncate" title={stage.name}>
              {stage.name}
            </div>

            {/* 环节块 */}
            <div className="space-y-1">
              {stage.segments.slice(0, 3).map((segment) => {
                const companyCount = segment.companies.length
                return (
                  <div
                    key={segment.id}
                    className="bg-blue-500 rounded px-1.5 py-1 text-white"
                    style={{
                      opacity: Math.min(0.5 + (companyCount * 0.15), 1)
                    }}
                  >
                    <div className="text-[9px] font-medium truncate" title={segment.name}>
                      {segment.name}
                    </div>
                    <div className="text-[8px] opacity-90">
                      {companyCount}家
                    </div>
                  </div>
                )
              })}
              {stage.segments.length > 3 && (
                <div className="text-[8px] text-slate-400 text-center">
                  +{stage.segments.length - 3}
                </div>
              )}
            </div>
          </div>
        ))}

        {sortedStages.length > 5 && (
          <div className="flex items-center text-slate-400">
            <ArrowRight className="h-4 w-4" />
            <span className="text-[10px] ml-1">+{sortedStages.length - 5}</span>
          </div>
        )}
      </div>

      {/* 底部统计 */}
      <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between text-[10px] text-slate-500">
        <span>{sortedStages.length}个阶段</span>
        <span>
          {sortedStages.reduce((sum, s) => sum + s.segments.reduce((ss, seg) => ss + seg.companies.length, 0), 0)}家企业
        </span>
      </div>
    </div>
  )
}
