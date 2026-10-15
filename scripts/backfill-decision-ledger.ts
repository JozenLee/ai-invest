import { config } from 'dotenv'
config({quiet:true})

async function main(){
  const [{prisma},{archiveUnifiedDecisionVersion,listUnifiedDecisionVersions,assessDecisionHistory,archiveDecisionHistory},{readSnapshot}]=await Promise.all([
    import('../src/lib/db'),import('../src/lib/research/decision-ledger'),import('../src/lib/research/store'),
  ])
  let archived=0,skipped=0
  try{
    const reports=await prisma.aIAnalysisReport.findMany({where:{type:'comprehensive'},orderBy:{createdAt:'asc'},select:{id:true,industryId:true,createdAt:true,dataJson:true}})
    for(const report of reports){
      try{
        const data=JSON.parse(report.dataJson||'{}'),evaluation=data.researchEvaluation,metadata=data.metadata||{}
        if(!evaluation?.snapshotId||!data.investmentAdvice||metadata.verificationMode){skipped++;continue}
        await archiveUnifiedDecisionVersion({reportId:report.id,industryId:report.industryId,runId:String(metadata.runId||`legacy:${report.id}`),snapshotId:evaluation.snapshotId,
          generatedAt:String(metadata.generatedAt||report.createdAt.toISOString()),horizonTradingDays:Number(evaluation.profile?.horizonDays)||20,evaluation,investmentAdvice:data.investmentAdvice,reportQuality:data.reportQuality})
        archived++
      }catch{skipped++}
    }
    const industries=[...new Set(reports.map(report=>report.industryId))]
    const assessments=[]
    for(const industryId of industries){
      const latest=await prisma.rawPayload.findFirst({where:{datasetKey:'research_snapshot',targetCode:industryId},orderBy:{fetchedAt:'desc'},select:{id:true}})
      if(!latest)continue
      const snapshot=await readSnapshot(latest.id),versions=await listUnifiedDecisionVersions(industryId)
      assessments.push(await archiveDecisionHistory(assessDecisionHistory(versions,snapshot)))
    }
    console.log(JSON.stringify({archived,skipped,industries:assessments.map(item=>({industryId:item.industryId,decisionVersions:item.decisionVersions,directionalMatured:item.directionalMatured,pending:item.pending,calibrationStatus:item.calibrationStatus}))},null,2))
  }finally{await prisma.$disconnect()}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
