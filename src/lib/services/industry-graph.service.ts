// src/lib/services/industry-graph.service.ts

import type {
  Industry,
  SwimLaneData,
  ExplorationTask,
  ExtendedTask,
  ExplorationContext
} from '@/types/industry-graph'
import type {
  GraphUpdateReview,
  Change
} from '@/types/graph-diff'
import type { ReviewFeedback } from '@/types/review'
import type { CoverageAssessment } from '@/types/coverage'

class IndustryGraphService {
  private baseUrl = '/api/graph/industries'

  async checkIndustryExists(name: string): Promise<{ exists: boolean; industry: Industry | null }> {
    const response = await fetch(`${this.baseUrl}/check?name=${encodeURIComponent(name)}`)

    if (!response.ok) {
      throw new Error('检查产业名称失败')
    }

    const data = await response.json()
    return data.data
  }

  async createIndustry(name: string, description?: string): Promise<{ taskId: string; industryId: string }> {
    const response = await fetch(`${this.baseUrl}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })

    if (!response.ok) {
      throw new Error('创建产业失败')
    }

    const data = await response.json()
    return data.data
  }

  async deleteIndustry(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE'
    })

    if (!response.ok) {
      throw new Error('删除产业失败')
    }
  }

  async getTaskStatus(taskId: string): Promise<ExtendedTask> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData.error || '获取任务状态失败'
      const details = errorData.details ? ` (${JSON.stringify(errorData.details)})` : ''
      console.error('[getTaskStatus] API错误:', {
        taskId,
        status: response.status,
        error: errorMsg,
        details: errorData.details
      })
      throw new Error(`${errorMsg}${details}`)
    }

    const data = await response.json()

    // 验证返回的数据结构
    if (!data.success) {
      console.error('[getTaskStatus] API返回失败:', data)
      throw new Error(data.error || '获取任务状态失败')
    }

    return data.data
  }

  async approveStructure(taskId: string, modifiedStructure?: any): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/approve-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved: true,
        modifiedStructure
      })
    })

    if (!response.ok) {
      throw new Error('批准骨架失败')
    }
  }

  async getIndustry(id: string): Promise<Industry> {
    const response = await fetch(`${this.baseUrl}/${id}`)

    if (!response.ok) {
      throw new Error('获取产业失败')
    }

    const data = await response.json()
    return data.data
  }

  async getSwimLaneData(id: string): Promise<SwimLaneData> {
    const response = await fetch(`${this.baseUrl}/${id}/swimlane`)

    if (!response.ok) {
      throw new Error('获取泳道数据失败')
    }

    const data = await response.json()
    return data.data
  }

  async triggerUpdate(id: string): Promise<{ taskId: string }> {
    const response = await fetch(`${this.baseUrl}/${id}/update`, {
      method: 'POST'
    })

    if (!response.ok) {
      throw new Error('触发更新失败')
    }

    const data = await response.json()
    return data.data
  }

  async getPendingReviews(): Promise<GraphUpdateReview[]> {
    const response = await fetch('/api/graph/reviews?status=pending')

    if (!response.ok) {
      throw new Error('获取待审核列表失败')
    }

    const data = await response.json()
    return data.data.reviews
  }

  async getReview(reviewId: string): Promise<GraphUpdateReview> {
    const response = await fetch(`/api/graph/reviews/${reviewId}`)

    if (!response.ok) {
      throw new Error('获取审核详情失败')
    }

    const data = await response.json()
    return data.data
  }

  async approveAllChanges(reviewId: string): Promise<void> {
    const response = await fetch(`/api/graph/reviews/${reviewId}/approve-all`, {
      method: 'POST'
    })

    if (!response.ok) {
      throw new Error('批准失败')
    }
  }

  async rejectAllChanges(reviewId: string, reason?: string): Promise<void> {
    const response = await fetch(`/api/graph/reviews/${reviewId}/reject-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    })

    if (!response.ok) {
      throw new Error('拒绝失败')
    }
  }

  async reviewChange(
    reviewId: string,
    changeId: string,
    action: 'approved' | 'rejected',
    reason?: string
  ): Promise<void> {
    const response = await fetch(
      `/api/graph/reviews/${reviewId}/changes/${changeId}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason })
      }
    )

    if (!response.ok) {
      throw new Error('审核变更失败')
    }
  }

  async reviewStructure(taskId: string, feedback: ReviewFeedback): Promise<void> {
    // Transform modified_data to modified_structure for backend
    const body = {
      approved: feedback.approved,
      comments: feedback.comments,
      modified_structure: feedback.modified_data
    }

    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/review-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error('提交结构Review失败')
    }
  }

  async reviewCompanies(taskId: string, feedback: ReviewFeedback): Promise<void> {
    // Transform modified_data to modified_companies for backend
    const body = {
      approved: feedback.approved,
      comments: feedback.comments,
      modified_companies: feedback.modified_data
    }

    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/review-companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error('提交企业Review失败')
    }
  }

  async reviewUnified(taskId: string, feedback: ReviewFeedback): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback)
    })

    if (!response.ok) {
      throw new Error('提交统一Review失败')
    }
  }

  async getCoverage(taskId: string): Promise<CoverageAssessment> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/coverage`)

    if (!response.ok) {
      throw new Error('获取覆盖度评估失败')
    }

    const data = await response.json()
    return data.data
  }

  async createEditTask(industryId: string): Promise<{ taskId: string; industryId: string }> {
    const response = await fetch(`${this.baseUrl}/${industryId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || '创建编辑任务失败')
    }

    const data = await response.json()
    return data.data
  }

  async getExplorationHistory(taskId: string): Promise<{
    iterations: Array<{
      iteration: number
      search_queries: string[]
      summary: string
      coverage_score: number
    }>
    review_history: Array<{
      phase: string
      iteration: number
      feedback: ReviewFeedback
      timestamp: string
    }>
  }> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/exploration-history`)

    if (!response.ok) {
      throw new Error('获取探索历史失败')
    }

    const data = await response.json()
    return data.data
  }
}

export const industryGraphService = new IndustryGraphService()
