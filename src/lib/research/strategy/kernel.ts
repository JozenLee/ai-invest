import { auditTemporalEvidence, type TemporalEvidence } from './temporal'
import { createHash } from 'node:crypto'

export const KERNEL_VERSION='unified-allocation/1'
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type StrategyPolicy={
  version:1; id:string; name:string; industryId:string; kernelVersion:string; parentId:string|null
  mode:'archived-ai'; maxExposure:number; maxWeight:number; maxTurnover:number
  adjustmentScale:number; minCash:number
  filters:{minRelative20Pct:number|null;maxVolatilityPct:number|null;requirePositiveProfit:boolean}
  model:string; promptHash:string; implementationHash:string
}
export type AllocationProduct={ticker:string;indexCode:string|null;direction:'increase'|'reduce'|'neutral';adjustmentPct:number;verified:boolean;validUntil:string;reason:string;trigger:string;invalidation:string;evidenceIds:string[];opinionId:string;features?:{relative20Pct:number|null;volatilityPct:number|null;profitGrowthPct:number|null}}
export type AllocationInput={snapshotId:string;asOf:string;generatedAt:string;sourceDate:string;policy:StrategyPolicy;products:AllocationProduct[];evidence?:TemporalEvidence[];previous?:UnifiedAllocation|null}
export type UnifiedAllocation={
  version:1; id:string; kernelVersion:string; strategy:StrategyPolicy; snapshotId:string; asOf:string; generatedAt:string; validUntil:string; sourceDate:string
  parentId:string|null; initialState:'cash'|'previous-targets'; inputHash:string
  priorTargets:Record<string,number>; requestedTargets:Record<string,number>; targets:Record<string,number>; appliedOpinions:Record<string,string>
  decisions:Array<{ticker:string;status:'eligible'|'watch'|'missing';reason:string;trigger:string;invalidation:string;blockers:string[]}>
  status:'ready'|'partial'|'blocked'; limitations:string[]
}
export function validatePolicy(policy:StrategyPolicy){
  if(!policy.filters||![policy.filters.minRelative20Pct,policy.filters.maxVolatilityPct].every(value=>value===null||typeof value==='number'&&Number.isFinite(value))||typeof policy.filters.requirePositiveProfit!=='boolean'||policy.filters.maxVolatilityPct!==null&&policy.filters.maxVolatilityPct<0)throw new Error('策略特征过滤参数无效')
  if(policy.version!==1||policy.mode!=='archived-ai'||policy.kernelVersion!==KERNEL_VERSION||!policy.id||![policy.maxExposure,policy.maxWeight,policy.maxTurnover,policy.minCash].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||policy.maxExposure+policy.minCash>1+1e-8||!Number.isFinite(policy.adjustmentScale)||policy.adjustmentScale<=0||policy.adjustmentScale>3)throw new Error('策略定义或风险参数无效')
}
export function createPolicy(input:Partial<Pick<StrategyPolicy,'filters'|'parentId'|'name'|'industryId'|'maxExposure'|'maxWeight'|'maxTurnover'|'minCash'|'adjustmentScale'|'model'|'promptHash'|'implementationHash'>>={}):StrategyPolicy{
  const core={version:1 as const,name:'综合决策统一策略',industryId:'research',kernelVersion:KERNEL_VERSION,parentId:null,mode:'archived-ai' as const,maxExposure:.8,maxWeight:.3,maxTurnover:.2,minCash:.2,adjustmentScale:1,filters:{minRelative20Pct:null,maxVolatilityPct:null,requirePositiveProfit:false},model:'archived-output',promptHash:'unspecified',implementationHash:KERNEL_VERSION,...input}
  const policy={...core,id:`unified-policy:${fingerprint(core)}`};validatePolicy(policy);return policy
}
const round=(value:number)=>Number(value.toFixed(10))
/** Shared deterministic allocation limits. Missing targets must never mean liquidation. */
export function constrainTargets(desired:Record<string,number>,previous:Record<string,number>,limits:{maxWeight:number;maxExposure:number;maxTurnover:number}){
  const keys=[...new Set([...Object.keys(previous),...Object.keys(desired)])].sort()
  if([...Object.values(desired),...Object.values(previous)].some(w=>!Number.isFinite(w)||w<0||w>1)||Object.values(previous).reduce((s,w)=>s+w,0)>1+1e-8)throw new Error('目标或初始仓位无效')
  const targets=Object.fromEntries(keys.map(key=>[key,Math.min(limits.maxWeight,desired[key]??previous[key]??0)]))
  const requestedExposure=Object.values(targets).reduce((sum,weight)=>sum+weight,0)
  if(requestedExposure>limits.maxExposure){
    const scale=limits.maxExposure/requestedExposure
    for(const key of keys)targets[key]*=scale
  }
  const requests={...targets}
  // Reduce first; a cap change may need several turnover-limited sessions.
  let capacity=limits.maxTurnover
  for(const key of keys){const old=previous[key]||0;if(targets[key]<old){const delta=Math.min(old-targets[key],capacity);targets[key]=old-delta;capacity-=delta}else targets[key]=old}
  let exposure=Object.values(targets).reduce((s,w)=>s+w,0)
  for(const key of keys){const request=requests[key];const delta=Math.max(0,Math.min(request-targets[key],capacity,limits.maxExposure-exposure));targets[key]+=delta;capacity-=delta;exposure+=delta}
  return Object.fromEntries(keys.map(key=>[key,round(targets[key])]))
}

