'use client'
import { useEffect,useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { UnifiedValidation } from '@/lib/research/strategy/validation'
const pct=(v:number|null|undefined)=>v==null?'尚无结果':`${v.toFixed(2)}%`
export function UnifiedValidationPanel({industryId}:{industryId:string}){
  const [result,setResult]=useState<UnifiedValidation|null>(null),[id,setId]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[verified,setVerified]=useState(false)
  const [scale,setScale]=useState('1'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[cost,setCost]=useState('3'),[slippage,setSlippage]=useState('5')
  const [relative,setRelative]=useState(''),[volatility,setVolatility]=useState(''),[profit,setProfit]=useState(false)
  const [executionMode,setExecutionMode]=useState('economic')
  const url=`/api/research/${encodeURIComponent(industryId)}/validation`
  useEffect(()=>{const controller=new AbortController();fetch(url,{signal:controller.signal,cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error);setResult(body.result);setId(body.runs[0]?.id||'');setLoaded(true)}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoaded(true)}});return()=>controller.abort()},[url])
  async function run(action:'compare'|'verify'){
    setBusy(true);setError('');setVerified(false)
    try{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='verify'?{action,id}:{action,adjustmentScale:Number(scale),policyPatch:{filters:{minRelative20Pct:relative===''?null:Number(relative),maxVolatilityPct:volatility===''?null:Number(volatility),requirePositiveProfit:profit}},protocol:{executionMode,...(start?{startDate:start}:{}),...(end?{endDate:end}:{}),commissionBps:Number(cost),slippageBps:Number(slippage)}})})
      const body=await response.json();if(!response.ok)throw new Error(body.error)
      if(action==='verify')setVerified(body.verified);else{setId(body.id);setResult(body.result)}
    }catch(e){setError(e instanceof Error?e.message:'历史验证失败')}finally{setBusy(false)}
  }
  return <section aria-label="统一策略历史验证" aria-busy={busy} className="space-y-4 rounded-2xl border bg-card p-5">
    <div><h3 className="text-lg font-semibold">统一策略历史验证</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">重放综合报告真实归档的目标仓位，并在相同资金、时段和成本下比较仓位幅度候选。下方价格规则实验独立展示，不代表综合AI策略收益。</p></div>
    <form onSubmit={e=>{e.preventDefault();void run('compare')}} className="space-y-4">
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div><Label htmlFor="unified-scale">候选调整幅度</Label><select id="unified-scale" value={scale} onChange={e=>setScale(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm"><option value="1">原幅度（检查一致性）</option><option value="0.5">原幅度的50%</option><option value="1.5">原幅度的150%</option></select></div>
        <div><Label htmlFor="unified-start">起始日期（可选）</Label><Input id="unified-start" className="mt-2 min-h-11" type="date" value={start} onChange={e=>setStart(e.target.value)}/></div>
        <div><Label htmlFor="unified-end">结束日期（可选）</Label><Input id="unified-end" className="mt-2 min-h-11" type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></div>
        <div><Label htmlFor="unified-cost">佣金（基点）</Label><Input id="unified-cost" className="mt-2 min-h-11" type="number" min="0" max="500" step="0.1" required value={cost} onChange={e=>setCost(e.target.value)}/></div>
        <div><Label htmlFor="unified-slip">滑点（基点）</Label><Input id="unified-slip" className="mt-2 min-h-11" type="number" min="0" max="500" step="0.1" required value={slippage} onChange={e=>setSlippage(e.target.value)}/></div>
      </fieldset>
      <div><Label htmlFor="unified-execution">成交验证口径</Label><select id="unified-execution" value={executionMode} disabled={busy} onChange={e=>setExecutionMode(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm"><option value="economic">经济份额模拟（含佣金与滑点）</option><option value="exchange">严格场内成交（缺少历史限制时不成交）</option></select></div>
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">候选证据条件（只限制新增暴露）</summary><div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="unified-relative">最低20日相对收益（百分点）</Label><Input id="unified-relative" type="number" step="0.1" value={relative} onChange={e=>setRelative(e.target.value)} disabled={busy}/></div><div><Label htmlFor="unified-volatility">最高年化波动率（%）</Label><Input id="unified-volatility" type="number" min="0" step="0.1" value={volatility} onChange={e=>setVolatility(e.target.value)} disabled={busy}/></div><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={profit} onChange={e=>setProfit(e.target.checked)} disabled={busy}/>要求归档利润同比为正</label></div><p className="mt-2 text-sm text-muted-foreground">留空表示不启用。缺少当时的特征时阻断新增暴露，不使用最新财报回填。</p></details>
      <div className="flex flex-wrap gap-3"><Button type="submit" className="min-h-11" disabled={busy||!loaded}>{busy?'正在验证…':'登记候选并对照验证'}</Button><Button type="button" variant="outline" className="min-h-11" disabled={busy||!id} onClick={()=>void run('verify')}>精确重放本次结果</Button></div>
    </form>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {verified&&<p role="status" className="text-sm">重放通过：归档输入、完整组合结果及哈希一致。</p>}
    {!loaded&&<p role="status" className="text-sm">正在读取验证记录…</p>}
    {loaded&&!result&&<p className="text-sm leading-6 text-muted-foreground">尚无统一策略验证记录。新版综合报告归档后可运行；历史旧报告不会被补造为当时的统一策略。</p>}
    {result&&<>
      <p className="rounded-lg bg-muted/40 p-3 text-sm leading-6">{result.status==='incomplete-coverage'?'覆盖不完整':result.status==='insufficient-history'?'有效样本不足':'已完成描述性对照'} · 已接纳 {result.accepted} 份归档决策，排除 {result.exclusions.length} 份，待后续行情 {result.pending?.length||0} 份。企业与事件仅使用原归档证据，未重新推理历史AI。</p>
      <div className="grid gap-3 sm:grid-cols-2">{[{title:'原始统一目标',value:result.baseline},{title:'候选目标',value:result.challenger}].map(row=><div key={row.title} className="rounded-xl border p-4"><h4 className="font-medium">{row.title}</h4><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt>扣费收益</dt><dd className="mt-1 font-mono">{pct(row.value.returnPct)}</dd></div><div><dt>最大回撤</dt><dd className="mt-1 font-mono">{pct(row.value.maxDrawdownPct)}</dd></div><div><dt>观察 / 成交</dt><dd>{row.value.observations} / {row.value.trades}</dd></div><div><dt>费用</dt><dd>{row.value.costs.toFixed(2)}</dd></div></dl></div>)}</div>
      <p className="text-sm leading-6">候选收益差 {pct(result.incrementalReturnPct)}；双倍成本下原策略 {pct(result.doubleCost.baseline.returnPct)}，候选 {pct(result.doubleCost.candidate.returnPct)}。时间留出用于诊断，尚未成为独立前瞻证明。</p>
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">覆盖范围、排除原因与时间窗口</summary><div className="space-y-2 text-sm leading-6"><p>{result.protocol.startDate} 至 {result.protocol.endDate} · {result.coverage.priceAssets}只产品 · {result.coverage.commonSessions}个共同交易日</p>{result.exclusions.map((row,i)=><p key={`${row.decisionId}:${i}`}>{row.decisionId.slice(-12)}：{row.reason}</p>)}{result.folds.map(fold=><p key={fold.startDate}>{fold.startDate} 至 {fold.endDate}：原策略 {pct(fold.baseline.returnPct)}，候选 {pct(fold.candidate.returnPct)}</p>)}{result.sensitivity?.map(row=><p key={row.adjustmentScale}>幅度敏感性 {row.adjustmentScale.toFixed(2)}倍：收益 {pct(row.returnPct)} · 回撤 {pct(row.maxDrawdownPct)}</p>)}{result.limitations.map(text=><p key={text}>{text}</p>)}</div></details>
    </>}
  </section>
}
