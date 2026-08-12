'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SwimLaneData, ExtendedTask } from '@/types/industry-graph'

interface UseSwimLaneDataOptions {
  // 从已完成的产业获取数据
  industryId?: string
  // 从创建/编辑任务构建预览数据
  task?: ExtendedTask | null
  // 产业名称（用于预览）
  industryName?: string
}

interface UseSwimLaneDataResult {
  data: SwimLaneData | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/**
 * 统一的泳道图数据获取 Hook
 *
 * 优先级：
 * 1. 如果提供 industryId，从 API 获取已保存的数据
 * 2. 如果 task.status === 'completed'，从 API 获取
 * 3. 否则从 task.structure/structureYaml 构建预览
 */
export function useSwimLaneData({
  industryId,
  task,
  industryName
}: UseSwimLaneDataOptions): UseSwimLaneDataResult {
  const [data, setData] = useState<SwimLaneData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 从 API 获取数据
  const fetchFromApi = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/graph/industries/${id}/swimlane`)

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || result.message || 'API 返回失败')
      }

      if (!result.data) {
        throw new Error('API 返回数据为空')
      }

      setData(result.data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取泳道图数据失败'
      console.error('[useSwimLaneData] 获取失败:', err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 从 task 构建预览数据
  const buildFromTask = useCallback((taskData: ExtendedTask) => {
    setIsLoading(true)
    setError(null)

    try {
      // 优先从 result.structure 获取（新增修复），然后是 structure/structureYaml
      const structure = taskData.result?.structure || taskData.structure || taskData.structureYaml
      if (!structure) {
        setData(null)
        setIsLoading(false)
        return
      }

      // 获取阶段列表
      const stagesList = structure.structure || structure.stages
      if (!stagesList || !Array.isArray(stagesList)) {
        console.error('[useSwimLaneData] 未找到有效的阶段列表')
        setData(null)
        setIsLoading(false)
        return
      }

      // 定义阶段顺序映射（与API保持一致）
      const stageOrder: Record<string, number> = {
        'upstream': 1,
        'midstream': 2,
        'downstream': 3
      }

      // 检查是否有企业数据
      const hasCompaniesData = taskData.status === 'companies_reviewing' ||
                               taskData.status === 'companies_refining' ||
                               taskData.status === 'reviewing' ||
                               taskData.status === 'refining' ||
                               taskData.status === 'writing_to_graph' ||
                               taskData.status === 'completed'
      const companiesDetails = hasCompaniesData && taskData.result?.details ? taskData.result.details : null

      // 转换为统一格式
      const stages = stagesList.map((stage: any, stageIndex: number) => {
        const stageCode = stage.stage_code || stage.code || `STAGE_${stageIndex}`
        // 使用阶段代码获取正确的顺序，如果没有匹配则使用999确保排在最后
        const order = stageOrder[stageCode] ?? 999

        return {
          id: `stage-${stageIndex}`,
          name: stage.stage || stage.name || stage.stage_name || '未命名阶段',
          code: stageCode,
          order: order,
          description: stage.description,
          segments: (stage.segments || stage.links || []).map((segment: any, segIndex: number) => {
            const segmentCode = segment.code || `SEG_${stageIndex}_${segIndex}`

            // 获取企业数据
            let companies = segment.companies || []
            if (companiesDetails && companiesDetails[segmentCode]) {
              companies = companiesDetails[segmentCode].companies || []
            }

            // 使用segment本身的order字段，如果没有则使用索引
            const segmentOrder = segment.order ?? segIndex

            return {
              id: `segment-${stageIndex}-${segIndex}`,
              name: segment.name || segment.link_name || '未命名环节',
              code: segmentCode,
              order: segmentOrder,
              description: segment.description,
              keyCategories: segment.key_categories || segment.keyCategories || [],
              companies: companies.map((company: any, compIndex: number) => ({
                id: `company-${stageIndex}-${segIndex}-${compIndex}`,
                name: company.name || company.company_name || '未命名企业',
                nameEn: company.name_en || company.nameEn,
                ticker: company.ticker || company.stock_code,
                exchange: company.exchange,
                country: company.country || 'CN',
                marketPosition: company.market_position || company.marketPosition || 'major',
                keyProducts: company.key_products || company.keyProducts,
                description: company.description
              })),
              // 添加匹配结果支持
              matchedEtfs: segment.matchedEtfs || segment.matched_etfs || [],
              matchedIndices: segment.matchedIndices || segment.matched_indices || [],
              lastMatchedAt: segment.lastMatchedAt || segment.last_matched_at
            }
          })
        }
      })

      // 按 order 排序 stages（确保上游、中游、下游的正确顺序）
      stages.sort((a: any, b: any) => a.order - b.order)

      // 按 order 排序每个 stage 内的 segments
      stages.forEach((stage: any) => {
        stage.segments.sort((a: any, b: any) => a.order - b.order)
      })

      // 计算统计信息
      let nodeCount = 0
      let edgeCount = 0
      stages.forEach((stage: any) => {
        stage.segments.forEach((segment: any) => {
          nodeCount += segment.companies.length
          edgeCount += 1
        })
      })

      setData({
        industry: {
          id: taskData.industryId || 'preview',
          name: industryName || taskData.industryName || '产业链',
          code: taskData.industryId ? structure.industry?.code || 'PREVIEW' : 'PREVIEW',
          version: '1.0',
          nodeCount,
          edgeCount,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        stages
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '构建预览数据失败'
      console.error('[useSwimLaneData] 构建失败:', err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [industryName])

  // 主效果：根据优先级获取数据
  useEffect(() => {
    // 优先级1: 直接提供了 industryId
    if (industryId) {
      fetchFromApi(industryId)
      return
    }

    // 优先级2: task 已完成且有 industryId
    if (task?.industryId && task.status === 'completed') {
      fetchFromApi(task.industryId)
      return
    }

    // 优先级3: 从 task 构建预览（检查多个可能的数据源）
    if (task && (task.result?.structure || task.structureYaml || task.structure)) {
      buildFromTask(task)
      return
    }

    // 无数据源
    setData(null)
    setError(null)
    setIsLoading(false)
  }, [industryId, task, task?.industryId, task?.status, task?.structureYaml, task?.structure, task?.result?.structure, fetchFromApi, buildFromTask])

  const refetch = useCallback(() => {
    if (industryId) {
      fetchFromApi(industryId)
    } else if (task?.industryId && task.status === 'completed') {
      fetchFromApi(task.industryId)
    } else if (task) {
      buildFromTask(task)
    }
  }, [industryId, task, fetchFromApi, buildFromTask])

  return {
    data,
    isLoading,
    error,
    refetch
  }
}
