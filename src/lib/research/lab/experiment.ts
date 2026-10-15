import { adjustedBars, validBars } from '../engine'
import { sessionBoundary } from '../time'
import type { ResearchSnapshot } from '../contracts'
import { LAB_COSTS, LAB_VERSION, STRATEGIES, type LabDataset, type PaperResult, type StrategySpec, type TargetPlan } from './contracts'
import { simulatePortfolio } from './simulator'
import { labelOutcomes } from './outcomes'
import { participationMetrics } from './metrics'
import { targetPlan } from './modules'
import { rollingValidation } from './rolling-validation'

export function datasetFromSnapshot(snapshot: ResearchSnapshot): LabDataset {
  const boundary=sessionBoundary(snapshot.calendar,snapshot.asOf),cutoff=boundary.expectedSession
  const exclusions:LabDataset['exclusions']=[]
  const benchmarkBars=validBars(snapshot.benchmarkBars,cutoff)
  const assets=snapshot.etfs.flatMap(etf=>{
    const series=adjustedBars(etf,cutoff)
    const reason=!boundary.verified?'交易日历未核验':!etf.indexCode?'正式指数映射缺失':!series.adjusted||series.discontinuity?'完整复权因子缺失或价格不连续':series.bars.length<62?'不足62个历史价格':null
    if(reason){exclusions.push({ticker:etf.ticker,reason});return []}
    return [{ticker:etf.ticker,indexCode:etf.indexCode!,bars:series.bars,rawBars:validBars(etf.bars,cutoff),execution:etf.executionRules}]
  })
  const limitations=[
    '历史重建使用当前已订阅产品与指数映射，存在存续和选样偏差；不能据此自动升级正式投资策略。',
    '仅模拟场内ETF的复权经济份额，不代表真实成交；尚未模拟整手、涨跌停排队、盘口冲击或场外基金申赎。',
    '基准沿用冻结指数价格序列，未核验为全收益指数；正式评价前需补齐可投资且分红口径一致的基准。',
    '回撤预算在收盘后检测，最早下一开盘退出；跳空可能使实际回撤超出预算。触发后本次实验保持现金。',
  ]
  if(assets.length){
    const start=[...assets.map(a=>a.bars[0].date),benchmarkBars[0]?.date||'9999-12-31'].sort().at(-1)!
    const end=[...assets.map(a=>a.bars.at(-1)!.date),benchmarkBars.at(-1)?.date||'0000-01-01',cutoff||'0000-01-01'].sort()[0]
    const expected=snapshot.calendar.filter(d=>d.open&&d.date>=start&&d.date<=end).map(d=>d.date)
    const bDates=new Set(benchmarkBars.map(b=>b.date))
    for(const asset of [...assets]){
      const dates=new Set(asset.bars.map(b=>b.date))
      if(expected.some(d=>!dates.has(d)||!bDates.has(d))){
        exclusions.push({ticker:asset.ticker,reason:'共同研究区间存在交易日缺口，未插值或按零收益处理'})
        assets.splice(assets.indexOf(asset),1)
      }
    }
  }
  return {snapshotId:snapshot.id,asOf:snapshot.asOf,benchmark:snapshot.profile.benchmark,benchmarkBars,assets,exclusions,limitations}
}

/** Dependence-aware, deterministic moving-block bootstrap. Descriptive evidence only. */
export function excessInterval(result:PaperResult):[number,number]|null {
  const rows=result.equity
  if(rows.length<61)return null
  const r=rows.slice(1).map((row,i)=>row.equity/rows[i].equity-row.benchmark/rows[i].benchmark)
  let seed=4139
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const samples:number[]=[]
  for(let trial=0;trial<300;trial++){
    const values:number[]=[]
    while(values.length<r.length){const start=Math.floor(random()*(r.length-19));values.push(...r.slice(start,start+20))}
    samples.push(values.slice(0,r.length).reduce((s,v)=>s+v,0)/r.length*252*100)
  }
  samples.sort((a,b)=>a-b)
  return [samples[7],samples[292]]
}

export function promotionAssessment(result:PaperResult,spec:StrategySpec,forwardCoverage:boolean){
  const interval=excessInterval(result)
  const gates=[
    {key:'forward',met:forwardCoverage,detail:'仅使用策略登记后实时归档的计划，并取得完整共同价格区间'},
    {key:'observations',met:result.observations>=252,detail:`前瞻观察 ${result.observations}/252 个交易日；达到数量仍不等于策略有效`},
    {key:'activity',met:result.trades>=30,detail:`模拟成交 ${result.trades}/30 笔；相关成交不视为独立样本`},
    {key:'risk',met:result.maxDrawdownPct!==null&&result.maxDrawdownPct<spec.drawdownBudget*100&&!result.halted,detail:'回撤未触及候选预算'},
    {key:'excess',met:!!interval&&interval[0]>0,detail:'20日区块重采样的年化平均日超额区间下界为正'},
  ]
  return {status:gates.every(g=>g.met)?'eligible-for-review' as const:'collecting-evidence' as const,gates,excessIntervalPct:interval,
    autoPromoted:false as const,reason:'满足统计门槛后进入复核候选；需完成产品、基准和执行口径核验，才可用于正式账户。'}
}

