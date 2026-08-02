'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { industryGraphService } from '@/lib/services/industry-graph.service'
import type { ExplorationTask } from '@/types/industry-graph'

interface ExtendedTask extends ExplorationTask {
  industryId?: string
}

export function useIndustryCreation() {
  const [task, setTask] = useState<ExtendedTask | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
        progress: 0
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

    pollIntervalRef.current = setInterval(async () => {
      try {
        const taskData = await industryGraphService.getTaskStatus(taskId)
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
        }

        // Stop polling if structure is ready and waiting for approval
        if (taskData.status === 'structure_ready') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          setIsCreating(false)
        }
      } catch (err) {
        console.error('获取任务状态失败:', err)
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        setIsCreating(false)
        setError('获取任务状态失败')
      }
    }, 2000) // Poll every 2 seconds
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

  const reset = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setTask(null)
    setIsCreating(false)
    setError(null)
  }, [])

  return {
    task,
    isCreating,
    error,
    createIndustry,
    approveStructure,
    reset
  }
}
