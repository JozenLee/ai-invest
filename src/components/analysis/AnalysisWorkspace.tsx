'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Activity, ArrowUpRight, CircleAlert, Clock3, FileText, GitBranch, History, Layers3, Loader2, Play, RefreshCw, Settings2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Evaluation, Profile } from '@/lib/research/contracts'
import type { ResearchSchedule } from '@/lib/research/schedule'
import { artifact, runProgress, shouldPollRun, STEP_TITLES, type AnalysisRun, type RunListItem } from './workspace-model'
import { DecisionEvidencePanel } from './DecisionEvidencePanel'
import { ResearchSettings } from './ResearchSettings'
import { chineseNarrative } from '@/lib/analysis/chinese-labels'
import { reportAdviceConfidence } from '@/lib/analysis/report-insights'
import { HistoricalReportsDialog, type HistoricalReportSummary } from './HistoricalReportsDialog'
import type { DecisionTimingAssessment } from '@/lib/analysis/decision-timing'
import type { WorkflowNodeConfig } from '@/lib/workflow/types'
import { actionAvailability } from '@/lib/analysis/action-availability'
import type { UnifiedAllocation } from '@/lib/research/strategy/kernel'
import { UnifiedAllocationView } from './UnifiedAllocationView'
import { DailyExecutionPanel } from './DailyExecutionPanel'
import { StrategyLab } from './StrategyLab'
import { WorkflowTopology } from './WorkflowTopology'
import { normalizeAIProductDecisions } from '@/lib/analysis/investment-conclusion'

type Industry={id:string;name:string}
type ResearchState={profile:Profile;schedule:ResearchSchedule;history:Array<{snapshotId:string;asOf:string}>;evaluation:Evaluation|null}
const time=(value?:string|null)=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未生成'
const statusLabel:Record<string,string>={PENDING:'待执行',RUNNING:'分析中',COMPLETED:'已归档',FAILED:'执行中断',PAUSED:'已暂停'}
async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:'no-store',...options})
  const payload=await response.json()
  if(!response.ok)throw new Error(payload.error||'请求失败，请重试')
  return payload as T
}
function parsedRecord(value:unknown):Record<string,unknown>{
  if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>
  try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}
}

