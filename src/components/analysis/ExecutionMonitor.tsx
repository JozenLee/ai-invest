'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RotateCcw,
  AlertCircle,
  Database,
  Sparkles,
  SkipForward
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExecutionMonitorProps {
  runId: string
  onComplete?: (reportId: string) => void
}

interface StepData {
  id: string
  stepName: string
  stepIndex: number
  status: string
  startedAt: string | null
  completedAt: string | null
  duration: number | null
  error: string | null
  progress: {
    current: number
    total: number
    message?: string
  } | null
  artifacts: Array<{
    artifactKey: string
    artifactType: string
    size: number
    data?: string
  }>
}

interface ExecutionData {
  id: string
  workflowId: string
  status: string
  startedAt: string
  completedAt: string | null
  error: string | null
  metadata: any
  steps: StepData[]
}

export function ExecutionMonitor({ runId, onComplete }: ExecutionMonitorProps) {
  const [execution, setExecution] = useState<ExecutionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(true)

  // 轮询获取执行状态
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/analysis/comprehensive/${runId}`)
        if (!res.ok) throw new Error('Failed to fetch execution status')
        const data = await res.json()
        setExecution(data)

        // 如果执行完成，停止轮询并触发回调
        if (data.status === 'COMPLETED') {
          setPolling(false)
          const reportStep = data.steps.find(
            (s: StepData) => s.stepName === 'generate-report' && s.status === 'COMPLETED'
          )
          if (reportStep && onComplete) {
            const reportArtifact = reportStep.artifacts.find(
              (a: { artifactKey: string }) => a.artifactKey === 'report-id'
            )
            if (reportArtifact) {
              onComplete(reportArtifact.data || '')
            }
          }
        }

        if (data.status === 'FAILED') {
          setPolling(false)
        }
      } catch (error) {
        console.error('Failed to fetch execution status:', error)
      }
    }

    fetchStatus()

    if (!polling) return

    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [runId, polling, onComplete])

  const executeAll = async () => {
    setLoading(true)
    setPolling(true)
    try {
      const res = await fetch(
        `/api/analysis/comprehensive/${runId}/execute?mode=all`,
        { method: 'POST' }
      )
      if (!res.ok) throw new Error('Failed to execute workflow')
    } catch (error) {
      console.error('Execution failed:', error)
      setPolling(false)
    } finally {
      setLoading(false)
    }
  }

  const executeNext = async () => {
    setLoading(true)
    setPolling(true)
    try {
      const res = await fetch(
        `/api/analysis/comprehensive/${runId}/execute?mode=next`,
        { method: 'POST' }
      )
      if (!res.ok) throw new Error('Failed to execute next step')
    } catch (error) {
      console.error('Execution failed:', error)
      setPolling(false)
    } finally {
      setLoading(false)
    }
  }

  const resumeExecution = async () => {
    setLoading(true)
    setPolling(true)
    try {
      const res = await fetch(
        `/api/analysis/comprehensive/${runId}/execute?mode=resume`,
        { method: 'POST' }
      )
      if (!res.ok) throw new Error('Failed to resume execution')
    } catch (error) {
      console.error('Resume failed:', error)
      setPolling(false)
    } finally {
      setLoading(false)
    }
  }

  if (!execution) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>加载执行状态...</span>
        </div>
      </Card>
    )
  }

  // 分离数据获取步骤和AI分析步骤
  const dataSteps = execution.steps.filter(s =>
    ['fetch-etfs', 'fetch-etf-data', 'fetch-etf-holdings',
     'fetch-companies', 'fetch-company-data', 'fetch-news',
     'calculate-market-trends'].includes(s.stepName)
  )

  const aiSteps = execution.steps.filter(s =>
    ['market-analysis', 'news-analysis', 'company-analysis',
     'industry-overview', 'investment-advice', 'generate-report'].includes(s.stepName)
  )

  const dataCompleted = dataSteps.filter(s => s.status === 'COMPLETED').length
  const dataTotal = dataSteps.length
  const dataProgress = (dataCompleted / dataTotal) * 100

  const aiCompleted = aiSteps.filter(s => s.status === 'COMPLETED').length
  const aiTotal = aiSteps.length
  const aiProgress = aiTotal > 0 ? (aiCompleted / aiTotal) * 100 : 0

  const isRunning = execution.status === 'RUNNING'
  const isFailed = execution.status === 'FAILED'
  const isCompleted = execution.status === 'COMPLETED'

  const allDataComplete = dataCompleted === dataTotal

  return (
    <div className="space-y-6">
      {/* 顶部状态栏 */}
      <Card className="overflow-hidden border-border/40 shadow-sm">
        <div className="relative h-1.5 w-full overflow-hidden bg-muted/30">
          <div
            className={cn(
              'h-full transition-all duration-500',
              isCompleted && 'bg-green-500',
              isFailed && 'bg-destructive',
              isRunning && 'bg-primary animate-pulse'
            )}
            style={{ width: `${((dataCompleted + aiCompleted) / (dataTotal + aiTotal)) * 100}%` }}
          />
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">综合分析执行</h3>
                <StatusBadge status={execution.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {dataCompleted + aiCompleted} / {dataTotal + aiTotal} 步骤已完成
              </p>
            </div>

            <div className="flex gap-2">
              {isFailed && (
                <Button
                  onClick={resumeExecution}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  继续执行
                </Button>
              )}

              {!isCompleted && !isRunning && (
                <>
                  <Button onClick={executeAll} disabled={loading} size="sm">
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    {dataCompleted > 0 ? '执行全部' : '开始执行'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={executeNext}
                    disabled={loading}
                    size="sm"
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    执行下一步
                  </Button>
                </>
              )}
            </div>
          </div>

          {isFailed && execution.error && (
            <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-destructive">执行失败</p>
                  <p className="text-sm text-muted-foreground">{execution.error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 左右分栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：数据获取流程 */}
        <Card className="p-6 border-border/40">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold">数据获取</h4>
                <p className="text-sm text-muted-foreground">
                  {dataCompleted} / {dataTotal} 完成
                </p>
              </div>
              <div className="text-right text-sm font-medium">
                {Math.round(dataProgress)}%
              </div>
            </div>

            <Progress value={dataProgress} className="h-2" />

            <div className="space-y-2">
              {dataSteps.map((step, index) => (
                <DataStepCard key={step.id} step={step} index={index} />
              ))}
            </div>
          </div>
        </Card>

        {/* 右侧：AI分析流程 */}
        <Card className={cn(
          'p-6 border-border/40 transition-all',
          !allDataComplete && 'opacity-50'
        )}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold">AI分析报告</h4>
                <p className="text-sm text-muted-foreground">
                  {allDataComplete ? `${aiCompleted} / ${aiTotal} 完成` : '等待数据获取完成'}
                </p>
              </div>
              <div className="text-right text-sm font-medium">
                {Math.round(aiProgress)}%
              </div>
            </div>

            <Progress value={aiProgress} className="h-2" />

            {!allDataComplete && (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  数据获取完成后将自动开始AI分析
                </p>
              </div>
            )}

            {allDataComplete && (
              <div className="space-y-2">
                {aiSteps.map((step, index) => (
                  <AIStepCard key={step.id} step={step} index={index} />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function DataStepCard({ step, index }: { step: StepData; index: number }) {
  const getIcon = () => {
    switch (step.status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-destructive" />
      case 'RUNNING':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground/40" />
    }
  }

  const getStepLabel = (name: string) => ({
    'fetch-etfs': '定位产业关联 ETF',
    'fetch-etf-data': '采集 ETF 历史行情',
    'fetch-etf-holdings': '解析 ETF 成分股持仓',
    'fetch-companies': '提取产业链企业节点',
    'fetch-company-data': '采集企业行情数据',
    'fetch-news': '采集产业资讯并汇总情绪',
    'calculate-market-trends': '计算 ETF 与企业趋势指标'
  }[name] || name)

  // 解析产物获取数据摘要
  const getSummary = () => {
    if (step.status !== 'COMPLETED' || !step.artifacts.length) return null

    try {
      for (const artifact of step.artifacts) {
        if (artifact.data) {
          const data = JSON.parse(artifact.data)

          switch (artifact.artifactKey) {
            case 'etf-bindings':
              if (Array.isArray(data)) return `已定位 ${data.length} 个关联 ETF`
              break
            case 'etf-market-data':
              if (Array.isArray(data)) return `已采集 ${data.length} 个 ETF 行情样本`
              break
            case 'holdings-summary':
              if (data.totalHoldings) return `已汇总 ${data.uniqueStocks || 0} 只成分股`
              break
            case 'companies':
              if (Array.isArray(data)) return `已提取 ${data.length} 家产业链企业`
              break
            case 'company-market-data':
              if (Array.isArray(data)) return `已采集 ${data.length} 家企业行情`
              break
            case 'news-sentiment':
              if (data.totalNews !== undefined) return `已处理 ${data.totalNews} 条资讯并完成情绪汇总`
              break
            case 'market-trends':
              return '已计算 ETF 与企业趋势、市场热度'
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return null
  }

  const summary = getSummary()

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-all text-sm',
        step.status === 'COMPLETED' && 'border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20',
        step.status === 'FAILED' && 'border-destructive/30 bg-destructive/5',
        step.status === 'RUNNING' && 'border-primary/30 bg-primary/5',
        step.status === 'PENDING' && 'border-border/40'
      )}
    >
      <div className="mt-0.5">{getIcon()}</div>

      <div className="flex-1 min-w-0">
        <div className="font-medium">{getStepLabel(step.stepName)}</div>

        {step.progress && step.status === 'RUNNING' && (
          <p className="text-xs text-muted-foreground mt-1">
            {step.progress.message}
          </p>
        )}

        {step.error && (
          <p className="text-xs text-destructive mt-1">{step.error}</p>
        )}

        {summary && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            <span>{summary}</span>
          </div>
        )}

        {step.duration && (
          <span className="text-xs text-muted-foreground">
            {(step.duration / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  )
}

function AIStepCard({ step, index }: { step: StepData; index: number }) {
  const getIcon = () => {
    switch (step.status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-destructive" />
      case 'RUNNING':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground/40" />
    }
  }

  const getStepLabel = (name: string) => ({
    'market-analysis': '解读 ETF 行情与资金趋势',
    'news-analysis': '研判资讯事件与市场情绪',
    'company-analysis': '分析产业链企业基本面',
    'industry-overview': '整合多维度行业总览',
    'investment-advice': '生成综合评分与配置建议',
    'generate-report': '汇编并保存综合分析报告'
  }[name] || name)

  // 解析AI分析产物摘要
  const getSummary = () => {
    if (step.status !== 'COMPLETED' || !step.artifacts.length) return null

    switch (step.stepName) {
      case 'market-analysis':
        return '市场趋势分析完成'
      case 'news-analysis':
        return '资讯动态分析完成'
      case 'company-analysis':
        return '企业基本面分析完成'
      case 'industry-overview':
        return '行业总览完成'
      case 'investment-advice':
        return '投资建议完成'
      case 'generate-report':
        return '报告已生成'
      default:
        return null
    }
  }

  const summary = getSummary()

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-all text-sm',
        step.status === 'COMPLETED' && 'border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20',
        step.status === 'FAILED' && 'border-destructive/30 bg-destructive/5',
        step.status === 'RUNNING' && 'border-primary/30 bg-primary/5',
        step.status === 'PENDING' && 'border-border/40'
      )}
    >
      <div className="mt-0.5">{getIcon()}</div>

      <div className="flex-1 min-w-0">
        <div className="font-medium">{getStepLabel(step.stepName)}</div>

        {step.progress && step.status === 'RUNNING' && (
          <p className="text-xs text-muted-foreground mt-1">
            {step.progress.message}
          </p>
        )}

        {step.error && (
          <p className="text-xs text-destructive mt-1">{step.error}</p>
        )}

        {summary && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            <span>{summary}</span>
          </div>
        )}

        {step.duration && (
          <span className="text-xs text-muted-foreground">
            {(step.duration / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: '待执行',
      className: 'bg-muted text-muted-foreground border-border'
    },
    RUNNING: {
      label: '执行中',
      className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900'
    },
    COMPLETED: {
      label: '已完成',
      className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900'
    },
    FAILED: {
      label: '失败',
      className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900'
    }
  }

  const variant = variants[status] || variants.PENDING

  return (
    <Badge variant="outline" className={cn('font-medium', variant.className)}>
      {variant.label}
    </Badge>
  )
}
