'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, BarChart3, Building2, CheckCircle2, FileText, Loader2, Newspaper, PieChart, RefreshCw, Sparkles, TrendingUp } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

type Stage = 'idle' | 'loading' | 'success' | 'error'
type Industry = { id: string; name: string }
type ModuleState = { status: Stage; detail?: string; result?: Record<string, unknown> }
type CompanySource = 'graph' | 'etf_holdings'
type Advice = {
  industry: string
  strategy: string
  summary: string
  riskWarning?: string
  recommendations: Array<{ action: 'buy' | 'sell' | 'hold' | 'watch'; target: string; targetType: 'etf' | 'index'; reason: string; allocation?: number; targetPrice?: number }>
}
type SavedReport = { id: string; title?: string; createdAt: string; industryName: string }

const initialModules = (): Record<string, ModuleState> => ({
  market: { status: 'idle' },
  news: { status: 'idle' },
  company: { status: 'idle' },
  portfolio: { status: 'idle' },
})

const stageMeta = {
  market: { label: '大盘分析', detail: '匹配 ETF、指数并计算趋势指标', icon: TrendingUp },
  news: { label: '资讯分析', detail: '整理近期资讯与产业链影响', icon: Newspaper },
  company: { label: '企业分析', detail: '汇总企业行情、财报与公告', icon: Building2 },
  portfolio: { label: '持仓画像', detail: '读取默认投资组合及当前持仓', icon: PieChart },
} as const

function parseError(payload: Record<string, unknown>, fallback: string) {
  return typeof payload.error === 'string' ? payload.error : fallback
}

function formatReportDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '日期未知' : date.toLocaleString('zh-CN')
}

