'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SwimLaneGraph } from './SwimLaneGraph'
import { Loader2, Eye, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSwimLaneData } from '@/hooks/useSwimLaneData'
import type { ExtendedTask } from '@/types/industry-graph'

interface SwimLanePreviewProps {
  task: ExtendedTask | null
  industryName: string
  industryId?: string
}

export function SwimLanePreview({ task, industryName, industryId }: SwimLanePreviewProps) {
  // 使用统一的数据获取 hook
  const { data: swimLaneData, isLoading: isLoadingGraph, error: dataError, refetch } = useSwimLaneData({
    industryId,
    task,
    industryName
  })

  const showPreview = task && (
    task.status === 'structure_reviewing' ||
    task.status === 'structure_refining' ||
    task.status === 'companies_reviewing' ||
    task.status === 'companies_refining' ||
    task.status === 'reviewing' ||
    task.status === 'refining' ||
    task.status === 'writing_to_graph' ||
    task.status === 'completed'
  )

  // AI生成中的状态（显示转圈）
  const isAIGenerating = task && (
    task.status === 'exploring_structure' ||
    task.status === 'structure_refining' ||
    task.status === 'exploring_details' ||
    task.status === 'companies_refining' ||
    task.status === 'refining' ||
    task.status === 'writing_to_graph'
  )

  if (!task) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent>
          <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
            <Eye className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">泳道图预览</p>
            <p className="text-sm mt-2">输入产业信息后，AI生成的结构将在这里展示</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!showPreview) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent>
          <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
            <Loader2 className="h-12 w-12 mb-4 animate-spin" />
            <p className="text-lg font-medium">AI正在探索产业结构</p>
            <p className="text-sm mt-2">请稍候，这可能需要几分钟...</p>
            {task.currentStep && (
              <p className="text-xs mt-4 text-center max-w-md">
                {task.currentStep}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isAIGenerating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
          产业链泳道图预览
        </CardTitle>
        <CardDescription>
          {task.status === 'structure_reviewing' && '请审核产业链结构，确认无误后继续'}
          {task.status === 'structure_refining' && 'AI正在根据您的反馈优化结构...'}
          {task.status === 'companies_reviewing' && '请审核企业列表和分类'}
          {task.status === 'companies_refining' && 'AI正在根据您的反馈优化企业列表...'}
          {task.status === 'reviewing' && '请审核产业链结构和企业信息'}
          {task.status === 'refining' && 'AI正在根据您的反馈优化知识图谱...'}
          {task.status === 'writing_to_graph' && '正在将数据写入知识图谱...'}
          {task.status === 'completed' && '知识图谱创建完成！'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {dataError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{dataError}</AlertDescription>
          </Alert>
        )}
        {isLoadingGraph ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : swimLaneData ? (
          <SwimLaneGraph
            data={swimLaneData}
            isLoading={false}
            error={null}
            onRefetch={refetch}
            onCompanyClick={(companyId) => {
              console.log('Company clicked:', companyId)
            }}
          />
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>暂无预览数据</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
