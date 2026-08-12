/**
 * Review Feedback Types
 * Review反馈相关类型定义
 */

export interface ReviewFeedback {
  /** 是否通过 */
  approved: boolean
  /** 用户评论 */
  comments?: string
  /** 用户修改的数据 */
  modified_data?: Record<string, any>
}

export type ReviewPhase = 'structure' | 'companies'

export interface ReviewHistory {
  task_id: string
  phase: ReviewPhase
  iteration: number
  feedback: ReviewFeedback
  timestamp: string
}