export function InvestmentAdvice() {
  const router = useRouter()
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState('')
  const [modules, setModules] = useState(initialModules)
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [selectedReportId, setSelectedReportId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced')
  const [investmentHorizon, setInvestmentHorizon] = useState<'short' | 'medium' | 'long'>('short')
  const [companySource, setCompanySource] = useState<CompanySource>('etf_holdings')

  useEffect(() => {
    fetch('/api/graph/industries')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.success === false) throw new Error(parseError(payload, '加载产业列表失败'))
        const list = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload.industries) ? payload.industries : [])
        setIndustries(list)
        if (list[0]) setSelectedIndustry(list[0].id)
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载产业列表失败'))
  }, [])

  useEffect(() => {
    if (!selectedIndustry) return
    let cancelled = false
    fetch(`/api/analysis/reports?industryId=${encodeURIComponent(selectedIndustry)}&type=comprehensive&limit=20`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.success === false) throw new Error(parseError(payload, '读取历史综合报告失败'))
        if (cancelled) return
        const reports = Array.isArray(payload.reports) ? payload.reports : []
        setSavedReports(reports)
        setSelectedReportId(reports[0]?.id || '')
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '读取历史综合报告失败') })
    return () => { cancelled = true }
  }, [selectedIndustry])

  const selected = industries.find((industry) => industry.id === selectedIndustry)
  const completedCount = Object.values(modules).filter((module) => module.status === 'success').length

  const runComprehensiveAnalysis = async () => {
    if (!selected) return
    setRunning(true)
    setError(null)
    setAdvice(null)
    setReportId(null)
    setModules({ market: { status: 'loading' }, news: { status: 'loading' }, company: { status: 'loading' }, portfolio: { status: 'loading' } })

    try {
      const response = await fetch(`/api/analysis/industry/${encodeURIComponent(selected.id)}/daily-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industryName: selected.name,
          periodDays: 90,
          riskTolerance,
          investmentHorizon,
          companySource,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) throw new Error(parseError(payload, '每日投资行动报告生成失败'))

      const modulePayload = payload.modules && typeof payload.modules === 'object' ? payload.modules as Record<string, Record<string, unknown>> : {}
      setModules({
        market: { status: modulePayload.market?.success === false ? 'error' : 'success', detail: typeof modulePayload.market?.error === 'string' ? modulePayload.market.error : undefined, result: payload.data?.market },
        news: { status: modulePayload.news?.success === false ? 'error' : 'success', detail: typeof modulePayload.news?.error === 'string' ? modulePayload.news.error : undefined, result: payload.data?.news },
        company: { status: modulePayload.company?.success === false ? 'error' : 'success', detail: typeof modulePayload.company?.error === 'string' ? modulePayload.company.error : typeof modulePayload.company?.warning === 'string' ? modulePayload.company.warning : undefined, result: payload.data?.company },
        portfolio: { status: modulePayload.portfolio?.success === false ? 'error' : 'success', result: payload.data?.portfolio },
      })

      const generatedAdvice = payload.data?.advice as Advice | undefined
      if (!generatedAdvice) throw new Error('报告已生成，但缺少结构化投资行动结果')
      const savedReport = {
        id: String(payload.report?.id || ''),
        title: String(payload.report?.title || `${selected.name} 每日投资行动报告`),
        createdAt: String(payload.report?.createdAt || new Date().toISOString()),
        industryName: selected.name,
      }
      if (!savedReport.id) throw new Error('报告已生成，但未返回报告编号')
      setAdvice(generatedAdvice)
      setReportId(savedReport.id)
      setSavedReports((current) => [savedReport, ...current.filter((item) => item.id !== savedReport.id)].slice(0, 20))
      setSelectedReportId(savedReport.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '综合分析失败，请重试')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Alert className="border-primary/20 bg-primary/[0.03]">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <AlertTitle>综合分析工作台</AlertTitle>
        <AlertDescription>系统会分别完成大盘、资讯和企业分析，再结合默认投资组合，从资深投资分析师视角生成个性化建议。报告仅供研究参考，不构成投资承诺。</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> 综合投资分析</CardTitle>
              <CardDescription className="mt-1">一次触发四类数据采集，完成后自动生成结合持仓的投资建议报告</CardDescription>
            </div>
            <Button onClick={runComprehensiveAnalysis} disabled={running || !selectedIndustry} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : advice ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {running ? '分析中...' : advice ? '重新生成报告' : '开始综合分析'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-1"><label className="text-sm font-medium" htmlFor="analysis-industry">分析领域</label><Select value={selectedIndustry} onValueChange={(value) => { setSelectedIndustry(value || ''); setAdvice(null); setModules(initialModules()) }}><SelectTrigger id="analysis-industry"><SelectValue placeholder="选择产业领域">{selected?.name || '选择产业领域'}</SelectValue></SelectTrigger><SelectContent>{industries.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium">风险偏好</label><Select value={riskTolerance} onValueChange={(value) => setRiskTolerance(value as typeof riskTolerance)}><SelectTrigger><SelectValue>{riskTolerance === 'conservative' ? '保守型' : riskTolerance === 'aggressive' ? '进取型' : '平衡型'}</SelectValue></SelectTrigger><SelectContent><SelectItem value="conservative">保守型</SelectItem><SelectItem value="balanced">平衡型</SelectItem><SelectItem value="aggressive">进取型</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium">投资周期</label><Select value={investmentHorizon} onValueChange={(value) => setInvestmentHorizon(value as typeof investmentHorizon)}><SelectTrigger><SelectValue>{investmentHorizon === 'short' ? '短期（1-3个月）' : investmentHorizon === 'long' ? '长期（1年以上）' : '中期（3-12个月）'}</SelectValue></SelectTrigger><SelectContent><SelectItem value="short">短期（1-3个月）</SelectItem><SelectItem value="medium">中期（3-12个月）</SelectItem><SelectItem value="long">长期（1年以上）</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium" htmlFor="company-source">企业数据来源</label><Select value={companySource} onValueChange={(value) => { setCompanySource(value as CompanySource); setAdvice(null); setModules(initialModules()) }}><SelectTrigger id="company-source"><SelectValue>{companySource === 'etf_holdings' ? 'ETF持仓' : '知识图谱'}</SelectValue></SelectTrigger><SelectContent><SelectItem value="graph">知识图谱</SelectItem><SelectItem value="etf_holdings">ETF持仓</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">ETF持仓将从本次市场筛选标的提取底层企业并去重。</p></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="综合分析流程状态">
            {Object.entries(stageMeta).map(([key, meta]) => { const state = modules[key]; const Icon = meta.icon; return <div key={key} className={`rounded-lg border p-3 transition-colors ${state.status === 'loading' ? 'border-primary/40 bg-primary/5' : state.status === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' : state.status === 'error' ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/20'}`}><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${state.status === 'success' ? 'text-emerald-600' : 'text-primary'}`} aria-hidden="true" /><span className="text-sm font-medium">{meta.label}</span></div>{state.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : state.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : state.status === 'error' ? <AlertCircle className="h-4 w-4 text-destructive" /> : <span className="text-xs text-muted-foreground">待执行</span>}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{state.detail || meta.detail}</p></div> })}
          </div>
          {running && <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground" role="status" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" />正在聚合分析结果并生成投资建议（已完成 {completedCount}/4 个数据模块）</div>}
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {(advice || savedReports.length > 0) && <Card className="border-primary/20"><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />查看历史报告</CardTitle><CardDescription className="mt-1">选择已保存的综合报告，进入完整报告查看结构化结论、图表和明细数据</CardDescription></div><Badge variant="secondary">{savedReports.length} 份报告</Badge></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button className="shrink-0 gap-2" onClick={() => (reportId || selectedReportId) && router.push(`/analysis/comprehensive-report/${reportId || selectedReportId}`)} disabled={!reportId && !selectedReportId}><FileText className="h-4 w-4" />查看完整报告</Button><div className="min-w-0 flex-1"><Select value={selectedReportId} onValueChange={(value) => { const id = value || ''; setSelectedReportId(id); setReportId(id) }}><SelectTrigger aria-label="选择历史报告"><SelectValue placeholder="选择历史报告">{savedReports.find((saved) => saved.id === selectedReportId) ? formatReportDate(savedReports.find((saved) => saved.id === selectedReportId)!.createdAt) : undefined}</SelectValue></SelectTrigger><SelectContent>{savedReports.map((saved) => <SelectItem key={saved.id} value={saved.id}>{formatReportDate(saved.createdAt)}</SelectItem>)}</SelectContent></Select></div></div></CardContent></Card>}

      {!advice && !running && !error && <div className="rounded-lg border border-dashed py-12 text-center"><Sparkles className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">选择领域后开始综合分析</p><p className="mt-1 text-xs text-muted-foreground">系统将按模块展示进度，并在最后生成个性化投资建议</p></div>}
      {running && <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>}
    </div>
  )
}
