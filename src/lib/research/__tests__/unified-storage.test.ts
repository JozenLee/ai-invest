// @vitest-environment node
import { beforeAll,afterAll,it,expect } from 'vitest'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fixture } from './fixtures'
import { evaluateResearch } from '../engine'
import { NextRequest } from 'next/server'
let directory:string
let db:typeof import('@/lib/db')['prisma']
let store:typeof import('../strategy/store')
let ledger:typeof import('../decision-ledger')
let validation:typeof import('../strategy/validation-store')
let lease:typeof import('../lease')
let route:typeof import('@/app/api/research/[industryId]/validation/route')
const oldUrl=process.env.TEST_DATABASE_URL
beforeAll(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),'ai-invest-unified-test-'))
  const filename=path.join(directory,'isolated.sqlite')
  process.env.TEST_DATABASE_URL=`file:${filename}`
  const SQLite=createRequire(import.meta.url)('better-sqlite3')
  const sqlite=new SQLite(filename)
  sqlite.exec(`CREATE TABLE raw_payloads (id TEXT PRIMARY KEY, datasetKey TEXT NOT NULL,targetCode TEXT NOT NULL,provider TEXT,payload TEXT NOT NULL,contentHash TEXT NOT NULL,fetchedAt DATETIME NOT NULL DEFAULT (unixepoch('subsec')*1000));
    CREATE TABLE AIAnalysisReport (id TEXT PRIMARY KEY,type TEXT NOT NULL,industryId TEXT NOT NULL,industryName TEXT NOT NULL,title TEXT NOT NULL,summary TEXT,content TEXT NOT NULL,dataJson TEXT,createdAt DATETIME NOT NULL DEFAULT (unixepoch('subsec')*1000));`)
  sqlite.exec(`CREATE TABLE execution_runs(id TEXT PRIMARY KEY,workflowId TEXT NOT NULL,status TEXT NOT NULL,startedAt DATETIME NOT NULL DEFAULT (unixepoch('subsec')*1000),completedAt DATETIME,error TEXT,metadata TEXT,workflowVersion TEXT NOT NULL DEFAULT 'legacy',definitionHash TEXT,definitionSnapshot TEXT,configSnapshot TEXT);
    CREATE TABLE execution_steps(id TEXT PRIMARY KEY,runId TEXT NOT NULL,stepName TEXT NOT NULL,stepIndex INTEGER NOT NULL,status TEXT NOT NULL,startedAt DATETIME,completedAt DATETIME,duration INTEGER,error TEXT,progress TEXT,methodId TEXT,methodVersion TEXT,configSnapshot TEXT,UNIQUE(runId,stepName));`)
  sqlite.close()
  db=(await import('@/lib/db')).prisma
  store=await import('../strategy/store');ledger=await import('../decision-ledger');validation=await import('../strategy/validation-store');lease=await import('../lease');route=await import('@/app/api/research/[industryId]/validation/route')
})
afterAll(async()=>{await db?.$disconnect();process.env.TEST_DATABASE_URL=oldUrl;await rm(directory,{recursive:true,force:true})})
it('closes frozen evidence → strategy → decision archive → API comparison → exact replay with real SQLite',async()=>{
  const {persistResearchSnapshot}=await import('../store')
  const source=fixture()
  await store.archiveStrategyRecord('profile:ai','research_profile','ai',source.profile)
  for(const index of [80,100,120,148]){
    const snapshot=structuredClone(source),date=source.etfs[0].bars[index].date
    snapshot.id=`frozen:${index}`;snapshot.asOf=`${date}T15:30:00+08:00`;snapshot.capturedAt=snapshot.asOf
    snapshot.etfs[0].bars=source.etfs[0].bars.slice(0,index+1);snapshot.benchmarkBars=source.benchmarkBars.slice(0,index+1)
    snapshot.evidence=[{id:'proof',source:'test',dataDate:date,publishedAt:`${date}T15:00:00+08:00`,fetchedAt:`${date}T15:05:00+08:00`,hash:'frozen-proof'}]
    await persistResearchSnapshot(snapshot)
    const evaluation=evaluateResearch(snapshot);evaluation.decisions.forEach(d=>{d.evidenceIds=['proof']});const generatedAt=`${date}T16:00:00+08:00`
    const advice={productDecisions:[{ticker:'159995',heldAction:index===120?'减仓':'加仓',unheldAction:index===120?'观望':'建仓',suggestedAdjustmentPct:5,confidencePct:70,reason:'归档测试',trigger:'收盘确认',invalidation:'趋势失效',quantitativeOverride:null,evidenceIds:['proof'],decisionSource:'ai',executionContract:{asOf:snapshot.asOf,validUntil:`${source.etfs[0].bars[index+1].date}T15:00:00+08:00`,status:'verified',triggerRules:[],reviewPolicy:'daily'}}]}
    const allocation=await store.prepareUnifiedAllocation({evaluation,advice,snapshot,runId:`run-${index}`,generatedAt,model:'fixture-model'})
    const version=await ledger.archiveUnifiedDecisionVersion({reportId:`report-${index}`,industryId:'ai',runId:`run-${index}`,snapshotId:snapshot.id,generatedAt,horizonTradingDays:20,evaluation,investmentAdvice:advice,allocation,reportQuality:{usability:'advice-grade',executionReadinessScore:100}})
    expect(version.allocation?.targets['159995']).toBeGreaterThanOrEqual(0)
    expect(allocation.parentId===null).toBe(index===80)
  }
  await db.rawPayload.delete({where:{id:'frozen:148'}}) // Compact market archive survives snapshot cleanup.
  const context={params:Promise.resolve({industryId:'ai'})}
  const request=new NextRequest('http://localhost:3000/api/research/ai/validation',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({action:'compare',adjustmentScale:.5})})
  const response=await route.POST(request,context),payload=await response.json()
  expect(response.status,JSON.stringify(payload)).toBe(200)
  expect(payload.result.accepted).toBe(3) // Last decision was published after the evaluation snapshot.
  expect(payload.result.exclusions).toHaveLength(0)
  expect(payload.result.pending).toHaveLength(1)
  expect(payload.result.baseline.trades).toBeGreaterThan(0)
  expect(payload.result.challenger.fills[0].notional).toBeLessThan(payload.result.baseline.fills[0].notional)
  const verification=await validation.verifyUnifiedValidation('ai',payload.id)
  expect(verification.verified).toBe(true)
  const get=await route.GET(new NextRequest('http://localhost:3000/api/research/ai/validation'),context)
  expect((await get.json()).runs).toHaveLength(1)
  await expect(validation.verifyUnifiedValidation('other',payload.id)).rejects.toThrow('不存在')
  await db.rawPayload.update({where:{id:payload.id},data:{payload:'{}'}})
  await expect(validation.verifyUnifiedValidation('ai',payload.id)).rejects.toThrow('哈希')
},20000)
it('keeps immutable records and prevents a second process from claiming a live task',async()=>{
  await store.archiveStrategyRecord('immutable','test','ai',{value:1})
  await expect(store.archiveStrategyRecord('immutable','test','ai',{value:2})).rejects.toThrow('冲突')
  let release!:()=>void,entered!:()=>void
  const ready=new Promise<void>(resolve=>{entered=resolve})
  const work=lease.withResearchLease('test','ai',async()=>{entered();await new Promise<void>(resolve=>{release=resolve});return 1})
  await ready
  await expect(lease.withResearchLease('test','ai',async()=>2)).rejects.toThrow('已有')
  release();expect(await work).toBe(1)
  expect(await lease.withResearchLease('test','ai',async()=>3)).toBe(3)
})
it('applies the same cross-industry veto without a second position allocator',async()=>{
  const {accountConflictBlockers}=await import('../strategy/account-conflicts')
  const {fingerprint}=await import('../strategy/kernel')
  const versions=await ledger.listUnifiedDecisionVersions('ai')
  const current=versions[0],allocation=structuredClone(current.allocation!)
  allocation.targets={'159995':.3}
  const other={...current,id:'other-decision',industryId:'other',allocation:{...allocation,targets:{'159995':.05}}}
  await db.rawPayload.create({data:{id:other.id,datasetKey:'unified_decision_version',targetCode:'other',provider:'test',payload:JSON.stringify(other),contentHash:fingerprint(other),fetchedAt:new Date(current.generatedAt)}})
  const account={portfolioId:'account',asOf:current.generatedAt,totalAssets:100000,cashWeightPct:80,holdings:[{ticker:'159995',name:'ETF',weightPct:20,marketValue:20000}],riskBudget:{riskProfile:'moderate' as const,investHorizon:'medium' as const,minCashRatio:.2,maxIndustryRatio:.6,maxFundRatio:.3,maxSingleAdjustmentRatio:.1,stagedAdjustment:false}}
  const blockers=await accountConflictBlockers('ai',allocation,evaluateResearch(fixture()),account,current.generatedAt)
  expect(blockers['159995'][0]).toContain('相反调整')
  expect(await accountConflictBlockers('ai',allocation,evaluateResearch(fixture()),account,'2099-01-01')).toEqual({})
})
it('rejects cross-origin validation mutations without entering the experiment engine',async()=>{
  const response=await route.POST(new NextRequest('http://localhost:3000/api/research/ai/validation',{method:'POST',headers:{origin:'https://other.test','content-type':'application/json'},body:'{"action":"compare"}'}),{params:Promise.resolve({industryId:'ai'})})
  expect(response.status).toBe(403)
})

