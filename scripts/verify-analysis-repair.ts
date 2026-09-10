/** Read-only replay of the reported regression against its original evidence. */
import 'dotenv/config'
import { strict as assert } from 'node:assert'
import { prisma } from '../src/lib/db/prisma'
import { assessTechnicalReadiness } from '../src/lib/research/technical-readiness'
import { evaluateResearch } from '../src/lib/research/engine'
import { buildReportQuality } from '../src/lib/analysis/report-quality'
import { buildPortfolioDecisionSupport, type PortfolioHoldingInput, type RiskBudget } from '../src/lib/portfolio/decision-support'
import { buildIndustryOverview } from '../src/lib/workflow/steps/industry-overview-step'
import { researchEvidence, researchPrompt } from '../src/lib/workflow/research-input'
import { companyResearchPacket } from '../src/lib/workflow/prompt-evidence'
import type { StepContext } from '../src/lib/workflow/types'
import type { ResearchSnapshot } from '../src/lib/research/contracts'

async function verifyCompletedRun(runId:string){
 const run=await prisma.executionRun.findUnique({where:{id:runId},include:{steps:{include:{artifacts:true}}}})
 assert.equal(run?.status,'COMPLETED')
 assert.equal(run.steps.length,19)
 assert(run.steps.every(step=>step.status==='COMPLETED'))
 const report=await prisma.aIAnalysisReport.findFirst({where:{type:'comprehensive',dataJson:{contains:runId}},orderBy:{createdAt:'desc'}})
 assert(report?.dataJson)
 const data=JSON.parse(report.dataJson)
 assert.equal(data.dataQuality.usable,8)
 assert.equal(data.dataQuality.technicalReadiness.referenceSession,'2026-09-10')
 assert(data.dataQuality.technicalReadiness.perEtf.every((row:{issues:unknown[]})=>row.issues.length===0))
 const portfolio=data.portfolioDecisionSupport as ReturnType<typeof buildPortfolioDecisionSupport>
 assert(portfolio.actions.every(action=>action.mapping.verified||action.amount===null))
 assert(portfolio.actions.every(action=>!action.executable))
 const advice=typeof data.investmentAdvice==='string'?JSON.parse(data.investmentAdvice):data.investmentAdvice
 if(data.aiServiceStatus?.status==='billing-blocked'){
   assert.equal(advice.rating,'未形成模型评级')
   assert(advice.recommendationSource.includes('规则汇编'))
   assert(data.reportQuality.overallScore<=69)
   assert(run.steps.some(step=>step.artifacts.some(artifact=>artifact.artifactKey==='ai-request-status'&&JSON.parse(artifact.data||'{}').attempt===0)))
 }
 const overview=typeof data.industryAnalysis==='string'?JSON.parse(data.industryAnalysis):data.industryAnalysis
 assert(overview.counterEvidence.length>0)
 assert(data.opportunityLedger.length>0)
 assert.deepEqual(advice.opportunityLedger,data.opportunityLedger)
 assert(data.opportunityLedger.some((item:{exposure:Array<{ticker:string;weightPct:number}>})=>item.exposure.some(product=>product.ticker==='159995'&&product.weightPct>0)))
 assert(data.opportunityLedger.every((item:{discoveryPlan?:unknown[];exposure:unknown[]})=>item.exposure.length>0||item.discoveryPlan?.length===3))
 console.log(JSON.stringify({runId,reportId:report.id,steps:run.steps.length,technical:'8/8',referenceSession:data.dataQuality.technicalReadiness.referenceSession,modelService:data.aiServiceStatus?.status||'available',rating:advice.rating,unverifiedAmountsWithheld:true,checks:'passed'}))
}

