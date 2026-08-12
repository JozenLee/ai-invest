'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IndustryCreateForm } from './IndustryCreateForm'
import { ExplorationProgress } from './ExplorationProgress'
import { useIndustryCreation } from '@/hooks/useIndustryCreation'
import { useEffect } from 'react'

interface IndustryCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function IndustryCreateDialog({
  open,
  onOpenChange,
  onSuccess
}: IndustryCreateDialogProps) {
  const {
    task,
    isCreating,
    error: creationError,
    createIndustry,
    approveStructure,
    reviewStructure,
    reviewCompanies,
    reset
  } = useIndustryCreation()

  // 当创建完成后，通知父组件并关闭对话框
  useEffect(() => {
    if (task?.status === 'completed') {
      setTimeout(() => {
        onSuccess?.()
        reset()
        onOpenChange(false)
      }, 2000)
    }
  }, [task?.status, reset, onSuccess, onOpenChange])

  // 关闭时重置状态
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isCreating) {
      reset()
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI驱动的产业链探索</DialogTitle>
          <DialogDescription>
            输入产业名称和领域，AI将自动探索产业链结构、企业关系和市场洞察
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!task ? (
            <>
              <IndustryCreateForm
                onSubmit={createIndustry}
                isLoading={isCreating}
              />

              {/* 使用提示 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">使用提示</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex gap-2">
                    <span className="font-medium text-foreground">1.</span>
                    <span>输入产业名称（如"AI芯片"、"新能源汽车"）和领域描述</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium text-foreground">2.</span>
                    <span>AI将自动探索产业链结构，包括上下游关系、核心企业等</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium text-foreground">3.</span>
                    <span>审核AI生成的结构后，系统将构建完整的知识图谱</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium text-foreground">4.</span>
                    <span>通过泳道图可视化查看产业链各环节和企业分布</span>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <ExplorationProgress
              task={task}
              onApprove={task.status === 'structure_ready' ? approveStructure : undefined}
              onReviewStructure={reviewStructure}
              onReviewCompanies={reviewCompanies}
              onReset={reset}
              isApproving={isCreating}
            />
          )}

          {creationError && (
            <div className="rounded-lg border border-red-200 p-4 bg-red-50 dark:bg-red-950">
              <p className="text-sm text-red-800 dark:text-red-200">{creationError}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
