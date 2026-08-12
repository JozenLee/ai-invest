'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import { ArrowLeft, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { ExplorationProgress } from '@/components/graph/ExplorationProgress'
import { SwimLanePreview } from '@/components/graph/SwimLanePreview'
import { useIndustryCreation } from '@/hooks/useIndustryCreation'
import { industryGraphService } from '@/lib/services/industry-graph.service'

export default function CreateIndustryPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [hasStarted, setHasStarted] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [existingIndustryId, setExistingIndustryId] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false)

  const {
    task,
    isCreating,
    error: creationError,
    createIndustry,
    approveStructure,
    reviewStructure,
    reviewCompanies,
    reviewUnified,
    reset
  } = useIndustryCreation()

  // 当创建完成后，显示确认对话框
  useEffect(() => {
    if (task?.status === 'completed' && task.industryId) {
      setCompletionDialogOpen(true)
    }
  }, [task?.status, task?.industryId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    // 检查是否已存在
    setIsChecking(true)
    try {
      console.log('[创建页面] 检查产业名称:', name.trim())
      const result = await industryGraphService.checkIndustryExists(name.trim())
      console.log('[创建页面] 检查结果:', result)

      if (result.exists && result.industry) {
        // 已存在，显示提示对话框
        console.log('[创建页面] 产业已存在，显示对话框')
        setExistingIndustryId(result.industry.id)
        setDuplicateDialogOpen(true)
        return
      }

      // 不存在，开始创建
      console.log('[创建页面] 产业不存在，开始创建')
      startCreation()
    } catch (err) {
      console.error('[创建页面] 检查产业名称失败:', err)
      // 检查失败也允许继续创建
      startCreation()
    } finally {
      setIsChecking(false)
    }
  }

  const startCreation = () => {
    setHasStarted(true)
    createIndustry(name.trim(), description.trim() || undefined)
  }

  const handleEditExisting = () => {
    setDuplicateDialogOpen(false)
    if (existingIndustryId) {
      router.push(`/graph/edit/${existingIndustryId}`)
    }
  }

  const handleCancel = () => {
    if (!isCreating) {
      reset()
      router.push('/graph')
    }
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
          {hasStarted ? '取消' : '返回'}
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI驱动的产业链探索
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            输入产业名称，AI将自动探索产业链结构、企业关系和市场洞察
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：表单和进度 */}
        <div className="lg:col-span-4 space-y-6">
          {/* 创建表单 */}
          {!hasStarted ? (
            <Card>
              <CardHeader>
                <CardTitle>产业信息</CardTitle>
                <CardDescription>
                  输入产业名称和描述，开始AI探索
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">产业名称 *</Label>
                    <Input
                      id="name"
                      placeholder="例如：AI算力硬件、新能源汽车"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">描述（可选）</Label>
                    <Textarea
                      id="description"
                      placeholder="简要描述产业范围和特点"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={!name.trim() || isChecking}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isChecking ? '检查中...' : '开始探索'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 产业信息卡片 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">产业信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">名称</p>
                    <p className="font-medium">{name}</p>
                  </div>
                  {description && (
                    <div>
                      <p className="text-sm text-muted-foreground">描述</p>
                      <p className="text-sm">{description}</p>
                    </div>
                  )}
                  {/* 产业ID字段已移除 - 不在UI中显示内部ID */}
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
            </>
          )}

          {/* 使用提示 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">探索流程</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <div className={`flex-shrink-0 mt-0.5 ${hasStarted && task ? 'text-primary' : 'text-muted-foreground'}`}>
                  {hasStarted && task ? <CheckCircle2 className="h-5 w-5" /> : <div className="h-5 w-5 rounded-full border-2 border-current" />}
                </div>
                <div>
                  <p className="font-medium text-sm">1. AI探索结构</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    分析产业链各阶段和环节
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className={`flex-shrink-0 mt-0.5 ${
                  task?.status === 'structure_reviewing' ||
                  task?.status === 'reviewing' ||
                  task?.status === 'structure_refining' ||
                  task?.status === 'refining' ||
                  task?.status === 'exploring_details' ||
                  task?.status === 'companies_reviewing' ||
                  task?.status === 'companies_refining' ||
                  task?.status === 'writing_to_graph' ||
                  task?.status === 'completed'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}>
                  {
                    task?.status === 'structure_reviewing' ||
                    task?.status === 'reviewing' ||
                    task?.status === 'structure_refining' ||
                    task?.status === 'refining' ||
                    task?.status === 'exploring_details' ||
                    task?.status === 'companies_reviewing' ||
                    task?.status === 'companies_refining' ||
                    task?.status === 'writing_to_graph' ||
                    task?.status === 'completed'
                      ? <CheckCircle2 className="h-5 w-5" />
                      : <div className="h-5 w-5 rounded-full border-2 border-current" />
                  }
                </div>
                <div>
                  <p className="font-medium text-sm">2. 知识图谱审核</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    查看泳道图并提供反馈（结构+企业）
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className={`flex-shrink-0 mt-0.5 ${
                  task?.status === 'writing_to_graph' ||
                  task?.status === 'completed'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}>
                  {
                    task?.status === 'writing_to_graph' ||
                    task?.status === 'completed'
                      ? <CheckCircle2 className="h-5 w-5" />
                      : <div className="h-5 w-5 rounded-full border-2 border-current" />
                  }
                </div>
                <div>
                  <p className="font-medium text-sm">3. 构建图谱</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    生成完整的知识图谱
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 错误提示 */}
          {creationError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">创建失败</p>
                    <p className="text-sm text-muted-foreground mt-1">{creationError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：泳道图预览 */}
        <div className="lg:col-span-8">
          <SwimLanePreview task={task} industryName={name} />
        </div>
      </div>

      {/* 重复提示对话框 */}
      <AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>产业图谱已存在</AlertDialogTitle>
            <AlertDialogDescription>
              产业"{name}"已存在图谱。您可以选择编辑现有图谱或取消创建。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleEditExisting}>
              前往编辑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 完成确认对话框 */}
      <AlertDialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>产业图谱创建完成</AlertDialogTitle>
            <AlertDialogDescription>
              产业"{name}"的知识图谱已成功创建。是否查看完整泳道图？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCompletionDialogOpen(false)}>
              留在当前页面
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (task?.industryId) {
                router.push(`/graph/industries/${task.industryId}`)
              }
            }}>
              查看泳道图
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
