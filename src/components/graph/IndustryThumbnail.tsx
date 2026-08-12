'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIndustrySwimLane } from '@/hooks/useIndustrySwimLane'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Building2, Loader2, AlertCircle, Edit, Trash2, Sparkles } from 'lucide-react'
import { industryGraphService } from '@/lib/services/industry-graph.service'
import type { Industry } from '@/types/industry-graph'

interface IndustryThumbnailProps {
  industry: Industry
  mode: 'simple' | 'detailed'
  onClick?: () => void
  onDelete?: () => void
}

export function IndustryThumbnail({
  industry,
  mode,
  onClick,
  onDelete
}: IndustryThumbnailProps) {
  const router = useRouter()
  const { data: swimlaneData, isLoading, error } = useIndustrySwimLane(industry.id)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/graph/edit/${industry.id}`)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    try {
      await industryGraphService.deleteIndustry(industry.id)
      if (onDelete) {
        await onDelete()  // Wait for parent to refresh
      }
    } catch (err) {
      console.error('删除失败:', err)
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className={mode === 'simple' ? 'cursor-pointer' : ''} onClick={mode === 'simple' ? onClick : undefined}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error || !swimlaneData) {
    return (
      <Card className={mode === 'simple' ? 'cursor-pointer' : ''} onClick={mode === 'simple' ? onClick : undefined}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <AlertCircle className="h-6 w-6 mb-2" />
          <p className="text-sm">{error || '加载失败'}</p>
        </CardContent>
      </Card>
    )
  }

  // Simple mode - compact card
  if (mode === 'simple') {
    const stages = swimlaneData.stages || []
    const totalSegments = stages.reduce((sum, stage) => sum + (stage.segments?.length || 0), 0)
    const totalCompanies = stages.reduce(
      (sum, stage) => (stage.segments || []).reduce((s, seg) => s + (seg.companies?.length || 0), 0) + sum,
      0
    )

    return (
      <>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={onClick}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-base">{industry.name}</CardTitle>
                <CardDescription className="text-xs line-clamp-2">
                  {swimlaneData.industry.name} - 产业链全景
                </CardDescription>
              </div>
              <div className="flex gap-1 ml-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleEdit}
                  title="编辑"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={handleDeleteClick}
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* 阶段环节列表 */}
            <div className="space-y-2">
              {stages.slice(0, 3).map((stage) => (
                <div key={stage.id} className="text-sm">
                  <span className="font-medium text-xs text-muted-foreground">
                    {stage.name}:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(stage.segments || []).slice(0, 4).map((seg) => (
                      <Badge key={seg.id} variant="outline" className="text-xs">
                        {seg.name}
                      </Badge>
                    ))}
                    {(stage.segments?.length || 0) > 4 && (
                      <Badge variant="secondary" className="text-xs">
                        +{(stage.segments?.length || 0) - 4}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {stages.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  +{stages.length - 3} 个阶段
                </p>
              )}
            </div>

            {/* 统计信息 */}
            <div className="flex items-center gap-3 pt-2 border-t text-xs text-muted-foreground">
              <span>{totalSegments} 个环节</span>
              <span>{totalCompanies} 家企业</span>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除产业图谱"{industry.name}"吗？此操作将删除所有相关数据，包括阶段、环节和企业信息，且无法恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  // Detailed mode - full display
  const stages = swimlaneData.stages || []
  const totalSegments = stages.reduce((sum, stage) => sum + (stage.segments?.length || 0), 0)
  const totalCompanies = stages.reduce(
    (sum, stage) => (stage.segments || []).reduce((s, seg) => s + (seg.companies?.length || 0), 0) + sum,
    0
  )

  return (
    <>
      <Card className="max-w-4xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>{industry.name}</CardTitle>
              <CardDescription>
                产业链全景 · {totalSegments} 个环节 · {totalCompanies} 家企业
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleEdit}
              >
                <Edit className="mr-2 h-4 w-4" />
                编辑
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleDeleteClick}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* 完整产业链展示 */}
          {stages.map((stage) => (
            <div key={stage.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-1 bg-primary rounded" />
                <div>
                  <h3 className="font-semibold">{stage.name}</h3>
                  {stage.description && (
                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                  )}
                </div>
              </div>

              {/* 各环节详细信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 ml-3">
                {(stage.segments || []).map((segment) => (
                  <Card key={segment.id} className="p-3">
                    <h4 className="font-medium text-sm mb-2">
                      {segment.name}
                    </h4>
                    {segment.description && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                        {segment.description}
                      </p>
                    )}

                    {/* 龙头企业 */}
                    <div className="space-y-1">
                      {(segment.companies || []).slice(0, 3).map((company, i) => (
                        <div
                          key={company.id}
                          className="flex items-start gap-2 text-xs"
                        >
                          <Building2 className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-medium">{company.name}</span>
                              {company.ticker && (
                                <span className="text-muted-foreground">
                                  {company.ticker}
                                </span>
                              )}
                            </div>
                            {company.description && (
                              <p className="text-muted-foreground line-clamp-1 mt-0.5">
                                {company.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      {(segment.companies?.length || 0) > 3 && (
                        <p className="text-xs text-muted-foreground pl-5">
                          +{(segment.companies?.length || 0) - 3} 家企业
                        </p>
                      )}
                      {(segment.companies?.length || 0) === 0 && (
                        <p className="text-xs text-muted-foreground italic">
                          暂无企业数据
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除产业图谱"{industry.name}"吗？此操作将删除所有相关数据，包括阶段、环节和企业信息，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
