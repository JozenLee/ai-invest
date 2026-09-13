/** Reproduce saved output failures; optionally run and verify a fresh comprehensive analysis. */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { prisma } from '../src/lib/db/prisma'
import { parseResearchObject, saveValidatedResearchOutput } from '../src/lib/workflow/research-output'
import { validatePortfolioOutput } from '../src/lib/workflow/steps/portfolio-analysis-step'
import type { StepContext } from '../src/lib/workflow/types'

const originalRunId='cmtvp9x6q004h5dvpks3y69hc'
async function verify(runId:string){
 const run=await prisma.executionRun.findUniqueOrThrow({where:{id:runId},include:{steps:{include:{artifacts:true},orderBy:{stepIndex:'asc'}}}})
 assert.equal(run.status,'COMPLETED')
 assert.equal(run.steps.length,19)
 assert(run.steps.every(step=>step.status==='COMPLETED'))
 for(const step of run.steps){
  for(const artifact of step.artifacts){
   const value=JSON.parse(artifact.data||'null')
   if(artifact.artifactKey.endsWith('-validation')&&value?.issues)assert.deepEqual(value.issues,[],`${step.stepName}: ${JSON.stringify(value.issues)}`)
   if(artifact.artifactKey.endsWith('-ai-status'))assert.notEqual(value?.status,'fallback',step.stepName)
  }
 }
 const report=await prisma.aIAnalysisReport.findFirstOrThrow({where:{type:'comprehensive',dataJson:{contains:runId}},orderBy:{createdAt:'desc'}})
 const data=JSON.parse(report.dataJson!)
 assert.equal(data.analysisStatuses.portfolio.status,'completed')
 assert(Object.values(data.outputValidations).every((value)=>!(value as {issues:string[]}).issues.length))
 const technicalReadiness=data.dataQuality.technicalReadiness
 const usableEtfs=technicalReadiness.perEtf.filter((item:{usable:boolean})=>item.usable).length
 assert.equal(technicalReadiness.usable,usableEtfs,'可用技术样本数必须与逐基金门禁结果一致')
 assert.equal(technicalReadiness.requested,technicalReadiness.perEtf.length,'请求样本数必须与逐基金门禁记录一致')
 assert(technicalReadiness.usable<=technicalReadiness.requested,'可用技术样本数不能超过请求样本数')
 assert.equal(data.dataQuality.status,'limited','Real data gaps must remain visible')
 const sources=new Set(data.researchEvaluation.evidence.map((row:{id:string})=>row.id))
 for(const key of ['marketAnalysis','companyAnalysis','sentimentAnalysis','industryAnalysis','investmentAdvice']){
  const value=typeof data[key]==='string'?JSON.parse(data[key]):data[key]
  const visit=(item:unknown)=>{
   if(Array.isArray(item))return item.forEach(visit)
   if(!item||typeof item!=='object')return
   const row=item as Record<string,unknown>
   if(typeof row.claim==='string'){
    assert.deepEqual(row.referenceIssues||[],[],key)
    assert(Array.isArray(row.evidenceIds)&&row.evidenceIds.length>0,key)
    assert((row.evidenceIds as string[]).every(id=>sources.has(id)),key)
   }
   Object.values(row).forEach(visit)
  }
  visit(value)
 }
 console.log(JSON.stringify({runId,reportId:report.id,steps:19,modelAndCitationChecks:'passed',realDataLimitsPreserved:true}))
}
async function main(){
 if(process.argv[2]==='--verify')return verify(process.argv[3])
 if(process.argv[2]==='--repair'){
  const {comprehensiveAnalysisWorkflow}=await import('../src/lib/workflow/workflows/comprehensive-analysis')
  const runId=process.argv[3]
  await comprehensiveAnalysisWorkflow.executeSelectedStep(runId,'market-analysis')
  await comprehensiveAnalysisWorkflow.resume(runId)
  return verify(runId)
 }
 if(process.argv[2]==='--live'){
  const original=await prisma.executionRun.findUniqueOrThrow({where:{id:originalRunId}})
  const input=JSON.parse(original.metadata||'{}')
  assert.equal(input.portfolioAiConsent,new URL(process.env.ANTHROPIC_BASE_URL||'https://api.anthropic.com').origin,'Reuse consent only for the original destination')
  const {comprehensiveAnalysisWorkflow}=await import('../src/lib/workflow/workflows/comprehensive-analysis')
  const runId=await comprehensiveAnalysisWorkflow.createRun({...input,timestamp:new Date().toISOString(),repairOfRunId:originalRunId})
  console.log(JSON.stringify({newRunId:runId}))
  await comprehensiveAnalysisWorkflow.executeAll(runId)
  return verify(runId)
 }
 const run=await prisma.executionRun.findUniqueOrThrow({where:{id:originalRunId},include:{steps:{include:{artifacts:true}}}})
 const artifacts=new Map(run.steps.flatMap(step=>step.artifacts.map(a=>[a.artifactKey,JSON.parse(a.data||'null')] as [string,unknown])))
 const originalSnapshot=JSON.stringify(artifacts.get('research-snapshot'))
 const response=(stepName:string,key='ai-response')=>JSON.parse(run.steps.find(s=>s.stepName===stepName)!.artifacts.find(a=>a.artifactKey===key)!.data!).content[0].text as string
 assert.throws(()=>parseResearchObject(response('portfolio-decision','ai-response-attempt-1')),SyntaxError)
 assert.throws(()=>validatePortfolioOutput(response('portfolio-decision','ai-response-attempt-2')),/analysis.*字符串/)
 const context={runId:run.id,stepId:'replay',artifacts,input:{},updateProgress:async()=>{},saveArtifact:async(key:string,value:unknown)=>{artifacts.set(key,value)}} as StepContext
 for(const stepName of ['market-analysis','company-analysis','news-analysis','investment-advice']){
  await saveValidatedResearchOutput(context,stepName,response(stepName))
  console.log(JSON.stringify({stepName,validation:artifacts.get(`${stepName}-validation`)}))
 }
 assert.equal(JSON.stringify(artifacts.get('research-snapshot')),originalSnapshot)
 console.log('Original response failures reproduced without updating archived reports.')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect())