export function AnalysisWorkspace(){
  const router=useRouter(),params=useSearchParams()
  const initial=useRef({runId:params.get('runId')||'',industryId:params.get('industryId')||''})
  const [industries,setIndustries]=useState<Industry[]>([]),[industryId,setIndustryId]=useState(''),[runId,setRunId]=useState(()=>params.get('runId')||'')
  const [run,setRun]=useState<AnalysisRun|null>(null),[runs,setRuns]=useState<RunListItem[]>([]),[reports,setReports]=useState<HistoricalReportSummary[]>([]),[research,setResearch]=useState<ResearchState|null>(null)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[settings,setSettings]=useState(false)
  const [settingsSection,setSettingsSection]=useState<'scope'|'history'|'rules'|'schedule'>('scope')
  const [refresh,setRefresh]=useState(0),[showLegacy,setShowLegacy]=useState(false)
  const tab=['flow','decisions','history','lab','daily'].includes(params.get('tab')||'')?params.get('tab')!:'flow'
  function setTab(value:string){const next=new URLSearchParams(params.toString());next.set('tab',value);router.replace(`/comprehensive-analysis?${next.toString()}`,{scroll:false})}
  const [historyDialog,setHistoryDialog]=useState(false),[historyLoading,setHistoryLoading]=useState(false),[allReports,setAllReports]=useState<HistoricalReportSummary[]>([]),[historyPolicy,setHistoryPolicy]=useState<NonNullable<Profile['historyReports']>|null>(null)
  const [aiDestination,setAiDestination]=useState(''),[portfolioConsent,setPortfolioConsent]=useState(false)
  const [nodeConfigs,setNodeConfigs]=useState<Record<string,WorkflowNodeConfig>>({})
  const evaluation=artifact<Evaluation>(run,'research-evaluation')
  const investmentAdvice=parsedRecord(artifact<unknown>(run,'investment-advice'))
  const aiDecisions=normalizeAIProductDecisions(investmentAdvice.productDecisions,evaluation?.decisions.map(item=>item.ticker)||[])
  const reportId=artifact<string>(run,'report-id')
  const quality=artifact<{usable:number;requested:number;status:string;companyCoverage?:{total:number}}>(run,'data-quality')
  const decisionTiming=artifact<DecisionTimingAssessment>(run,'decision-timing')
  const industry=industries.find(i=>i.id===industryId)
  const progress=runProgress(run),running=run?.status==='RUNNING',locked=busy||running
  const blocked=evaluation?.decisions.filter(d=>d.state==='blocked').length||0
  const eligible=evaluation?.decisions.filter(d=>d.state==='eligible').length||0
  const riskOff=evaluation?.decisions.filter(d=>d.state==='risk-off').length||0
  const availableAi=aiDecisions.filter(item=>actionAvailability(item).available)
  const aiIncrease=availableAi.filter(item=>item.unheldAction==='建仓'||item.heldAction==='加仓').length
  const aiReduce=availableAi.filter(item=>item.heldAction==='减仓').length
  const currentStep=run?.steps.find(s=>s.status==='RUNNING')
  const adviceConfidence=reportAdviceConfidence(evaluation||undefined,quality)

  useEffect(()=>{
    const controller=new AbortController()
    async function initialize(){
      try{
        const [payload,privacy]=await Promise.all([request<{data:Industry[]}>('/api/data-subscriptions/industries',{signal:controller.signal}),request<{destination:string}>('/api/analysis/privacy',{signal:controller.signal})])
        if(controller.signal.aborted)return
        setIndustries(payload.data.map(item=>({...item,name:chineseNarrative(item.name)})))
        setAiDestination(privacy.destination)
        let chosen=payload.data.find(i=>i.id===initial.current.industryId)
        if(initial.current.runId){
          const existing=await request<AnalysisRun>(`/api/analysis/comprehensive/${encodeURIComponent(initial.current.runId)}?view=workspace`,{signal:controller.signal})
          chosen=payload.data.find(i=>i.id===existing.metadata?.industryId)
          if(!chosen)throw new Error('该历史轮次的领域已不在当前订阅中')
        }
        if(!controller.signal.aborted)setIndustryId((chosen||payload.data.find(i=>i.name==='AI算力硬件')||payload.data[0])?.id||'')
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'领域加载失败')}
      finally{if(!controller.signal.aborted)setLoading(false)}
    }
    void initialize();return()=>controller.abort()
  },[])

  useEffect(()=>{
    if(!industryId)return
    const controller=new AbortController()
    Promise.all([
      request<RunListItem[]>(`/api/analysis/comprehensive?industryId=${encodeURIComponent(industryId)}&limit=50`,{signal:controller.signal}),
      request<ResearchState>(`/api/research/${encodeURIComponent(industryId)}`,{signal:controller.signal}),
      request<{reports:HistoricalReportSummary[]}>(`/api/analysis/reports?industryId=${encodeURIComponent(industryId)}&contextIndustryId=${encodeURIComponent(industryId)}&type=comprehensive&view=summary&limit=50`,{signal:controller.signal}),
    ]).then(([history,config,reportHistory])=>{if(controller.signal.aborted)return;setRuns(history);setResearch(config);setReports(reportHistory.reports);setRunId(current=>current||history[0]?.id||'')}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return()=>controller.abort()
  },[industryId,refresh])

  useEffect(()=>{
    if(!runId)return
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
    async function poll(){
      try{
        const next=await request<AnalysisRun>(`/api/analysis/comprehensive/${encodeURIComponent(runId)}?view=workspace`,{signal:controller.signal})
        if(controller.signal.aborted)return
        setRun(next)
        if(shouldPollRun(next.status))timer=setTimeout(poll,2500)
        else {
          const [history,reportHistory]=await Promise.all([request<RunListItem[]>(`/api/analysis/comprehensive?industryId=${encodeURIComponent(next.metadata.industryId)}&limit=50`,{signal:controller.signal}),request<{reports:HistoricalReportSummary[]}>(`/api/analysis/reports?industryId=${encodeURIComponent(next.metadata.industryId)}&contextIndustryId=${encodeURIComponent(next.metadata.industryId)}&type=comprehensive&view=summary&limit=50`,{signal:controller.signal})])
          if(!controller.signal.aborted){setRuns(history);setReports(reportHistory.reports)}
        }
      }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'连接中断，正在重试');timer=setTimeout(poll,5000)}}
    }
    void poll();return()=>{controller.abort();if(timer)clearTimeout(timer)}
  },[runId,refresh])

  function selectIndustry(value:string){setIndustryId(value);setRunId('');setRun(null);setRuns([]);setReports([]);setResearch(null);setError('');setNotice('');router.replace(`/comprehensive-analysis?industryId=${encodeURIComponent(value)}`,{scroll:false})}
  function selectRun(id:string){setRun(null);setRunId(id);setError('');setNotice('');router.replace(`/comprehensive-analysis?industryId=${encodeURIComponent(industryId)}&runId=${encodeURIComponent(id)}`,{scroll:false})}
  async function start(parentRunId?:string,rulesOnly=false){
    setBusy(true);setError('');setNotice('')
    try{
      const privateAllowed=!rulesOnly&&portfolioConsent&&!!aiDestination
      const created=await request<{runId:string}>('/api/analysis/comprehensive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({industryId,parentRunId,rulesOnly,publicOnly:!privateAllowed,portfolioAiConsent:privateAllowed?aiDestination:null,nodeConfigs})})
      setPortfolioConsent(false)
      selectRun(created.runId)
      await request(`/api/analysis/comprehensive/${created.runId}/execute?mode=all`,{method:'POST'})
      setRefresh(n=>n+1)
      setNotice(rulesOnly?'已启动快速规则复核：沿用同一执行链路，不调用AI，原报告保持不变。':parentRunId?'已启动完整复核：新证据将与所选报告比较，原报告不会被覆盖。':'已启动完整分析。可离开页面，后台会继续执行。')
    }catch(e){setError(e instanceof Error?e.message:'启动失败')}finally{setBusy(false)}
  }
  async function continueRun(mode='resume'){
    setBusy(true);setError('')
    try{await request(`/api/analysis/comprehensive/${runId}/execute?mode=${mode}`,{method:'POST'});setRefresh(n=>n+1)}catch(e){setError(e instanceof Error?e.message:'继续执行失败')}finally{setBusy(false)}
  }
  async function openHistoryReports(){
    setHistoryDialog(true);setHistoryLoading(true)
    try{const payload=await request<{reports:HistoricalReportSummary[];contextPolicy:NonNullable<Profile['historyReports']>|null}>(`/api/analysis/reports?scope=all&contextIndustryId=${encodeURIComponent(industryId)}&type=comprehensive&view=summary&limit=100`);setAllReports(payload.reports);setHistoryPolicy(payload.contextPolicy)}catch(e){setError(e instanceof Error?e.message:'历史报告读取失败')}finally{setHistoryLoading(false)}
  }
  const canReview=!!evaluation&&run?.status==='COMPLETED'
  const currentStepCount=Object.keys(STEP_TITLES).length
  const currentRuns=runs.filter(item=>item.progress.total===currentStepCount)
  const visibleRuns=showLegacy?runs.slice(0,50):currentRuns.slice(0,12)

  return <div className="mx-auto max-w-[1440px] space-y-6 p-4 sm:p-6 xl:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground">智能投研工作台</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">综合分析</h1><p className="mt-2 text-sm text-muted-foreground">从领域判断到指数基金决策，让每一次复核都有据可循。</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11 rounded-xl" disabled={!industryId} onClick={()=>void openHistoryReports()}><History className="size-4"/>历史报告</Button><Button variant="outline" className="min-h-11 rounded-xl" disabled={!research||locked} onClick={()=>{setSettingsSection('scope');setSettings(true)}}><Settings2 className="size-4"/>研究设置</Button><Button className="min-h-11 rounded-xl px-5" disabled={!industryId||!research||locked} onClick={()=>void start()}>{busy?<Loader2 className="size-4 animate-spin motion-reduce:animate-none"/>:<Play className="size-4"/>}新建综合分析</Button></div></header>
    {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span className="flex items-center gap-2"><CircleAlert className="size-4 shrink-0"/>{error}</span><Button variant="ghost" size="sm" onClick={()=>{setError('');setRefresh(n=>n+1)}}>重新连接</Button></div>}
    {notice&&<p role="status" className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">{notice}</p>}
    <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] px-4 py-3 text-sm"><Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300"/><p className="leading-6"><span className="font-medium">行情数据口径：</span>综合分析始终执行同一套流程。交易时段使用底层订阅的实时数据，其他时段使用最新交易日收盘数据；报告仅用标签提示数据口径。{decisionTiming&&<span className="ml-1 font-medium">本轮：{decisionTiming.label}。</span>}</p></div>

    <section className="grid overflow-hidden rounded-2xl border bg-card lg:grid-cols-[1.65fr_1fr]">
      <div className="relative overflow-hidden bg-slate-950 p-6 text-slate-50 sm:p-8 dark:bg-slate-900"><div aria-hidden className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full border border-white/10"/><div aria-hidden className="pointer-events-none absolute -right-8 -top-20 size-56 rounded-full border border-white/10"/>
        <div className="relative flex flex-wrap items-center gap-3"><span className="flex items-center gap-2 text-xs text-slate-300"><Layers3 className="size-4"/>当前研究领域</span><label htmlFor="workspace-industry" className="sr-only">选择研究领域</label><select id="workspace-industry" value={industryId} disabled={locked} onChange={e=>selectIndustry(e.target.value)} className="min-h-10 max-w-full rounded-lg border border-white/15 bg-slate-900 px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-blue-300"><option value="" disabled>{loading?'加载领域…':'选择领域'}</option>{industries.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div className="relative mt-7"><div className="mb-3 flex items-center gap-2 text-xs text-slate-400"><span className={cn('size-1.5 rounded-full',running?'bg-sky-400 motion-safe:animate-pulse':run?.status==='COMPLETED'?'bg-emerald-400':'bg-slate-400')}/>{run?`${run.metadata.kind==='review'?'复核轮次':'分析轮次'} · ${statusLabel[run.status]||run.status}`:'一套流程，持续研究'}</div><h2 className="text-2xl font-semibold leading-tight sm:text-3xl">{industry?.name||'选择你的研究领域'}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">{running?`正在${STEP_TITLES[currentStep?.stepName||'']||'准备研究证据'}。本轮的数据、量化证据与AI结论会统一归档。`:run?.status==='FAILED'?'分析中途遇到问题。已完成步骤与冻结证据均已保留，可从中断处继续。':aiDecisions.length&&!availableAi.length?'本轮归档观点已过期或执行条件未通过；请在每日执行中更新证据。暂无有效建议不等于维持仓位。':availableAi.length?`AI投资决策已生成，综合置信度 ${adviceConfidence}%；${aiIncrease} 只建议增加暴露，${aiReduce} 只建议降低暴露，其余维持或观察。`:evaluation?`量化证据已完成：${eligible}只状态改善、${riskOff}只关注风险、${blocked}只数据受限；等待AI综合投资决策。`:'市场趋势、企业景气与事件资讯，在同一份证据快照中交叉验证。'}</p></div>
        <div className="relative mt-7 flex flex-wrap items-center gap-4"><span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="size-3.5"/>{evaluation?`证据时点 ${time(evaluation.asOf)}`:run?`启动于 ${time(run.startedAt)}`:'开始后冻结最新本地证据'}</span><span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="size-3.5"/>{run?.metadata.publicOnly===false?'含授权私有AI解读 · 不进入发布版':'公开研究 + 本地组合门禁 · 持仓不发送AI'}</span></div>
      </div>
        <div className="flex flex-col justify-between gap-6 p-6 sm:p-8"><div><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">本轮执行</p><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{run?.metadata.rulesOnly?'本地规则复核':'规则与智能分析'}</span></div><div className="mt-4 flex items-end gap-2"><span className="font-mono text-4xl tracking-tight">{progress.done}</span><span className="pb-1 text-sm text-muted-foreground">/ {progress.total} 节点</span><span className="ml-auto pb-1 font-mono text-sm text-primary">{progress.percent}%</span></div><div role="progressbar" aria-label="综合分析进度" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{width:`${progress.percent}%`}}/></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{run?.status==='COMPLETED'?'节点执行完成不等于投资条件成立，数据门禁将单独展示。':running?'后台持续执行，节点状态自动更新。':'完整分析会调用已配置的智能分析接口。'}</p></div>
        <div className="flex flex-wrap gap-2">{reportId&&<Link href={`/comprehensive-analysis/report/${reportId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">阅读报告<ArrowUpRight className="size-4"/></Link>}{canReview&&<><Button variant="outline" className="min-h-11 rounded-xl" disabled={locked} onClick={()=>void start(run!.id)}><RefreshCw className="size-4"/>复核最新数据</Button><Button variant="ghost" className="min-h-11 rounded-xl text-xs" disabled={locked} onClick={()=>void start(run!.id,true)}>快速规则复核</Button></>}{run&&['FAILED','PENDING','PAUSED'].includes(run.status)&&<Button className="min-h-11 rounded-xl" disabled={locked} onClick={()=>void continueRun()}><Play className="size-4"/>继续本轮</Button>}{!run&&<span className="text-xs text-muted-foreground">点击右上角「新建综合分析」开始</span>}</div>
      </div>
    </section>

    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="研究概况">{[
      {label:'关联指数基金',value:evaluation?.decisions.length??quality?.requested??'—',detail:'逐标的检查，不重复计算指数',icon:Layers3},
      {label:'有效技术样本',value:quality?`${quality.usable} / ${quality.requested}`:'—',detail:'复权、时效与连续性同时满足',icon:Activity},
      {label:'事件证据',value:evaluation?.events.length??'—',detail:'公告与资讯按事件归并',icon:FileText},
      {label:'归档报告复核',value:research?.schedule.enabled?'已开启':'手动复核',detail:research?.schedule.enabled?research.schedule.times.join('、')+' · 本地规则':'从已完成报告发起新版本',icon:GitBranch},
    ].map(({label,value,detail,icon:Icon})=><div key={label} className="rounded-2xl border bg-card px-4 py-5 sm:px-5"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{label}</span><Icon className="size-4"/></div><p className="mt-3 font-mono text-2xl font-medium tracking-tight">{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}</section>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b"><div className="flex flex-wrap gap-x-5 sm:gap-x-8" aria-label="研究视图">{[{id:'flow',label:'分析流程',icon:Layers3},{id:'decisions',label:'投资建议与证据',icon:ShieldCheck},{id:'daily',label:'每日执行',icon:Clock3},{id:'lab',label:'策略实验室',icon:Activity},{id:'history',label:`历史报告${reports.length?` ${reports.length}`:''}`,icon:History}].map(({id,label,icon:Icon})=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)} className={cn('flex min-h-12 items-center gap-2 border-b-2 text-sm transition-colors',tab===id?'border-primary font-medium text-primary':'border-transparent text-muted-foreground hover:text-foreground')}><Icon className="size-4"/>{label}</button>)}</div><span className="pb-2 text-[11px] text-muted-foreground">{runId?`轮次 ${runId.slice(-8).toUpperCase()}`:'尚未选择轮次'}</span></div>

    {tab==='flow'&&<WorkflowTopology runId={runId||undefined} locked={locked} configs={nodeConfigs} onConfigsChange={setNodeConfigs} onChanged={()=>{setNotice('模块已按当前配置重新派发；其下游产物已标记为待更新。');setRefresh(value=>value+1)}}/>}

    {tab==='decisions'&&(evaluation?<DecisionEvidencePanel key={evaluation.snapshotId} evaluation={evaluation}/>:<div className="rounded-2xl border bg-card p-12 text-center"><ShieldCheck className="mx-auto mb-4 size-8 text-muted-foreground/40"/><h2 className="font-medium">本轮尚未形成规则决策</h2><p className="mt-2 text-sm text-muted-foreground">质量复核完成后，逐只指数基金的条件与证据会出现在这里。</p><Button variant="outline" className="mt-5" onClick={()=>setTab('flow')}>查看执行进度</Button></div>)}

    {tab==='daily'&&industryId&&<DailyExecutionPanel key={industryId} industryId={industryId} initialStrategy={params.get('strategy')||undefined}/>}
    {tab==='decisions'&&<UnifiedAllocationView allocation={artifact<UnifiedAllocation>(run,'unified-allocation')}/>}
    {tab==='lab'&&industryId&&<StrategyLab key={industryId} industryId={industryId}/>}
    {tab==='history'&&<div className="space-y-5"><section className="overflow-hidden rounded-2xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">历史投资报告</h2><p className="mt-1 text-xs text-muted-foreground">按生成时间倒序保存结论、置信度与当时的冻结证据，方便后续复盘。</p></div><span className="text-xs text-muted-foreground">共 {reports.length} 份</span></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{reports.map(item=>{const counts=item.recommendation.stateCounts,hasAi=(counts['ai-increase']||0)+(counts['ai-reduce']||0)>0;return <Link key={item.id} href={`/comprehensive-analysis/report/${item.id}`} className="group min-w-0 rounded-xl border bg-background p-4 transition-colors hover:border-primary/35 hover:bg-primary/[0.02] focus-visible:outline-2 focus-visible:outline-ring"><div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="size-4"/></span><span className="rounded-full border px-2 py-1 font-mono text-[11px]">置信度 {item.recommendation.confidencePct}%</span></div><h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-6">{chineseNarrative(item.title)}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{chineseNarrative(item.summary||'暂无摘要')}</p><div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{time(item.createdAt)}</span>{item.quality?.overallScore!=null&&<span>质量 {item.quality.overallScore}分</span>}{hasAi?<><span>AI增加 {counts['ai-increase']||0}</span><span>AI降低 {counts['ai-reduce']||0}</span></>:<><span>历史量化风险 {counts['risk-off']||0}</span><span>历史满足条件 {counts.eligible||0}</span></>}</div><span className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary">打开报告<ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5"/></span></Link>})}{!reports.length&&<p className="col-span-full p-8 text-center text-sm text-muted-foreground">当前领域还没有已归档报告。</p>}</div></section><section className="overflow-hidden rounded-2xl border bg-card"><div className="flex items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">执行轮次记录</h2><p className="mt-1 text-xs text-muted-foreground">包含完成、失败与暂停轮次，用于追踪报告生成过程。</p></div><span className="text-xs text-muted-foreground">显示 {visibleRuns.length} / {runs.length} 轮</span></div>{visibleRuns.map(item=><div key={item.id} className={cn('flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-0',runId===item.id&&'bg-primary/[0.03]')}><div className="flex min-w-0 items-start gap-3"><span className="mt-1 rounded-lg bg-muted p-2">{item.metadata?.parentRunId?<GitBranch className="size-4 text-primary"/>:<FileText className="size-4 text-muted-foreground"/>}</span><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{item.metadata?.rulesOnly?'量化证据复核':item.metadata?.parentRunId?'完整AI复核':'综合AI分析'}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px]',item.status==='COMPLETED'?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':item.status==='FAILED'?'bg-destructive/10 text-destructive':'bg-muted text-muted-foreground')}>{statusLabel[item.status]||item.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{time(item.startedAt)} · 执行进度 {item.progress.percentage}% · {item.id.slice(-8).toUpperCase()}</p>{item.metadata?.parentRunId&&<button type="button" className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs text-primary" onClick={()=>{selectRun(item.metadata.parentRunId!)}}>基于 {item.metadata.parentRunId.slice(-8).toUpperCase()}<ArrowUpRight className="size-3"/></button>}</div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>{selectRun(item.id)}} disabled={busy}>查看轮次</Button>{item.reportId&&<Link className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-medium text-primary hover:bg-primary/5" href={`/comprehensive-analysis/report/${item.reportId}`}>报告<ArrowUpRight className="ml-1 size-3.5"/></Link>}</div></div>)}{!runs.length&&<p className="p-12 text-center text-sm text-muted-foreground">当前领域还没有分析记录。</p>}{runs.length>currentRuns.length&&<div className="border-t bg-muted/20 p-4 text-center"><Button variant="ghost" size="sm" onClick={()=>setShowLegacy(value=>!value)}>{showLegacy?'仅显示当前流程':`查看 ${runs.length-currentRuns.length} 个旧版记录`}</Button></div>}</section>
      {evaluation?.workflow?.parentRunId&&<section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">本轮复核变化</h2><p className="mt-1 text-xs text-muted-foreground">比较指定原报告的冻结快照，而不是任意最近数据。</p>{evaluation.changes.length?evaluation.changes.map(c=><p key={c.ticker} className="mt-4 border-t pt-3 text-sm leading-6"><span className="font-mono">{c.ticker}</span> · {c.from} → {c.to}<br/><span className="text-muted-foreground">变化条件：{c.changedConditions.join('、')||'状态变化'}</span></p>):<p className="mt-4 text-sm text-muted-foreground">本轮未出现规则状态变化。新快照已保存，原报告保持不变。</p>}</section>}
    </div>}
    <HistoricalReportsDialog open={historyDialog} onOpenChange={setHistoryDialog} onConfigure={()=>{setHistoryDialog(false);setSettingsSection('history');setSettings(true)}} reports={allReports} loading={historyLoading} contextIndustryId={industryId} contextIndustryName={industry?.name||''} policy={historyPolicy}/>
    {settings&&research&&<ResearchSettings key={`${industryId}-${settingsSection}`} profile={research.profile} schedule={research.schedule} aiDestination={aiDestination} portfolioConsent={portfolioConsent} initialSection={settingsSection} onClose={()=>setSettings(false)} onSaved={(profile,schedule,consent)=>{setPortfolioConsent(consent);setResearch({...research,profile,schedule});setRefresh(value=>value+1);setNotice(consent?'研究设置已保存。下一次手动完整分析将包含授权的私有持仓解读，启动后授权自动清除。':'研究设置已保存，下一轮综合分析或复核将采用新配置。')}}/>}
  </div>
}
