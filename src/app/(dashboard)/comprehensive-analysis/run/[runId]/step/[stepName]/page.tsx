'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Database, FileText, Loader2, ExternalLink, BarChart3, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import ReactMarkdown from 'react-markdown'
import { AnalysisResultView } from '@/components/analysis/AnalysisResultView'
import { PromptDialog } from '@/components/analysis/PromptDialog'
import { analysisFieldLabels, chineseValue } from '@/lib/analysis/chinese-labels'

type Artifact = { artifactKey: string; artifactType: string; data: unknown; size: number }
type Step = { stepName: string; status: string; completedAt: string | null; artifacts: Artifact[] }

const titles: Record<string, string> = {
  'fetch-portfolio': '邮箱持仓与组合风险', 'portfolio-analysis': '私有持仓分析', 'assess-data-quality': '数据质量校验', 'social-report': '社媒报告编辑',
  'fetch-etfs': '定位产业关联指数基金', 'fetch-etf-data': '获取指数基金行情及关键指标', 'fetch-etf-holdings': '解析指数基金成分股持仓',
  'fetch-companies': '提取产业链企业节点', 'fetch-company-data': '采集企业行情数据', 'fetch-news': '采集产业资讯并汇总情绪',
  'fetch-market-snapshot': '分析市场指数与板块资金', 'calculate-market-trends': '计算指数基金与企业趋势指标',
  'market-analysis': '解读指数基金行情与资金趋势', 'news-analysis': '研判资讯事件与市场情绪', 'company-analysis': '分析产业链企业基本面',
  'industry-overview': '整合多维度行业总览', 'investment-advice': '生成综合评分与配置建议', 'generate-report': '汇编并保存综合分析报告',
}

const labels: Record<string, string> = {
  'research-snapshot':'冻结研究快照','research-manifest':'研究证据清单','research-evaluation':'规则复核结果','etf-actions':'指数基金决策',
  'etf-bindings': '关联指数基金', 'etf-market-data': '指数基金行情数据', 'report-content': '分析报告',
  'report-id': '报告编号', companies: '产业链企业', 'company-codes': '企业代码',
  'company-market-data': '企业行情数据', news: '产业资讯', 'market-snapshot': '市场概览',
  'market-trends': '市场趋势', 'industry-info': '产业信息', 'etf-codes': '指数基金代码','data-quality':'数据质量','etf-data-gaps':'行情缺口',
  'etf-holdings':'指数基金持仓','holdings-summary':'持仓摘要','news-articles':'资讯样本','news-events':'归并事件','news-evidence-gaps':'资讯证据缺口',
  'news-trends':'资讯趋势','news-sentiment':'资讯倾向','market-reference-data':'市场参考数据','market-reference-indicators':'市场参考指标',
  'social-report':'一页研究摘要','social-report-status':'一页摘要状态','public-report-validation':'公开报告校验','portfolio-analysis':'私有持仓分析',
  code: '代码', ticker: '代码', name: '名称', description: '描述', weight: '权重',
  bind_type: '绑定类型', bindType: '绑定类型', etf_code: '指数基金代码', etf_name: '指数基金名称',
  change_pct: '涨跌幅', change: '涨跌幅', price: '价格', date: '日期', time: '时间',
  status: '状态', source: '数据来源', total: '总数', count: '数量', success: '成功',
  reasoning: '匹配理由', relevance: '相关度', nodeName: '节点名称', nodeId: '节点编号',
}

const artifactTypes: Record<string, string> = { DATA: '数据', TEXT: '文本', JSON: '结构化数据' }
const statuses: Record<string, string> = { COMPLETED: '已完成', RUNNING: '进行中', PENDING: '等待中', FAILED: '失败', PAUSED: '已暂停' }

function pretty(value: unknown) {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) ?? '（空）'
}

function labelFor(key: string) {
  return labels[key] || analysisFieldLabels[key] || labels[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] || '补充数据'
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '暂无'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  return String(chineseValue(value))
}

function SummaryCard({ label, value, tone = 'text-foreground' }: { label: string; value: unknown; tone?: string }) {
  return <div className="rounded-xl border bg-background/70 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{formatValue(value)}</div></div>
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="mt-1 font-semibold tabular-nums">{formatValue(value)}</div></div>
}

