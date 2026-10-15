import type { LabDataset, TargetPlan } from '../lab/contracts'
import { simulatePortfolio } from '../lab/simulator'
import { STRATEGIES, LAB_COSTS } from '../lab/contracts'
import { decideAllocation, fingerprint, validatePolicy, type AllocationInput, type StrategyPolicy, type UnifiedAllocation } from './kernel'
import { auditTemporalEvidence } from './temporal'

export type ArchivedAllocation={decisionId:string;availableAt:string;executionReady?:boolean;input:AllocationInput;allocation:UnifiedAllocation}
export type ValidationProtocol={startDate:string;endDate:string;initialCapital:number;commissionBps:number;slippageBps:number;holdoutFraction:number;executionMode?:'economic'|'exchange'}
export function validateProtocol(protocol:ValidationProtocol){
  if(protocol.executionMode!==undefined&&!['economic','exchange'].includes(protocol.executionMode))throw new Error('无效成交模式')
  if(![protocol.startDate,protocol.endDate].every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v)))||protocol.startDate>protocol.endDate||!Number.isFinite(protocol.initialCapital)||protocol.initialCapital<=0||protocol.initialCapital>1e10||![protocol.commissionBps,protocol.slippageBps].every(n=>Number.isFinite(n)&&n>=0&&n<=500)||protocol.holdoutFraction<.1||protocol.holdoutFraction>.5||!Number.isFinite(protocol.holdoutFraction))throw new Error('历史验证区间、资金或成本参数无效')
}
function plan(allocation:UnifiedAllocation,availableAt:string,strategyId:string):TargetPlan{
  return {id:allocation.id,strategyId,generatedAt:availableAt,sourceDate:allocation.sourceDate,validUntil:allocation.validUntil,targets:allocation.targets,features:[],decisions:allocation.decisions,reason:'共享内核完整目标仓位',policyVersionId:allocation.strategy.id}
}
/** No model is invoked: a counterfactual changes only registered allocation rules. */
export function compareUnifiedStrategies(data:LabDataset,archives:ArchivedAllocation[],candidate:StrategyPolicy,protocol:ValidationProtocol){
  validatePolicy(candidate);validateProtocol(protocol)
  if(protocol.endDate>data.asOf.slice(0,10))throw new Error('验证结束日期晚于数据快照')
  const exclusions:Array<{decisionId:string;reason:string}>=[]
  const accepted:ArchivedAllocation[]=[],pending:Array<{decisionId:string;reason:string}>=[]
  const seen=new Set<string>()
  for(const row of [...archives].sort((a,b)=>a.availableAt.localeCompare(b.availableAt)||a.decisionId.localeCompare(b.decisionId))){
    if(seen.has(row.allocation.id))continue
    seen.add(row.allocation.id)
    if(Date.parse(row.availableAt)>Date.parse(data.asOf)){pending.push({decisionId:row.decisionId,reason:'该决策发布晚于当前价格快照，等待后续交易日'});continue}
    const reasons:string[]=[]
    if(!Number.isFinite(Date.parse(row.availableAt))||Date.parse(row.availableAt)<Date.parse(row.input.generatedAt)||Date.parse(row.availableAt)>Date.parse(data.asOf))reasons.push('决策发布时间无效或晚于评价快照')
    if(row.input.sourceDate>=row.availableAt.slice(0,10)&&Date.parse(row.availableAt)<Date.parse(`${row.input.sourceDate}T15:00:00+08:00`))reasons.push('引用尚不可用的收盘数据')
    const temporal=auditTemporalEvidence(row.input.evidence||[],row.input.products.flatMap(p=>p.evidenceIds),row.input.asOf)
    reasons.push(...temporal.issues)
    try{if(fingerprint(decideAllocation(row.input))!==fingerprint(row.allocation))reasons.push('归档输入不能精确复现目标')}catch(error){reasons.push(error instanceof Error?error.message:'内核复现失败')}
    if(Object.keys(row.allocation.targets).some(ticker=>!data.assets.some(asset=>asset.ticker===ticker)))reasons.push('价格历史不覆盖原始目标产品，不允许静默删除持仓')
    if(reasons.length)exclusions.push({decisionId:row.decisionId,reason:reasons.join('；')});else accepted.push(row)
  }
  const common=data.benchmarkBars.map(b=>b.date).filter(date=>date>=protocol.startDate&&date<=protocol.endDate&&data.assets.length&&data.assets.every(asset=>asset.bars.some(b=>b.date===date)))
  const holdoutStart=common[Math.floor(common.length*(1-protocol.holdoutFraction))]||null
  const archivedPlans=accepted.filter(row=>row.executionReady!==false).map(row=>plan(row.allocation,row.availableAt,'archived-unified'))
  let previous:UnifiedAllocation|null=accepted[0]?.input.previous||null
  const candidatePlans=accepted.map(row=>{
    const allocation=decideAllocation({...row.input,policy:candidate,previous})
    previous=allocation
    return row.executionReady===false?null:plan(allocation,row.availableAt,candidate.id)
  }).filter((row):row is TargetPlan=>row!==null)
  const costs={commissionBps:protocol.commissionBps,slippageBps:protocol.slippageBps}
  const simulate=(id:string,plans:TargetPlan[],startDate=protocol.startDate,endDate=protocol.endDate,stress=1)=>simulatePortfolio(data,{...STRATEGIES[0],id,drawdownBudget:1},{mode:'forward-paper',plans,startDate,endDate,initialCapital:protocol.initialCapital,executionMode:protocol.executionMode,costs:{commissionBps:costs.commissionBps*stress,slippageBps:costs.slippageBps*stress}})
  const baseline=simulate('archived-unified',archivedPlans),challenger=simulate(candidate.id,candidatePlans)
  // Both ledgers start on the same calendar and capital; no opportunity window advantage.
  const benchmark=simulatePortfolio(data,{...STRATEGIES[0],id:'equal-weight-control',drawdownBudget:1},{mode:'buy-and-hold',startDate:baseline.equity[0]?.date||protocol.startDate,endDate:protocol.endDate,initialCapital:protocol.initialCapital,executionMode:protocol.executionMode,costs})
  const folds=Array.from({length:Math.min(4,Math.floor(common.length/20))},(_,i,)=>{
    const count=Math.min(4,Math.floor(common.length/20)),size=Math.floor(common.length/count)
    const start=common[i*size],end=common[i===count-1?common.length-1:(i+1)*size-1]
    return {startDate:start,endDate:end,baseline:simulate('archived-unified',archivedPlans,start,end),candidate:simulate(candidate.id,candidatePlans,start,end)}
  })
  const sensitivity=[.8,1.2].map(multiplier=>{
    const policy={...candidate,adjustmentScale:Math.min(3,candidate.adjustmentScale*multiplier)}
    let prior=accepted[0]?.input.previous||null
    const plans=accepted.flatMap(row=>{const allocation=decideAllocation({...row.input,policy,previous:prior});prior=allocation;return row.executionReady===false?[]:[plan(allocation,row.availableAt,candidate.id)]})
    const result=simulate(candidate.id,plans)
    return {adjustmentScale:policy.adjustmentScale,returnPct:result.returnPct,maxDrawdownPct:result.maxDrawdownPct,trades:result.trades}
  })
  if(protocol.executionMode==='exchange')for(const asset of data.assets){if(!asset.execution||!asset.rawBars||common.some(date=>!asset.execution?.sessions[date]?.source||!Number.isFinite(Date.parse(asset.execution.sessions[date].availableAt))||Date.parse(asset.execution.sessions[date].availableAt)>Date.parse(`${date}T09:30:00+08:00`)||!asset.rawBars?.some(bar=>bar.date===date)))exclusions.push({decisionId:asset.ticker,reason:'严格成交模式缺少完整历史执行规则或原始价格'})}
  const enough=baseline.observations>=60&&challenger.observations>=60&&baseline.trades>=8&&challenger.trades>=8
  return {version:1,scope:'archived-ai-allocation' as const,protocol,snapshotId:data.snapshotId,asOf:data.asOf,candidate,accepted:accepted.length,pending,exclusions,nonExecutable:accepted.filter(row=>row.executionReady===false).map(row=>row.decisionId),
    status:exclusions.length?'incomplete-coverage' as const:enough?'descriptive-comparison' as const:'insufficient-history' as const,
    coverage:{initialReference:accepted[0]?.input.previous?'archived-prior-targets':'cash',priceAssets:data.assets.length,commonSessions:common.length,archivedDecisions:accepted.length,financialEvents:'frozen-original-evidence-only',ai:'archived-outputs-no-new-inference',universe:'current-survivors',execution:protocol.executionMode==='exchange'?'historical-exchange-constraints':'adjusted-economic-units'},
    exactReplayVerified:accepted.length>0&&exclusions.length===0,baseline,challenger,benchmark,
    incrementalReturnPct:baseline.returnPct!==null&&challenger.returnPct!==null?challenger.returnPct-baseline.returnPct:null,
    doubleCost:{baseline:simulate('archived-unified',archivedPlans,undefined,undefined,2),candidate:simulate(candidate.id,candidatePlans,undefined,undefined,2)},folds,
    holdout:holdoutStart?{startDate:holdoutStart,status:'diagnostic-already-viewed' as const,baseline:simulate('archived-unified',archivedPlans,holdoutStart),candidate:simulate(candidate.id,candidatePlans,holdoutStart)}:null,
    candidatePlans,sensitivity,limitations:[...(accepted[0]?.input.previous?['最早决策以前的目标作为冻结初始参考；未包含其形成过程，不能评价更早策略历史。']:[]),'仅比较归档AI观点上的仓位策略；未重建历史AI推理，不证明完整策略的预测能力。','当前可用产品池存在存续偏差；企业、事件只使用当时归档证据，缺失时不补造。','调整后经济份额模拟不等于账户成交；场外申赎、整手、盘口及涨跌停需另行核验。','时间留出和窗口结果已展示，仅作诊断；候选登记后的前瞻结果才是新增证据。','各窗口从现金开始，过期信号不跨窗口续期；不同窗口不拼接为连续账户。']}
}
export const defaultProtocol=(data:LabDataset):ValidationProtocol=>({startDate:data.benchmarkBars[0]?.date||data.asOf.slice(0,10),endDate:data.benchmarkBars.at(-1)?.date||data.asOf.slice(0,10),initialCapital:100000,...LAB_COSTS,holdoutFraction:.2,executionMode:'economic'})
export type UnifiedValidation=ReturnType<typeof compareUnifiedStrategies>