/** Pure function used by report, historical reconstruction and exact replay. */
export function decideAllocation(input:AllocationInput):UnifiedAllocation{
  const {policy,products,previous}=input;validatePolicy(policy)
  if(!Number.isFinite(Date.parse(input.asOf))||!Number.isFinite(Date.parse(input.generatedAt))||Date.parse(input.asOf)>Date.parse(input.generatedAt))throw new Error('冻结证据晚于决策时点')
  if(previous&&Date.parse(previous.generatedAt)>=Date.parse(input.generatedAt))throw new Error('前序目标必须早于当前决策')
  if(new Set(products.map(p=>p.ticker)).size!==products.length)throw new Error('同一决策不能重复包含产品')
  const priorTargets={...(previous?.targets||{})},desired={...priorTargets},appliedOpinions={...(previous?.appliedOpinions||{})}
  const decisions=products.map(product=>{
    const blockers:string[]=input.evidence?auditTemporalEvidence(input.evidence,product.evidenceIds,input.asOf).issues:[]
    if(!product.indexCode)blockers.push('正式指数映射缺失')
    if(!product.verified)blockers.push('证据或执行合同未通过')
    if(!(Date.parse(product.validUntil)>Date.parse(input.generatedAt)))blockers.push('执行合同已过期或无效')
    if(!Number.isFinite(product.adjustmentPct)||product.adjustmentPct<0||product.adjustmentPct>100)blockers.push('调整幅度无效')
    if(!product.evidenceIds.length)blockers.push('缺少决策证据')
    if(product.direction==='increase'){
      const features=product.features,filters=policy.filters
      if(filters.minRelative20Pct!==null&&(features?.relative20Pct==null||features.relative20Pct<filters.minRelative20Pct))blockers.push('相对强度过滤未通过或特征缺失')
      if(filters.maxVolatilityPct!==null&&(features?.volatilityPct==null||features.volatilityPct>filters.maxVolatilityPct))blockers.push('波动率过滤未通过或特征缺失')
      if(filters.requirePositiveProfit&&(features?.profitGrowthPct==null||features.profitGrowthPct<=0))blockers.push('利润增长过滤未通过或特征缺失')
    }
    const old=priorTargets[product.ticker]||0
    desired[product.ticker]=old
    const repeated=appliedOpinions[product.ticker]===product.opinionId
    if(!blockers.length&&repeated)desired[product.ticker]=previous?.requestedTargets?.[product.ticker]??old
    if(!blockers.length&&!repeated){
      desired[product.ticker]=Math.max(0,Math.min(1,old+(product.direction==='increase'?1:product.direction==='reduce'?-1:0)*product.adjustmentPct/100*policy.adjustmentScale))
      appliedOpinions[product.ticker]=product.opinionId
    }
    return {ticker:product.ticker,status:blockers.length?'missing' as const:product.direction==='neutral'?'watch' as const:'eligible' as const,reason:`${product.reason}${repeated?'；原观点已应用，本次仅复核，不重复叠加仓位':''}`,trigger:product.trigger,invalidation:product.invalidation,blockers}
  })
  for(const ticker of Object.keys(priorTargets).filter(ticker=>!products.some(p=>p.ticker===ticker)))decisions.push({ticker,status:'missing',reason:'原目标产品已不在本轮研究范围，保留参考仓位等待复核',trigger:'补齐产品与退出证据',invalidation:'不能将范围缺失视为退出信号',blockers:['产品范围变化']})
  for(const index of new Set(products.map(p=>p.indexCode).filter(Boolean))){
    const peers=products.filter(p=>p.indexCode===index),total=peers.reduce((sum,p)=>sum+(desired[p.ticker]||0),0)
    if(total>policy.maxWeight)for(const peer of peers)desired[peer.ticker]=desired[peer.ticker]*policy.maxWeight/total
  }
  const targets=constrainTargets(desired,priorTargets,policy)
  // A blocked product is frozen, including during risk-limit changes.
  for(const row of decisions.filter(row=>row.blockers.length))targets[row.ticker]=priorTargets[row.ticker]||0
  // Never allow the restoration of blocked holdings to fund extra exposure.
  let capacity=Math.max(0,policy.maxExposure-Object.values(priorTargets).reduce((s,w)=>s+w,0)+Object.keys(targets).reduce((s,k)=>s+Math.max(0,(priorTargets[k]||0)-targets[k]),0))
  for(const ticker of Object.keys(targets).sort()){const increase=Math.max(0,targets[ticker]-(priorTargets[ticker]||0));if(increase>capacity)targets[ticker]=round((priorTargets[ticker]||0)+capacity);capacity=Math.max(0,capacity-increase)}
  const ready=decisions.filter(row=>!row.blockers.length).length
  const validUntil=products.filter(p=>Number.isFinite(Date.parse(p.validUntil))).map(p=>p.validUntil).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||input.generatedAt
  const core={version:1 as const,kernelVersion:KERNEL_VERSION,strategy:policy,snapshotId:input.snapshotId,asOf:input.asOf,generatedAt:input.generatedAt,validUntil,sourceDate:input.sourceDate,parentId:previous?.id||null,initialState:previous?'previous-targets' as const:'cash' as const,inputHash:fingerprint(input),priorTargets,requestedTargets:desired,targets,appliedOpinions,decisions,status:!ready?'blocked' as const:ready===decisions.length?'ready' as const:'partial' as const,limitations:['目标为独立研究组合，以现金起步或衔接前序目标；实际账户另行应用同一执行约束。','归档AI输出可以重放；历史重新推理不构成真实前瞻证据。']}
  return {...core,id:`allocation:${fingerprint(core)}`}
}