export function runExperiment(data:LabDataset,plans:TargetPlan[]=[],specs:StrategySpec[]=STRATEGIES){
  const commonDates=data.benchmarkBars.map(b=>b.date).filter(date=>data.assets.length&&data.assets.every(a=>a.bars.some(b=>b.date===date)))
  const usableDates=commonDates.slice(61)
  const holdoutStart=usableDates[Math.floor(usableDates.length*.8)]||null
  const baseline=simulatePortfolio(data,{...specs[0],id:'buy-and-hold'}, {mode:'buy-and-hold'})
  const strategies=specs.map(spec=>{
    const historical=simulatePortfolio(data,spec,{mode:'historical-reconstruction'})
    const rolling=rollingValidation(data,spec)
    const holdout=holdoutStart?simulatePortfolio(data,spec,{mode:'historical-reconstruction',startDate:holdoutStart}):null
    const ownPlans=plans.filter(p=>p.strategyId===spec.id)
    const coverage=ownPlans.length>0&&commonDates.length>0&&ownPlans.every(p=>p.sourceDate>=commonDates[0])&&data.exclusions.length===0
    const forward=simulatePortfolio(data,spec,{mode:'forward-paper',plans:coverage?ownPlans:[]})
    if(ownPlans.length&&!coverage)forward.skipped.push({planId:'data-boundary',reason:'前瞻价格序列不完整；不重置账户或展示截断区间收益'})
    const ablations=spec.modules.map(module=>{
      const result=simulatePortfolio(data,{...spec,modules:spec.modules.filter(id=>id!==module)},{mode:'historical-reconstruction'})
      return {removedModule:module,returnPct:result.returnPct,maxDrawdownPct:result.maxDrawdownPct,incrementalReturnPct:historical.returnPct!==null&&result.returnPct!==null?historical.returnPct-result.returnPct:null}
    })
    const stressed=simulatePortfolio(data,spec,{mode:'historical-reconstruction',costs:{commissionBps:LAB_COSTS.commissionBps*2,slippageBps:LAB_COSTS.slippageBps*2}})
    const fixed=simulatePortfolio(data,{...spec,drawdownBudget:1},{mode:'fixed-exposure'})
    const neutral=simulatePortfolio(data,spec,{mode:'historical-reconstruction',selectionNeutral:true})
    const sourceDate=commonDates.at(-1)
    const diagnostic=sourceDate?targetPlan(data,spec,sourceDate,data.asOf,data.asOf):null
    const researchReport={sourceDate,horizonTradingDays:20,entryMode:spec.entryMode||'confirmed',
      conclusion:!diagnostic||diagnostic.decisions?.every(d=>d.status==='missing')?'数据不足，无法评估该逻辑的配置；这不是主动选择空仓。':Object.values(diagnostic.targets).some(w=>w>0)?'该入场逻辑识别到非零研究配置；需按实际账户、数据时效和执行成本复核。':'在该价格截面，入场条件未满足，研究目标为现金；实际账户调整仍需核验持仓与执行条件。',
      opportunities:(diagnostic?.decisions||[]).filter(d=>(diagnostic?.targets[d.ticker]||0)>0).map(d=>({...d,targetWeightPct:(diagnostic?.targets[d.ticker]||0)*100,metrics:diagnostic?.features.find(f=>f.ticker===d.ticker)?.modules||[]})),
      watchlist:(diagnostic?.decisions||[]).filter(d=>!(diagnostic?.targets[d.ticker]||0)).map(d=>({ticker:d.ticker,reason:d.reason,trigger:d.trigger})),
      boundary:'此处是最新可核验价格截面的研究诊断；诊断本身没有交易有效期，不能替代前瞻执行计划。企业与事件仍作独立前瞻验证，不编造胜率或预期收益。'}
    return {spec,historical,rolling,holdout,forward,researchReport,latestObservation:ownPlans.at(-1)||null,latestPlan:ownPlans.filter(p=>p.rebalance!==false).at(-1)||null,ablations,doubleCostReturnPct:stressed.returnPct,
      participation:participationMetrics(historical),forwardParticipation:participationMetrics(forward),
      controls:{fixedExposure:{returnPct:fixed.returnPct,maxDrawdownPct:fixed.maxDrawdownPct},neutralSelection:{returnPct:neutral.returnPct,maxDrawdownPct:neutral.maxDrawdownPct},timingIncrementPct:historical.returnPct!==null&&fixed.returnPct!==null?historical.returnPct-fixed.returnPct:null,selectionIncrementPct:historical.returnPct!==null&&neutral.returnPct!==null?historical.returnPct-neutral.returnPct:null},
      holdoutStatus:!holdout?.trades?'no-active-validation' as const:'descriptive-only' as const,promotion:promotionAssessment(forward,spec,coverage)}
  })
  return {version:LAB_VERSION,mode:'research-only' as const,objective:'比较多档积极风险预算，按扣费收益、回撤和稳定性积累证据；未选定账户回撤上限',
    snapshotId:data.snapshotId,asOf:data.asOf,benchmark:data.benchmark,costs:LAB_COSTS,assetCount:data.assets.length,exclusions:data.exclusions,
    commonSessions:commonDates.length,holdoutStart,baseline,strategies,outcomes:labelOutcomes(data,plans),limitations:[...data.limitations,'末段20%为固定参数的时间留出诊断；当前候选已共同查看该区间，不宣称独立样本外认证。','移除模块实验是条件增量比较，不能解释为因果贡献。']}
}
export type LabExperiment=ReturnType<typeof runExperiment>&{unifiedValidation?:{id:string;status:string;accepted:number;exactReplayVerified:boolean};dataStatus?:'current'|'stale';decisionHistory?:import('../decision-ledger').DecisionHistoryAssessment;decisionVersionId?:string|null;policyVersionId?:string}
