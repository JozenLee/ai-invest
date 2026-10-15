import { expect, it } from 'vitest'
import { fixture } from './fixtures'
import { evaluateResearch } from '../engine'
import { attachExecutionContracts, type AIProductDecision } from '@/lib/analysis/investment-conclusion'
import { revalidateAdvice } from '../revalidate-advice'
function setup(){
  const snapshot=fixture(),previous=evaluateResearch(snapshot),current=structuredClone(previous)
  previous.asOf='2026-09-03T01:00:00Z'
  current.asOf='2026-09-04T01:00:00Z'
  snapshot.asOf=current.asOf
  const row=previous.decisions[0]
  const product:AIProductDecision={ticker:row.ticker,unheldAction:'建仓',heldAction:'加仓',suggestedAdjustmentPct:2,confidencePct:70,reason:'旧观点',trigger:'按冻结指标复核',invalidation:'盈利下修',quantitativeOverride:null,evidenceIds:row.evidenceIds,triggerConditionKeys:['market'],triggerConditionStates:{market:'met'},decisionSource:'ai'}
  for(const evaluation of [previous,current])for(const condition of evaluation.decisions[0].conditions)condition.status='met'
  const advice={productDecisions:attachExecutionContracts([product],previous)}
  return {snapshot,previous,current,advice,sourceReportId:'original'}
}
it('renews a same-thesis contract at pre-open using new evidence and expiry',()=>{
  const input=setup()
  input.current.decisions[0].expiresAt='2026-09-04T07:00:00Z'
  const result=revalidateAdvice(input).productDecisions[0]
  expect(result.executionContract).toMatchObject({status:'verified',asOf:input.current.asOf,validUntil:'2026-09-04T07:00:00Z'})
  expect(result.reviewProvenance).toMatchObject({sourceAsOf:input.previous.asOf,reviewedAsOf:input.current.asOf,status:'revalidated',sourceReportId:'original'})
  expect(result.reason).toBe('旧观点')
})
it('requires new analysis for material events and prevents repeated reviews from resetting thesis age',()=>{
  const input=setup()
  input.current.events=[{...input.previous.events[0],id:'new-risk',status:'evidence',category:'risk'}]
  expect(revalidateAdvice(input).productDecisions[0].executionContract.status).toBe('blocked')
  input.current.events=input.previous.events
  input.advice.productDecisions[0].reviewProvenance={sourceAsOf:'2026-08-01T00:00:00Z',reviewedAsOf:input.previous.asOf,sourceReportId:'oldest',status:'revalidated',reasons:[]}
  expect(revalidateAdvice(input).productDecisions[0].reviewProvenance.status).toBe('requires-new-analysis')
})
it('keeps changed trigger definitions blocked instead of silently substituting a new rule',()=>{
  const input=setup()
  input.current.decisions[0].conditions.find(row=>row.key==='market')!.threshold=100
  expect(revalidateAdvice(input).productDecisions[0].executionContract.blockers.join('')).toContain('触发指标口径改变')
})
