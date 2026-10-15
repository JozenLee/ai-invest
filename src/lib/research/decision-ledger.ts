import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { normalizeAIProductDecisions, type AIProductDecision } from '@/lib/analysis/investment-conclusion'
import { adjustedBars, validBars } from './engine'
import { chinaDate } from './time'
import type { UnifiedAllocation } from './strategy/kernel'
import type { Evaluation, ResearchSnapshot } from './contracts'

const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const parse=<T,>(value:string):T=>JSON.parse(value) as T

export type UnifiedDecisionProduct={
  ticker:string
  name:string
  indexCode:string|null
  direction:'increase'|'reduce'|'neutral'
  unheldAction:'建仓'|'观望'
  heldAction:'加仓'|'持有'|'减仓'|'观望'
  suggestedAdjustmentPct:number
  confidencePct:number
  quantitativeState:string
  reason:string
  trigger:string
  invalidation:string
  evidenceIds:string[]
  executionContract?:AIProductDecision['executionContract']
  executionStatus:'verified'|'manual-review'|'blocked'
  validUntil:string
}

export type UnifiedDecisionVersion={
  version:1
  id:string
  industryId:string
  reportId:string
  runId:string
  snapshotId:string
  generatedAt:string
  horizonTradingDays:number
  validUntil:string
  reportQuality:{overallScore:number|null;usability:string;validationStatus:string;executionReadinessScore:number|null}
  products:UnifiedDecisionProduct[]
  allocation?:UnifiedAllocation
  strategyVersionId?:string
  source:'comprehensive-report'
}

export type UnifiedDecisionOutcome={
  decisionVersionId:string
  reportId:string
  ticker:string
  direction:UnifiedDecisionProduct['direction']
  generatedAt:string
  startDate:string|null
  endDate:string|null
  horizonTradingDays:number
  status:'matured'|'pending'|'rejected'
  returnPct:number|null
  benchmarkReturnPct:number|null
  excessReturnPct:number|null
  maxAdverseMovePct:number|null
  success:boolean|null
  reason:string
}

export type DecisionHistoryAssessment={
  version:1
  industryId:string
  asOf:string
  decisionVersions:number
  matured:number
  pending:number
  rejected:number
  directionalMatured:number
  successful:number
  hitRatePct:number|null
  calibrationStatus:'insufficient-history'|'descriptive'|'calibrated'
  excludedDuplicates?:number
  excludedOverlaps?:number
  minimumDirectionalOutcomes:number
  byDirection:Array<{direction:'increase'|'reduce';matured:number;successful:number;hitRatePct:number|null;meanExcessReturnPct:number|null;meanCashRelativeReturnPct?:number|null;meanAvoidedLossPct?:number|null;meanMissedUpsidePct?:number|null}>
  outcomes:UnifiedDecisionOutcome[]
  basis:string
}

type ArchiveDecisionInput={
  reportId:string
  industryId:string
  runId:string
  snapshotId:string
  generatedAt:string
  horizonTradingDays:number
  evaluation:Evaluation
  investmentAdvice:unknown
  allocation?:UnifiedAllocation
  reportQuality?:{overallScore?:number;usability?:string;validationStatus?:string;executionReadinessScore?:number}|null
}

function adviceRecord(value:unknown):Record<string,unknown>{
  if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>
  try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}
}

