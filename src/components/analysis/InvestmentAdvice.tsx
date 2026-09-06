'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, BarChart3, Building2, Check, Circle, Clock3, FileText, History, Loader2, Newspaper, PieChart, Play, RefreshCw, Settings2, Sparkles, TrendingUp } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useMarketContext } from '@/contexts/MarketContext'
import { localizeUserFacingText } from '@/lib/analysis/report-contract'
import { ANALYSIS_PIPELINE_MODULES, ANALYSIS_PIPELINE_STEPS, DEFAULT_AI_MODULES, type AnalysisPipelineModule, type AnalysisPipelineStep } from '@/config/comprehensive-analysis-flow'

type ModuleKey = AnalysisPipelineModule
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
type FlowStep = AnalysisPipelineStep
type Industry = { id: string; name?: string; code?: string }
type Report = { id: string; title?: string; createdAt: string }

const MODULES: Array<{ key: ModuleKey; label: string; detail: string; icon: typeof TrendingUp }> = ANALYSIS_PIPELINE_MODULES.map((module) => ({
  ...module,
  icon: { market: TrendingUp, news: Newspaper, company: Building2, portfolio: PieChart, overview: BarChart3 }[module.key],
}))
const FLOW_STEPS = ANALYSIS_PIPELINE_STEPS

function initialSteps() { return Object.fromEntries(FLOW_STEPS.map((step) => [step.id, 'pending'])) as Record<string, StepStatus> }
function statusText(status: StepStatus) { return status === 'running' ? '执行中' : status === 'completed' ? '已完成' : status === 'failed' ? '异常' : status === 'skipped' ? '已跳过' : '待执行' }

const RISK_LABELS: Record<string, string> = { conservative: '保守型', balanced: '平衡型', aggressive: '进取型' }
const HORIZON_LABELS: Record<string, string> = { short: '短期（1-3个月）', medium: '中期（3-12个月）', long: '长期（1年以上）' }
const SOURCE_LABELS: Record<string, string> = { etf_holdings: 'ETF 持仓', graph: '知识图谱' }
const INDUSTRY_LABELS: Record<string, string> = { semiconductor: '半导体', ai_hardware: 'AI算力硬件', robotics: '机器人', new_energy_vehicle: '新能源车', battery: '电池储能', photovoltaic: '光伏产业', wind_power: '风电产业', medical_device: '医疗器械' }

function displayLabel(value: unknown, fallback: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  const normalized = raw.toLowerCase().replace(/-/g, '_')
  return INDUSTRY_LABELS[normalized] || SOURCE_LABELS[normalized] || RISK_LABELS[normalized] || HORIZON_LABELS[normalized] || (normalized === 'blanced' ? '平衡型' : localizeUserFacingText(raw.replace(/_/g, ' ')))
}

function industryLabel(item: Industry, index: number) {
  const name = displayLabel(item.name, '')
  const code = displayLabel(item.code, '')
  const id = displayLabel(item.id, '')
  const nameLooksLikeCode = !name || /^(industry[_-]|[a-z]+[_-])[a-z0-9_-]*$/i.test(String(item.name))
  return nameLooksLikeCode ? (code || id || `分析领域 ${index + 1}`) : name
}