function SectorFlowSummary({ sectors }: { sectors: any[] }) {
  const rows = sectors
    .map((item) => ({
      ...item,
      name: item.sector || item.name,
      flow: Number(item.mainForceNet ?? item.main_force_net ?? item.netFlow ?? item.net_flow ?? item.net_amount ?? item.netAmount ?? item.mainNet ?? 0),
    }))
    .filter((item) => item.name)
  const unique=[...new Map(rows.sort((a,b)=>Math.abs(b.flow)-Math.abs(a.flow)).map(item=>[item.name,item])).values()]
  const inflow = unique.filter((item) => item.flow > 0).sort((a, b) => b.flow - a.flow).slice(0, 10)
  const outflow = unique.filter((item) => item.flow < 0).sort((a, b) => a.flow - b.flow).slice(0, 10)
  if (!rows.length) return <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">暂无板块资金数据</div>
  return <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border p-4"><div className="mb-3 font-medium text-rose-600">净流入板块</div>{inflow.map((item) => <div key={item.name} className="flex justify-between py-1 text-sm"><span>{item.name}</span><span className="font-semibold text-rose-600">+{item.flow.toFixed(2)} 亿</span></div>)}</div><div className="rounded-xl border p-4"><div className="mb-3 font-medium text-emerald-600">净流出板块</div>{outflow.map((item) => <div key={item.name} className="flex justify-between py-1 text-sm"><span>{item.name}</span><span className="font-semibold text-emerald-600">{item.flow.toFixed(2)} 亿</span></div>)}</div></div>
}

function ObjectGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => typeof value !== 'object' || value === null)
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{entries.map(([key, value]) => <SummaryCard key={key} label={labelFor(key)} value={value} tone={key.toLowerCase().includes('risk') ? 'text-amber-600' : ''} />)}</div>
}

function DataTable({ rows, hiddenColumns = [] }: { rows: unknown[]; hiddenColumns?: string[] }) {
  const records = rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
  if (!records.length) return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">暂无明细数据</div>
  const columns = Array.from(new Set(records.flatMap((row) => Object.keys(row))))
    .filter((column) => !hiddenColumns.includes(column) && !hiddenColumns.includes(column.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())))
    .slice(0, 8)
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/40"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">{labelFor(column)}</th>)}</tr></thead><tbody className="divide-y">{records.slice(0, 100).map((row, index) => <tr key={index} className="transition-colors hover:bg-muted/20">{columns.map((column) => <td key={column} className="max-w-[240px] truncate px-3 py-2">{formatValue(row[column])}</td>)}</tr>)}</tbody></table>{records.length > 100 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">仅展示前 100 条，共 {records.length} 条</p>}</div>
}

