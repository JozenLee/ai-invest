// src/lib/services/industry-graph.service.ts

import type {
  Industry,
  SwimLaneData,
  ExplorationTask
} from '@/types/industry-graph'
import type {
  GraphUpdateReview,
  Change
} from '@/types/graph-diff'

class IndustryGraphService {
  private baseUrl = '/api/graph/industries'

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

  async getTaskStatus(taskId: string): Promise<ExplorationTask> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`)

    if (!response.ok) {
      throw new Error('获取任务状态失败')
    }

    const data = await response.json()
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

  async getIndustry(id: string): Promise<{ industry: Industry; stages: any[] }> {
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
}

export const industryGraphService = new IndustryGraphService()
