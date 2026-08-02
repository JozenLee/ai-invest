'use client'

import { useState, useEffect, useCallback } from 'react'
import { industryGraphService } from '@/lib/services/industry-graph.service'
import type { SwimLaneData } from '@/types/industry-graph'

interface UseIndustrySwimLaneResult {
  data: SwimLaneData | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useIndustrySwimLane(industryId: string): UseIndustrySwimLaneResult {
  const [data, setData] = useState<SwimLaneData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!industryId) return

    setIsLoading(true)
    setError(null)

    try {
      const swimLaneData = await industryGraphService.getSwimLaneData(industryId)
      setData(swimLaneData)
    } catch (err) {
      console.error('获取泳道图数据失败:', err)
      setError(err instanceof Error ? err.message : '获取数据失败')
    } finally {
      setIsLoading(false)
    }
  }, [industryId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch: fetchData
  }
}
