import type { Evaluation, ResearchSnapshot } from './contracts'
import { adjustedBars, validBars } from './engine'

export type ReplayCosts = { commissionBps: number; slippageBps: number }
export type ReplayLedgerEntry = { snapshot: ResearchSnapshot; evaluation: Evaluation }
const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null
const deviation=(values:number[])=>{const mean=average(values);return mean===null||values.length<2?null:Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/(values.length-1))}
const annualRatio=(values:number[])=>{const mean=average(values),risk=deviation(values);return mean===null||risk===null||risk===0?null:mean/risk*Math.sqrt(252)}

/** Keep only point-in-time fields required by the walk-forward ledger. */
export function compactReplaySnapshot(snapshot: ResearchSnapshot): ResearchSnapshot {
  return {
    version: snapshot.version,
    id: snapshot.id,
    asOf: snapshot.asOf,
    capturedAt: snapshot.capturedAt,
    profile: snapshot.profile,
    calendar: snapshot.calendar,
    evidence: [],
    etfs: snapshot.etfs.map(etf => ({
      ...etf,
      evidenceIds: [],
      indexBars: [],
      indexConstituents: [],
      holdings: [],
      navHistory: [],
      product: { ...etf.product, evidenceIds: [] },
    })),
    benchmarkBars: snapshot.benchmarkBars,
    sectorFlows: [],
    events: [],
    companies: [],
    projections: {},
    workflow: snapshot.workflow,
  }
}
/** Walk-forward PAPER ledger. Signals are immutable historical snapshots, fills use
 * subsequent observed opens. Today's fundamentals are never backdated. */
export function replayResearch(snapshots: ResearchSnapshot[], evaluations: Evaluation[], costs: ReplayCosts) {
  if(![costs.commissionBps,costs.slippageBps].every(n=>Number.isFinite(n)&&n>=0&&n<=1000)) throw new Error('成本必须为0–1000 bps')
  const ordered=[...snapshots].sort((a,b)=>a.asOf.localeCompare(b.asOf))
  const last=ordered.at(-1)
  if(!last||ordered.length<2) return {status:'insufficient' as const,reason:'至少需要两个不同时间冻结的研究快照；不能用今天的数据回填历史观点',results:[],costs,validation:'not-validated'}
  if(new Set(ordered.map(s=>s.profile.industryId)).size!==1) throw new Error('不能混合不同领域回放')
  const results=last.etfs.map(etf=>{
    const series=adjustedBars(etf,last.asOf.slice(0,10))
    if(!series.adjusted||series.discontinuity) return {ticker:etf.ticker,status:'insufficient',reason:'缺少经核验的复权价格',trades:[],returnPct:null,benchmarkReturnPct:null,turnover:0,maxDrawdownPct:null}
    const bars=series.bars
    let cash=1,units=0,turnover=0,peak=1,maxDrawdown=0
    const trades:Array<{date:string;side:string;price:number;cost:number;snapshotId:string}>=[]
    const skipped:Array<{snapshotId:string;reason:string}>=[]
    const firstDay=ordered[0].asOf.slice(0,10)
    const tradingBars=bars.filter(b=>b.date>=firstDay)
    const fills=new Set<string>()
    for(const snapshot of ordered){
      const evaluation=evaluations.find(e=>e.snapshotId===snapshot.id),decision=evaluation?.decisions.find(d=>d.ticker===etf.ticker)
      if(!decision)continue
      const next=bars.find(b=>Date.parse(`${b.date}T09:30:00+08:00`)>Date.parse(snapshot.asOf))
      if(!next||fills.has(next.date))continue
      const fillTime=Date.parse(`${next.date}T09:30:00+08:00`)
      if(fillTime>=Date.parse(decision.expiresAt)){skipped.push({snapshotId:snapshot.id,reason:'信号在下一开盘前已过期，需要盘前复核'});continue}
      const side=decision.state==='eligible'&&units===0?'buy':decision.state==='risk-off'&&units>0?'sell':null
      if(!side)continue
      const rate=(costs.commissionBps+costs.slippageBps)/10000
      const value=side==='buy'?cash:units*next.open,cost=value*rate
      if(side==='buy'){units=(cash-cost)/next.open;cash=0}else{cash=value-cost;units=0}
      turnover+=value;fills.add(next.date);trades.push({date:next.date,side,price:next.open,cost,snapshotId:snapshot.id})
    }
    // Replay equity chronologically for drawdown; exclude close-before-fill look-ahead.
    let replayCash=1,replayUnits=0
    const equityCurve:Array<{date:string;equity:number}>=[]
    for(const bar of tradingBars){
      for(const trade of trades.filter(t=>t.date===bar.date)) {
        if(trade.side==='buy'){replayUnits=(replayCash-trade.cost)/trade.price;replayCash=0}else{replayCash=replayUnits*trade.price-trade.cost;replayUnits=0}
      }
      const equity=replayCash+replayUnits*bar.close;equityCurve.push({date:bar.date,equity});peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak*100)
    }
    const final=cash+units*(bars.at(-1)?.close||0)
    const benchmark=validBars(last.benchmarkBars,last.asOf.slice(0,10)).filter(b=>b.date>=tradingBars[0]?.date)
    const rate=(costs.commissionBps+costs.slippageBps)/10000
    const portfolioReturns=equityCurve.slice(1).map((row,index)=>row.equity/equityCurve[index].equity-1)
    const benchmarkByDate=new Map(benchmark.map(row=>[row.date,row])),aligned=equityCurve.filter(row=>benchmarkByDate.has(row.date))
    const benchmarkReturns=aligned.slice(1).map((row,index)=>benchmarkByDate.get(row.date)!.close/benchmarkByDate.get(aligned[index].date)!.close-1)
    const activeReturns=portfolioReturns.slice(-benchmarkReturns.length).map((value,index)=>value-benchmarkReturns[index])
    const benchmarkReturnPct=benchmark.length>1?((benchmark.at(-1)!.close/benchmark[0].open)*(1-rate)-1)*100:null
    return {ticker:etf.ticker,status:trades.length?'paper-only':'no-trades',trades,skipped,returnPct:(final-1)*100,benchmarkReturnPct,excessReturnPct:benchmarkReturnPct===null?null:(final-1)*100-benchmarkReturnPct,turnover,maxDrawdownPct:maxDrawdown,annualizedVolatilityPct:(deviation(portfolioReturns)||0)*Math.sqrt(252)*100,sharpeRatio:annualRatio(portfolioReturns),informationRatio:annualRatio(activeReturns),observations:equityCurve.length}
  })
  const tested=results.filter(item=>item.status!=='insufficient'),trades=tested.reduce((sum,item)=>sum+item.trades.length,0),observations=tested.length?Math.min(...tested.map(item=>item.observations||0)):0
  const validation=tested.length&&trades>=30&&observations>=252?'candidate-walk-forward' as const:'insufficient-history' as const
  return {status:'paper-only' as const,reason:validation==='candidate-walk-forward'?'已达到最小样本门槛，仍需跨市场状态稳定性和参数敏感性复核后才能标记为有效。':'仅验证可重放、成本和风险指标口径；样本不足以证明投资有效性。',results,costs,validation,snapshots:ordered.length,trades,observations,from:ordered[0].asOf,to:last.asOf}
}