async function main(){
 if(process.argv[2]==='--completed-run'){assert(process.argv[3]);return verifyCompletedRun(process.argv[3])}
 const report=await prisma.aIAnalysisReport.findUnique({where:{id:process.argv[2]||'cmtvb18gs0020l4vplxlze6dl'}})
 assert(report?.dataJson,'Report is required')
 const data=JSON.parse(report.dataJson),snapshotId=data.researchEvaluation.snapshotId
 const raw=await prisma.rawPayload.findUnique({where:{id:snapshotId}})
 assert(raw?.datasetKey==='research_snapshot','Immutable snapshot is required')
 const snapshot=JSON.parse(raw.payload) as ResearchSnapshot
 const inputHash=JSON.stringify(snapshot)
 const technical=assessTechnicalReadiness(snapshot)
 const evaluation=evaluateResearch(snapshot)
 const quality=buildReportQuality({evaluation,dataQuality:data.dataQuality})
 assert.equal(technical.usable,1)
 assert.equal(technical.referenceSession,'2026-09-09')
 assert.equal(technical.perEtf.filter(row=>row.issues.some(issue=>issue.field==='factors'&&issue.status==='pending-publication')).length,6)
 assert.equal(quality.dimensions.find(d=>d.key==='market')?.score,13)
 const steps=await prisma.executionStep.findMany({where:{runId:data.metadata.runId},include:{artifacts:true},orderBy:{stepIndex:'asc'}})
 const artifacts=new Map(steps.flatMap(step=>step.artifacts.map(artifact=>{let value:unknown;try{value=JSON.parse(artifact.data||'null')}catch{value=artifact.data}return [artifact.artifactKey,value] as [string,unknown]})))
 const context={artifacts} as StepContext
 const overview=buildIndustryOverview(context)
 assert(overview.counterEvidence.length>0,'Counter-evidence must survive aggregation')
 assert(overview.segmentSignals.some(row=>!row.eventSignal.includes('暂无')),'Stable identities must link events')
 const packet=researchEvidence(context,'industry-overview')
 assert.equal(packet.asOf,'2026-09-10T16:45:10.656+08:00')
 const prompt=researchPrompt(context,'investment-advice')
 assert(prompt.includes('invalidation')&&prompt.includes('pricingAssessment'),'Synthesis must preserve falsification and pricing')
 const portfolio=artifacts.get('portfolio-evidence') as {holdings:PortfolioHoldingInput[];totalAssets:number;cashWeightPct:number;riskBudget:RiskBudget;asOf:string}
 const support=buildPortfolioDecisionSupport({evaluation,holdings:portfolio.holdings,totalAssets:portfolio.totalAssets,cashWeightPct:portfolio.cashWeightPct,policy:portfolio.riskBudget,dataQualityAvailable:false,portfolioAsOf:portfolio.asOf,investmentAdvice:data.investmentAdvice})
 assert.equal(support.targetIndustryRangePct[1],15)
 assert.equal(support.unknownSignalPct,75)
 assert(support.actions.every(row=>row.amount===null&&!row.executable))
 const companies=companyResearchPacket(artifacts.get('company-market-data') as Array<Record<string,unknown>>)
 assert.equal(companies.coverage.profitGrowthKnown,40)
 assert(companies.coverage.positiveProfitGrowth>0)
 assert.equal(JSON.stringify(snapshot),inputHash)
 assert.equal((await prisma.aIAnalysisReport.findUnique({where:{id:report.id}}))?.dataJson,report.dataJson)
 console.log(JSON.stringify({reportId:report.id,readOnly:true,technical:{current:technical.usable,total:technical.requested,referenceSession:technical.referenceSession},budget:{before:data.portfolioDecisionSupport.targetIndustryRangePct[1],after:support.targetIndustryRangePct[1],unknownSignalPct:support.unknownSignalPct},counterEvidence:overview.counterEvidence.length,linkedSegments:overview.segmentSignals.filter(row=>!row.eventSignal.includes('暂无')).length,companyBreadth:companies.coverage.positiveProfitGrowth,checks:'passed'}))
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>prisma.$disconnect())