export function buildUnifiedDecisionVersion(input:ArchiveDecisionInput):UnifiedDecisionVersion{
  const expected=input.evaluation.decisions.map(item=>item.ticker)
  const advice=adviceRecord(input.investmentAdvice)
  const ai=normalizeAIProductDecisions(advice.productDecisions,expected,true)
  const products=input.evaluation.decisions.map(decision=>{
    const item=ai.find(candidate=>candidate.ticker===decision.ticker)
    const heldAction=item?.heldAction||decision.heldAction
    const unheldAction=item?.unheldAction||decision.unheldAction
    const direction:UnifiedDecisionProduct['direction']=heldAction==='减仓'?'reduce':heldAction==='加仓'||unheldAction==='建仓'?'increase':'neutral'
    const contract=item?.executionContract
    return {ticker:decision.ticker,name:decision.name,indexCode:decision.indexCode,direction,unheldAction,heldAction,
      suggestedAdjustmentPct:item?.suggestedAdjustmentPct||0,confidencePct:item?.confidencePct||0,quantitativeState:decision.state,
      reason:item?.reason||decision.reason,trigger:item?.trigger||decision.trigger,invalidation:item?.invalidation||decision.invalidation,
      evidenceIds:item?.evidenceIds||decision.evidenceIds,...(contract?{executionContract:contract}:{}),executionStatus:contract?.status||'blocked',validUntil:contract?.validUntil||decision.expiresAt}
  })
  const validUntil=products.map(item=>item.validUntil).filter(value=>Number.isFinite(Date.parse(value))).sort()[0]||input.generatedAt
  const quality=input.reportQuality||{}
  const core={version:1 as const,industryId:input.industryId,reportId:input.reportId,runId:input.runId,
    snapshotId:input.snapshotId,generatedAt:input.generatedAt,horizonTradingDays:input.horizonTradingDays,validUntil,
    reportQuality:{overallScore:typeof quality.overallScore==='number'?quality.overallScore:null,usability:quality.usability||'insufficient',validationStatus:quality.validationStatus||'insufficient-history',executionReadinessScore:typeof quality.executionReadinessScore==='number'?quality.executionReadinessScore:null},
    products,...(input.allocation?{allocation:input.allocation,strategyVersionId:input.allocation.strategy.id}:{}),source:'comprehensive-report' as const}
  return {...core,id:`decision-version:${input.reportId}:${digest(core).slice(0,16)}`}
}

export async function archiveUnifiedDecisionVersion(input:ArchiveDecisionInput){
  const value=buildUnifiedDecisionVersion(input),payload=JSON.stringify(value),contentHash=digest(value)
  const existing=await prisma.rawPayload.findUnique({where:{id:value.id}})
  if(existing&&existing.contentHash!==contentHash)throw new Error('同一报告的统一决策版本不可改写')
  await prisma.rawPayload.upsert({where:{id:value.id},create:{id:value.id,datasetKey:'unified_decision_version',targetCode:value.industryId,provider:'decision-ledger/v1',payload,contentHash},update:{}})
  return value
}

export async function listUnifiedDecisionVersions(industryId:string,limit=120):Promise<UnifiedDecisionVersion[]>{
  const rows=await prisma.rawPayload.findMany({where:{datasetKey:'unified_decision_version',targetCode:industryId},orderBy:{fetchedAt:'desc'},take:limit})
  return rows.flatMap(row=>{try{const value=parse<UnifiedDecisionVersion>(row.payload);return value.version===1&&digest(value)===row.contentHash?[value]:[]}catch{return []}}).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt)||b.id.localeCompare(a.id))
}

