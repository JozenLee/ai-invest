import { describe, expect, it } from 'vitest'
import { fixture } from './fixtures'
import { STRATEGIES, type LabDataset, type TargetPlan } from '../lab/contracts'
import { calculateModules, targetPlan } from '../lab/modules'
import { simulatePortfolio } from '../lab/simulator'
import { datasetFromSnapshot, runExperiment } from '../lab/experiment'
import { extendDataset } from '../lab/history'
import { labelOutcomes } from '../lab/outcomes'
import { attachFrozenModules } from '../lab/frozen-modules'
import { evaluateResearch } from '../engine'
import { proposeChallengers } from '../lab/evolution'
import { labRunDue } from '../lab/schedule'

function data():LabDataset{
  const snapshot=fixture()
  return datasetFromSnapshot(snapshot)
}
function flatData(){
  const d=data()
  const flat=(b:LabDataset['benchmarkBars'][number])=>({...b,open:100,high:100,low:100,close:100})
  d.assets[0].bars=d.assets[0].bars.map(flat);d.benchmarkBars=d.benchmarkBars.map(flat)
  return d
}
const spec={...STRATEGIES[0],maxWeight:1,drawdownBudget:.5}
function plan(d:LabDataset,index:number,weight:number):TargetPlan{
  const date=d.benchmarkBars[index].date,next=d.benchmarkBars[index+1].date
  return {id:`p${index}`,strategyId:spec.id,sourceDate:date,generatedAt:`${date}T16:00:00+08:00`,validUntil:`${next}T15:00:00+08:00`,targets:{'159995':weight},reason:'fixture',features:[]}
}