function VisualArtifact({ artifact }: { artifact: Artifact }) {
  const data = artifact.data
  if (artifact.artifactKey === 'report-content' || artifact.artifactKey.endsWith('analysis') || artifact.artifactKey === 'industry-overview' || artifact.artifactKey === 'investment-advice') {
    return <AnalysisResultView value={data} />
  }
  if (Array.isArray(data)) {
    if (artifact.artifactKey === 'etf-market-data') {
      return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.map((item: any, index) => <div key={item.code || item.ticker || index} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{item.name || item.code || item.ticker || '指数基金'}</div><div className="text-xs text-muted-foreground">{item.code || item.ticker || '暂无代码'}</div></div><Badge variant="outline">{String(chineseValue(item.trend || '震荡'))}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><Metric label="最新价格" value={item.price ?? item.current_price} /><Metric label="涨跌幅" value={item.changePct ?? item.change_pct ?? item.price_change_pct} /><Metric label="20日均线" value={item.keyIndicators?.trend?.ma?.ma20 ?? item.ma20} /><Metric label="相对强弱指标" value={item.keyIndicators?.momentum?.rsi?.rsi12 ?? item.rsi} /><Metric label="波动率" value={item.volatility} /><Metric label="最大回撤" value={item.max_drawdown} /></div></div>)}</div>
    }
    return <DataTable rows={data} hiddenColumns={artifact.artifactKey === 'etf-bindings' ? ['bind_type', 'bindType'] : []} />
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const nestedArrays = Object.entries(record).filter(([, value]) => Array.isArray(value))
    if (artifact.artifactKey === 'market-snapshot' && Array.isArray((record.overview as any)?.indices)) {
      const indices = (record.overview as any).indices
      return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{indices.map((item: any, index: number) => <div key={item.code || index} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{item.name || item.code}</div><div className="text-xs text-muted-foreground">{item.code}</div></div><Badge variant="outline">{item.changePct > 0 ? '上涨' : item.changePct < 0 ? '下跌' : '震荡'}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><Metric label="最新价格" value={item.price} /><Metric label="涨跌幅" value={item.changePct} /><Metric label="20日均线" value={item.indicators?.trend?.ma?.ma20} /><Metric label="相对强弱指标" value={item.indicators?.momentum?.rsi?.rsi12} /><Metric label="指数平滑异同移动平均线" value={item.indicators?.trend?.macd?.macd} /><Metric label="成交量比" value={item.indicators?.volume?.volumeRatio} /></div></div>)}</div><SectorFlowSummary sectors={Array.isArray(record.sectors) ? record.sectors : []} /></div>
    }
    return <div className="space-y-4"><ObjectGrid data={record} />{nestedArrays.map(([key, value]) => <section key={key}><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" />{labelFor(key)}</h3><DataTable rows={value as unknown[]} hiddenColumns={artifact.artifactKey === 'etf-bindings' ? ['bind_type', 'bindType'] : []} /></section>)}</div>
  }
  return <div className="rounded-lg bg-muted/30 p-4 text-sm">{formatValue(data)}</div>
}

export default function StepResultPage() {
  const params = useParams<{ runId: string; stepName: string }>()
  const router = useRouter()
  const [step, setStep] = useState<Step | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/analysis/comprehensive/${params.runId}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('读取流程结果失败')))
      .then((run) => setStep(run.steps.find((item: Step) => item.stepName === decodeURIComponent(params.stepName)) || null))
      .catch((reason) => setError(reason instanceof Error ? reason.message : '读取流程结果失败'))
      .finally(() => setLoading(false))
  }, [params.runId, params.stepName])

  const reportId = useMemo(() => {
    const value = step?.artifacts.find((artifact) => artifact.artifactKey === 'report-id')?.data
    return typeof value === 'string' ? value : value == null ? '' : String(value)
  }, [step])

  const visibleArtifacts = useMemo(
    () => (step?.artifacts || []).filter((artifact) => !['etf-codes', 'industry-info', 'ai-prompt'].includes(artifact.artifactKey)),
    [step]
  )

  if (loading) return <div className="flex min-h-[400px] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />加载结果中...</div>
  const analysisUrl = `/comprehensive-analysis?runId=${encodeURIComponent(params.runId)}`

  if (error || !step) return <div className="space-y-4 p-6"><Button variant="ghost" onClick={() => router.push(analysisUrl)}><ArrowLeft className="mr-2 h-4 w-4" />返回综合分析</Button><Card><CardContent className="p-8 text-center text-muted-foreground">{error || '未找到该子流程结果'}</CardContent></Card></div>

  return <div className="space-y-6 p-6">
    <Button variant="ghost" onClick={() => router.push(analysisUrl)}><ArrowLeft className="mr-2 h-4 w-4" />返回综合分析</Button>
    <header className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" /><Badge variant="secondary">步骤结果</Badge><Badge variant="outline">{statuses[step.status] || step.status}</Badge></div><h1 className="mt-3 text-2xl font-bold">{titles[step.stepName] || step.stepName}</h1><p className="mt-1 text-sm text-muted-foreground">查看该节点实际输出，核对数据是否符合预期。</p></div>
      <div className="flex gap-2">{step.artifacts.some(artifact => artifact.artifactKey === 'ai-prompt') && <PromptDialog artifacts={step.artifacts} />}{reportId && <Button onClick={() => router.push(`/comprehensive-analysis/report/${reportId}`)}><FileText className="mr-2 h-4 w-4" />打开完整报告</Button>}</div>
    </header>
    {visibleArtifacts.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">该步骤没有可展示的产物。</CardContent></Card> : <div className="grid gap-4">{visibleArtifacts.map((artifact) => <Card key={artifact.artifactKey}><CardHeader className="flex flex-row items-center justify-between space-y-0"><div className="flex items-center gap-2"><CardTitle className="text-base">{labelFor(artifact.artifactKey)}</CardTitle><Badge variant="outline" className="text-[10px]">{artifactTypes[artifact.artifactType] || '数据'}</Badge></div><span className="text-xs text-muted-foreground">已解析展示</span></CardHeader><CardContent className="space-y-4"><VisualArtifact artifact={artifact} />{artifact.artifactKey === 'report-id' && <Button variant="link" className="px-0" onClick={() => router.push(`/comprehensive-analysis/report/${reportId}`)}>查看报告 <ExternalLink className="ml-1 h-3 w-3" /></Button>}<details className="group rounded-lg border bg-muted/10"><summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />查看原始数据（调试用）</summary><pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t bg-muted/30 p-3 font-mono text-xs leading-5">{pretty(artifact.data)}</pre></details></CardContent></Card>)}</div>}
  </div>
}