it('atomically escalates a stale review in real SQLite and preserves the private skipped step',async()=>{
  const {escalateAutomaticReview}=await import('../auto-reanalysis')
  const {attachExecutionContracts}=await import('@/lib/analysis/investment-conclusion')
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot),previous=structuredClone(evaluation)
  previous.asOf='2026-08-01T09:00:00Z'
  const advice={productDecisions:attachExecutionContracts([{ticker:'159995',unheldAction:'观望',heldAction:'持有',suggestedAdjustmentPct:0,confidencePct:40,reason:'原观点',trigger:'等待条件',invalidation:'变化',quantitativeOverride:null,evidenceIds:['raw-one'],decisionSource:'ai'}],previous)}
  await db.aIAnalysisReport.create({data:{id:'auto-parent',industryId:'ai',industryName:'测试',type:'comprehensive',title:'原报告',content:'原观点',dataJson:JSON.stringify({metadata:{runId:'auto-parent-run'},investmentAdvice:advice,researchEvaluation:previous})}})
  const run=await db.executionRun.create({data:{id:'auto-review',workflowId:'comprehensive-analysis',status:'RUNNING',metadata:JSON.stringify({industryId:'ai',rulesOnly:true,autoReanalysis:true,parentRunId:'auto-parent-run'}),steps:{create:['market-analysis','news-analysis','company-analysis','industry-overview','social-report','portfolio-analysis'].map((stepName,stepIndex)=>({stepName,stepIndex,status:'SKIPPED'}))}}})
  const artifacts=new Map<string,unknown>([['data-quality',{status:'available'}]])
  const context={runId:run.id,stepId:'etf',attemptNumber:1,input:JSON.parse(run.metadata!),artifacts,saveArtifact:async(k:string,v:unknown)=>{artifacts.set(k,v)},updateProgress:async()=>{}}
  await escalateAutomaticReview(context,evaluation,snapshot)
  const updated=await db.executionRun.findUniqueOrThrow({where:{id:run.id},include:{steps:true}})
  expect(JSON.parse(updated.metadata!)).toMatchObject({rulesOnly:false,publicOnly:true,autoReanalysisAudit:{status:'started'}})
  expect(updated.steps.filter(s=>s.stepName!=='portfolio-analysis').every(s=>s.status==='PENDING')).toBe(true)
  expect(updated.steps.find(s=>s.stepName==='portfolio-analysis')?.status).toBe('SKIPPED')
  // Retrying the same barrier after a crash does not consume another budget slot.
  await escalateAutomaticReview(context,evaluation,snapshot)
  expect(await db.rawPayload.count({where:{datasetKey:'research_auto_reanalysis'}})).toBe(1)
  await db.executionRun.update({where:{id:run.id},data:{status:'COMPLETED'}})
})
