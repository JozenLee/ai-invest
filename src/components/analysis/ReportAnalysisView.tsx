import { auditClaim, type EvidenceClaim } from '@/lib/analysis/evidence-references'
import type { Evidence } from '@/lib/research/contracts'
import remarkGfm from 'remark-gfm'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Binoculars,
  Building2,
  CircleAlert,
  Compass,
  FileCheck2,
  GitBranch,
  Landmark,
  ListChecks,
  Network,
  Scale,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import { analysisFieldLabels, chineseNarrative, chineseValue } from '@/lib/analysis/chinese-labels'

type Row = Record<string, unknown>

const labels: Record<string, string> = {
  recommendation: '建议方向', unheld: '未持有', held: '已持有', reason: '判断依据',
  positiveSignals: '支持信号', negativeSignals: '反向信号', dataIssues: '数据限制', action: '建议动作', waitFor: '等待确认',
  operatingEvidence: '经营证据', graphPath: '产业链位置', selectionReason: '入选依据', mappingConfidence: '映射可信度', matchedProducts: '关联产品',
  exposureRationale: '产业暴露依据', evidenceBoundary: '证据边界', probability: '概率', expectedReturn: '预期收益',
  confidencePct: '建议置信度', recommendationSource:'观点来源', ruleAssessment:'规则约束', productSelection:'产品比较依据', dimensions:'市场维度', dataBoundary:'数据边界', judgment:'判断', detail:'说明', evidenceIds:'证据引用', referenceIssues:'引用核对', total:'指数数量', riskOff:'风险收缩指数', eligible:'满足条件指数', signal:'规则方向',
}

const statusKeys = ['rating', 'trend', 'risk_level', 'sentiment', 'stage', 'confidencePct'] as const
const evidenceKeys = new Set(['evidence', 'counterEvidence', 'counter_evidence'])
const summaryKeys = ['analysis', 'thesis', 'outlook'] as const
const percentageKeys = new Set(['confidence', 'confidencePct', 'mappingConfidence', 'probability'])
const chipKeys = new Set(['affectedCompanies', 'affectedEtfs', 'segments', 'companies', 'matchedProducts'])

function parse(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) }
  catch { return value }
}

function present(value: unknown): boolean {
  if (value == null || value === '') return false
  if (Array.isArray(value)) return value.some(present)
  if (typeof value === 'object') return Object.values(value as Row).some(present)
  return true
}

function labelFor(key: string) {
  if (/[^\x00-\x7F]/.test(key)) return key
  return analysisFieldLabels[key] || labels[key] || '补充说明'
}

function percentage(fieldKey:string,value:unknown){
  if(!percentageKeys.has(fieldKey)||typeof value!=='number'||!Number.isFinite(value))return null
  return Math.max(0,Math.min(100,value<=1?value*100:value))
}

function scalar(value: string | number | boolean, fieldKey = '') {
  const pct=percentage(fieldKey,value)
  if(pct!==null)return pct.toLocaleString('zh-CN',{maximumFractionDigits:1})+'%'
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('zh-CN') : value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
  return String(chineseValue(value))
}

function tone(value:unknown){
  const text=String(chineseValue(value))
  if(/积极|上行|已满足|可用|成长期|萌芽期/.test(text))return 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-800 dark:text-emerald-200'
  if(/消极|下行|高|衰退|风险收缩|证据不足/.test(text))return 'border-rose-500/20 bg-rose-500/[0.06] text-rose-800 dark:text-rose-200'
  if(/中性|震荡|谨慎|成熟期|未知|有限/.test(text))return 'border-amber-500/20 bg-amber-500/[0.06] text-amber-800 dark:text-amber-200'
  return 'border-border bg-card text-foreground'
}

