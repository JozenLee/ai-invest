import {it,expect} from 'vitest'
import {compareResearchPolicies} from '../policy-comparison'
import {fixture} from './fixtures'
import {evaluateResearch} from '../engine'
it('never gives a delayed report an earlier fill or treats legacy confidence as an executable AI signal',()=>{
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot)
  evaluation.asOf='2026-09-03T08:00:00Z';evaluation.expectedSession='2026-09-03'
  const result=compareResearchPolicies(snapshot,[{evaluation,generatedAt:'2026-09-04T05:19:00Z',investmentAdvice:{productDecisions:[{ticker:'159995',unheldAction:'建仓',heldAction:'加仓',suggestedAdjustmentPct:2,confidencePct:90,reason:'需求',trigger:'趋势',invalidation:'反转',evidenceIds:['raw-one']}]}}])
  expect(result.reports).toBe(1)
  expect(result.executableAIProducts).toBe(0)
  expect(result.excludedAIProducts).toBe(1)
  expect(result.ai[0].returnPct).toBeNull()
  expect(result.ai[0].trades).toBe(0)
})

it('uses an actual pre-open revalidation for the next-open paper fill instead of extending last night’s expiry',()=>{
  const snapshot=fixture(),night=evaluateResearch(snapshot),morning=structuredClone(night)
  night.snapshotId='night';night.asOf='2026-09-03T08:00:00Z';night.expectedSession='2026-09-03'
  morning.snapshotId='morning';morning.asOf='2026-09-04T01:00:00Z';morning.expectedSession='2026-09-03'
  night.decisions[0].expiresAt='2026-09-04T01:00:00Z'
  morning.decisions[0].expiresAt='2026-09-04T07:00:00Z'
  const product=(asOf:string,validUntil:string)=>({ticker:'159995',unheldAction:'建仓',heldAction:'加仓',suggestedAdjustmentPct:2,confidencePct:70,reason:'需求',trigger:'趋势',invalidation:'反转',evidenceIds:['raw-one'],executionContract:{asOf,validUntil,status:'verified',triggerRules:[]}})
  const result=compareResearchPolicies(snapshot,[{evaluation:night,generatedAt:night.asOf,investmentAdvice:{productDecisions:[product(night.asOf,night.decisions[0].expiresAt)]}},{evaluation:morning,generatedAt:morning.asOf,investmentAdvice:{productDecisions:[product(morning.asOf,morning.decisions[0].expiresAt)]}}])
  expect(result.reports).toBe(1)
  expect(result.ai[0].trades).toBe(1)
  expect(result.ai[0].returnPct).toBeNull()
})