describe('strategy laboratory portfolio accounting',()=>{
  it('runs after the China close and retries stale data without silently marking the day complete',()=>{
    const now=new Date('2026-10-12T12:10:00Z')
    expect(labRunDue(new Date('2026-10-12T11:34:00Z'))).toBe(false)
    expect(labRunDue(now)).toBe(true)
    expect(labRunDue(now,{fetchedAt:new Date('2026-10-12T11:35:00Z'),payload:'{"status":"waiting-data"}'})).toBe(true)
    expect(labRunDue(now,{fetchedAt:new Date('2026-10-12T11:55:00Z'),payload:'{"status":"failed"}'})).toBe(false)
    expect(labRunDue(now,{fetchedAt:new Date('2026-10-12T11:35:00Z'),payload:'{"status":"completed"}'})).toBe(false)
    expect(labRunDue(new Date('2026-10-11T12:10:00Z'))).toBe(false)
  })
  it('registers bounded challengers only after enough history and never registers the same parent twice',()=>{
    const result=runExperiment(data())
    expect(proposeChallengers(result,STRATEGIES)).toEqual([])
    const row=result.strategies[0];row.historical.observations=126;row.historical.maxDrawdownPct=10
    row.rolling={...row.rolling,status:'historical-qualified'}
    row.ablations[0]={...row.ablations[0],incrementalReturnPct:-2,maxDrawdownPct:9}
    const proposed=proposeChallengers(result,STRATEGIES)
    expect(proposed).toHaveLength(1)
    expect(proposed[0].modules).not.toContain('momentum')
    expect(proposeChallengers(result,[...STRATEGIES,...proposed])).toEqual([])
  })
  it('archives original financial evidence as shadow features without changing portfolio weights',()=>{
    const d=data(),p=plan(d,70,.5),evaluation=evaluateResearch(fixture())
    p.features=[{ticker:'159995',modules:calculateModules(d.assets[0].bars,d.benchmarkBars,p.sourceDate)}]
    const enriched=attachFrozenModules(p,evaluation)
    expect(enriched.targets).toEqual(p.targets)
    expect(enriched.features[0].modules.find(m=>m.id==='fundamental-profit')).toMatchObject({value:20,evidenceIds:['raw-one']})
    expect(enriched.features[0].modules.some(m=>m.id==='event-evidence')).toBe(true)
  })
  it('executes partial targets at the next open, funds costs from cash, and reconciles attribution',()=>{
    const d=flatData(),p=plan(d,70,.5),sell=plan(d,71,0)
    const result=simulatePortfolio(d,spec,{mode:'forward-paper',initialCapital:1000,plans:[p,sell],costs:{commissionBps:100,slippageBps:0}})
    expect(result.fills[0]).toMatchObject({date:d.benchmarkBars[71].date,notional:500,cost:5,units:5})
    expect(result.fills[1]).toMatchObject({date:d.benchmarkBars[72].date,notional:500,cost:5})
    expect(result.returnPct).toBeCloseTo(-1)
    expect(result.attribution.reduce((s,a)=>s+a.pnl,0)).toBeCloseTo(-10)
    expect(result.equity.every(e=>e.cashWeight>=-1e-10&&e.cashWeight<=1+1e-10)).toBe(true)
  })
  it('reserves transaction costs for a full investment without negative cash',()=>{
    const d=flatData(),result=simulatePortfolio(d,spec,{mode:'forward-paper',plans:[plan(d,70,1)],costs:{commissionBps:100,slippageBps:0}})
    expect(result.fills[0].notional).toBeCloseTo(100000/1.01)
    expect(result.equity[0].cashWeight).toBeCloseTo(0)
  })
  it('records daily shadow observations without turning weekly allocation into daily trading',()=>{
    const d=flatData(),buy=plan(d,70,.5),observation={...plan(d,71,0),rebalance:false}
    const result=simulatePortfolio(d,spec,{mode:'forward-paper',plans:[buy,observation]})
    expect(result.trades).toBe(1);expect(result.fills[0].side).toBe('buy')
  })
  it('does not revive an expired signal or give it an earlier fill',()=>{
    const d=data(),p=plan(d,70,.5);p.validUntil=`${d.benchmarkBars[71].date}T09:00:00+08:00`
    const result=simulatePortfolio(d,spec,{mode:'forward-paper',plans:[p]})
    expect(result.trades).toBe(0);expect(result.skipped[0].reason).toContain('过期')
  })
  it('supersedes old signals, rejects leverage, and never buys on a zero-volume day',()=>{
    const d=flatData(),p=plan(d,70,.5),latest={...p,id:'new',generatedAt:`${d.benchmarkBars[71].date}T08:30:00+08:00`,targets:{'159995':1.2}}
    let result=simulatePortfolio(d,spec,{mode:'forward-paper',plans:[p,latest]})
    expect(result.trades).toBe(0);expect(result.skipped).toHaveLength(2)
    d.assets[0].bars[71].volume=0
    result=simulatePortfolio(d,spec,{mode:'forward-paper',plans:[p]})
    expect(result.trades).toBe(0);expect(result.skipped[0].reason).toContain('无成交量')
  })
  it('reacts to a drawdown at the following open instead of using a future exit price',()=>{
    const d=flatData(),p=plan(d,70,1)
    for(const b of d.assets[0].bars.slice(72)){b.open=40;b.high=40;b.low=40;b.close=40}
    const result=simulatePortfolio(d,spec,{mode:'forward-paper',plans:[p],costs:{commissionBps:0,slippageBps:0}})
    expect(result.halted).toBe(true)
    expect(result.fills[1]).toMatchObject({side:'sell',price:40,date:d.benchmarkBars[73].date})
    expect(result.maxDrawdownPct).toBeCloseTo(60)
  })
  it('does not change historical decisions when later prices change',()=>{
    const d=data(),changed=structuredClone(d),date=d.benchmarkBars[90].date
    for(const b of changed.assets[0].bars.filter(b=>b.date>date)){b.close*=20;b.open*=20}
    expect(calculateModules(d.assets[0].bars,d.benchmarkBars,date)).toEqual(calculateModules(changed.assets[0].bars,changed.benchmarkBars,date))
    const a=simulatePortfolio(d,spec,{mode:'historical-reconstruction'}),b=simulatePortfolio(changed,spec,{mode:'historical-reconstruction'})
    expect(a.fills.filter(t=>t.date<=date)).toEqual(b.fills.filter(t=>t.date<=date))
  })
  it('keeps one product per index and respects per-product and portfolio exposure',()=>{
    const d=data();d.assets.push({...d.assets[0],ticker:'duplicate'})
    const p=targetPlan(d,STRATEGIES[2],d.benchmarkBars.at(-1)!.date,d.asOf,'2026-09-07T15:00:00+08:00')
    expect(Object.values(p.targets).filter(v=>v>0)).toHaveLength(1)
    expect(Math.max(...Object.values(p.targets))).toBeLessThanOrEqual(.5)
  })
  it('aligns different history starts but rejects an internal trading-session gap',()=>{
    const s=fixture();s.benchmarkBars=s.benchmarkBars.slice(15)
    expect(datasetFromSnapshot(s).assets).toHaveLength(1)
    s.etfs[0].bars.splice(60,1)
    expect(datasetFromSnapshot(s).assets).toHaveLength(0)
  })
  it('extends compatible price vintages without a split discontinuity or overwriting overlap',()=>{
    const old=data(),current=structuredClone(old)
    current.asOf='2026-09-07T15:00:00+08:00'
    current.assets[0].bars=current.assets[0].bars.slice(50).map(b=>({...b,open:b.open/2,high:b.high/2,low:b.low/2,close:b.close/2}))
    const merged=extendDataset(current,[old])
    expect(merged.assets[0].bars).toHaveLength(old.assets[0].bars.length)
    expect(merged.assets[0].bars[0].close).toBe(old.assets[0].bars[0].close/2)
    current.assets[0].bars[0].close+=2
    expect(extendDataset(current,[old]).assets[0].bars.length).toBe(current.assets[0].bars.length)
  })
  it('labels only mature, deduplicated predictions and does not convert confidence to probability',()=>{
    const d=data(),p=plan(d,70,.5);p.features=[{ticker:'159995',modules:calculateModules(d.assets[0].bars,d.benchmarkBars,p.sourceDate)}]
    const immature=plan(d,140,.5);immature.features=p.features
    const labels=labelOutcomes(d,[p,{...p,id:'duplicate'},immature,{...immature,id:'duplicate-pending'}])
    expect(labels.matured).toBe(1);expect(labels.pending).toBe(1)
    expect(labels.samples[0].endDate).toBe(d.benchmarkBars[90].date)
  })
  it('never promotes a successful historical curve without forward evidence',()=>{
    const result=runExperiment(data())
    expect(result.strategies).toHaveLength(3)
    expect(result.strategies.every(s=>s.historical.observations>0&&s.forward.observations===0&&s.promotion.status==='collecting-evidence'&&!s.promotion.autoPromoted)).toBe(true)
    expect(result.strategies[0].ablations).toHaveLength(4)
    expect(result.strategies[0].historical.equity[0].date).toEqual(result.baseline.equity[0].date)
  })
  it('refuses a truncated forward account rather than restarting it from cash and reporting a new return',()=>{
    const d=data(),p=plan(d,10,.5)
    d.assets[0].bars=d.assets[0].bars.slice(20)
    const result=runExperiment(d,[p])
    expect(result.strategies[0].forward.returnPct).toBeNull()
    expect(result.strategies[0].forward.skipped[0].reason).toContain('不重置账户')
  })
})
