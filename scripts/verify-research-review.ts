/** Read-only regression check against an archived run. Never rewrites reports or calls AI. */
import { createRequire } from 'node:module'
import { strict as assert } from 'node:assert'
import { financialView } from '../src/lib/market-detail'
import { enrichCatalysts } from '../src/lib/analysis/disclosed-exposure'
import { auditResearchConsistency } from '../src/lib/analysis/research-consistency'
import { effectiveDecisionTiming } from '../src/lib/analysis/decision-timing'
import { researchEvidence } from '../src/lib/workflow/research-input'
import type { StepContext } from '../src/lib/workflow/types'

const require=createRequire(import.meta.url)
const Database=require('better-sqlite3')
const db=new Database('prisma/dev.db',{readonly:true,fileMustExist:true})
try {
  const runId=process.argv[2] || db.prepare("SELECT id FROM execution_runs WHERE workflowId='comprehensive-analysis' AND status='COMPLETED' ORDER BY startedAt DESC LIMIT 1").get()?.id
  assert(runId,'No completed research run')
  const stored=db.prepare('SELECT a.artifactKey,a.data FROM step_artifacts a JOIN execution_steps s ON a.stepId=s.id WHERE s.runId=? ORDER BY s.stepIndex').all(runId) as Array<{artifactKey:string;data:string}>
  const artifacts=new Map<string, unknown>(stored.map(item=>{try{return [item.artifactKey,JSON.parse(item.data)]}catch{return [item.artifactKey,item.data]}}))
  const context={artifacts} as StepContext
  const timing=artifacts.get('decision-timing') as Parameters<typeof effectiveDecisionTiming>[0]
  if(timing?.eventCheckCoverage.fresh===0)assert.equal(effectiveDecisionTiming(timing,timing.asOf).executionReady,false)
  const graph=artifacts.get('graph-context') as {stages:Array<{segments:unknown[]}>}|undefined
  const overview=researchEvidence(context,'industry-overview')
  if(graph)assert.equal(overview.graph.stages.reduce((sum:number,stage:{segments:unknown[]})=>sum+stage.segments.length,0),graph.stages.reduce((sum,stage)=>sum+stage.segments.length,0))
  const originalIssues=auditResearchConsistency(artifacts.get('company-analysis'),artifacts.get('company-market-data'))
  // Rebuild one historically conflicting source through the current field adapter.
  const financial=financialView({reportPeriod:'2026-06-30',reportType:'income',source:'tushare',publishDate:null,metricsJson:JSON.stringify({currency:'CNY',q_sales_yoy:53.4377,tr_yoy:46.3283})})
  assert.equal(financial.metrics.find(item=>item.label==='营收同比')?.value,46.3283)
  const storage=enrichCatalysts({catalysts:[{affectedCompanies:['688008','688525','688041']}]},artifacts.get('etf-holdings'))
  console.log(JSON.stringify({runId,readOnly:true,externalCalls:0,originalConsistencyIssueCount:originalIssues.length,industrySegments:overview.graph?.stages?.reduce((sum:number,stage:{segments:unknown[]})=>sum+stage.segments.length,0),storageExposure:storage.catalysts,checks:'passed'}))
} finally { db.close() }
