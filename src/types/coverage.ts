/**
 * Coverage Assessment Types
 * 覆盖度评估相关类型定义
 */

export interface CoverageAssessment {
  /** 是否达标 */
  is_adequate: boolean
  /** 综合得分 (0-1) */
  score: number
  /** 各维度得分 */
  dimensions: {
    /** 数量指标 */
    quantity: number
    /** 质量指标 */
    quality: number
    /** 完整性指标 */
    completeness: number
    /** AI判断 */
    ai_judgment: number
  }
  /** 发现的遗漏点 */
  gaps: string[]
  /** 改进建议 */
  suggestions: string[]
}

export type CoverageDimension = 'quantity' | 'quality' | 'completeness' | 'ai_judgment'

export const DIMENSION_LABELS: Record<CoverageDimension, string> = {
  quantity: '数量',
  quality: '质量',
  completeness: '完整性',
  ai_judgment: 'AI评估'
}

export function getDimensionLabel(dimension: string): string {
  return DIMENSION_LABELS[dimension as CoverageDimension] || dimension
}
