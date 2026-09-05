'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Activity, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Circle, CircleAlert, Clock3, Database, FileText, GitBranch, History, Layers3, Loader2, Play, RefreshCw, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Evaluation, Profile } from '@/lib/research/contracts'
import type { ResearchSchedule } from '@/lib/research/schedule'
import { artifact, PHASES, phaseState, plainAnalysis, runProgress, STEP_TITLES, type AnalysisRun, type RunListItem, type RunStep } from './workspace-model'
import { DecisionEvidencePanel } from './DecisionEvidencePanel'
import { ResearchSettings } from './ResearchSettings'
import { clarifyCoverageLanguage } from '@/lib/analysis/clarify-coverage'
import { chineseNarrative } from '@/lib/analysis/chinese-labels'

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

export function AnalysisWorkspace(){
  const router=useRouter(),params=useSearchParams()
  const initial=useRef({runId:params.get('runId')||'',industryId:params.get('industryId')||''})
  const [industries,setIndustries]=useState<Industry[]>([]),[industryId,setIndustryId]=useState(''),[runId,setRunId]=useState(()=>params.get('runId')||'')
  const [run,setRun]=useState<AnalysisRun|null>(null),[runs,setRuns]=useState<RunListItem[]>([]),[research,setResearch]=useState<ResearchState|null>(null)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[settings,setSettings]=useState(false)
  const [tab,setTab]=useState('flow'),[refresh,setRefresh]=useState(0),[showLegacy,setShowLegacy]=useState(false)
  const [aiDestination,setAiDestination]=useState(''),[portfolioConsent,setPortfolioConsent]=useState(false)
  const evaluation=artifact<Evaluation>(run,'research-evaluation')
  const reportId=artifact<string>(run,'report-id')
  const quality=artifact<{usable:number;requested:number;status:string;companyCoverage?:{total:number}}>(run,'data-quality')
  const industry=industries.find(i=>i.id===industryId)
  const progress=runProgress(run),running=run?.status==='RUNNING',locked=busy||running
  const blocked=evaluation?.decisions.filter(d=>d.state==='blocked').length||0
  const eligible=evaluation?.decisions.filter(d=>d.state==='eligible').length||0
  const summary=clarifyCoverageLanguage(plainAnalysis(artifact(run,'industry-overview')),evaluation?.decisions.length)
  const currentStep=run?.steps.find(s=>s.status==='RUNNING')

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
    ]).then(([history,config])=>{if(controller.signal.aborted)return;setRuns(history);setResearch(config);setRunId(current=>current||history[0]?.id||'')}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
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
        if(next.status==='RUNNING')timer=setTimeout(poll,2500)
        else {
          const history=await request<RunListItem[]>(`/api/analysis/comprehensive?industryId=${encodeURIComponent(next.metadata.industryId)}&limit=50`,{signal:controller.signal})
          if(!controller.signal.aborted)setRuns(history)
        }
      }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'连接中断，正在重试');timer=setTimeout(poll,5000)}}
    }
    void poll();return()=>{controller.abort();if(timer)clearTimeout(timer)}
  },[runId,refresh])

  function selectIndustry(value:string){setIndustryId(value);setRunId('');setRun(null);setRuns([]);setResearch(null);setError('');setNotice('');router.replace(`/comprehensive-analysis?industryId=${encodeURIComponent(value)}`,{scroll:false})}
  function selectRun(id:string){setRun(null);setRunId(id);setError('');setNotice('');router.replace(`/comprehensive-analysis?industryId=${encodeURIComponent(industryId)}&runId=${encodeURIComponent(id)}`,{scroll:false})}
  async function start(parentRunId?:string,rulesOnly=false){
    setBusy(true);setError('');setNotice('')
    try{
      const privateAllowed=!rulesOnly&&portfolioConsent&&!!aiDestination
      const created=await request<{runId:string}>('/api/analysis/comprehensive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({industryId,parentRunId,rulesOnly,publicOnly:!privateAllowed,portfolioAiConsent:privateAllowed?aiDestination:null})})
      setPortfolioConsent(false)
      selectRun(created.runId);setTab('flow')
      await request(`/api/analysis/comprehensive/${created.runId}/execute?mode=all`,{method:'POST'})
      setRefresh(n=>n+1)
      setNotice(rulesOnly?'已启动快速规则复核：沿用同一执行链路，不调用AI，原报告保持不变。':parentRunId?'已启动完整复核：新证据将与所选报告比较，原报告不会被覆盖。':'已启动完整分析。可离开页面，后台会继续执行。')
    }catch(e){setError(e instanceof Error?e.message:'启动失败')}finally{setBusy(false)}
  }
  async function continueRun(mode='resume'){
    setBusy(true);setError('')
    try{await request(`/api/analysis/comprehensive/${runId}/execute?mode=${mode}`,{method:'POST'});setRefresh(n=>n+1)}catch(e){setError(e instanceof Error?e.message:'继续执行失败')}finally{setBusy(false)}
  }
  const canReview=!!evaluation&&run?.status==='COMPLETED'
  const needed=evaluation?Object.values(evaluation.decisions.reduce<Record<string,{label:string;count:number}>>((items,d)=>{for(const c of d.conditions.filter(c=>c.status==='unknown')){items[c.key]??={label:c.label,count:0};items[c.key].count++}return items},{})).sort((a,b)=>b.count-a.count).slice(0,4):[]
  const currentRuns=runs.filter(item=>item.progress.total===20)
  const visibleRuns=showLegacy?runs.slice(0,50):currentRuns.slice(0,12)

  return <div className="mx-auto max-w-[1440px] space-y-6 p-4 sm:p-6 xl:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground">智能投研工作台</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">综合分析</h1><p className="mt-2 text-sm text-muted-foreground">从领域判断到指数基金决策，让每一次复核都有据可循。</p></div><div className="flex gap-2"><Button variant="outline" className="min-h-11 rounded-xl" disabled={!research||locked} onClick={()=>setSettings(true)}><Settings2 className="size-4"/>研究设置</Button><Button className="min-h-11 rounded-xl px-5" disabled={!industryId||!research||locked} onClick={()=>void start()}>{busy?<Loader2 className="size-4 animate-spin motion-reduce:animate-none"/>:<Play className="size-4"/>}新建综合分析</Button></div></header>
    {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span className="flex items-center gap-2"><CircleAlert className="size-4 shrink-0"/>{error}</span><Button variant="ghost" size="sm" onClick={()=>{setError('');setRefresh(n=>n+1)}}>重新连接</Button></div>}
    {notice&&<p role="status" className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">{notice}</p>}

    <section className="grid overflow-hidden rounded-2xl border bg-card lg:grid-cols-[1.65fr_1fr]">
      <div className="relative overflow-hidden bg-slate-950 p-6 text-slate-50 sm:p-8 dark:bg-slate-900"><div aria-hidden className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full border border-white/10"/><div aria-hidden className="pointer-events-none absolute -right-8 -top-20 size-56 rounded-full border border-white/10"/>
        <div className="relative flex flex-wrap items-center gap-3"><span className="flex items-center gap-2 text-xs text-slate-300"><Layers3 className="size-4"/>当前研究领域</span><label htmlFor="workspace-industry" className="sr-only">选择研究领域</label><select id="workspace-industry" value={industryId} disabled={locked} onChange={e=>selectIndustry(e.target.value)} className="min-h-10 max-w-full rounded-lg border border-white/15 bg-slate-900 px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-blue-300"><option value="" disabled>{loading?'加载领域…':'选择领域'}</option>{industries.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div className="relative mt-7"><div className="mb-3 flex items-center gap-2 text-xs text-slate-400"><span className={cn('size-1.5 rounded-full',running?'bg-sky-400 motion-safe:animate-pulse':run?.status==='COMPLETED'?'bg-emerald-400':'bg-slate-400')}/>{run?`${run.metadata.kind==='review'?'复核轮次':'分析轮次'} · ${statusLabel[run.status]||run.status}`:'一套流程，持续研究'}</div><h2 className="text-2xl font-semibold leading-tight sm:text-3xl">{industry?.name||'选择你的研究领域'}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">{running?`正在${STEP_TITLES[currentStep?.stepName||'']||'准备研究证据'}。本轮的数据、规则与智能结论会统一归档。`:run?.status==='FAILED'?'分析中途遇到问题。已完成步骤与冻结证据均已保留，可从中断处继续。':evaluation?blocked===evaluation.decisions.length?'研究已形成；交易条件仍需更多证据。数据缺口不会被解释为买入或卖出信号。':`${eligible} 只指数基金满足实验规则，${blocked} 只仍受数据门禁限制。请结合证据与反证阅读。`:'市场趋势、企业景气与事件资讯，在同一份证据快照中交叉验证。'}</p></div>
        <div className="relative mt-7 flex flex-wrap items-center gap-4"><span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="size-3.5"/>{evaluation?`证据时点 ${time(evaluation.asOf)}`:run?`启动于 ${time(run.startedAt)}`:'开始后冻结最新本地证据'}</span><span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="size-3.5"/>{run?.metadata.publicOnly===false?'含授权私有解读 · 不进入公开报告':'公开研究 · 不读取个人持仓'}</span></div>
      </div>
      <div className="flex flex-col justify-between gap-6 p-6 sm:p-8"><div><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">本轮执行</p><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{run?.metadata.rulesOnly?'本地规则复核':'规则与智能分析'}</span></div><div className="mt-4 flex items-end gap-2"><span className="font-mono text-4xl tracking-tight">{progress.done}</span><span className="pb-1 text-sm text-muted-foreground">/ {progress.total} 步</span><span className="ml-auto pb-1 font-mono text-sm text-primary">{progress.percent}%</span></div><div role="progressbar" aria-label="综合分析进度" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{width:`${progress.percent}%`}}/></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{run?.status==='COMPLETED'?'步骤已完成不等于投资条件成立，数据门禁将单独展示。':running?'后台持续执行，进度自动更新。':'完整分析会调用已配置的智能分析接口。'}</p></div>
        <div className="flex flex-wrap gap-2">{reportId&&<Link href={`/comprehensive-analysis/report/${reportId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">阅读报告<ArrowUpRight className="size-4"/></Link>}{canReview&&<><Button variant="outline" className="min-h-11 rounded-xl" disabled={locked} onClick={()=>void start(run!.id)}><RefreshCw className="size-4"/>复核最新数据</Button><Button variant="ghost" className="min-h-11 rounded-xl text-xs" disabled={locked} onClick={()=>void start(run!.id,true)}>快速规则复核</Button></>}{run&&['FAILED','PENDING','PAUSED'].includes(run.status)&&<Button className="min-h-11 rounded-xl" disabled={locked} onClick={()=>void continueRun()}><Play className="size-4"/>继续本轮</Button>}{!run&&<span className="text-xs text-muted-foreground">点击右上角「新建综合分析」开始</span>}</div>
      </div>
    </section>

    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="研究概况">{[
      {label:'关联指数基金',value:evaluation?.decisions.length??quality?.requested??'—',detail:'逐标的检查，不重复计算指数',icon:Layers3},
      {label:'有效技术样本',value:quality?`${quality.usable} / ${quality.requested}`:'—',detail:'复权、时效与连续性同时满足',icon:Activity},
      {label:'事件证据',value:evaluation?.events.length??'—',detail:'公告与资讯按事件归并',icon:FileText},
      {label:'后续复核',value:research?.schedule.enabled?'已开启':'手动复核',detail:research?.schedule.enabled?research.schedule.times.join(' / ')+' · 本地规则':'从已完成报告发起新版本',icon:GitBranch},
    ].map(({label,value,detail,icon:Icon})=><div key={label} className="rounded-2xl border bg-card px-4 py-5 sm:px-5"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{label}</span><Icon className="size-4"/></div><p className="mt-3 font-mono text-2xl font-medium tracking-tight">{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}</section>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b"><div className="flex gap-5 sm:gap-8" aria-label="研究视图">{[{id:'flow',label:'分析流程',icon:Layers3},{id:'decisions',label:'决策与证据',icon:ShieldCheck},{id:'history',label:'历史版本',icon:History}].map(({id,label,icon:Icon})=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)} className={cn('flex min-h-12 items-center gap-2 border-b-2 text-sm transition-colors',tab===id?'border-primary font-medium text-primary':'border-transparent text-muted-foreground hover:text-foreground')}><Icon className="size-4"/>{label}</button>)}</div><span className="pb-2 text-[11px] text-muted-foreground">{runId?`轮次 ${runId.slice(-8).toUpperCase()}`:'尚未选择轮次'}</span></div>

    {tab==='flow'&&<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border bg-card"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="font-semibold">研究执行链路</h2><span className="text-xs text-muted-foreground">4 个阶段 · 同一份证据</span></div><div className="divide-y">{PHASES.map((phase,index)=>{
        const state=phaseState(run?.steps||[],phase.steps),steps=run?.steps.filter(s=>(phase.steps as readonly string[]).includes(s.stepName))||[],done=steps.filter(s=>['COMPLETED','SKIPPED'].includes(s.status)).length
        return <details key={phase.id} open={state==='running'||state==='failed'} className="group px-5 py-5"><summary className="flex min-h-12 cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden"><span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border font-mono text-sm',state==='completed'?'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':state==='running'?'border-primary/30 bg-primary/10 text-primary':state==='failed'?'border-destructive/20 bg-destructive/10 text-destructive':'bg-muted/30 text-muted-foreground')}>{state==='completed'?<Check className="size-5"/>:state==='running'?<Loader2 className="size-4 animate-spin motion-reduce:animate-none"/>:String(index+1).padStart(2,'0')}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{phase.title}</span><span className="mt-1 block text-xs text-muted-foreground">{phase.caption}</span></span><span className="hidden text-xs text-muted-foreground sm:block">{state==='skipped'?'未调用AI':state==='completed'?'已完成':state==='running'?'进行中':state==='failed'?'待恢复':'等待执行'}</span><span className="font-mono text-xs text-muted-foreground">{done}/{steps.length||phase.steps.length}</span><ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180"/></summary>
          <div className="ml-5 mt-4 space-y-1 border-l pl-8">{(steps.length?steps:phase.steps.map((name,i):RunStep=>({id:name,stepName:name,status:'PENDING',stepIndex:i,artifacts:[]}))).map(step=><div key={step.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">{step.status==='COMPLETED'?<CheckCircle2 className="size-3.5 text-emerald-600"/>:step.status==='RUNNING'?<Loader2 className="size-3.5 animate-spin text-primary motion-reduce:animate-none"/>:step.status==='FAILED'?<CircleAlert className="size-3.5 text-destructive"/>:<Circle className="size-3.5 text-muted-foreground/50"/>}<span className="flex-1">{STEP_TITLES[step.stepName]||step.stepName}</span>{step.duration!=null&&<span className="font-mono text-muted-foreground">{(step.duration/1000).toFixed(1)} 秒</span>}{runId&&step.status!=='PENDING'&&<Link className="inline-flex min-h-8 items-center text-primary hover:underline" href={`/comprehensive-analysis/run/${runId}/step/${step.stepName}`}>查看明细<ArrowUpRight className="ml-1 size-3"/></Link>}{step.error&&<p className="w-full break-words pl-6 leading-5 text-destructive">{step.error}</p>}{step.status==='RUNNING'&&step.progress?.message&&<p className="w-full pl-6 leading-5 text-muted-foreground">{step.progress.message}</p>}</div>)}</div>
        </details>
      })}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-4"><p className="text-xs leading-5 text-muted-foreground">已完成证据会保留；失败后可续执行，不重新抓取快照。</p>{run&&['PENDING','FAILED'].includes(run.status)&&<Button variant="ghost" size="sm" disabled={locked} onClick={()=>void continueRun('next')}>仅执行下一步<ArrowRight className="size-3.5"/></Button>}</div></section>
      <aside className="space-y-5"><section className="rounded-2xl border bg-card p-5"><div className="mb-4 flex items-center gap-2"><Sparkles className="size-4 text-primary"/><h2 className="font-semibold">本轮研判</h2></div>{summary?<p className="line-clamp-8 text-sm leading-7 text-muted-foreground">{summary}</p>:<div className="rounded-xl bg-muted/40 p-4"><p className="text-sm font-medium">{running?'智能分析正在梳理证据':'结论将在分析后生成'}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">先看市场与资金，再交叉验证企业景气和产业事件。规则限制不会被智能观点覆盖。</p></div>}{reportId&&<Link className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-medium text-primary" href={`/comprehensive-analysis/report/${reportId}`}>阅读完整论点与反证<ArrowRight className="size-3.5"/></Link>}</section>
        <section className="rounded-2xl border bg-card p-5"><div className="mb-4 flex items-center gap-2"><Database className="size-4 text-muted-foreground"/><h2 className="font-semibold">数据准备度</h2></div>{needed.length?<div className="space-y-4">{needed.map(item=><div key={item.label}><div className="flex items-start justify-between gap-3 text-xs"><span className="leading-5 text-muted-foreground">{item.label}</span><span className="shrink-0 rounded bg-amber-500/10 px-2 py-0.5 font-mono text-amber-800 dark:text-amber-300">{item.count} 只</span></div></div>)}</div>:<p className="text-sm leading-6 text-muted-foreground">{evaluation?'当前无未知数据条件，仍需检查未满足项与研究风险。':'冻结后将逐项检查时效、复权、财报与产品信息。'}</p>}<Link className="mt-5 inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-primary" href="/data-center/subscriptions">前往数据订阅<ArrowUpRight className="size-3.5"/></Link></section>
        <p className="px-1 text-xs leading-6 text-muted-foreground">实验性投研工具，不构成投资建议。执行成功、数据可用与投资条件成立是三个不同状态。</p>
      </aside>
    </div>}

    {tab==='decisions'&&(evaluation?<DecisionEvidencePanel key={evaluation.snapshotId} evaluation={evaluation}/>:<div className="rounded-2xl border bg-card p-12 text-center"><ShieldCheck className="mx-auto mb-4 size-8 text-muted-foreground/40"/><h2 className="font-medium">本轮尚未形成规则决策</h2><p className="mt-2 text-sm text-muted-foreground">质量复核完成后，逐只指数基金的条件与证据会出现在这里。</p><Button variant="outline" className="mt-5" onClick={()=>setTab('flow')}>查看执行进度</Button></div>)}

    {tab==='history'&&<div className="space-y-5"><section className="overflow-hidden rounded-2xl border bg-card"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-semibold">分析与复核版本</h2><p className="mt-1 text-xs text-muted-foreground">每轮独立归档，后续复核保留与原报告的关联。</p></div><span className="text-xs text-muted-foreground">显示 {visibleRuns.length} / {runs.length} 轮</span></div>{visibleRuns.map(item=><div key={item.id} className={cn('flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-0',runId===item.id&&'bg-primary/[0.03]')}><div className="flex min-w-0 items-start gap-3"><span className="mt-1 rounded-lg bg-muted p-2">{item.metadata?.parentRunId?<GitBranch className="size-4 text-primary"/>:<FileText className="size-4 text-muted-foreground"/>}</span><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{item.metadata?.rulesOnly?'规则复核':item.metadata?.parentRunId?'完整复核':'综合分析'}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px]',item.status==='COMPLETED'?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':item.status==='FAILED'?'bg-destructive/10 text-destructive':'bg-muted text-muted-foreground')}>{statusLabel[item.status]||item.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{time(item.startedAt)} · {item.progress.completed}/{item.progress.total} 步 · {item.id.slice(-8).toUpperCase()}</p>{item.metadata?.parentRunId&&<button type="button" className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs text-primary" onClick={()=>{selectRun(item.metadata.parentRunId!);setTab('flow')}}>基于 {item.metadata.parentRunId.slice(-8).toUpperCase()}<ArrowUpRight className="size-3"/></button>}</div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>{selectRun(item.id);setTab('flow')}} disabled={busy}>查看轮次</Button>{item.reportId&&<Link className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-medium text-primary hover:bg-primary/5" href={`/comprehensive-analysis/report/${item.reportId}`}>报告<ArrowUpRight className="ml-1 size-3.5"/></Link>}</div></div>)}{!runs.length&&<p className="p-12 text-center text-sm text-muted-foreground">当前领域还没有分析记录。</p>}{runs.length>currentRuns.length&&<div className="border-t bg-muted/20 p-4 text-center"><Button variant="ghost" size="sm" onClick={()=>setShowLegacy(value=>!value)}>{showLegacy?'仅显示当前20步流程':`查看 ${runs.length-currentRuns.length} 个旧版记录`}</Button></div>}</section>
      {evaluation?.workflow?.parentRunId&&<section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">本轮复核变化</h2><p className="mt-1 text-xs text-muted-foreground">比较指定原报告的冻结快照，而不是任意最近数据。</p>{evaluation.changes.length?evaluation.changes.map(c=><p key={c.ticker} className="mt-4 border-t pt-3 text-sm leading-6"><span className="font-mono">{c.ticker}</span> · {c.from} → {c.to}<br/><span className="text-muted-foreground">变化条件：{c.changedConditions.join('、')||'状态变化'}</span></p>):<p className="mt-4 text-sm text-muted-foreground">本轮未出现规则状态变化。新快照已保存，原报告保持不变。</p>}</section>}
    </div>}
    {settings&&research&&<ResearchSettings key={industryId} profile={research.profile} schedule={research.schedule} aiDestination={aiDestination} portfolioConsent={portfolioConsent} onClose={()=>setSettings(false)} onSaved={(profile,schedule,consent)=>{setPortfolioConsent(consent);setResearch({...research,profile,schedule});setNotice(consent?'研究设置已保存。下一次手动完整分析将包含授权的私有持仓解读，启动后授权自动清除。':'研究设置已保存，下一轮综合分析或复核将采用新配置。')}}/>}
  </div>
}