function MetricValue({fieldKey,value}:{fieldKey:string;value:string|number|boolean}){
  const pct=percentage(fieldKey,value)
  return <div><span className="text-sm font-semibold">{scalar(value,fieldKey)}</span>{pct!==null&&<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={labelFor(fieldKey)} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-primary" style={{width:pct+'%'}}/></div>}</div>
}

function TagList({values}:{values:unknown[]}){
  return <div className="flex flex-wrap gap-1.5">{values.filter(present).map((item,index)=><span key={String(item)+'-'+index} className="rounded-md border bg-background px-2 py-1 font-mono text-[11px] text-foreground/80">{typeof item==='string'||typeof item==='number'||typeof item==='boolean'?scalar(item):'第 '+(index+1)+' 项'}</span>)}</div>
}

function MarkdownText({ children, strong = false }: { children: string; strong?: boolean }) {
  return <div className={`${strong ? 'text-[15px] font-medium text-foreground' : 'text-sm text-foreground/85'} break-words leading-7 [&_a]:text-primary [&_a]:underline [&_li]:my-1.5 [&_ol]:ml-5 [&_ol]:list-decimal [&_p+p]:mt-3 [&_ul]:ml-5 [&_ul]:list-disc`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{chineseNarrative(children)}</ReactMarkdown></div>
}

function ObjectRows({ value, compact = false }: { value: Row; compact?: boolean }) {
  const entries = Object.entries(value).filter(([, item]) => present(item))
  return <dl className="divide-y divide-border/60">{entries.map(([key, item]) => <div key={key} className={`${compact ? 'block' : 'grid gap-1 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-4'} py-2.5 first:pt-0 last:pb-0`}><dt className="text-xs font-medium leading-6 text-muted-foreground">{labelFor(key)}</dt><dd className={`${compact ? 'mt-0.5' : ''} min-w-0`}>{key==='evidenceIds'&&Array.isArray(item)?<div className="flex flex-wrap gap-2">{[...new Set(item.map(String))].map((id,index)=><span key={id} title={id} className="rounded border px-2 py-1 text-xs text-muted-foreground">来源 {index+1} · {id.slice(-8)}</span>)}</div>:chipKeys.has(key)&&Array.isArray(item)?<TagList values={item}/>:percentageKeys.has(key)&&(typeof item==='number'||typeof item==='string'||typeof item==='boolean')?<MetricValue fieldKey={key} value={item}/>:<Content value={item} compact />}</dd></div>)}</dl>
}

function ObjectCards({ values }: { values: Row[] }) {
  return <div className="grid min-w-0 gap-3 xl:grid-cols-2">{values.map((row, index) => {
    const titleKey = ['公司', 'company', 'name', '事件', 'event', '事项', 'claim', 'segment', 'stage'].find(key => present(row[key]))
    const codeKey = ['代码', 'code', 'ticker'].find(key => present(row[key]))
    const remaining = Object.fromEntries(Object.entries(row).filter(([key]) => key !== titleKey && key !== codeKey))
    return <article key={`${titleKey ? String(row[titleKey]) : 'item'}-${index}`} className="min-w-0 rounded-xl border bg-muted/15 p-4 [overflow-wrap:anywhere]">
      {(titleKey || codeKey) && <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b pb-3"><h5 className="min-w-0 text-sm font-semibold leading-6 [overflow-wrap:anywhere]">{titleKey ? scalar(row[titleKey] as string | number | boolean) : labelFor(codeKey!)+' '+scalar(row[codeKey!] as string | number | boolean)}</h5>{titleKey&&codeKey && <Badge variant="outline" className="font-mono text-[11px]">{scalar(row[codeKey] as string | number | boolean)}</Badge>}</div>}
      {(typeof (row.path||row.graphPath) === 'string'||Array.isArray(row.path||row.graphPath)) && <PathFlow value={(row.path||row.graphPath) as string|unknown[]}/>}
      <ObjectRows value={Object.fromEntries(Object.entries(titleKey || codeKey ? remaining : row).filter(([key])=>key!=='path'&&key!=='graphPath'))} compact />
    </article>
  })}</div>
}

function PathFlow({ value }: { value: string|unknown[] }) {
  const nodes=(Array.isArray(value)?value.map(item=>chineseNarrative(String(item))):chineseNarrative(value).split(/\s*(?:→|->|—>|＞)\s*/u)).filter(Boolean)
  if(nodes.length<2)return <p className="mb-3 rounded-lg bg-primary/[0.05] px-3 py-2 text-xs leading-5 text-foreground/80">{nodes[0]||'传导路径待核验'}</p>
  return <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/10 bg-primary/[0.035] p-2.5" aria-label={`传导路径：${nodes.join('到')}`}>{nodes.map((node,index)=><Fragment key={`${node}-${index}`}><span className="rounded-md bg-background px-2 py-1 text-xs font-medium shadow-sm">{node}</span>{index<nodes.length-1&&<ArrowRight className="size-3.5 shrink-0 text-primary" aria-hidden="true"/>}</Fragment>)}</div>
}

function RecommendationView({ value }: { value: Row }) {
  const cards=([['未持有',value.unheld],['已持有',value.held]] as Array<[string,unknown]>).filter(([,item])=>present(item))
  return <div><div className="grid gap-3 sm:grid-cols-2">{cards.map(([label,item])=><div key={String(label)} className="rounded-xl border border-primary/15 bg-background p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-base font-semibold text-primary">{scalar(item as string|number|boolean)}</p></div>)}</div>{present(value.reason)&&<div className="mt-3 rounded-xl bg-muted/35 p-4"><p className="mb-1 text-xs font-medium text-muted-foreground">判断依据</p><Content value={value.reason}/></div>}</div>
}

function SegmentSignalGrid({ value }: { value: Row[] }) {
  return <div className="grid gap-3 xl:grid-cols-2">{value.map((row,index)=><article key={`${String(row.segment||row.stage||'segment')}-${index}`} className="overflow-hidden rounded-xl border bg-background"><div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/25 px-4 py-3"><div className="flex items-center gap-2"><Network className="size-4 text-primary" aria-hidden="true"/><h5 className="text-sm font-semibold">{scalar((row.segment||`环节 ${index+1}`) as string|number|boolean)}</h5></div>{present(row.stage)&&<Badge variant="outline" className="text-[11px]">{scalar(row.stage as string|number|boolean)}</Badge>}</div><dl className="grid gap-px bg-border/60 sm:grid-cols-3">{[['companySignal','企业信号'],['eventSignal','事件信号'],['etfExposure','指数基金暴露']].map(([key,label])=><div key={key} className="bg-card p-3"><dt className="text-[11px] font-medium text-muted-foreground">{label}</dt><dd className="mt-1.5"><Content value={row[key]} compact/></dd></div>)}</dl>{present(row.evidenceBoundary)&&<div className="border-t px-4 py-3"><p className="text-[11px] font-medium text-muted-foreground">证据边界</p><div className="mt-1"><Content value={row.evidenceBoundary} compact/></div></div>}</article>)}</div>
}

function Content({ value, compact = false }: { value: unknown; compact?: boolean }) {
  if (!present(value)) return <span className="text-sm text-muted-foreground">暂无可核验内容</span>
  if (typeof value === 'string') return <MarkdownText>{value}</MarkdownText>
  if (typeof value === 'number' || typeof value === 'boolean') return <span className="text-sm leading-6">{scalar(value)}</span>
  if (Array.isArray(value)) {
    const rows = value.filter(present)
    if (rows.every(item => item && typeof item === 'object' && !Array.isArray(item))) return <ObjectCards values={rows as Row[]} />
    return <ul className={`${compact ? 'space-y-1.5' : 'space-y-2.5'} text-sm leading-6`}>{rows.map((item, index) => <li key={index} className="flex gap-2.5"><span className="mt-[0.65rem] size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true"/><div className="min-w-0 flex-1"><Content value={item} compact /></div></li>)}</ul>
  }
  return <ObjectRows value={value as Row} compact={compact} />
}

function ScenarioGrid({ value }: { value: Row }) {
  const entries = Object.entries(value).filter(([, item]) => present(item))
  const scenarioLabels: Record<string, string> = { base: '基准情景', bull: '乐观情景', bear: '悲观情景' }
  const scenarioStyle:Record<string,{icon:LucideIcon;className:string}>={base:{icon:Compass,className:'border-sky-500/20 bg-sky-500/[0.04]'},bull:{icon:TrendingUp,className:'border-emerald-500/20 bg-emerald-500/[0.04]'},bear:{icon:TrendingDown,className:'border-rose-500/20 bg-rose-500/[0.04]'}}
  return <div className="grid gap-3 md:grid-cols-3">{entries.map(([key, item]) => {const style=scenarioStyle[key]||{icon:Compass,className:'bg-muted/15'},Icon=style.icon;return <article key={key} className={'min-w-0 rounded-xl border p-4 '+style.className}><h5 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" aria-hidden="true"/>{scenarioLabels[key] || labelFor(key)}</h5><Content value={item} compact/></article>})}</div>
}

function SectionBlock({ fieldKey, title, icon: Icon, value, emphasis = false }: { fieldKey:string; title: string; icon: LucideIcon; value: unknown; emphasis?: boolean }) {
  const special=fieldKey==='recommendation'&&value&&typeof value==='object'&&!Array.isArray(value)?<RecommendationView value={value as Row}/>:fieldKey==='segmentSignals'&&Array.isArray(value)?<SegmentSignalGrid value={value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)) as Row[]}/>:fieldKey==='scenarios'&&value&&typeof value==='object'&&!Array.isArray(value)?<ScenarioGrid value={value as Row}/>:<Content value={value}/>
  return <section className={`rounded-2xl border ${emphasis ? 'border-primary/20 bg-gradient-to-br from-primary/[0.055] to-transparent' : 'bg-card'} p-4 sm:p-5`}><div className="mb-4 flex items-center gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><Icon className="size-4"/></span><h4 className="text-sm font-semibold">{title}</h4></div>{special}</section>
}

function iconFor(key: string): LucideIcon {
  if (key === 'key_companies') return Building2
  if (key === 'chain_structure' || key === 'etfImplications') return GitBranch
  if (key === 'scenarios') return Compass
  if (key === 'recommendation' || key === 'tacticalView' || key === 'strategicView') return Target
  if (key === 'risks') return ShieldAlert
  if (key === 'watchlist') return Binoculars
  if (key === 'drivers' || key === 'catalysts') return ListChecks
  return Landmark
}

export function ReportAnalysisView({ value, sources = [], evidenceBaseUrl }: { value: unknown; sources?:Evidence[]; evidenceBaseUrl?:string }) {
  const parsed = parse(value)
  if (typeof parsed === 'string') return <MarkdownText>{parsed}</MarkdownText>
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return <Content value={parsed}/>

  const row = parsed as Row
  const summaryKey = summaryKeys.find(key => typeof row[key] === 'string' && present(row[key]))
  const meta = statusKeys.filter(key => present(row[key]))
  const remaining = Object.entries(row).filter(([key, item]) => present(item) && key !== summaryKey && !statusKeys.includes(key as typeof statusKeys[number]) && key !== 'score')
  const primary = remaining.filter(([key]) => !evidenceKeys.has(key) && key !== 'risks' && key !== 'watchlist')
  const supporting = remaining.filter(([key]) => key === 'risks' || key === 'watchlist')
  const evidence = remaining.filter(([key]) => evidenceKeys.has(key))

  return <div className="space-y-4" aria-label="结构化综合研判">
    {summaryKey && <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 sm:p-5"><div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary"><FileCheck2 className="size-4" aria-hidden="true"/>核心判断</div><MarkdownText strong>{String(row[summaryKey])}</MarkdownText></section>}

    {meta.length > 0 && <dl className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">{meta.map(key => {const numeric=percentage(key,row[key]);return <div key={key} className={'min-w-0 rounded-xl border px-3 py-3 '+tone(row[key])}><dt className="text-[11px] opacity-70">{labelFor(key)}</dt><dd className="mt-1 truncate text-sm font-semibold">{scalar(row[key] as string | number | boolean,key)}</dd>{numeric!==null&&<div className="mt-2 h-1 overflow-hidden rounded-full bg-current/15" role="progressbar" aria-label={labelFor(key)} aria-valuenow={Math.round(numeric)} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-current" style={{width:numeric+'%'}}/></div>}</div>})}</dl>}

    <div className="grid gap-4 lg:grid-cols-2">{primary.map(([key, item]) => <div key={key} className={key==='tacticalView'||key==='strategicView'?'':'lg:col-span-2'}><SectionBlock fieldKey={key} title={labelFor(key)} icon={iconFor(key)} value={item} emphasis={key === 'recommendation' || key === 'tacticalView' || key === 'strategicView'}/></div>)}</div>

    {supporting.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{supporting.map(([key, item]) => <SectionBlock key={key} fieldKey={key} title={labelFor(key)} icon={iconFor(key)} value={item}/>)}</div>}

    {evidence.length > 0 && <div className="space-y-2">{evidence.map(([key, item]) => <details key={key} className="group rounded-xl border bg-muted/10"><summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden"><span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">{key === 'evidence' ? <FileCheck2 className="size-4"/> : <Scale className="size-4"/>}</span><span className="flex-1">{labelFor(key)}</span><span className="text-xs font-normal text-muted-foreground">展开核对</span></summary><div className="border-t px-4 py-4"><EvidenceList value={item} sources={sources} evidenceBaseUrl={evidenceBaseUrl}/></div></details>)}</div>}

    {!summaryKey && primary.length === 0 && supporting.length === 0 && evidence.length === 0 && <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true"/><p>本模块没有可展示的有效分析字段。</p></div>}
  </div>
}

function EvidenceList({value,sources,evidenceBaseUrl}:{value:unknown;sources:Evidence[];evidenceBaseUrl?:string}){
  if(!Array.isArray(value))return <Content value={value}/>
  return <ol className="space-y-3">{value.map((item,index)=>{
    if(!item||typeof item!=='object'||typeof item.claim!=='string')return <li key={index}><Content value={item}/></li>
    const row=auditClaim(item as EvidenceClaim,sources)
    return <li key={index} className="min-w-0 rounded-lg border bg-background p-4 [overflow-wrap:anywhere]"><p className="text-sm leading-6">{row.claim}</p><p className="mt-2 text-xs text-muted-foreground">{chineseNarrative(row.source||'来源待核验')} · {row.date||'日期未标注'}</p><div className="mt-2 flex flex-wrap gap-2">{row.evidenceIds?.map((id,i)=>evidenceBaseUrl&&sources.some(source=>source.id===id)?<a key={id} href={`${evidenceBaseUrl}&evidence=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" className="rounded border px-2 py-1 text-xs text-primary" title={id}>来源 {i+1} · {id.slice(-8)}</a>:<span key={id} className="text-xs text-muted-foreground" title={id}>引用 {id.slice(-8)}</span>)}</div>{!!row.referenceIssues?.length&&<p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{row.referenceIssues.join('；')}</p>}</li>
  })}</ol>
}
