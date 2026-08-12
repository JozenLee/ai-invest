'use client'

import { useQuery } from '@tanstack/react-query'
import { industryGraphService } from '@/lib/services/industry-graph.service'
import type { CoverageAssessment } from '@/types/coverage'

export function useCoverage(taskId: string | null) {
  return useQuery<CoverageAssessment | null>({
    queryKey: ['coverage', taskId],
    queryFn: async () => {
      if (!taskId) return null
      return await industryGraphService.getCoverage(taskId)
    },
    enabled: !!taskId,
    refetchInterval: 5000,
    staleTime: 2000
  })
}
