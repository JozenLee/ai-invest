'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ExecutionRunsList } from './ExecutionRunsList'
import {
  Sparkles,
  Settings2,
  History,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  AlertCircle,
  Database,
  SkipForward,
  FileText
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Industry {
  id: string
  name?: string
  code?: string
  description?: string
  type?: string
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
    data?: unknown
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

const STEP_LABELS: Record<string, { title: string; detail: string }> = {
  'fetch-etfs': {
    title: '定位产业关联 ETF',
    detail: '查询产业图谱与绑定关系，去重整理 ETF 候选'
  },
  'fetch-etf-data': {
    title: '获取ETF行情及关键指标',
    detail: '获取候选 ETF 行情并计算均线、MACD、RSI、波动率等指标'
  },
  'fetch-etf-holdings': {
    title: '解析 ETF 成分股持仓',
    detail: '获取各 ETF 持仓明细并汇总底层股票'
  },
  'fetch-companies': {
    title: '提取产业链企业节点',
    detail: '从产业图谱中提取关联企业与所属环节'
  },
  'fetch-company-data': {
    title: '采集企业行情数据',
    detail: '批量补充企业最新价格、涨跌等市场数据'
  },
  'fetch-news': {
    title: '采集产业资讯并汇总情绪',
    detail: '获取近 30 天新闻，提取热点并计算情感分布'
  },
  'fetch-market-snapshot': {
    title: '分析市场指数与板块资金',
    detail: '获取市场指数及关键指标、板块资金流向并准备趋势分析输入'
  },
  'calculate-market-trends': {
    title: '计算 ETF 与企业趋势指标',
    detail: '汇总涨跌表现，计算市场热度与整体趋势强度'
  },
  'market-analysis': {
    title: '解读 ETF 行情与资金趋势',
    detail: '基于行情、成交量与趋势指标生成市场研判'
  },
  'news-analysis': {
    title: '研判资讯事件与市场情绪',
    detail: '分析政策事件、舆论情绪、催化剂与潜在风险'
  },
  'company-analysis': {
    title: '分析产业链企业基本面',
    detail: '识别关键企业，评估竞争格局、成长性与产业链壁垒'
  },
  'industry-overview': {
    title: '整合多维度行业总览',
    detail: '汇总市场、资讯与企业分析，判断行业阶段与展望'
  },
  'investment-advice': {
    title: '生成综合评分与配置建议',
    detail: '结合全部分析给出评分、配置比例、周期与风险提示'
  },
  'generate-report': {
    title: '汇编并保存综合分析报告',
    detail: '整合行业、产业链、资讯与投资建议，生成可查看报告'
  }
}

const DATA_STEP_ORDER = ['fetch-market-snapshot', 'fetch-etfs', 'fetch-etf-data', 'fetch-etf-holdings', 'fetch-companies', 'fetch-company-data', 'fetch-news', 'calculate-market-trends']

function getStepLabel(name: string) {
  return STEP_LABELS[name] || { title: name, detail: '' }
}

const INDUSTRY_LABELS: Record<string, string> = {
  semiconductor: '半导体', ai_hardware: 'AI算力硬件', robotics: '机器人',
  new_energy_vehicle: '新能源车', battery: '电池储能', photovoltaic: '光伏产业',
  wind_power: '风电产业', medical_device: '医疗器械',
}

function industryDisplayName(industry: Industry | undefined) {
  if (!industry) return '选择产业领域'
  const name = String(industry.name || '').trim()
  const code = String(industry.code || '').trim()
  const normalized = (code || name).toLowerCase().replace(/-/g, '_')
  if (INDUSTRY_LABELS[normalized]) return INDUSTRY_LABELS[normalized]
  if (name && !/^[a-f0-9]{6,}$/i.test(name) && !/^industry[_-]/i.test(name)) return name
  if (code && !/^[a-f0-9]{6,}$/i.test(code)) return code
  return '选择产业领域'
}

const EMPTY_FLOW_STEPS: StepData[] = Object.keys(STEP_LABELS).map((stepName, stepIndex) => ({
  id: `pending-${stepName}`,
  stepName,
  stepIndex,
  status: 'PENDING',
  startedAt: null,
  completedAt: null,
  duration: null,
  error: null,
  progress: null,
  artifacts: [],
}))

function getStepStatusLabel(status: string) {
  return ({
    PENDING: '等待执行',
    RUNNING: '执行中',
    COMPLETED: '已完成',
    FAILED: '执行失败',
    SKIPPED: '已跳过'
  } as Record<string, string>)[status] || status
}

export function ComprehensiveAnalysisFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryRunId = searchParams.get('runId') || ''
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [companySource, setCompanySource] = useState<'etf' | 'graph'>('etf')
  const [currentRunId, setCurrentRunId] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // 执行监控状态
  const [execution, setExecution] = useState<ExecutionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(true)

  useEffect(() => {
    if (queryRunId) {
      setCurrentRunId(queryRunId)
      setPolling(true)
      setShowHistory(false)
    }
  }, [queryRunId])

  // 加载产业列表
  useEffect(() => {
    const fetchIndustries = async () => {
      try {
        const res = await fetch('/api/graph/industries')
        if (!res.ok) throw new Error('Failed to fetch industries')
        const response = await res.json()
        const data = response.success && Array.isArray(response.data) ? response.data : []

        setIndustries(data)
        if (data.length > 0 && !selectedIndustry) {
          setSelectedIndustry(data[0].id)
        }
      } catch (error) {
        console.error('Failed to fetch industries:', error)
        setIndustries([])
      }
    }

    fetchIndustries()
  }, [selectedIndustry])

  // 轮询获取执行状态
  useEffect(() => {
    if (!currentRunId || !polling) return

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/analysis/comprehensive/${currentRunId}`)
        if (!res.ok) throw new Error('Failed to fetch execution status')
        const data = await res.json()
        setExecution(data)

        // 如果执行完成，停止轮询并跳转
        if (data.status === 'COMPLETED') {
          setPolling(false)
          const reportStep = data.steps.find(
            (s: StepData) => s.stepName === 'generate-report' && s.status === 'COMPLETED'
          )
          if (reportStep) {
            const reportArtifact = reportStep.artifacts.find(
              (a: { artifactKey: string }) => a.artifactKey === 'report-id'
            )
            if (reportArtifact?.data) {
              router.push(`/comprehensive-analysis/report/${reportArtifact.data}`)
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
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [currentRunId, polling, router])

  // 页面进入或切换产业时只重置当前流程，避免在用户开始执行前写入历史。
  useEffect(() => {
    if (queryRunId) return
    setCurrentRunId('')
    setExecution(null)
    setPolling(false)
  }, [selectedIndustry, companySource, queryRunId])

  const createRun = async () => {
    if (!selectedIndustry) return null

    setCreating(true)
    try {
      const res = await fetch('/api/analysis/comprehensive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industryId: selectedIndustry, companySource })
      })
      if (!res.ok) throw new Error('Failed to create analysis')
      const { runId } = await res.json()
      setCurrentRunId(runId)
      setShowHistory(false)
      return runId as string
    } finally {
      setCreating(false)
    }
  }

  const executeAll = async (runId?: string) => {
    setLoading(true)
    setPolling(true)
    try {
      const targetRunId = runId || currentRunId || await createRun()
      if (!targetRunId) return
      const res = await fetch(
        `/api/analysis/comprehensive/${targetRunId}/execute?mode=all`,
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
      const targetRunId = currentRunId || await createRun()
      if (!targetRunId) return
      const res = await fetch(
        `/api/analysis/comprehensive/${targetRunId}/execute?mode=next`,
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
        `/api/analysis/comprehensive/${currentRunId}/execute?mode=resume`,
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

  // 查看历史记录
  const handleSelectRun = (runId: string) => {
    setCurrentRunId(runId)
    setShowHistory(false)
    setPolling(true)
  }

  // 计算步骤统计
  const getStepStats = () => {
    const currentExecution = execution || { steps: EMPTY_FLOW_STEPS }
    if (!currentExecution.steps.length) return {
      dataSteps: [],
      aiSteps: [],
      dataProgress: 0,
      aiProgress: 0,
      dataCompleted: 0,
      dataTotal: 0,
      aiCompleted: 0,
      aiTotal: 0
    }

    const dataSteps = currentExecution.steps.filter(s =>
      ['fetch-etfs', 'fetch-etf-data', 'fetch-etf-holdings',
       'fetch-companies', 'fetch-company-data', 'fetch-news',
       'fetch-market-snapshot', 'calculate-market-trends'].includes(s.stepName)
    ).sort((a, b) => DATA_STEP_ORDER.indexOf(a.stepName) - DATA_STEP_ORDER.indexOf(b.stepName))

    const aiSteps = currentExecution.steps.filter(s =>
      ['market-analysis', 'news-analysis', 'company-analysis',
       'industry-overview', 'investment-advice', 'generate-report'].includes(s.stepName)
    )

    const activeDataSteps = dataSteps.filter(s => s.status !== 'SKIPPED')
    const dataCompleted = activeDataSteps.filter(s => s.status === 'COMPLETED').length
    const dataTotal = activeDataSteps.length
    const dataProgress = dataTotal > 0 ? (dataCompleted / dataTotal) * 100 : 0

    const activeAiSteps = aiSteps.filter(s => s.status !== 'SKIPPED')
    const aiCompleted = activeAiSteps.filter(s => s.status === 'COMPLETED').length
    const aiTotal = activeAiSteps.length
    const aiProgress = aiTotal > 0 ? (aiCompleted / aiTotal) * 100 : 0

    return { dataSteps, aiSteps, dataProgress, aiProgress, dataCompleted, dataTotal, aiCompleted, aiTotal }
  }

  const stats = getStepStats()
  const isRunning = execution?.status === 'RUNNING'
  const isFailed = execution?.status === 'FAILED'
  const isCompleted = execution?.status === 'COMPLETED'
  const isBusy = creating || loading || isRunning
  const allDataComplete = stats.dataCompleted === stats.dataTotal && stats.dataTotal > 0

  return (
    <div className="space-y-6">
      {/* 顶部切换栏 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={!showHistory ? 'default' : 'outline'}
            onClick={() => setShowHistory(false)}
            disabled={isBusy}
            className="flex items-center gap-2"
          >
            <Settings2 className="h-4 w-4" />
            分析配置
          </Button>
          <Button
            variant={showHistory ? 'default' : 'outline'}
            onClick={() => setShowHistory(true)}
            disabled={isBusy}
            className="flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            历史记录
          </Button>
        </div>

        {currentRunId && !showHistory && execution && (
          <div className="flex items-center gap-3">
            <StatusBadge status={execution.status} />
            <span className="text-sm text-muted-foreground">
              {stats.dataCompleted + stats.aiCompleted} / {stats.dataTotal + stats.aiTotal} 步骤
            </span>
          </div>
        )}
      </div>

      {/* 历史记录视图 */}
      {showHistory && (
        <ExecutionRunsList onSelectRun={handleSelectRun} />
      )}

      {/* 分析配置和执行监控视图 */}
      {!showHistory && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,2.28fr)]">
          {/* 左侧：配置面板 */}
          <Card className="min-w-0 border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.04]">
            <CardHeader className="border-b bg-background/45">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-5 w-5 text-primary" />
                分析配置
              </CardTitle>
              <CardDescription className="text-xs">
                选择产业并启动分析任务
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="industry-select">分析领域</label>
                  <Select value={selectedIndustry} onValueChange={(value) => setSelectedIndustry(value || '')} disabled={isBusy}>
                    <SelectTrigger id="industry-select" className="h-10 bg-background"><SelectValue placeholder="选择产业领域">{industryDisplayName(industries.find(i => i.id === selectedIndustry))}</SelectValue></SelectTrigger>
                    <SelectContent>{industries.map((industry) => <SelectItem key={industry.id} value={industry.id}>{industryDisplayName(industry)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="company-source-select">企业来源</label>
                  <Select value={companySource} onValueChange={(value) => setCompanySource(value as 'etf' | 'graph')} disabled={isBusy}>
                    <SelectTrigger id="company-source-select" className="h-10 bg-background"><SelectValue>{companySource === 'graph' ? '知识图谱' : 'ETF持仓'}</SelectValue></SelectTrigger>
                    <SelectContent><SelectItem value="etf">ETF持仓</SelectItem><SelectItem value="graph">知识图谱</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">仅执行所选来源，另一条企业提取步骤将标记为已跳过。</p>

              {/* 当前任务信息 */}
              {currentRunId && execution && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">当前任务</span>
                    <Badge variant="outline" className="text-xs">
                      {execution.metadata?.industryId &&
                        industryDisplayName(industries.find(i => i.id === execution.metadata.industryId))
                      }
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    预计耗时: 3-8分钟
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="space-y-2 pt-2">
                {!currentRunId && (
                  <>
                    <Button onClick={() => executeAll()} disabled={isBusy || !selectedIndustry} className="w-full">
                      {loading || creating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      执行全部
                    </Button>
                    <Button variant="outline" onClick={executeNext} disabled={isBusy || !selectedIndustry} className="w-full">
                      {loading || creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SkipForward className="mr-2 h-4 w-4" />}
                      执行下一步
                    </Button>
                  </>
                )}
                {currentRunId && execution && (
                  <>
                    {isFailed && (
                      <Button
                          onClick={resumeExecution}
                          disabled={isBusy}
                        variant="outline"
                        className="w-full"
                      >
                        {loading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-2 h-4 w-4" />
                        )}
                        继续执行
                      </Button>
                    )}

                    {isRunning && (
                      <Button disabled className="w-full">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        流程执行中...
                      </Button>
                    )}

                    {!isCompleted && !isRunning && (
                      <>
                        <Button onClick={() => executeAll()} disabled={isBusy} className="w-full">
                          {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="mr-2 h-4 w-4" />
                          )}
                          执行全部
                        </Button>
                        <Button
                          variant="outline"
                          onClick={executeNext}
                          disabled={isBusy}
                          className="w-full"
                        >
                          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SkipForward className="mr-2 h-4 w-4" />}
                          执行下一步
                        </Button>
                      </>
                    )}

                    {isCompleted && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          const reportStep = execution.steps.find(
                            s => s.stepName === 'generate-report' && s.status === 'COMPLETED'
                          )
                          if (reportStep) {
                            const reportArtifact = reportStep.artifacts.find(
                              (a: { artifactKey: string }) => a.artifactKey === 'report-id'
                            )
                            if (reportArtifact?.data) {
                              router.push(`/comprehensive-analysis/report/${reportArtifact.data}`)
                            }
                          }
                        }}
                        className="w-full"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        查看报告
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 右侧：执行监控 */}
          <div className="min-w-0 space-y-6">
            {!selectedIndustry ? (
              <Card className="p-12">
                <div className="text-center text-muted-foreground space-y-3">
                  <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/40" />
                  <p className="text-sm">正在准备待执行的分析流程...</p>
                </div>
              </Card>
            ) : (
              <>
                {/* 左右分栏：数据获取 + AI分析 */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(250px,0.82fr)_minmax(360px,1.18fr)]">
                  {/* 左侧：数据获取流程 */}
                  <Card className="min-w-0 p-4 border-border/40">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                          <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold">数据获取</h4>
                          <p className="text-xs text-muted-foreground">
                            {stats.dataCompleted} / {stats.dataTotal} 完成
                          </p>
                        </div>
                        <div className="text-right text-xs font-medium">
                          {Math.round(stats.dataProgress)}%
                        </div>
                      </div>

                      <Progress value={stats.dataProgress} className="h-1.5" />

                      <div className="space-y-1.5">
                        {stats.dataSteps.map((step, index) => (
                            <DataStepCard key={step.id} step={step} index={index} onView={() => router.push(`/comprehensive-analysis/run/${currentRunId}/step/${encodeURIComponent(step.stepName)}`)} />
                        ))}
                      </div>
                    </div>
                  </Card>

                  {/* 右侧：AI分析流程 */}
                  <Card className="min-w-0 border-primary/20 bg-gradient-to-br from-primary/[0.045] via-card to-card p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950">
                          <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold">AI分析报告</h4>
                          <p className="text-xs text-muted-foreground">
                            {allDataComplete ? `${stats.aiCompleted} / ${stats.aiTotal} 完成` : `${stats.aiTotal} 个步骤已列出，等待数据获取`}
                          </p>
                        </div>
                        <div className="text-right text-xs font-medium">
                          {Math.round(stats.aiProgress)}%
                        </div>
                      </div>

                      <Progress value={stats.aiProgress} className="h-1.5" />

                      {!allDataComplete && (
                        <div className="rounded-lg border border-dashed border-primary/25 bg-primary/[0.035] p-3">
                          <div className="flex items-start gap-2.5">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                            <p className="text-xs leading-5 text-muted-foreground">
                              AI 分析将在数据获取完成后自动开始；下方已展示全部报告步骤及当前状态。
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {stats.aiSteps.map((step, index) => (
                            <AIStepCard key={step.id} step={step} index={index} onView={() => {
                              const reportId = step.artifacts.find((artifact) => artifact.artifactKey === 'report-id')?.data
                              if (step.stepName === 'generate-report' && reportId) {
                                router.push(`/comprehensive-analysis/report/${reportId}`)
                              } else {
                                router.push(`/comprehensive-analysis/run/${currentRunId}/step/${encodeURIComponent(step.stepName)}`)
                              }
                            }} />
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DataStepCard({ step, index, onView }: { step: StepData; index: number; onView: () => void }) {
  const getIcon = () => {
    switch (step.status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      case 'FAILED':
        return <XCircle className="h-3.5 w-3.5 text-destructive" />
      case 'RUNNING':
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
    }
  }

  const getSummary = () => {
    if (step.status !== 'COMPLETED' || !step.artifacts.length) return null

    try {
      for (const artifact of step.artifacts) {
        if (artifact.data) {
          const data = typeof artifact.data === 'string' ? JSON.parse(artifact.data) : artifact.data

          switch (artifact.artifactKey) {
            case 'etf-bindings':
              if (Array.isArray(data)) return `${data.length} 个`
              break
            case 'etf-market-data':
              if (Array.isArray(data)) return `${data.length} 个`
              break
            case 'holdings-summary':
              if (data.totalHoldings) return `${data.uniqueStocks || 0} 只股票`
              break
            case 'companies':
              if (Array.isArray(data)) return `${data.length} 家`
              break
            case 'company-market-data':
              if (Array.isArray(data)) return `${data.length} 家`
              break
            case 'news-sentiment':
              if (data.totalNews !== undefined) return `${data.totalNews} 条`
              break
            case 'market-trends':
              return '完成'
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
        'flex items-start gap-2 rounded-md border p-2 transition-all text-xs',
        step.status === 'COMPLETED' && 'border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20',
        step.status === 'FAILED' && 'border-destructive/30 bg-destructive/5',
        step.status === 'RUNNING' && 'border-primary/30 bg-primary/5',
        step.status === 'PENDING' && 'border-border/40',
        step.status === 'SKIPPED' && 'border-border/30 bg-muted/20 opacity-60'
      )}
    >
      <div className="mt-0.5">{getIcon()}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium">{getStepLabel(step.stepName).title}</div>
          <div className="flex items-center gap-1.5"><span className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px]',
            step.status === 'RUNNING' && 'bg-primary/10 text-primary',
            step.status === 'COMPLETED' && 'bg-green-500/10 text-green-600',
            step.status === 'FAILED' && 'bg-destructive/10 text-destructive',
            step.status === 'PENDING' && 'bg-muted text-muted-foreground',
            step.status === 'SKIPPED' && 'bg-muted text-muted-foreground'
          )}>{getStepStatusLabel(step.status)}</span><Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" disabled={step.status !== 'COMPLETED'} onClick={onView} aria-label={`查看${getStepLabel(step.stepName).title}数据`}><Database className="mr-1 h-3 w-3" />查看数据</Button></div>
        </div>
        {getStepLabel(step.stepName).detail && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {getStepLabel(step.stepName).detail}
          </p>
        )}

        {step.progress && step.status === 'RUNNING' && (
          <div className="mt-1 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{step.progress.message || '正在处理...'}</span>
              <span>{step.progress.current}/{step.progress.total}</span>
            </div>
            <Progress value={step.progress.total > 0 ? (step.progress.current / step.progress.total) * 100 : 0} className="h-1" />
          </div>
        )}

        {step.error && (
          <p className="text-[10px] text-destructive mt-0.5 line-clamp-1">{step.error}</p>
        )}

        {summary && (
          <span className="text-[10px] text-muted-foreground">
            {summary}
          </span>
        )}
      </div>
    </div>
  )
}

function AIStepCard({ step, index, onView }: { step: StepData; index: number; onView: () => void }) {
  const getIcon = () => {
    switch (step.status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      case 'FAILED':
        return <XCircle className="h-3.5 w-3.5 text-destructive" />
      case 'RUNNING':
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
    }
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border p-2 transition-all text-xs',
        step.status === 'COMPLETED' && 'border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20',
        step.status === 'FAILED' && 'border-destructive/30 bg-destructive/5',
        step.status === 'RUNNING' && 'border-primary/30 bg-primary/5',
        step.status === 'PENDING' && 'border-border/40'
      )}
    >
      <div className="mt-0.5">{getIcon()}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium">{getStepLabel(step.stepName).title}</div>
          <div className="flex items-center gap-1.5"><span className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px]',
            step.status === 'RUNNING' && 'bg-primary/10 text-primary',
            step.status === 'COMPLETED' && 'bg-green-500/10 text-green-600',
            step.status === 'FAILED' && 'bg-destructive/10 text-destructive',
            step.status === 'PENDING' && 'bg-muted text-muted-foreground'
          )}>{getStepStatusLabel(step.status)}</span><Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" disabled={step.status !== 'COMPLETED'} onClick={onView} aria-label={`查看${step.stepName === 'generate-report' ? '报告' : '数据'}`}><FileText className="mr-1 h-3 w-3" />{step.stepName === 'generate-report' ? '查看报告' : '查看数据'}</Button></div>
        </div>
        {getStepLabel(step.stepName).detail && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {getStepLabel(step.stepName).detail}
          </p>
        )}

        {step.progress && step.status === 'RUNNING' && (
          <div className="mt-1 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{step.progress.message || '正在处理...'}</span>
              <span>{step.progress.current}/{step.progress.total}</span>
            </div>
            <Progress value={step.progress.total > 0 ? (step.progress.current / step.progress.total) * 100 : 0} className="h-1" />
          </div>
        )}

        {step.error && (
          <p className="text-[10px] text-destructive mt-0.5 line-clamp-1">{step.error}</p>
        )}

        {step.status === 'COMPLETED' && step.duration && (
          <span className="text-[10px] text-muted-foreground">
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
    <Badge variant="outline" className={cn('font-medium text-xs', variant.className)}>
      {variant.label}
    </Badge>
  )
}
