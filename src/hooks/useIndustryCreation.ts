'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { industryGraphService } from '@/lib/services/industry-graph.service'
import type { ExtendedTask } from '@/types/industry-graph'
import type { ReviewFeedback } from '@/types/review'

export function useIndustryCreation() {
  const [task, setTask] = useState<ExtendedTask | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const waitingForStatusChangeRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  const createIndustry = useCallback(async (name: string, description?: string) => {
    setIsCreating(true)
    setError(null)

    try {
      const result = await industryGraphService.createIndustry(name, description)
      setTask({
        taskId: result.taskId,
        industryId: result.industryId,
        industryName: name,
        status: 'pending',
        progress: 0,
        structure_iterations: 0,
        companies_iterations: 0,
        review_history: []
      })

      // Start polling task status
      pollTaskStatus(result.taskId, result.industryId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
      setIsCreating(false)
    }
  }, [])

  const pollTaskStatus = useCallback((taskId: string, industryId?: string) => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    // 动态调整轮询间隔：AI生成阶段使用较长间隔，减少频繁重渲染
    const getPollingInterval = (status: string) => {
      if (status === 'structure_refining' || status === 'companies_refining') {
        return 5000 // AI优化阶段：5秒
      }
      if (status === 'exploring_structure' || status === 'exploring_details') {
        return 3000 // AI探索阶段：3秒
      }
      return 2000 // 其他阶段：2秒
    }

    const poll = async () => {
      try {
        console.log('[pollTaskStatus] 查询任务状态:', taskId)
        const taskData = await industryGraphService.getTaskStatus(taskId)
        console.log('[pollTaskStatus] 任务状态:', taskData.status, 'progress:', taskData.progress)

        setTask(prev => ({
          ...taskData,
          industryId: prev?.industryId || industryId
        }))

        // Stop polling if task is completed or failed
        if (taskData.status === 'completed' || taskData.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          setIsCreating(false)
          console.log('[pollTaskStatus] 任务已完成，停止轮询')
          return
        }

        // Stop polling if waiting for review (structure, companies, or unified)
        // BUT: Don't stop if we just submitted feedback and waiting for status change
        if (taskData.status === 'structure_reviewing' || taskData.status === 'companies_reviewing' || taskData.status === 'reviewing') {
          // Always reset isCreating to false when in reviewing state to enable buttons
          setIsCreating(false)

          if (!waitingForStatusChangeRef.current) {
            // Stop polling if not waiting for a status change after review submission
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            console.log('[pollTaskStatus] 等待审核，停止轮询')
            return
          }
          // Continue polling if waiting for status change after review submission
          console.log('[pollTaskStatus] 等待状态变更，继续轮询')
        }

        // Reset waiting flag if status changed to refining
        if (taskData.status === 'structure_refining' || taskData.status === 'companies_refining' || taskData.status === 'refining') {
          waitingForStatusChangeRef.current = false
          console.log('[pollTaskStatus] 状态已变更为优化中')
        }

        // Stop polling if structure is ready and waiting for approval (legacy)
        if (taskData.status === 'structure_ready') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          setIsCreating(false)
          console.log('[pollTaskStatus] 结构就绪，停止轮询')
          return
        }

        // 根据当前状态调整轮询间隔
        const currentInterval = getPollingInterval(taskData.status)
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
        }
        pollIntervalRef.current = setInterval(poll, currentInterval)

      } catch (err) {
        console.error('[pollTaskStatus] 获取任务状态失败:', err)
        console.error('[pollTaskStatus] 错误详情:', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        })

        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        setIsCreating(false)

        // 提供更详细的错误信息
        const errorMessage = err instanceof Error ? err.message : '获取任务状态失败'
        setError(errorMessage)
      }
    }

    // 立即执行第一次查询，然后设置定时轮询
    console.log('[pollTaskStatus] 开始轮询任务状态:', taskId)
    poll().then(() => {
      // 第一次查询完成后，如果需要继续轮询，会在poll函数中设置interval
      console.log('[pollTaskStatus] 首次查询完成')
    })
  }, [])

  const approveStructure = useCallback(async () => {
    if (!task || task.status !== 'structure_ready') {
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      await industryGraphService.approveStructure(task.taskId, task.structureYaml)

      // Continue polling until completion
      pollTaskStatus(task.taskId, task.industryId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '批准失败')
      setIsCreating(false)
    }
  }, [task, pollTaskStatus])

  const reviewStructure = useCallback(async (feedback: ReviewFeedback) => {
    if (!task) {
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      waitingForStatusChangeRef.current = true
      await industryGraphService.reviewStructure(task.taskId, feedback)

      // Wait a moment for backend to process
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Continue polling after submitting review
      pollTaskStatus(task.taskId, task.industryId)

      // Reset flag after 15 seconds as failsafe
      setTimeout(() => {
        waitingForStatusChangeRef.current = false
      }, 15000)
    } catch (err) {
      waitingForStatusChangeRef.current = false
      setError(err instanceof Error ? err.message : '提交结构审核失败')
      setIsCreating(false)
    }
  }, [task, pollTaskStatus])

  const reviewCompanies = useCallback(async (feedback: ReviewFeedback) => {
    if (!task) {
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      waitingForStatusChangeRef.current = true
      await industryGraphService.reviewCompanies(task.taskId, feedback)

      // Wait a moment for backend to process
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Continue polling after submitting review
      pollTaskStatus(task.taskId, task.industryId)

      // Reset flag after 15 seconds as failsafe
      setTimeout(() => {
        waitingForStatusChangeRef.current = false
      }, 15000)
    } catch (err) {
      waitingForStatusChangeRef.current = false
      setError(err instanceof Error ? err.message : '提交企业审核失败')
      setIsCreating(false)
    }
  }, [task, pollTaskStatus])

  const reviewUnified = useCallback(async (feedback: ReviewFeedback) => {
    if (!task) {
      console.warn('[reviewUnified] task 不存在')
      return
    }

    console.log('[reviewUnified] 开始提交审核', {
      taskId: task.taskId,
      feedback
    })

    setIsCreating(true)
    setError(null)

    try {
      waitingForStatusChangeRef.current = true
      await industryGraphService.reviewUnified(task.taskId, feedback)
      console.log('[reviewUnified] 审核提交成功')

      // Wait a moment for backend to process
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Continue polling after submitting review
      pollTaskStatus(task.taskId, task.industryId)

      // Reset flag after 15 seconds as failsafe
      setTimeout(() => {
        waitingForStatusChangeRef.current = false
      }, 15000)
    } catch (err) {
      console.error('[reviewUnified] 审核提交失败', err)
      waitingForStatusChangeRef.current = false
      setError(err instanceof Error ? err.message : '提交审核失败')
      setIsCreating(false)
    }
  }, [task, pollTaskStatus])

  const reset = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setTask(null)
    setIsCreating(false)
    setError(null)
  }, [])

  // 加载现有图谱进入编辑模式
  const loadForEdit = useCallback(async (industryId: string, industryName: string) => {
    setIsCreating(true)
    setError(null)

    try {
      console.log('[useIndustryCreation] 创建编辑任务:', industryId)
      // 调用后端创建真实的编辑任务
      const result = await industryGraphService.createEditTask(industryId)

      console.log('[useIndustryCreation] 编辑任务创建成功:', result)

      // 获取任务状态
      const taskData = await industryGraphService.getTaskStatus(result.taskId)

      setTask({
        ...taskData,
        industryId: result.industryId
      })

      setIsCreating(false)
    } catch (err) {
      console.error('[useIndustryCreation] 创建编辑任务失败:', err)
      setError(err instanceof Error ? err.message : '创建编辑任务失败')
      setIsCreating(false)
    }
  }, [])

  return {
    task,
    isCreating,
    error,
    createIndustry,
    approveStructure,
    reviewStructure,
    reviewCompanies,
    reviewUnified,
    reset,
    loadForEdit
  }
}
