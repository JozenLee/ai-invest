'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Eye, Play, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RunData {
  reportId?: string | null
  id: string
  workflowId: string
  status: string
  startedAt: string
  completedAt: string | null
  error: string | null
  metadata: any
  progress: {
    total: number
    completed: number
    failed: number
    percentage: number
  }
}

interface ExecutionRunsListProps {
  onSelectRun: (runId: string) => void
}

export function ExecutionRunsList({ onSelectRun }: ExecutionRunsListProps) {
  const [runs, setRuns] = useState<RunData[]>([])
  const [loading, setLoading] = useState(true)
  const [industryNames, setIndustryNames] = useState<Record<string, string>>({})

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/analysis/comprehensive?limit=50')
      if (!res.ok) throw new Error('Failed to fetch runs')
      const data = await res.json()
      setRuns(data)

      // 获取所有唯一的产业ID
      const uniqueIndustryIds = [...new Set(
        data
          .map((run: RunData) => run.metadata?.industryId)
          .filter(Boolean)
      )] as string[]

      // 批量获取产业名称
      if (uniqueIndustryIds.length > 0) {
        const industryRes = await fetch('/api/graph/industries')
        if (industryRes.ok) {
          const response = await industryRes.json()
          const industries = response.success ? response.data : []

          const nameMap: Record<string, string> = {}
          industries.forEach((industry: any) => {
            nameMap[industry.id] = industry.name
          })
          setIndustryNames(nameMap)
        }
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRuns()
  }, [])

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center text-muted-foreground">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          <span>加载历史记录...</span>
        </div>
      </Card>
    )
  }

  if (runs.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">暂无执行记录</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">历史执行记录</h3>
        <Button variant="ghost" size="sm" onClick={fetchRuns}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            onSelect={onSelectRun}
            industryName={industryNames[run.metadata?.industryId]}
          />
        ))}
      </div>
    </div>
  )
}

function RunCard({
  run,
  onSelect,
  industryName
}: {
  run: RunData
  onSelect: (id: string) => void
  industryName?: string
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20'
      case 'FAILED':
        return 'border-destructive/30 bg-destructive/5'
      case 'RUNNING':
        return 'border-primary/30 bg-primary/5'
      default:
        return 'border-border/40'
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      PENDING: {
        label: '待执行',
        className: 'bg-muted text-muted-foreground'
      },
      RUNNING: {
        label: '执行中',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
      },
      COMPLETED: {
        label: '已完成',
        className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
      },
      FAILED: {
        label: '失败',
        className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
      }
    }
    return variants[status] || variants.PENDING
  }

  const statusInfo = getStatusBadge(run.status)

  return (
    <Card className={cn('p-4 transition-all hover:shadow-md', getStatusColor(run.status))}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          {/* 标题行 */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusInfo.className}>
              {statusInfo.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatDistance(new Date(run.startedAt), new Date(), {
                addSuffix: true,
                locale: zhCN
              })}
            </span>
          </div>

          {/* 产业信息 - 显示中文名称 */}
          {run.metadata?.industryId && (
            <div className="text-sm">
              <span className="text-muted-foreground">产业: </span>
              <span className="font-medium">
                {industryName || run.metadata.industryId}
              </span>
            </div>
          )}

          {/* 进度信息 */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {run.progress.completed} / {run.progress.total} 步骤
                </span>
                <span className="font-medium">{run.progress.percentage}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full transition-all',
                    run.status === 'COMPLETED' && 'bg-green-500',
                    run.status === 'FAILED' && 'bg-destructive',
                    run.status === 'RUNNING' && 'bg-primary',
                    run.status === 'PENDING' && 'bg-muted-foreground'
                  )}
                  style={{ width: `${run.progress.percentage}%` }}
                />
              </div>
            </div>

            {run.progress.failed > 0 && (
              <Badge variant="destructive" className="text-xs">
                {run.progress.failed} 失败
              </Badge>
            )}
          </div>

          {/* 错误信息 */}
          {run.error && (
            <p className="text-sm text-destructive line-clamp-1">{run.error}</p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex shrink-0 gap-2">
          {run.reportId && <Link className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm hover:bg-muted" href={'/comprehensive-analysis/report/' + encodeURIComponent(run.reportId)}>查看报告</Link>}
          <Button size="sm" variant="outline" onClick={() => onSelect(run.id)}>
            <Eye className="h-4 w-4 mr-1" />
            查看完整流程
          </Button>

          {run.status === 'FAILED' && (
            <Button size="sm" onClick={() => onSelect(run.id)}>
              <Play className="h-4 w-4 mr-1" />
              继续
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