function ParameterSelection({
  industries,
  selectedIndustry,
  setSelectedIndustry,
  moduleCount,
  setModuleCount,
  riskTolerance,
  setRiskTolerance,
  investmentHorizon,
  setInvestmentHorizon,
  companySource,
  setCompanySource,
  running,
  resetAnalysis,
}: {
  industries: Industry[]
  selectedIndustry: string
  setSelectedIndustry: (value: string) => void
  moduleCount: number
  setModuleCount: (value: number) => void
  riskTolerance: string
  setRiskTolerance: (value: string) => void
  investmentHorizon: string
  setInvestmentHorizon: (value: string) => void
  companySource: string
  setCompanySource: (value: string) => void
  running: boolean
  resetAnalysis: () => void
}) {
  const selectedIndustryLabel = industries.find((item) => item.id === selectedIndustry)
  const selectedIndustryText = selectedIndustryLabel ? industryLabel(selectedIndustryLabel, industries.indexOf(selectedIndustryLabel)) : ''

  return <Card className="flex h-full flex-col overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.04] shadow-sm">
    <CardHeader className="border-b bg-background/45 pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><Settings2 className="h-5 w-5 text-primary" />参数选择</CardTitle><CardDescription className="mt-1">配置分析对象、覆盖范围与风险偏好。</CardDescription></div><Badge variant="secondary" className="shrink-0">分析配置</Badge></div></CardHeader>
    <CardContent className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.35fr)]">
      <div className="space-y-1.5 lg:row-span-2"><label className="text-sm font-medium" htmlFor="analysis-industry">分析领域</label><Select value={selectedIndustry} onValueChange={(value) => { if (value) { setSelectedIndustry(value); resetAnalysis() } }} disabled={running}><SelectTrigger id="analysis-industry" className="h-10 w-full bg-background"><SelectValue placeholder="选择产业领域">{selectedIndustryText || '选择产业领域'}</SelectValue></SelectTrigger><SelectContent>{industries.map((item, index) => <SelectItem key={item.id} value={item.id}>{industryLabel(item, index)}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3 lg:h-full lg:grid-rows-2">
        <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="analysis-scope">执行范围</label><Select value={String(moduleCount)} onValueChange={(value) => { if (value) { setModuleCount(Number(value)); resetAnalysis() } }} disabled={running}><SelectTrigger id="analysis-scope" className="h-10 w-full bg-background"><SelectValue>{`前 ${moduleCount} 个模块`}</SelectValue></SelectTrigger><SelectContent>{MODULES.map((module, index) => <SelectItem key={module.key} value={String(index + 1)}>{`前 ${index + 1} 个模块：${module.label}`}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="analysis-risk">风险偏好</label><Select value={riskTolerance} onValueChange={(value) => value && setRiskTolerance(value)} disabled={running}><SelectTrigger id="analysis-risk" className="h-10 w-full bg-background"><SelectValue>{displayLabel(riskTolerance, '请选择风险偏好')}</SelectValue></SelectTrigger><SelectContent><SelectItem value="conservative">保守型</SelectItem><SelectItem value="balanced">平衡型</SelectItem><SelectItem value="aggressive">进取型</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="analysis-horizon">投资周期</label><Select value={investmentHorizon} onValueChange={(value) => value && setInvestmentHorizon(value)} disabled={running}><SelectTrigger id="analysis-horizon" className="h-10 w-full bg-background"><SelectValue>{displayLabel(investmentHorizon, '请选择投资周期')}</SelectValue></SelectTrigger><SelectContent><SelectItem value="short">短期（1-3个月）</SelectItem><SelectItem value="medium">中期（3-12个月）</SelectItem><SelectItem value="long">长期（1年以上）</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="analysis-source">企业数据来源</label><Select value={companySource} onValueChange={(value) => value && setCompanySource(value)} disabled={running}><SelectTrigger id="analysis-source" className="h-10 w-full bg-background"><SelectValue>{displayLabel(companySource, '请选择数据来源')}</SelectValue></SelectTrigger><SelectContent><SelectItem value="etf_holdings">ETF 持仓</SelectItem><SelectItem value="graph">知识图谱</SelectItem></SelectContent></Select></div>
      </div>
    </CardContent>
  </Card>
}

function ReportAccess({ report, history, historyId, setHistoryId, openReport, openHistory }: { report: Report | null; history: Report[]; historyId: string; setHistoryId: (value: string) => void; openReport: () => void; openHistory: () => void }) {
  const selectedHistory = history.find((item) => item.id === historyId)
  const selectedHistoryText = selectedHistory ? `${new Date(selectedHistory.createdAt).toLocaleDateString('zh-CN')} · ${displayLabel(selectedHistory.title, '综合投资分析报告')}` : ''
  return <Card className="h-full overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.08] via-card to-card shadow-sm"><CardHeader className="border-b bg-background/45 pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" />查看完整报告</CardTitle><CardDescription className="mt-1">查看本次生成结果，或快速打开历史报告。</CardDescription></div><History className="h-5 w-5 text-primary" /></div></CardHeader><CardContent className="flex h-[calc(100%-85px)] flex-col gap-4 p-4"><Button onClick={openReport} disabled={!report} variant={report ? 'default' : 'outline'} className="h-10 w-full gap-2"><FileText className="h-4 w-4" />查看完整报告</Button><div className="mt-auto space-y-2 border-t pt-3"><label className="flex items-center gap-2 text-sm font-medium" htmlFor="analysis-history"><History className="h-4 w-4 text-primary" />历史报告</label><div className="flex flex-col gap-2 sm:flex-row"><Select value={historyId} onValueChange={(value) => value && setHistoryId(value)}><SelectTrigger id="analysis-history" className="h-10 w-full min-w-0 flex-1 bg-background"><SelectValue placeholder="选择历史报告">{selectedHistoryText || '选择历史报告'}</SelectValue></SelectTrigger><SelectContent>{history.map((item) => <SelectItem key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleDateString('zh-CN')} · {displayLabel(item.title, '综合投资分析报告')}</SelectItem>)}</SelectContent></Select><Button variant="outline" className="h-10 shrink-0 gap-2 whitespace-nowrap px-3" disabled={!historyId} onClick={openHistory}>查看历史报告</Button></div></div></CardContent></Card>
}

function FlowModuleCard({
  module,
  index,
  steps,
  statuses,
  stepErrors,
  stepDetails,
  aiEnabled,
}: {
  module: typeof MODULES[number]
  index: number
  steps: FlowStep[]
  statuses: Record<string, StepStatus>
  stepErrors: Record<string, string>
  stepDetails: Record<string, string>
  aiEnabled: boolean
}) {
  return <section className={cn('rounded-xl border bg-background/70', module.key === 'overview' && 'border-primary/30 bg-primary/[0.025]')} aria-labelledby={`module-${module.key}`}>
    <div className="border-b px-4 py-4">
      <div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span><module.icon className="h-4 w-4 text-primary" /></div>
      <h3 id={`module-${module.key}`} className="mt-3 text-base font-semibold">{module.label}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{module.detail}</p>
    </div>
    <div className="divide-y">
      {steps.map((step, stepIndex) => {
        const status = statuses[step.id]
        return <div key={step.id} className={cn('min-h-[98px] p-3.5 transition-colors', status === 'running' && 'bg-primary/[0.05]', status === 'failed' && 'bg-destructive/[0.05]', status === 'skipped' && 'bg-muted/30')}>
          <div className="flex items-start gap-2.5">
            <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]', status === 'completed' && 'border-emerald-500 bg-emerald-500 text-white', status === 'running' && 'border-primary text-primary', status === 'failed' && 'border-destructive bg-destructive text-white', status === 'skipped' && 'border-muted-foreground/40 text-muted-foreground')}>
              {status === 'completed' ? <Check className="h-3.5 w-3.5" /> : status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status === 'failed' ? <AlertCircle className="h-3.5 w-3.5" /> : status === 'skipped' ? <span>–</span> : <span>{stepIndex + 1}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5"><p className="text-sm font-medium leading-5">{step.label}</p><span className={cn('text-[11px]', status === 'completed' ? 'text-emerald-600' : status === 'failed' ? 'text-destructive' : status === 'running' ? 'text-primary' : 'text-muted-foreground')}>{statusText(status)}</span></div>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{stepErrors[step.id] || stepDetails[step.id] || (status === 'skipped' ? '已按统一配置关闭 AI 分析报告' : step.detail)}</p>
            </div>
          </div>
        </div>
      })}
    </div>
  </section>
}

export function InvestmentAdvice() {
  const router = useRouter()
  const { indices } = useMarketContext()
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState('')
  const [moduleCount, setModuleCount] = useState(5)
  const [riskTolerance, setRiskTolerance] = useState('balanced')
  const [investmentHorizon, setInvestmentHorizon] = useState('short')
  const [companySource, setCompanySource] = useState('graph')
  const [aiModules, setAiModules] = useState<Record<ModuleKey, boolean>>(DEFAULT_AI_MODULES)
  const [steps, setSteps] = useState(initialSteps)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stepError, setStepError] = useState<Record<string, string>>({})
  const [stepDetails, setStepDetails] = useState<Record<string, string>>({})
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<Report[]>([])
  const [historyId, setHistoryId] = useState('')
  const [preferencesReady, setPreferencesReady] = useState(false)
  const preferenceKey = 'ai-invest:comprehensive-analysis:preferences'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}') as Record<string, unknown>
        if (typeof saved.selectedIndustry === 'string') setSelectedIndustry(saved.selectedIndustry)
        if (typeof saved.moduleCount === 'number') setModuleCount(Math.min(Math.max(saved.moduleCount, 1), MODULES.length))
        if (typeof saved.riskTolerance === 'string') setRiskTolerance(saved.riskTolerance)
        if (typeof saved.investmentHorizon === 'string') setInvestmentHorizon(saved.investmentHorizon)
        if (typeof saved.companySource === 'string') setCompanySource(saved.companySource)
        if (typeof saved.generateAiReport === 'boolean') setAiModules(Object.fromEntries(MODULES.map((module) => [module.key, saved.generateAiReport])) as Record<ModuleKey, boolean>)
      } catch { /* ignore malformed local preferences */ }
      setPreferencesReady(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => { fetch('/api/graph/industries').then((response) => response.json()).then((payload) => { const list = Array.isArray(payload.data) ? payload.data : []; setIndustries(list); if (list[0] && !selectedIndustry) setSelectedIndustry(list[0].id) }).catch(() => setError('产业列表加载失败，请刷新后重试')) }, [selectedIndustry])
  useEffect(() => { if (!preferencesReady) return; localStorage.setItem(preferenceKey, JSON.stringify({ selectedIndustry, moduleCount, riskTolerance, investmentHorizon, companySource, generateAiReport: Object.values(aiModules).every(Boolean) })) }, [preferencesReady, selectedIndustry, moduleCount, riskTolerance, investmentHorizon, companySource, aiModules])
  useEffect(() => {
    let cancelled = false
    setHistoryId('')
    if (!selectedIndustry) {
      setHistory([])
      return () => { cancelled = true }
    }

    fetch(`/api/analysis/reports?industryId=${encodeURIComponent(selectedIndustry)}&type=comprehensive&limit=20`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return
        const list = Array.isArray(payload.reports) ? payload.reports : []
        setHistory(list)
      })
      .catch(() => {
        if (!cancelled) setHistory([])
      })

    return () => { cancelled = true }
  }, [selectedIndustry])

  const activeModules = MODULES.slice(0, moduleCount)
  const groupedSteps = useMemo(() => Object.fromEntries(MODULES.slice(0, moduleCount).map((module) => [module.key, FLOW_STEPS.filter((step) => step.module === module.key)])) as Record<ModuleKey, FlowStep[]>, [moduleCount])
  const finishedCount = FLOW_STEPS.filter((step) => activeModules.some((module) => module.key === step.module) && ['completed', 'skipped'].includes(steps[step.id])).length
  const selected = industries.find((industry) => industry.id === selectedIndustry)

  const resetAnalysis = () => { setReport(null); setError(null); setStepError({}); setStepDetails({}); setSteps(initialSteps()) }
  const openReport = () => { if (report) router.push(`/analysis/comprehensive-report/${report.id}`) }
  const openHistory = () => { if (historyId) router.push(`/analysis/comprehensive-report/${historyId}`) }

  const run = async () => {
    if (!selected) return
    setRunning(true); setError(null); setReport(null); setStepError({}); setStepDetails({}); setSteps(initialSteps())
    try {
      const generateAiReport = Object.values(aiModules).every(Boolean)
      const response = await fetch(`/api/analysis/industry/${encodeURIComponent(selected.id)}/pipeline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ industryName: industryLabel(selected, industries.indexOf(selected)), moduleCount, riskTolerance, investmentHorizon, companySource, generateAiReport, aiModules, marketIndexCodes: indices.map((item) => item.code).filter(Boolean) }) })
      if (!response.ok || !response.body) throw new Error('分析链路无法启动')
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      const handleEvent = (line: string) => {
        if (!line.trim()) return
        const event = JSON.parse(line) as { type: string; stage?: ModuleKey; stepId?: string; status?: 'started' | 'completed' | 'failed' | 'skipped'; error?: string; detail?: string; report?: Report }
        if (event.type === 'step' && event.stepId) {
          setSteps((current) => ({ ...current, [event.stepId!]: event.status === 'failed' || event.error ? 'failed' : event.status === 'started' ? 'running' : event.status === 'skipped' ? 'skipped' : 'completed' }))
          if (event.error) setStepError((current) => ({ ...current, [event.stepId!]: event.error! }))
          if (event.detail) setStepDetails((current) => ({ ...current, [event.stepId!]: event.detail! }))
        }
        if (event.type === 'report' && event.report) {
          setReport(event.report)
          setHistory((current) => [event.report!, ...current.filter((item) => item.id !== event.report!.id)])
        }
        if (event.type === 'module' && event.stage === 'overview' && event.report) {
          setReport(event.report)
          setHistory((current) => [event.report!, ...current.filter((item) => item.id !== event.report!.id)])
        }
        if (event.type === 'complete') {
          // Pipeline 完成，确保最后一次报告已设置
          // 如果前面的 'report' 事件已经设置了 report，这里不会覆盖
        }
        if (event.type === 'pipeline_error') {
          setError(event.error || '分析链路异常，请根据标红步骤定位')
          if (event.stepId) {
            setSteps((current) => ({ ...current, [event.stepId!]: 'failed' }))
            setStepError((current) => ({ ...current, [event.stepId!]: event.error || '该步骤执行失败' }))
          }
        }
      }
      while (true) {
        const { value, done } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) handleEvent(line)
      }
      buffer += decoder.decode()
      if (buffer.trim()) handleEvent(buffer)

      // 流读取完成后，如果没有报告但也没有错误，尝试重新获取最新报告
      if (!report && !error) {
        try {
          const response = await fetch(`/api/analysis/reports?industryId=${encodeURIComponent(selectedIndustry)}&type=comprehensive&limit=1`)
          const data = await response.json()
          const reports = Array.isArray(data.reports) ? data.reports : Array.isArray(data) ? data : []
          if (reports.length > 0) {
            setReport(reports[0])
            setHistory((current) => [reports[0], ...current.filter((item) => item.id !== reports[0].id)])
          }
        } catch {
          // 静默失败，不影响主流程
        }
      }
    } catch (runError) { setError(runError instanceof Error ? runError.message : '分析失败，请重试') } finally { setRunning(false) }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      {/* 页面标题区域 */}
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary">
            <Sparkles className="h-4 w-4" />
            智能投研流水线
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">综合分析</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            横向查看各分析模块，纵向追踪每个模块的实际子流程。所有状态按数据链路实时更新。
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-2 px-3 py-1.5">
          <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
          串行执行
        </Badge>
      </div>

      {/* 参数选择和报告访问 */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
        <ParameterSelection
          industries={industries}
          selectedIndustry={selectedIndustry}
          setSelectedIndustry={setSelectedIndustry}
          moduleCount={moduleCount}
          setModuleCount={setModuleCount}
          riskTolerance={riskTolerance}
          setRiskTolerance={setRiskTolerance}
          investmentHorizon={investmentHorizon}
          setInvestmentHorizon={setInvestmentHorizon}
          companySource={companySource}
          setCompanySource={setCompanySource}
          running={running}
          resetAnalysis={resetAnalysis}
        />
        <ReportAccess
          report={report}
          history={history}
          historyId={historyId}
          setHistoryId={setHistoryId}
          openReport={openReport}
          openHistory={openHistory}
        />
      </div>

      {/* 执行流程卡片 */}
      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="border-b bg-muted/10">
          <div className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Play className="h-5 w-5 text-primary" />
                执行流程
              </CardTitle>
              <CardDescription>
                横向为分析模块，纵向为模块子流程；进度与关键数据会实时更新。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm shadow-sm">
                <span>生成AI报告</span>
                <Switch
                  checked={Object.values(aiModules).every(Boolean)}
                  onCheckedChange={(checked) => {
                    setAiModules(Object.fromEntries(MODULES.map((module) => [module.key, checked])) as Record<ModuleKey, boolean>)
                    resetAnalysis()
                  }}
                  disabled={running}
                  aria-label="统一生成AI报告开关"
                />
              </label>
              <Button
                onClick={run}
                disabled={running || !selectedIndustry}
                className="h-10 gap-2 px-5"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : report ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {running ? '执行中' : report ? '重新执行' : '开始执行'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              已完成 {finishedCount} /{' '}
              {FLOW_STEPS.filter((step) => activeModules.some((module) => module.key === step.module)).length} 个子流程
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {running ? '正在接收实时进度' : report ? '报告已持续落盘' : '等待开始'}
            </span>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[980px] grid-cols-5 gap-3">
              {activeModules.map((module, moduleIndex) => (
                <FlowModuleCard
                  key={module.key}
                  module={module}
                  index={moduleIndex}
                  steps={groupedSteps[module.key]}
                  statuses={steps}
                  stepErrors={stepError}
                  stepDetails={stepDetails}
                  aiEnabled={aiModules[module.key]}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>执行出现异常</AlertTitle>
          <AlertDescription>
            {error} 请根据标红的子流程检查对应数据源后重新执行。
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
