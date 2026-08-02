'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { ExplorationTask } from '@/types/industry-graph'

interface ExtendedTask extends ExplorationTask {
  industryId?: string
}

interface ExplorationProgressProps {
  task: ExtendedTask
  onApprove?: () => void
  onReset?: () => void
  isApproving?: boolean
}

const statusLabels: Record<string, string> = {
  pending: '准备中',
  exploring_structure: '探索产业链结构',
  structure_ready: '结构就绪，等待确认',
  exploring_details: '填充企业信息',
  completed: '完成',
  failed: '失败'
}

export function ExplorationProgress({
  task,
  onApprove,
  onReset,
  isApproving = false
}: ExplorationProgressProps) {
  const router = useRouter()

  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />
      default:
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

  return (
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

        {task.status === 'structure_ready' && structure && (
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

        {task.status === 'completed' && task.industryId && (
          <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950">
            <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
              ✓ 探索完成
            </h4>
            <div className="text-sm text-green-800 dark:text-green-200">
              <p>产业图谱已创建成功</p>
              <p className="mt-1 text-xs text-green-700 dark:text-green-300">ID: {task.industryId}</p>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={() => router.push(`/graph/industries/${task.industryId}`)}
            >
              查看产业图谱
            </Button>
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
  )
}
