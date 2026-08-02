'use client'

import { IndustryCreateForm } from '@/components/graph/IndustryCreateForm'
import { ExplorationProgress } from '@/components/graph/ExplorationProgress'
import { useIndustryCreation } from '@/hooks/useIndustryCreation'

export default function CreateIndustryPage() {
  const {
    task,
    isCreating,
    error,
    createIndustry,
    approveStructure,
    reset
  } = useIndustryCreation()

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">产业知识图谱</h1>
        <p className="text-muted-foreground mt-2">
          AI驱动的产业链结构和企业关系探索
        </p>
      </div>

      {!task ? (
        <IndustryCreateForm
          onSubmit={createIndustry}
          isLoading={isCreating}
        />
      ) : (
        <ExplorationProgress
          task={task}
          onApprove={task.status === 'structure_ready' ? approveStructure : undefined}
          onReset={reset}
          isApproving={isCreating}
        />
      )}

      {error && (
        <div className="rounded-lg border border-red-200 p-4 bg-red-50 dark:bg-red-950">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  )
}
