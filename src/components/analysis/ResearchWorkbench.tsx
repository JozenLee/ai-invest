'use client'

import { useEffect, useState } from 'react'
import type { Evaluation, Profile } from '@/lib/research/contracts'
import type { replayResearch } from '@/lib/research/replay'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const states={blocked:'证据不足',watch:'观察',eligible:'条件满足（实验）','risk-off':'风险收缩（实验）'}
const conditionStates={met:'已满足',unmet:'未满足',unknown:'未知'}
const display=(v:unknown)=>typeof v==='number'?Number(v.toFixed(3)).toLocaleString('zh-CN'):v==null?'—':String(v)
export function ResearchEvaluation({evaluation}:{evaluation:Evaluation}) {
  const [evidenceLimit,setEvidenceLimit]=useState(50)
  return <div className="space-y-4">
    <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm leading-6">实验规则，尚未通过样本外验证，不自动下单。分析时点：{new Date(evaluation.asOf).toLocaleString('zh-CN')}；统一交易日：{evaluation.expectedSession||'日历未核验'}。同一指数只计一次，指数有效覆盖 {evaluation.indexBreadth.usableIndices}/{evaluation.indexBreadth.mappedIndices}。</p>
    {!!evaluation.changes.length&&<details className="rounded-lg border p-4"><summary className="cursor-pointer py-2 font-medium">本轮 {evaluation.changes.length} 项状态或条件变化</summary>{evaluation.changes.map(c=><p key={c.ticker} className="mt-3 break-words text-sm leading-6">{c.ticker}：{c.from} → {c.to}；变化条件：{c.changedConditions.join('、')}。{c.reason}</p>)}</details>}
    {!!evaluation.products?.length&&<details className="rounded-lg border p-4"><summary className="cursor-pointer py-2 font-medium">指数暴露与同指数ETF比较</summary><p className="mt-2 text-sm leading-6 text-muted-foreground">只比较已核验映射；未知不排名。披露权重不是实时穿透；跟踪波动按可比净值与指数收益计算，不等同基金合同披露值。</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{evaluation.products.map(p=><div key={p.ticker} className="rounded-lg bg-muted/40 p-3 text-sm leading-6"><p className="font-medium">{p.ticker} → {p.indexCode||'指数待核验'}</p><p>管理费 {display(p.feePct)}% · 份额变化 {display(p.shareChangePct)}%<br/>净值日期 {p.navDate||'未知'} · 年化跟踪波动 {display(p.trackingErrorPct)}%</p><p>同指数候选：{p.alternatives.join('、')||'无已核验候选'}</p>{p.exposure.map(e=><p key={e.segment}>{e.segment}：{display(e.weightPct)}%</p>)}</div>)}</div></details>}
    {evaluation.decisions.map(d=><details key={d.ticker} className="rounded-xl border p-4">
      <summary className="cursor-pointer py-2"><span className="font-medium">{d.name}（{d.ticker}）</span><Badge className="ml-3" variant="outline">{states[d.state]}</Badge><span className="mt-2 block text-sm text-muted-foreground">指数 {d.indexCode||'未映射'} · 未持有：{d.unheldAction} · 已持有：{d.heldAction} · {d.gaps.length} 项未满足/未知</span></summary>
      <p className="my-3 break-words text-sm leading-6">{d.reason}</p>
      <div className="grid gap-2 sm:grid-cols-2">{d.conditions.map(c=><div key={c.key} className="rounded-lg bg-muted/40 p-3 text-sm"><div className="flex justify-between gap-2"><span>{c.label}</span><span className="shrink-0 font-medium">{conditionStates[c.status]}</span></div><p className="mt-2 font-mono">{display(c.value)} {c.operator} {display(c.threshold)}</p><p className="mt-1 break-all text-xs text-muted-foreground">证据：{c.evidenceIds.join('、')||'暂无有效来源'}</p></div>)}</div>
      <p className="mt-4 text-sm leading-6">失效条件：{d.invalidation}<br/>有效至：{new Date(d.expiresAt).toLocaleString('zh-CN')}，发生新事件须提前复核。</p>
    </details>)}
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer py-2 font-medium">事件与原始证据（{evaluation.events.length} 个事件簇）</summary>
      {[...new Map(evaluation.events.map(event=>[event.id,event])).values()].slice(0,30).map((e,eventIndex)=><article key={`${e.id}-${eventIndex}`} className="mt-4 border-t pt-3 text-sm leading-6"><p className="font-medium">{e.title} · {e.status==='lead'?'待核实线索':'有正文证据'}</p><p>{e.excerpt}</p><p className="text-muted-foreground">{e.publishedAt} · {e.sources.join(' / ')}；转载不计为独立核验</p>{[...new Set(e.urls.filter(url=>/^https?:\/\//i.test(url)))].map((url,urlIndex)=><a key={`${url}-${urlIndex}`} href={url} target="_blank" rel="noreferrer" className="mr-3 inline-block py-2 text-primary underline">查看原文</a>)}</article>)}
      <details className="mt-4"><summary className="cursor-pointer py-2">来源清单与校验值（{evaluation.evidence.length}）</summary>
        <div className="max-h-96 space-y-3 overflow-auto">{[...new Map(evaluation.evidence.map(item=>[item.id,item])).values()].slice(0,evidenceLimit).map((e,index)=><div key={`${e.id}-${index}`} className="break-all text-xs leading-5"><p>{e.id} · {e.source} · 数据日期 {e.dataDate||'未知'} · 发布 {e.publishedAt||'未知'} · 采集 {e.fetchedAt}<br/>校验：{e.hash}</p><a className="inline-block min-h-11 py-3 text-primary underline" target="_blank" rel="noreferrer" href={`/api/research/${encodeURIComponent(evaluation.profile.industryId)}?snapshot=${encodeURIComponent(evaluation.snapshotId)}&evidence=${encodeURIComponent(e.id)}`}>查看冻结原始记录</a></div>)}</div>
        {evidenceLimit<evaluation.evidence.length&&<Button variant="outline" className="mt-3 min-h-11" onClick={()=>setEvidenceLimit(n=>n+50)}>加载更多来源</Button>}
      </details>
    </details>
  </div>
}
type History={snapshotId:string;asOf:string;changes:number}
export function ResearchWorkbench() {
  const [industries,setIndustries]=useState<Array<{id:string;name:string}>>([]),[industry,setIndustry]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[evaluation,setEvaluation]=useState<Evaluation|null>(null),[history,setHistory]=useState<History[]>([])
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[advanced,setAdvanced]=useState(''),[replay,setReplay]=useState<ReturnType<typeof replayResearch>|null>(null)
  const [commission,setCommission]=useState(3),[slippage,setSlippage]=useState(5)
  const [schedule,setSchedule]=useState({enabled:false,times:['08:50','19:30']}),[scheduleTimes,setScheduleTimes]=useState('08:50,19:30'),[reviews,setReviews]=useState<Array<{status:string;error?:string;asOf?:string;changes?:number}>>([])
  useEffect(()=>{const controller=new AbortController();fetch('/api/data-subscriptions/industries',{signal:controller.signal}).then(r=>r.json()).then(p=>{const rows=p.data||p;if(!Array.isArray(rows))throw new Error('领域列表无效');setIndustries(rows);if(rows[0])setIndustry(rows[0].id);else setLoading(false)}).catch(e=>{if(e.name!=='AbortError'){setError('领域列表加载失败，请刷新后重试');setLoading(false)}});return()=>controller.abort()},[])
  useEffect(()=>{
    if(!industry)return
    const controller=new AbortController()
    fetch('/api/research/'+encodeURIComponent(industry),{signal:controller.signal}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error);setProfile(p.profile);setAdvanced(JSON.stringify({segments:p.profile.segments,leaders:p.profile.leaders},null,2));setEvaluation(p.evaluation);setHistory(p.history);setSchedule(p.schedule);setScheduleTimes(p.schedule.times.join(','));setReviews(p.reviews||[])}).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[industry])
  async function submit(action:string,extra:Record<string,unknown>={}) {
    setBusy(true);setError('');setNotice('')
    try{
      const response=await fetch('/api/research/'+encodeURIComponent(industry),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})}),data=await response.json()
      if(!response.ok)throw new Error(data.error||'请求失败')
      if(data.evaluation)setEvaluation(data.evaluation)
      if(action==='replay')setReplay(data)
      if(action==='evaluate')setHistory(h=>[{snapshotId:data.evaluation.snapshotId,asOf:data.evaluation.asOf,changes:data.evaluation.changes.length},...h].slice(0,30))
      setNotice(action==='schedule'?'复核计划已保存。需Python数据服务运行，定时只读本地数据，不调用外部AI。':action==='profile'?'领域配置已保存；下一次复核使用新版本，旧快照不变。':action==='evaluate'?'本地复核完成，未调用外部AI或触发采集。':action==='inspect'?'已重放保存的快照，未使用今天的数据替换历史证据。':'模拟验证完成；不代表策略有效。')
    }catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}
  }
  function save(){try{const extra=JSON.parse(advanced);void submit('profile',{profile:{...profile,segments:extra.segments,leaders:extra.leaders}})}catch{setError('细分环节与领先企业必须为有效JSON')}}
  function changeIndustry(value:string){setLoading(true);setProfile(null);setEvaluation(null);setHistory([]);setReplay(null);setError('');setNotice('');setIndustry(value)}
  return <Card className="space-y-5 p-4 sm:p-6" aria-labelledby="research-workbench-title">
    <div><h2 id="research-workbench-title" className="text-xl font-semibold">领域研究与决策复核</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">数据校验 → 证据整理 → 条件决策与版本跟踪。只读取本地订阅，不调用外部智能分析、不交易。</p></div>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-48 flex-1"><Label htmlFor="research-industry">研究领域</Label><select id="research-industry" value={industry} disabled={busy} onChange={e=>changeIndustry(e.target.value)} className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">{industries.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div><Button className="min-h-11" disabled={!profile||busy||loading} onClick={()=>void submit('evaluate')}>{busy?'处理中…':'冻结并复核当前数据'}</Button></div>
    {loading&&<p role="status">正在读取领域配置与历史…</p>}{error&&<p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
    {profile&&<details className="rounded-lg border p-4"><summary className="cursor-pointer py-2 font-medium">领域配置与实验规则</summary><p className="mt-2 text-sm text-muted-foreground">阈值是可编辑的实验假设，不是已验证投资参数。板块名需与订阅原始名称完全一致。</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="research-benchmark">基准指数</Label><Input id="research-benchmark" value={profile.benchmark} onChange={e=>setProfile({...profile,benchmark:e.target.value})}/></div><div><Label htmlFor="research-sectors">领域资金板块（逗号分隔）</Label><Input id="research-sectors" value={profile.sectors.join(',')} onChange={e=>setProfile({...profile,sectors:e.target.value.split(/[,，]/).filter(Boolean)})}/></div>{Object.entries(profile.rules).map(([key,value])=><div key={key}><Label htmlFor={'research-rule-'+key}>{{minHistory:'历史样本数',maxPremiumPct:'最大绝对折溢价(%)',minDailyAmount:'最低日均成交额(元)',maxSpreadBps:'最大价差(bps)',maxVolatilityPct:'最高年化波动(%)',flowDays:'资金观察交易日',entryConfirmDays:'趋势确认交易日'}[key]}</Label><Input id={'research-rule-'+key} type="number" value={value} onChange={e=>setProfile({...profile,rules:{...profile.rules,[key]:Number(e.target.value)}})}/></div>)}</div><Label htmlFor="research-advanced" className="mt-4 block">细分环节与领先企业（结构化配置）</Label><textarea id="research-advanced" className="mt-2 min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm focus-visible:outline-2 focus-visible:outline-ring" value={advanced} onChange={e=>setAdvanced(e.target.value)}/><p className="text-xs leading-5 text-muted-foreground">segments: [&#123;name, companies:[代码]&#125;]；leaders: [&#123;code, name, segment&#125;]。领先企业无需属于ETF持仓；未采集的数据会显示缺口。</p><Button className="mt-4 min-h-11" disabled={busy} onClick={save}>保存领域配置</Button></details>}
    {profile&&<details className="rounded-lg border p-4"><summary className="cursor-pointer py-2 font-medium">盘前 / 盘后自动复核（默认关闭）</summary><p className="mt-2 text-sm leading-6 text-muted-foreground">依赖Python数据服务。定时复核只保存本地证据和条件变化，不采集、不调用AI、不发布；新事件可随时手动复核。</p><label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={schedule.enabled} onChange={e=>setSchedule({...schedule,enabled:e.target.checked})}/>启用本领域自动复核</label><Label htmlFor="research-schedule-times">北京时间（逗号分隔，每日最多4次）</Label><Input id="research-schedule-times" value={scheduleTimes} onChange={e=>setScheduleTimes(e.target.value)}/><Button variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={()=>void submit('schedule',{schedule:{...schedule,times:scheduleTimes.split(/[,，]/).map(t=>t.trim()).filter(Boolean)}})}>保存复核计划</Button>{reviews.map((r,i)=><p key={i} className="mt-3 text-sm">{r.asOf||'最近任务'} · {r.status} {r.error||''}{r.changes!==undefined?` · ${r.changes} 项条件变化`:''}</p>)}</details>}
    {evaluation?<ResearchEvaluation evaluation={evaluation}/>:!loading&&<p className="rounded-lg bg-muted/40 p-5 text-sm">尚无版本化决策。先确认配置，再冻结并复核；关键数据缺失时会明确显示阻断原因。</p>}
    {!!history.length&&<details className="rounded-lg border p-4"><summary className="cursor-pointer py-2 font-medium">历史复核与模拟验证（{history.length} 轮）</summary><div className="mt-3 flex flex-wrap gap-2">{history.map(h=><Button key={h.snapshotId} variant="outline" className="min-h-11" disabled={busy} onClick={()=>void submit('inspect',{snapshotId:h.snapshotId})}>{new Date(h.asOf).toLocaleString('zh-CN')}</Button>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><Label htmlFor="paper-commission">单边佣金(bps)</Label><Input id="paper-commission" type="number" min="0" value={commission} onChange={e=>setCommission(Number(e.target.value))}/></div><div><Label htmlFor="paper-slippage">单边滑点(bps)</Label><Input id="paper-slippage" type="number" min="0" value={slippage} onChange={e=>setSlippage(Number(e.target.value))}/></div><Button className="min-h-11 self-end" disabled={busy||history.length<2} onClick={()=>void submit('replay',{snapshotIds:history.map(h=>h.snapshotId),commissionBps:commission,slippageBps:slippage})}>按历史快照模拟验证</Button></div>{replay&&<div role="status" className="mt-4 space-y-2 text-sm"><p>{replay.reason}</p>{replay.results?.map(r=><p key={r.ticker}>{r.ticker}：{r.status} · 模拟收益 {display(r.returnPct)}% · 基准 {display(r.benchmarkReturnPct)}% · 回撤 {display(r.maxDrawdownPct)}% · 成交 {r.trades.length} 次</p>)}</div>}</details>}
  </Card>
}
