import type { LabDataset, StrategySpec } from './contracts'
import { LAB_COSTS } from './contracts'
import { simulatePortfolio } from './simulator'

export type RollingValidation={
  status:'insufficient-history'|'historical-unstable'|'historical-qualified'
  folds:Array<{startDate:string;endDate:string;observations:number;trades:number;returnPct:number|null;excessReturnPct:number|null;maxDrawdownPct:number|null;doubleCostReturnPct:number|null}>
  positiveExcessFolds:number
  totalFolds:number
  aggregateObservations:number
  aggregateTrades:number
  worstDrawdownPct:number|null
  meanExcessReturnPct:number|null
  stabilityScore:number
  limitations:string[]
}

/** Chronological, non-overlapping rollback validation for a frozen strategy.
 * It never tunes parameters inside a fold. Historical qualification only lets a
 * challenger enter forward paper tracking; it can never promote an account.
 */
export function rollingValidation(data:LabDataset,spec:StrategySpec,foldCount=4):RollingValidation{
  const common=data.benchmarkBars.map(row=>row.date).filter(date=>data.assets.length&&data.assets.every(asset=>asset.bars.some(row=>row.date===date)))
  const usable=common.slice(61),minimumFoldSessions=20
  if(usable.length<minimumFoldSessions*3)return {status:'insufficient-history',folds:[],positiveExcessFolds:0,totalFolds:0,aggregateObservations:0,aggregateTrades:0,worstDrawdownPct:null,meanExcessReturnPct:null,stabilityScore:0,limitations:[`可回滚区间仅${usable.length}个交易日，至少需要${minimumFoldSessions*3}日才能分成3个不重叠时间窗口。`]}
  const count=Math.min(foldCount,Math.floor(usable.length/minimumFoldSessions)),size=Math.floor(usable.length/count)
  const folds=Array.from({length:count},(_,index)=>{
    const start=index*size,end=index===count-1?usable.length-1:(index+1)*size-1,startDate=usable[start],endDate=usable[end]
    const regular=simulatePortfolio(data,spec,{mode:'historical-reconstruction',startDate,endDate})
    const stressed=simulatePortfolio(data,spec,{mode:'historical-reconstruction',startDate,endDate,costs:{commissionBps:LAB_COSTS.commissionBps*2,slippageBps:LAB_COSTS.slippageBps*2}})
    return {startDate,endDate,observations:regular.observations,trades:regular.trades,returnPct:regular.returnPct,excessReturnPct:regular.excessReturnPct,maxDrawdownPct:regular.maxDrawdownPct,doubleCostReturnPct:stressed.returnPct}
  })
  const evaluable=folds.filter(row=>row.observations>=minimumFoldSessions&&row.excessReturnPct!==null)
  const positiveExcessFolds=evaluable.filter(row=>(row.excessReturnPct||0)>0).length
  const aggregateObservations=folds.reduce((sum,row)=>sum+row.observations,0),aggregateTrades=folds.reduce((sum,row)=>sum+row.trades,0)
  const drawdowns=folds.flatMap(row=>row.maxDrawdownPct===null?[]:[row.maxDrawdownPct]),excesses=evaluable.map(row=>row.excessReturnPct!)
  const worstDrawdownPct=drawdowns.length?Math.max(...drawdowns):null,meanExcessReturnPct=excesses.length?excesses.reduce((sum,value)=>sum+value,0)/excesses.length:null
  const positiveRatio=evaluable.length?positiveExcessFolds/evaluable.length:0
  const costRobust=folds.filter(row=>row.doubleCostReturnPct!==null&&row.doubleCostReturnPct>0).length/Math.max(1,folds.length)
  const riskRobust=worstDrawdownPct!==null&&worstDrawdownPct<spec.drawdownBudget*100?1:0
  const activity=Math.min(1,aggregateTrades/20)
  const stabilityScore=Math.round((positiveRatio*.45+costRobust*.2+riskRobust*.2+activity*.15)*100)
  const qualified=evaluable.length===folds.length&&positiveRatio>=.75&&costRobust>=.5&&riskRobust===1&&aggregateTrades>=8
  return {status:qualified?'historical-qualified':'historical-unstable',folds,positiveExcessFolds,totalFolds:folds.length,aggregateObservations,aggregateTrades,worstDrawdownPct,meanExcessReturnPct,stabilityScore,
    limitations:['时间窗口按顺序不重叠分割，窗口内不重新拟合参数。','使用当前产品池和可用价格史，仍存在产品存续与选样偏差。','历史通过只允许进入前瞻模拟，不会自动替换账户策略。']}
}