function outcome(version:UnifiedDecisionVersion,product:UnifiedDecisionProduct,snapshot:ResearchSnapshot):UnifiedDecisionOutcome{
  const base={decisionVersionId:version.id,reportId:version.reportId,ticker:product.ticker,direction:product.direction,generatedAt:version.generatedAt,startDate:null,endDate:null,horizonTradingDays:version.horizonTradingDays}
  const etf=snapshot.etfs.find(item=>item.ticker===product.ticker)
  if(!etf)return {...base,status:'rejected',returnPct:null,benchmarkReturnPct:null,excessReturnPct:null,maxAdverseMovePct:null,success:null,reason:'当前可验证产品范围不包含该标的'}
  const series=adjustedBars(etf,chinaDate(snapshot.asOf))
  if(!series.adjusted||series.discontinuity)return {...base,status:'rejected',returnPct:null,benchmarkReturnPct:null,excessReturnPct:null,maxAdverseMovePct:null,success:null,reason:'复权或连续性未通过'}
  const benchmark=validBars(snapshot.benchmarkBars,chinaDate(snapshot.asOf)),benchmarkByDate=new Map(benchmark.map(bar=>[bar.date,bar]))
  const start=series.bars.findIndex(bar=>Date.parse(`${bar.date}T09:30:00+08:00`)>Date.parse(version.generatedAt))
  if(start<0)return {...base,status:'pending',returnPct:null,benchmarkReturnPct:null,excessReturnPct:null,maxAdverseMovePct:null,success:null,reason:'尚无报告生成后的下一交易日'}
  const first=series.bars[start],window=series.bars.slice(start,start+version.horizonTradingDays),last=window.at(-1)
  if(window.length<version.horizonTradingDays||!last)return {...base,startDate:first.date,status:'pending',returnPct:null,benchmarkReturnPct:null,excessReturnPct:null,maxAdverseMovePct:null,success:null,reason:`需等待${version.horizonTradingDays-window.length}个交易日后完成结果标注`}
  const bFirst=benchmarkByDate.get(first.date),bLast=benchmarkByDate.get(last.date)
  if(!bFirst||!bLast)return {...base,startDate:first.date,endDate:last.date,status:'rejected',returnPct:null,benchmarkReturnPct:null,excessReturnPct:null,maxAdverseMovePct:null,success:null,reason:'基准在评价窗口内不完整'}
  const returnPct=(last.close/first.open-1)*100,benchmarkReturnPct=(bLast.close/bFirst.open-1)*100,excessReturnPct=returnPct-benchmarkReturnPct
  const path=window.map(bar=>(bar.close/first.open-1)*100)
  const maxAdverseMovePct=product.direction==='reduce'?Math.max(...path):product.direction==='increase'?Math.min(...path):Math.max(...path.map(Math.abs))
  const success=product.direction==='neutral'?null:product.direction==='increase'?excessReturnPct>0:excessReturnPct<0
  return {...base,startDate:first.date,endDate:last.date,status:'matured',returnPct,benchmarkReturnPct,excessReturnPct,maxAdverseMovePct,success,reason:product.direction==='neutral'?'中性动作只记录后续表现，不计入方向命中率':'按报告发布后下一开盘到固定期限评价相对基准方向'}
}

export function assessDecisionHistory(versions:UnifiedDecisionVersion[],snapshot:ResearchSnapshot):DecisionHistoryAssessment{
  const valid=versions.filter(item=>item.industryId===snapshot.profile.industryId&&Date.parse(item.generatedAt)<Date.parse(snapshot.asOf))
  const all=valid.flatMap(version=>version.products.map(product=>outcome(version,product,snapshot)))
  // Last decision available before the same opening wins. Same-index products
  // and overlapping windows are not independent directional observations.
  const byOpening=new Map<string,UnifiedDecisionOutcome>()
  for(const item of [...all].sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt)||a.decisionVersionId.localeCompare(b.decisionVersionId))){
    const next=snapshot.calendar.find(day=>day.open&&Date.parse(`${day.date}T09:30:00+08:00`)>Date.parse(item.generatedAt))?.date
    const key=`${item.ticker}:${item.startDate||next||item.generatedAt}:${item.horizonTradingDays}`
    byOpening.set(key,item)
  }
  const outcomes=[...byOpening.values()]
  const lastEnd=new Map<string,string>()
  let excludedOverlaps=0
  const independent=new Set<UnifiedDecisionOutcome>()
  for(const item of [...outcomes].sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||'')||a.ticker.localeCompare(b.ticker))){
    if(item.status!=='matured'||item.direction==='neutral'||!item.startDate||!item.endDate)continue
    const exposure=snapshot.etfs.find(etf=>etf.ticker===item.ticker)?.indexCode||item.ticker
    if(item.startDate<=(lastEnd.get(exposure)||'')){excludedOverlaps++;continue}
    independent.add(item);lastEnd.set(exposure,item.endDate)
  }
  const directional=outcomes.filter(item=>independent.has(item)),successful=directional.filter(item=>item.success===true)
  const minimumDirectionalOutcomes=20
  const byDirection=(['increase','reduce'] as const).map(direction=>{const rows=directional.filter(item=>item.direction===direction),wins=rows.filter(item=>item.success).length;return {direction,matured:rows.length,successful:wins,hitRatePct:rows.length?wins/rows.length*100:null,meanExcessReturnPct:rows.length?rows.reduce((sum,item)=>sum+(item.excessReturnPct||0),0)/rows.length:null,meanCashRelativeReturnPct:rows.length?rows.reduce((sum,item)=>sum+(direction==='reduce'?-1:1)*(item.returnPct||0),0)/rows.length:null,meanAvoidedLossPct:direction==='reduce'&&rows.length?rows.reduce((sum,item)=>sum+Math.max(0,-(item.returnPct||0)),0)/rows.length:null,meanMissedUpsidePct:direction==='reduce'&&rows.length?rows.reduce((sum,item)=>sum+Math.max(0,item.returnPct||0),0)/rows.length:null}})
  return {version:1,industryId:snapshot.profile.industryId,asOf:snapshot.asOf,decisionVersions:valid.length,matured:outcomes.filter(item=>item.status==='matured').length,pending:outcomes.filter(item=>item.status==='pending').length,rejected:outcomes.filter(item=>item.status==='rejected').length,
    directionalMatured:directional.length,successful:successful.length,hitRatePct:directional.length?successful.length/directional.length*100:null,
    calibrationStatus:directional.length>=minimumDirectionalOutcomes?'descriptive':'insufficient-history',excludedDuplicates:all.length-outcomes.length,excludedOverlaps,minimumDirectionalOutcomes,byDirection,outcomes,
    basis:'只使用当时已归档的统一决策，按报告后下一开盘起算固定交易日窗口；同产品同开盘保留最后版本，同指数重叠窗口不重复计数；方向统计仅为描述性结果，不代表概率校准。'}
}

