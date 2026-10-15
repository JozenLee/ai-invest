import { config } from 'dotenv'
config({quiet:true})
async function main(){
  const {prisma}=await import('../src/lib/db')
  const {runLab,setLabEnabled,runEnabledLabs,verifyLatestExperiment}=await import('../src/lib/research/lab/store')
  try{
    const industryId=process.argv.find(arg=>arg.startsWith('--industry='))?.slice(11)
    if(!industryId){console.log(JSON.stringify(await runEnabledLabs()));return}
    const {getResearchProfile,saveResearchProfile,captureResearchSnapshot,persistResearchSnapshot}=await import('../src/lib/research/store')
    await getResearchProfile(industryId)
    if(process.argv.includes('--enable')){
      const profile=await getResearchProfile(industryId)
      await saveResearchProfile({...profile,investmentObjective:{style:'aggressive',riskBudgetMode:'compare',goal:'net-return'}},industryId)
      await setLabEnabled(industryId,true)
      const portfolio=await prisma.portfolio.findFirst({orderBy:[{isDefault:'desc'},{createdAt:'asc'}],select:{userId:true}})
      if(portfolio)await prisma.userSetting.upsert({where:{userId:portfolio.userId},create:{userId:portfolio.userId,riskProfile:'aggressive'},update:{riskProfile:'aggressive'}})
    }
    let snapshotId:string|undefined
    if(process.argv.includes('--refresh')){const snapshot=await captureResearchSnapshot(industryId);await persistResearchSnapshot(snapshot);snapshotId=snapshot.id}
    const result=await runLab(industryId,snapshotId)
    console.log(JSON.stringify({asOf:result.asOf,assetCount:result.assetCount,commonSessions:result.commonSessions,exclusions:result.exclusions,
      strategies:result.strategies.map(s=>({name:s.spec.name,history:{observations:s.historical.observations,returnPct:s.historical.returnPct,drawdownPct:s.historical.maxDrawdownPct,costs:s.historical.costs,trades:s.historical.trades},forwardObservations:s.forward.observations,promotion:s.promotion.status})),reproducibility:await verifyLatestExperiment(industryId),limitations:result.limitations},null,2))
  }finally{await prisma.$disconnect()}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
