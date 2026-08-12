'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { StructureReviewPanel } from './StructureReviewPanel'
import { CompaniesReviewPanel } from './CompaniesReviewPanel'
import { UnifiedReviewPanel } from './UnifiedReviewPanel'
import type { ExtendedTask } from '@/types/industry-graph'
import type { ReviewFeedback } from '@/types/review'

interface ExplorationProgressProps {
  task: ExtendedTask
  onApprove?: () => void
  onReset?: () => void
  isApproving?: boolean
  onReviewStructure?: (feedback: ReviewFeedback) => void
  onReviewCompanies?: (feedback: ReviewFeedback) => void
  onReviewUnified?: (feedback: ReviewFeedback) => void
}

const statusLabels: Record<string, string> = {
  pending: '准备中',
  exploring_structure: '探索产业链结构',
  structure_reviewing: '结构就绪，等待确认',
  structure_refining: '优化结构中',
  exploring_details: '填充企业信息',
  companies_reviewing: '企业信息就绪，等待确认',
  companies_refining: '补充企业信息中',
  reviewing: '知识图谱就绪，等待确认',  // 新增统一审核状态
  refining: '优化知识图谱中',  // 新增统一优化状态
  writing_to_graph: '写入图数据库',
  completed: '完成',
  failed: '失败',
  // 兼容旧状态
  structure_ready: '结构就绪，等待确认'
}

export function ExplorationProgress({
  task,
  onApprove,
  onReset,
  isApproving = false,
  onReviewStructure,
  onReviewCompanies,
  onReviewUnified
}: ExplorationProgressProps) {
  const router = useRouter()

  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'structure_reviewing':
      case 'companies_reviewing':
      case 'reviewing':  // 新增统一审核状态
        // 用户审核阶段：不显示加载动画
        return <CheckCircle className="h-5 w-5 text-blue-600" />
      default:
        // AI生成阶段：显示加载动画
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
    }
  }

  const parseStructureYaml = (yaml: any) => {
    if (!yaml) return null

    try {
      // If it's already an object with structure property
      if (typeof yaml === 'object' && yaml.structure) {
        return yaml.structure
      }
      // If it's a string, try to parse as JSON
      if (typeof yaml === 'string') {
        const parsed = JSON.parse(yaml)
        return parsed.structure || parsed
      }
      return yaml
    } catch {
      return null
    }
  }

  const structure = parseStructureYaml(task.structureYaml)

  // 判断是否显示统一审核面板
  const showUnifiedReview = task.status === 'reviewing' && task.structure

  // 判断是否显示结构审核面板（兼容旧状态）
  const showStructureReview = (task.status === 'structure_reviewing' || task.status === 'structure_ready') &&
    task.structure &&
    !showUnifiedReview

  // 判断是否显示企业审核面板（兼容旧状态）
  const showCompaniesReview = task.status === 'companies_reviewing' && task.result && !showUnifiedReview

  // Debug logging
  console.log('[ExplorationProgress] Debug Info:', {
    status: task.status,
    structureFromYaml: structure,
    structureFromTask: task.structure,
    hasStructure: !!task.structure,
    hasResult: !!task.result,
    showStructureReview,
    showCompaniesReview,
    hasReviewStructureCallback: !!onReviewStructure,
    hasReviewCompaniesCallback: !!onReviewCompanies,
    fullTask: task
  })

  // 如果应该显示但没显示，打印警告
  if ((task.status === 'structure_reviewing' || task.status === 'structure_ready') && !showStructureReview) {
    console.warn('[ExplorationProgress] 应该显示结构审核面板但条件不满足:', {
      status: task.status,
      hasStructure: !!task.structure,
      structureValue: task.structure
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon()}
              {task.industryName}
            </CardTitle>
            {(task.status === 'completed' || task.status === 'failed') && onReset && (
              <Button variant="outline" size="sm" onClick={onReset}>
                创建新产业
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {statusLabels[task.status] || task.status}
              </span>
              <span className="font-medium">{task.progress}%</span>
            </div>
            <Progress value={task.progress} />
            {task.currentStep && (
              <p className="text-sm text-muted-foreground">{task.currentStep}</p>
            )}
          </div>

          {task.status === 'completed' && task.industryId && (
            <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950">
              <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                ✓ 探索完成
              </h4>
              <div className="text-sm text-green-800 dark:text-green-200">
                <p>产业图谱已创建成功</p>
              </div>
            </div>
          )}

          {task.status === 'failed' && task.error && (
            <div className="rounded-lg border border-red-200 p-4 bg-red-50 dark:bg-red-950">
              <h4 className="font-medium text-red-900 dark:text-red-100 mb-2">
                探索失败
              </h4>
              <p className="text-sm text-red-800 dark:text-red-200">{task.error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 统一审核面板（新） */}
      {showUnifiedReview && onReviewUnified && (
        <UnifiedReviewPanel
          structure={task.structure!}
          result={task.result}
          isSubmitting={isApproving}
          onApprove={onReviewUnified}
          onReject={onReviewUnified}
        />
      )}

      {/* 结构审核面板（兼容旧状态） */}
      {showStructureReview && onReviewStructure && (
        <StructureReviewPanel
          structure={task.structure!}
          coverage={task.coverage_assessment || {
            is_adequate: true,
            score: 0.8,
            dimensions: {
              quantity: 0.8,
              quality: 0.8,
              completeness: 0.8,
              ai_judgment: 0.8
            },
            gaps: [],
            suggestions: []
          }}
          isSubmitting={isApproving}
          onApprove={onReviewStructure}
          onReject={onReviewStructure}
        />
      )}

      {/* 企业审核面板（兼容旧状态） */}
      {showCompaniesReview && onReviewCompanies && (
        <CompaniesReviewPanel
          result={task.result!}
          coverage={task.coverage_assessment || {
            is_adequate: true,
            score: 0.8,
            dimensions: {
              quantity: 0.8,
              quality: 0.8,
              completeness: 0.8,
              ai_judgment: 0.8
            },
            gaps: [],
            suggestions: []
          }}
          isSubmitting={isApproving}
          onApprove={onReviewCompanies}
          onReject={onReviewCompanies}
        />
      )}

      {/* 兼容旧的 structure_ready 状态 */}
      {task.status === 'structure_ready' && structure && !task.structure && !onReviewStructure && (
        <div className="space-y-3">
          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-medium mb-2">发现的产业链结构：</h4>
            <ul className="space-y-1 text-sm">
              {Array.isArray(structure) && structure.map((stage: any, idx: number) => (
                <li key={idx}>
                  <strong>{stage.stage || stage.name}</strong>: {stage.segments?.length || 0} 个环节
                </li>
              ))}
            </ul>
          </div>
          {onApprove && (
            <Button
              onClick={onApprove}
              disabled={isApproving}
              className="w-full"
            >
              {isApproving ? '批准中...' : '确认结构，继续探索企业'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
