import { prisma } from '@/lib/db'
import { withResearchLease } from './lease'

/** A new snapshot must travel through the same review/report/decision chain. */
export async function refreshUnifiedResearch(industryId:string){
  return withResearchLease('refresh',industryId,async()=>{
    const parent=await prisma.aIAnalysisReport.findFirst({where:{industryId,type:'comprehensive'},orderBy:{createdAt:'desc'}})
    const data=parent?.dataJson?JSON.parse(parent.dataJson):null
    if(!data?.metadata?.runId||!data.researchEvaluation)throw new Error('请先完成一次综合分析，规则复核不能补造AI观点')
    const {comprehensiveAnalysisWorkflow:workflow}=await import('@/lib/workflow/workflows/comprehensive-analysis')
    const runId=await workflow.createRun({industryId,publicOnly:true,rulesOnly:true,autoReanalysis:true,parentRunId:data.metadata.runId,baselineSnapshotId:data.researchEvaluation.snapshotId,kind:'review',createdBy:'unified-review',timestamp:new Date().toISOString()})
    await workflow.executeAll(runId)
    const run=await workflow.getRunDetails(runId,true)
    const artifact=run?.steps.flatMap(step=>step.artifacts).find(row=>row.artifactKey==='unified-decision-version')
    if(run?.status!=='COMPLETED'||!artifact?.data)throw new Error(`统一复核未完成：${runId}`)
    const decision=JSON.parse(artifact.data)
    const {runLab}=await import('./lab/store')
    const experiment=await runLab(industryId,decision.snapshotId)
    if(experiment.decisionVersionId!==decision.id)throw new Error('复核决策与实验版本不一致')
    return {runId,snapshotId:decision.snapshotId,decisionVersionId:decision.id,experiment}
  })
}
