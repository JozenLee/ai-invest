'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Sparkles, AlertCircle } from 'lucide-react'
import { ExplorationProgress } from '@/components/graph/ExplorationProgress'
import { SwimLanePreview } from '@/components/graph/SwimLanePreview'
import { useIndustryCreation } from '@/hooks/useIndustryCreation'
import type { ExtendedTask } from '@/types/industry-graph'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditIndustryPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [industryName, setIndustryName] = useState('')
  const [isLoadingTask, setIsLoadingTask] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false)

  const {
    task,
    isCreating,
    error: creationError,
    approveStructure,
    reviewStructure,
    reviewCompanies,
    reviewUnified,
    reset,
    loadForEdit
  } = useIndustryCreation()

  // 加载产业并创建编辑任务
  useEffect(() => {
    const loadIndustryForEdit = async () => {
      setIsLoadingTask(true)
      setLoadError(null)

      try {
        // 1. 获取产业基本信息
        const infoResponse = await fetch(`/api/graph/industries/${id}`)
        const infoResult = await infoResponse.json()

        if (!infoResult.success || !infoResult.data) {
          throw new Error('产业不存在')
        }

        setIndustryName(infoResult.data.name)

        // 2. 使用 hook 的 loadForEdit 方法加载编辑任务
        await loadForEdit(id, infoResult.data.name)

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '加载产业失败'
        console.error('[编辑页面] 加载失败:', err)
        setLoadError(errorMessage)
      } finally {
        setIsLoadingTask(false)
      }
    }

    loadIndustryForEdit()
  }, [id, loadForEdit])

  // 当编辑完成后，显示确认对话框
  useEffect(() => {
    if (task?.status === 'completed' && task.industryId) {
      setCompletionDialogOpen(true)
    }
  }, [task?.status, task?.industryId])

  const handleCancel = () => {
    if (!isCreating) {
      reset()
      router.push('/graph')
    }
  }

  const handleViewResult = () => {
    if (task?.industryId) {
      router.push(`/graph/industries/${task.industryId}`)
    }
  }

  if (isLoadingTask) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/graph')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">编辑产业图谱</h1>
            <p className="text-sm text-muted-foreground mt-1">
              正在加载产业数据...
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p className="text-muted-foreground">加载中...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/graph')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">编辑产业图谱</h1>
          </div>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">加载失败</p>
                <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={isCreating}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          取消
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            编辑产业图谱
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            审核并优化"{industryName}"的产业链结构
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：产业信息和进度 */}
        <div className="lg:col-span-4 space-y-6">
          {/* 产业信息卡片 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">产业信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">名称</p>
                <p className="font-medium">{industryName}</p>
              </div>
            </CardContent>
          </Card>

          {/* 探索进度 */}
          {task && (
            <ExplorationProgress
              task={task}
              onApprove={task.status === 'structure_ready' ? approveStructure : undefined}
              onReviewStructure={reviewStructure}
              onReviewCompanies={reviewCompanies}
              onReviewUnified={reviewUnified}
              onReset={reset}
              isApproving={isCreating}
            />
          )}

          {/* 编辑说明 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">编辑流程</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. 审核当前知识图谱（结构+企业）</p>
              <p>2. 提供修改建议或直接确认</p>
              <p>3. AI增量优化（如需修改）</p>
              <p>4. 更新到知识图谱</p>
            </CardContent>
          </Card>

          {/* 错误提示 */}
          {creationError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">编辑失败</p>
                    <p className="text-sm text-muted-foreground mt-1">{creationError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：泳道图预览 */}
        <div className="lg:col-span-8">
          <SwimLanePreview task={task} industryName={industryName} />
        </div>
      </div>

      {/* 完成确认对话框 */}
      <AlertDialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>产业图谱更新完成</AlertDialogTitle>
            <AlertDialogDescription>
              产业"{industryName}"的知识图谱已成功更新。是否查看完整泳道图？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCompletionDialogOpen(false)}>
              留在当前页面
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleViewResult}>
              查看泳道图
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
