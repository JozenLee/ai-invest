import { prisma } from '@/lib/db'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createPolicy, decideAllocation, fingerprint, type AllocationInput, type UnifiedAllocation } from './kernel'
import { normalizeAIProductDecisions } from '@/lib/analysis/investment-conclusion'
import { datasetFromSnapshot } from '../lab/experiment'
import type { Evaluation, ResearchSnapshot } from '../contracts'

export async function archiveStrategyRecord(id:string,key:string,industryId:string,value:unknown){
  const payload=JSON.stringify(value),contentHash=fingerprint(value)
  const row=await prisma.rawPayload.upsert({where:{id},create:{id,datasetKey:key,targetCode:industryId,provider:'unified-strategy/v1',payload,contentHash},update:{}})
  if(row.contentHash!==contentHash||fingerprint(JSON.parse(row.payload))!==contentHash)throw new Error('策略归档内容冲突或校验失败')
  return value
}
export async function prepareUnifiedAllocation(input:{evaluation:Evaluation;advice:unknown;runId:string;generatedAt:string;model?:string;snapshot?:ResearchSnapshot}){
  const {evaluation}=input
  if(input.snapshot){
    if(input.snapshot.id!==evaluation.snapshotId)throw new Error('策略与行情快照不一致')
    await archiveStrategyRecord(`unified-market:${evaluation.snapshotId}`,'unified_strategy_market',evaluation.profile.industryId,datasetFromSnapshot(input.snapshot))
  }
  const advice=typeof input.advice==='string'?JSON.parse(input.advice):input.advice as Record<string,unknown>
  const products=normalizeAIProductDecisions(advice.productDecisions,evaluation.decisions.map(d=>d.ticker),true)
  const sourcePaths=['src/lib/workflow/research-input.ts','src/lib/research/strategy/kernel.ts','src/lib/research/strategy/temporal.ts','src/lib/analysis/investment-conclusion.ts']
  const sourceBundle=Object.fromEntries(await Promise.all(sourcePaths.map(async file=>[file,await readFile(path.join(process.cwd(),file),'utf8')])))
  const implementationHash=fingerprint(sourceBundle)
  await archiveStrategyRecord(`unified-code:${evaluation.profile.industryId}:${implementationHash}`,'unified_strategy_implementation',evaluation.profile.industryId,sourceBundle)
  const policy=createPolicy({industryId:evaluation.profile.industryId,model:input.model||process.env.CLAUDE_FAST_MODEL||process.env.CLAUDE_MODEL||'configured-model',promptHash:fingerprint(sourceBundle[sourcePaths[0]]),implementationHash})
  await archiveStrategyRecord(policy.id,'unified_strategy_policy',evaluation.profile.industryId,policy)
  const previousRows=await prisma.rawPayload.findMany({where:{datasetKey:'unified_decision_version',targetCode:evaluation.profile.industryId},orderBy:{fetchedAt:'desc'},take:120})
  const allocations=previousRows.map(row=>{if(fingerprint(JSON.parse(row.payload))!==row.contentHash)throw new Error('前序策略目标校验失败');return (JSON.parse(row.payload) as {allocation?:UnifiedAllocation}).allocation})
  const previous=allocations.filter((row):row is UnifiedAllocation=>!!row).filter(row=>row.snapshotId!==evaluation.snapshotId&&Date.parse(row.asOf)<=Date.parse(evaluation.asOf)&&Date.parse(row.generatedAt)<Date.parse(input.generatedAt)).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))[0]||null
  const boundary:AllocationInput={snapshotId:evaluation.snapshotId,asOf:evaluation.asOf,generatedAt:input.generatedAt,sourceDate:evaluation.expectedSession||evaluation.asOf.slice(0,10),policy,previous,evidence:evaluation.evidence.map(e=>({id:e.id,businessAt:e.dataDate,publishedAt:e.publishedAt,observedAt:e.fetchedAt,hash:e.hash})),products:evaluation.decisions.map(decision=>{
    const product=products.find(p=>p.ticker===decision.ticker),contract=product?.executionContract
    return {ticker:decision.ticker,indexCode:decision.indexCode,direction:product?.heldAction==='减仓'?'reduce':product?.heldAction==='加仓'||product?.unheldAction==='建仓'?'increase':'neutral',adjustmentPct:product?.suggestedAdjustmentPct||0,verified:contract?.status==='verified'&&!!contract.triggerRules?.every(rule=>rule.status===(rule.requiredStatus||'met')),validUntil:contract?.validUntil||evaluation.asOf,reason:product?.reason||'AI观点缺失',trigger:product?.trigger||'补齐研究',invalidation:product?.invalidation||'证据失效',evidenceIds:[...new Set([...(product?.evidenceIds||[]),...decision.evidenceIds])],opinionId:product?.reviewProvenance?.sourceReportId||input.runId,features:{relative20Pct:decision.metrics.relative20Pct,volatilityPct:decision.metrics.volatilityPct,profitGrowthPct:typeof decision.conditions.find(c=>c.key==='profit-growth')?.value==='number'?Number(decision.conditions.find(c=>c.key==='profit-growth')!.value):null}}
  })}
  // A review's source report points to the original run; normalize opinion identity.
  for(const product of boundary.products){
    if(product.opinionId!==input.runId){const report=await prisma.aIAnalysisReport.findUnique({where:{id:product.opinionId},select:{dataJson:true}});if(report?.dataJson)product.opinionId=JSON.parse(report.dataJson).metadata?.runId||product.opinionId}
  }
  const result=decideAllocation(boundary)
  await archiveStrategyRecord(`${result.id}:input`,'unified_strategy_input',evaluation.profile.industryId,boundary)
  await archiveStrategyRecord(result.id,'unified_strategy_allocation',evaluation.profile.industryId,result)
  return result
}