export async function archiveDecisionHistory(assessment:DecisionHistoryAssessment){
  for(const item of assessment.outcomes.filter(row=>row.status==='matured')){
    const id=`decision-outcome:${item.decisionVersionId.slice('decision-version:'.length)}:${item.ticker}`,payload=JSON.stringify(item),contentHash=digest(item)
    const existing=await prisma.rawPayload.findUnique({where:{id}})
    if(existing&&existing.contentHash!==contentHash)throw new Error('已成熟决策结果不可改写')
    await prisma.rawPayload.upsert({where:{id},create:{id,datasetKey:'unified_decision_outcome',targetCode:assessment.industryId,provider:'decision-ledger/v1',payload,contentHash},update:{}})
  }
  const summary={...assessment,outcomes:assessment.outcomes.slice(-60)},id=`decision-calibration:${assessment.industryId}`,payload=JSON.stringify(summary),contentHash=digest(summary)
  await prisma.rawPayload.upsert({where:{id},create:{id,datasetKey:'unified_decision_calibration',targetCode:assessment.industryId,provider:'decision-ledger/v1',payload,contentHash},update:{payload,contentHash,fetchedAt:new Date()}})
  return summary
}

export function compactDecisionHistory(assessment:DecisionHistoryAssessment){
  return {asOf:assessment.asOf,decisionVersions:assessment.decisionVersions,directionalMatured:assessment.directionalMatured,pending:assessment.pending,hitRatePct:assessment.directionalMatured>=assessment.minimumDirectionalOutcomes?assessment.hitRatePct:null,calibrationStatus:assessment.calibrationStatus,byDirection:assessment.byDirection.map(item=>({...item,hitRatePct:item.matured>=10?item.hitRatePct:null,meanExcessReturnPct:item.matured>=10?item.meanExcessReturnPct:null,meanCashRelativeReturnPct:item.matured>=10?item.meanCashRelativeReturnPct:null,meanAvoidedLossPct:item.matured>=10?item.meanAvoidedLossPct:null,meanMissedUpsidePct:item.matured>=10?item.meanMissedUpsidePct:null})),basis:assessment.basis,attributionBasis:'减仓同时评价避免的绝对亏损与错失上涨；相对现金贡献为标的毛收益的反方向，不含仓位和费用，不解释为账户收益。',
    recentMatured:assessment.outcomes.filter(item=>item.status==='matured'&&item.direction!=='neutral').slice(-8).map(item=>({reportId:item.reportId,ticker:item.ticker,direction:item.direction,startDate:item.startDate,endDate:item.endDate,success:item.success,excessReturnPct:item.excessReturnPct}))}
}
