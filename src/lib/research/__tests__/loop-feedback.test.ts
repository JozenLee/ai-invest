import { expect, it } from 'vitest'
import { researchLoopMetrics } from '../loop-metrics'
import { executionAttribution, type ExecutionMark } from '../lab/execution-attribution'
import type { DailyPlan, ExecutionFeedback } from '../lab/daily-plan'
import { attachExecutionContracts, decisionSemanticIssues, type AIProductDecision } from '@/lib/analysis/investment-conclusion'
import { evaluateResearch } from '../engine'
import { fixture } from './fixtures'
const decision:AIProductDecision={ticker:'159995',unheldAction:'观望',heldAction:'减仓',suggestedAdjustmentPct:2,confidencePct:60,reason:'趋势失效',trigger:'基准低于均线',invalidation:'风险信号撤销',quantitativeOverride:null,evidenceIds:['raw-one'],triggerConditionKeys:['market'],triggerConditionStates:{market:'unmet'},decisionSource:'ai'}
it('allows risk reduction without requiring entry confirmation and blocks unknown conditions',()=>{
  const evaluation=evaluateResearch(fixture()),condition=evaluation.decisions[0].conditions.find(c=>c.key==='market')!
  condition.status='unmet'
  expect(attachExecutionContracts([decision],evaluation)[0].executionContract.status).toBe('verified')
  condition.status='unknown'
  expect(attachExecutionContracts([decision],evaluation)[0].executionContract.status).toBe('blocked')
  expect(decisionSemanticIssues({...decision,triggerConditionStates:{market:'met'}})).not.toHaveLength(0)
  expect(decisionSemanticIssues({...decision,triggerConditionStates:{market:'met'},manualReviewConditions:['人工核验反弹减仓价位']})).toHaveLength(0)
})
it('counts only current verified nonzero actions, never held, blocked or expired opinions',()=>{
  const e=evaluateResearch(fixture());e.decisions[0].conditions.find(c=>c.key==='market')!.status='unmet'
  const row=attachExecutionContracts([decision],e)[0]
  const valid=researchLoopMetrics({productDecisions:[row]},e.asOf)
  expect(valid).toMatchObject({executableActions:1,reduce:1,increase:0,executableActionRatePct:100})
  expect(researchLoopMetrics({productDecisions:[row]},'2099-01-01').executableActions).toBe(0)
  expect(researchLoopMetrics({productDecisions:[{...row,heldAction:'持有',suggestedAdjustmentPct:0}]},e.asOf).executableActions).toBe(0)
  expect(researchLoopMetrics({productDecisions:[{...row,executionContract:{...row.executionContract,status:'blocked',blockers:['缺失']}}]},e.asOf).blockers).toEqual([{reason:'缺失',count:1}])
})
const plan={id:'plan',asOf:'2026-09-01T00:00:00Z',decisionVersionId:'decision',policyVersionId:'policy',actions:[{id:'fund',ticker:'fund',side:'sell',status:'review',amount:1000,referencePrice:10}]} as DailyPlan
const fill:ExecutionFeedback={id:'fill-1',planId:'plan',actionId:'fund',ticker:'fund',status:'filled',recordedAt:'2026-09-01T08:00:00Z',occurredAt:'2026-09-01T07:00:00Z',quantity:100,price:9.9,fee:5,note:''}
it('attributes a sale to avoided losses or missed upside and separates execution costs',()=>{
  const result=executionAttribution([plan],[fill],{fund:{price:9,asOf:'2026-09-02T07:00:00Z'}},'2026-09-03T00:00:00Z')
  expect(result.valued).toBe(1)
  expect(result.rows[0]).toMatchObject({decisionVersionId:'decision',fee:5,missedUpside:0})
  expect(result.netContribution).toBeCloseTo(85)
  expect(result.executionShortfall).toBeCloseTo(15)
  expect(result.rows[0].avoidedLoss).toBeCloseTo(90)
  const rising=executionAttribution([plan],[fill],{fund:{price:11,asOf:'2026-09-02T07:00:00Z'}},'2026-09-03T00:00:00Z')
  expect(rising.netContribution).toBeCloseTo(-115)
  expect(rising.rows[0].missedUpside).toBeCloseTo(110)
})
it('does not use a target ETF price for a fund or a mark before confirmation',()=>{
  const cases:Record<string,ExecutionMark>[]=[{ETF:{price:9,asOf:'2026-09-02T07:00:00Z'}},{fund:{price:9,asOf:'2026-09-01T00:00:00Z'}}]
  for(const marks of cases){
    const result=executionAttribution([plan],[fill],marks,'2026-09-03T00:00:00Z')
    expect(result).toMatchObject({valued:0,pending:1,netContribution:null})
  }
  expect(executionAttribution([plan],[{...fill,status:'submitted'}],{},'2026-09-03T00:00:00Z').fills).toBe(0)
  expect(executionAttribution([plan],[fill,{...fill,id:'retry'}],{},'2026-09-03T00:00:00Z').fills).toBe(1)
})

it('verifies Python history bytes without changing original float serialization',async()=>{
 const {readVerifiedArchive}=await import('../archive-json')
 const {createHash}=await import('node:crypto')
 const payload='{"close":1.0,"name":"ETF"}',contentHash=createHash('sha256').update(payload).digest('hex')
 expect(readVerifiedArchive({payload,contentHash})).toEqual({close:1,name:'ETF'})
 expect(()=>readVerifiedArchive({payload:payload.replace('1.0','2.0'),contentHash})).toThrow('校验失败')
})
