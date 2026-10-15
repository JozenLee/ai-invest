import type { LabDataset, TargetPlan } from './contracts'

/** Results are generated after a fixed horizon. Scores are never treated as probabilities. */
export function labelOutcomes(data:LabDataset,plans:TargetPlan[],horizon=20){
  const samples:Array<{planId:string;ticker:string;startDate:string;endDate:string;returnPct:number;excessReturnPct:number;modules:TargetPlan['features'][number]['modules']}>=[]
  let pending=0,rejected=0
  const benchmark=new Map(data.benchmarkBars.map(b=>[b.date,b]))
  const seen=new Set<string>()
  for(const plan of plans){
    const start=data.benchmarkBars.findIndex(b=>Date.parse(`${b.date}T09:30:00+08:00`)>Date.parse(plan.generatedAt))
    const window=start<0?[]:data.benchmarkBars.slice(start,start+horizon)
    const session=window[0]?.date||plan.scheduledSession||`after:${plan.generatedAt}`
    const first=window[0],last=window.at(-1)!
    if(first&&plan.scheduledSession&&first.date!==plan.scheduledSession){rejected+=plan.features.length;continue}
    if(!Number.isFinite(Date.parse(plan.generatedAt))||!Number.isFinite(Date.parse(plan.validUntil))||Date.parse(plan.validUntil)<=Date.parse(`${session}T09:30:00+08:00`)){rejected+=plan.features.length;continue}
    for(const feature of plan.features){
      const key=`${feature.ticker}:${session}`
      if(seen.has(key))continue
      seen.add(key)
      if(window.length<horizon){pending++;continue}
      const bars=new Map(data.assets.find(a=>a.ticker===feature.ticker)?.bars.map(b=>[b.date,b])||[])
      if(window.some(b=>!bars.has(b.date))){rejected++;continue}
      const returnPct=(bars.get(last.date)!.close/bars.get(first.date)!.open-1)*100
      const benchmarkReturn=(benchmark.get(last.date)!.close/benchmark.get(first.date)!.open-1)*100
      samples.push({planId:plan.id,ticker:feature.ticker,startDate:first.date,endDate:last.date,returnPct,excessReturnPct:returnPct-benchmarkReturn,modules:feature.modules})
    }
  }
  const ids=[...new Set(plans.flatMap(p=>p.features.flatMap(f=>f.modules.map(m=>m.id))))]
  const moduleEvaluation=ids.map(id=>{
    const available=samples.flatMap(sample=>{const feature=sample.modules.find(m=>m.id===id);return feature?.value==null?[]:[{value:feature.value,outcome:sample.excessReturnPct}]})
    const mean=available.length?available.reduce((s,p)=>s+p.outcome,0)/available.length:null
    const sorted=[...available].sort((a,b)=>a.value-b.value),count=Math.floor(sorted.length/3)
    const separable=count>=10&&sorted[count-1].value<sorted[sorted.length-count].value
    const bucketMean=(rows:typeof sorted)=>rows.reduce((s,p)=>s+p.outcome,0)/rows.length
    return {id,samples:available.length,meanExcessReturnPct:mean,highMinusLowPct:separable?bucketMean(sorted.slice(-count))-bucketMean(sorted.slice(0,count)):null,status:separable?'descriptive-only':'insufficient',basis:'同产品同日期去重后的高低三分组描述；相邻期限和同指数相关性未消除，不用于自动赋权'}
  })
  return {horizonTradingDays:horizon,matured:samples.length,pending,rejected,samples,moduleEvaluation,
    basis:'按归档后的下一开盘起算20个交易日；同产品同起算日去重。结果为毛收益标签，组合收益另扣成本；模块分数不解释为概率。'}
}
