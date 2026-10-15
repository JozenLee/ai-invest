import { constrainTargets } from '../strategy/kernel'
import type { Bar } from '../contracts'
import type { LabDataset, ModuleValue, StrategySpec, TargetPlan } from './contracts'

const mean = (v: number[]) => v.reduce((a,b) => a+b,0)/v.length
export function annualVolatility(bars: Bar[]) {
  const r = bars.slice(1).map((b,i) => b.close/bars[i].close-1)
  if (r.length < 20) return null
  const m = mean(r)
  return Math.sqrt(r.reduce((s,n) => s+(n-m)**2,0)/(r.length-1)*252)
}
/** Every input is sliced before computing a feature. No AI or future fundamentals are reconstructed. */
export function calculateModules(bars: Bar[], benchmark: Bar[], date: string): ModuleValue[] {
  const past = bars.filter(b => b.date <= date).slice(-61)
  const bmap = new Map(benchmark.filter(b => b.date <= date).map(b => [b.date,b]))
  const ready = past.length === 61 && past.at(-1)?.date === date && past.every(b => bmap.has(b.date))
  const ret = (days: number) => ready ? past.at(-1)!.close/past.at(-days-1)!.close-1 : null
  const momentum = ret(60), recent = ret(20)
  const relative = ready ? recent!-(bmap.get(date)!.close/bmap.get(past.at(-21)!.date)!.close-1) : null
  return [
    { id:'momentum',version:'1',value:momentum,unit:'ratio-60-sessions' },
    { id:'relative-strength',version:'1',value:relative,unit:'excess-20-sessions' },
    { id:'trend',version:'1',value:ready ? past.at(-1)!.close/mean(past.slice(-60).map(b=>b.close))-1 : null,unit:'distance-ma60' },
    { id:'volatility',version:'1',value:ready ? annualVolatility(past) : null,unit:'annualized-ratio' },
    { id:'short-trend',version:'1',value:ready?past.at(-1)!.close/mean(past.slice(-20).map(b=>b.close))-1:null,unit:'distance-ma20' },
    { id:'momentum-5',version:'1',value:ret(5),unit:'ratio-5-sessions' },
  ]
}

export function targetPlan(data: LabDataset, spec: StrategySpec, sourceDate: string, generatedAt: string, validUntil: string): TargetPlan {
  const features = data.assets.map(a => ({ ticker:a.ticker,modules:calculateModules(a.bars,data.benchmarkBars,sourceDate) }))
  const ranked = features.map(row => {
    const values = Object.fromEntries(row.modules.map(m=>[m.id,m.value]))
    const ready = spec.modules.every(id => values[id] !== null)
    let participation=1
    const relativeMet=!spec.modules.includes('relative-strength')||values['relative-strength']!>0
    if(spec.modules.includes('trend')){
      participation=values.trend!>0?1:0
      if(!participation&&spec.entryMode==='graded'){
        if(values.trend!>-.1&&relativeMet)participation=.5
        else if(values.trend!>-.2&&values['momentum-5']!>0&&relativeMet)participation=.25
      }
      if(!participation&&spec.entryMode==='probe'&&values['short-trend']!>0&&values['momentum-5']!>0&&relativeMet)participation=.25
    }
    const eligible=ready&&participation>0
    const score = (spec.modules.includes('momentum') ? values.momentum || 0 : 0)+(spec.modules.includes('relative-strength') ? values['relative-strength'] || 0 : 0)
    return { ...row,ready,participation,eligible,score,vol:values.volatility || .01,index:data.assets.find(a=>a.ticker===row.ticker)!.indexCode }
  })
  const eligible=ranked.filter(row=>row.eligible).sort((a,b)=>b.score-a.score || a.ticker.localeCompare(b.ticker))
  const indices = new Set<string>()
  const selected = eligible.filter(row=>{if(indices.has(row.index))return false;indices.add(row.index);return true}).slice(0,spec.topN)
  const targets: Record<string,number> = Object.fromEntries(data.assets.map(a=>[a.ticker,0]))
  // Equal weights, scaled by the largest constituent volatility; no covariance optimizer.
  const riskScale = selected.length && spec.modules.includes('volatility') ? Math.min(1,spec.targetVolatility/Math.max(...selected.map(row=>row.vol))) : 1
  for(const row of selected) targets[row.ticker] = Math.min(spec.maxWeight,spec.exposure*riskScale/selected.length*row.participation)
  return { id:`${spec.id}:${generatedAt}`,strategyId:spec.id,generatedAt,validUntil,sourceDate,targets:constrainTargets(targets,{},{maxWeight:spec.maxWeight,maxExposure:spec.exposure,maxTurnover:1}),features,
    decisions:ranked.map(row=>({ticker:row.ticker,status:!row.ready?'missing':row.eligible?'eligible':'watch',reason:!row.ready?'历史或基准数据不足':targets[row.ticker]>0?`进入候选，采用${row.participation*100}%档位并应用波动缩放`:row.eligible?'同指数去重或排名未进入前三':'未满足当前家族入场条件',trigger:spec.entryMode==='graded'?'60日趋势转正，或满足预登记的相对强度与分级条件':spec.entryMode==='probe'?'60日趋势转正，或20日均线、5日动量与相对强度同时转正':'收盘价站上60日均线',invalidation:'入场条件失效时在下一次调仓复核；回撤预算触发时下一可交易时点退出。'})),
    reason:selected.length ? `选择${selected.length}个不同指数暴露；趋势、相对强度与波动模块生成目标仓位` : '没有满足本版本条件的标的，目标为现金' }
}
