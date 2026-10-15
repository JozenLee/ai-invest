import { beforeEach, expect, it, vi } from 'vitest'
import { fixture } from './fixtures'
import { evaluateResearch } from '../engine'
import { attachExecutionContracts, type AIProductDecision } from '@/lib/analysis/investment-conclusion'
import type { StepContext } from '@/lib/workflow/types'
const mocks=vi.hoisted(()=>({parent:vi.fn(),records:vi.fn(),active:vi.fn(),claim:vi.fn(),run:vi.fn(),update:vi.fn(),steps:vi.fn()}))
vi.mock('@/lib/db',()=>({prisma:{aIAnalysisReport:{findFirst:mocks.parent},$transaction:async(work:(tx:unknown)=>unknown)=>work({rawPayload:{findMany:mocks.records,upsert:mocks.claim},executionRun:{findMany:mocks.active,findUniqueOrThrow:mocks.run,update:mocks.update},executionStep:{updateMany:mocks.steps}})}}))
import { escalateAutomaticReview, reanalysisBudget, canReanalyze } from '../auto-reanalysis'
function setup(){
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot),previous=structuredClone(evaluation)
  previous.asOf='2026-08-01T09:00:00Z'
  const product:AIProductDecision={ticker:'159995',unheldAction:'观望',heldAction:'持有',suggestedAdjustmentPct:0,confidencePct:40,reason:'原观点',trigger:'等待条件',invalidation:'风险失效',quantitativeOverride:null,evidenceIds:['raw-one'],decisionSource:'ai'}
  mocks.parent.mockResolvedValue({id:'original',dataJson:JSON.stringify({investmentAdvice:{productDecisions:attachExecutionContracts([product],previous)},researchEvaluation:previous})})
  const artifacts=new Map<string,unknown>([['data-quality',{status:'available'}]])
  const ctx:StepContext={runId:'review',stepId:'etf',attemptNumber:1,input:{industryId:'ai',parentRunId:'old',rulesOnly:true,autoReanalysis:true},artifacts,saveArtifact:async(k,v)=>{artifacts.set(k,v)},updateProgress:vi.fn()}
  return {snapshot,evaluation,ctx,artifacts}
}
beforeEach(()=>{vi.clearAllMocks();mocks.records.mockResolvedValue([]);mocks.active.mockResolvedValue([]);mocks.run.mockResolvedValue({metadata:JSON.stringify({industryId:'ai',rulesOnly:true,parentRunId:'old',portfolioConsent:true})})})
it('upgrades stale opinions before public AI waves while preserving snapshot and private boundaries',async()=>{
  const {ctx,evaluation,snapshot,artifacts}=setup()
  await escalateAutomaticReview(ctx,evaluation,snapshot)
  expect(artifacts.get('auto-reanalysis')).toMatchObject({status:'started',sourceReportId:'original'})
  const saved=JSON.parse(mocks.update.mock.calls[0][0].data.metadata)
  expect(saved).toMatchObject({rulesOnly:false,publicOnly:true,parentRunId:'old'})
  expect(mocks.steps.mock.calls[0][0].where.stepName.in).not.toContain('portfolio-analysis')
  expect(mocks.steps.mock.calls[0][0].where.stepName.in).toEqual(expect.arrayContaining(['market-analysis','company-analysis','news-analysis','industry-overview']))
  expect(snapshot.id).toBe('snapshot-one')
})
it('never upgrades an explicit quick review or spends model budget on insufficient evidence',async()=>{
  const {ctx,evaluation,snapshot,artifacts}=setup()
  ctx.input.autoReanalysis=false
  await escalateAutomaticReview(ctx,evaluation,snapshot)
  expect(mocks.parent).not.toHaveBeenCalled()
  ctx.input.autoReanalysis=true;artifacts.set('data-quality',{status:'limited'})
  await escalateAutomaticReview(ctx,evaluation,snapshot)
  expect(artifacts.get('auto-reanalysis')).toMatchObject({status:'deferred'})
  expect(mocks.claim).not.toHaveBeenCalled()
})
it('deduplicates simultaneous full analyses and defers within the cooldown',async()=>{
  const {ctx,evaluation,snapshot,artifacts}=setup()
  mocks.active.mockResolvedValue([{metadata:JSON.stringify({industryId:'ai',rulesOnly:false})}])
  await escalateAutomaticReview(ctx,evaluation,snapshot)
  expect(artifacts.get('auto-reanalysis')).toMatchObject({status:'deferred'})
  expect(mocks.update).not.toHaveBeenCalled()
  mocks.active.mockResolvedValue([]);mocks.records.mockResolvedValue([{payload:JSON.stringify({runId:'earlier',startedAt:new Date().toISOString()})}])
  await escalateAutomaticReview(ctx,evaluation,snapshot)
  expect(artifacts.get('auto-reanalysis')).toMatchObject({status:'deferred',retryAfter:expect.any(String)})
  expect(mocks.claim).not.toHaveBeenCalled()
})
it('bounds attempts per Shanghai day including failed attempts and permits idempotent recovery',()=>{
  const attempts=[{runId:'a',startedAt:'2026-09-04T00:00:00Z'},{runId:'b',startedAt:'2026-09-04T06:00:00Z'}]
  expect(reanalysisBudget('2026-09-04T13:00:00Z',attempts,'c')).toEqual({allowed:false,retryAfter:'2026-09-04T16:00:00.000Z'})
  expect(reanalysisBudget('2026-09-04T06:01:00Z',attempts,'b').allowed).toBe(true)
  expect(reanalysisBudget('2026-09-04T16:01:00Z',attempts,'c').allowed).toBe(true)
})

it('allows new research with known secondary gaps without treating it as trading permission',()=>{
 expect(canReanalyze({status:'limited',calendarVerified:true,usable:10,modules:{market:{status:'available'}}})).toBe(true)
 expect(canReanalyze({status:'limited',calendarVerified:false,usable:10,modules:{market:{status:'available'}}})).toBe(false)
 expect(canReanalyze({status:'available',dataAnomalies:['价格异常']})).toBe(false)
})
