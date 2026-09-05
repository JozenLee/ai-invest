import { prisma } from '@/lib/db'
import { digest, encode, getResearchProfile, latestEvaluation } from './store'
import { validateProfile } from './profile'
export type ResearchSchedule={enabled:boolean;times:string[]}
export function validateSchedule(value:unknown):ResearchSchedule {
  const s=value as ResearchSchedule
  if(!s||typeof s.enabled!=='boolean'||!Array.isArray(s.times)||!s.times.length||s.times.length>4||s.times.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw new Error('复核时间须为北京时间HH:mm，每日1–4次')
  return {enabled:s.enabled,times:[...new Set(s.times)].sort()}
}
export async function getResearchSchedule(industryId:string):Promise<ResearchSchedule> {
  const row=await prisma.rawPayload.findUnique({where:{id:'research-schedule:'+industryId}})
  return row?validateSchedule(JSON.parse(row.payload)):{enabled:false,times:['08:50','19:30']}
}
export async function saveResearchSchedule(industryId:string,value:unknown) {
  await getResearchProfile(industryId)
  const schedule=validateSchedule(value),data={datasetKey:'research_schedule',targetCode:industryId,provider:'local-schedule',payload:encode(schedule),contentHash:digest(schedule)}
  await prisma.rawPayload.upsert({where:{id:'research-schedule:'+industryId},create:{id:'research-schedule:'+industryId,...data},update:{...data,fetchedAt:new Date()}})
}
export async function saveResearchSettings(industryId:string,profileInput:unknown,scheduleInput:unknown) {
  await getResearchProfile(industryId)
  const profile=validateProfile(profileInput,industryId),schedule=validateSchedule(scheduleInput)
  const data={datasetKey:'research_schedule',targetCode:industryId,provider:'local-schedule',payload:encode(schedule),contentHash:digest(schedule)}
  await prisma.$transaction([
    prisma.rawPayload.create({data:{datasetKey:'research_profile',targetCode:industryId,provider:'user-config',payload:encode(profile),contentHash:digest(profile)}}),
    prisma.rawPayload.upsert({where:{id:'research-schedule:'+industryId},create:{id:'research-schedule:'+industryId,...data},update:{...data,fetchedAt:new Date()}}),
  ])
  return {profile,schedule}
}
export function dueSlots(schedule:ResearchSchedule,now:Date) {
  if(!schedule.enabled)return []
  const local=new Date(now.getTime()+8*3600000),date=local.toISOString().slice(0,10),minute=local.toISOString().slice(11,16)
  // Weekends need no routine review; calendar gates still decide actual tradability.
  if([0,6].includes(local.getUTCDay()))return []
  return schedule.times.filter(t=>t<=minute).map(time=>({date,time}))
}
export async function runScheduledResearch(now=new Date()) {
  const schedules=await prisma.rawPayload.findMany({where:{datasetKey:'research_schedule'}})
  const results=[]
  for(const row of schedules) {
    const due=dueSlots(validateSchedule(JSON.parse(row.payload)),now).at(-1)
    if(!due)continue
    const claimId=`research-review:${row.targetCode}:${due.date}:${due.time}`
    let attempts=1
    try{await prisma.rawPayload.create({data:{id:claimId,datasetKey:'research_review_run',targetCode:row.targetCode,provider:'local-scheduler',payload:encode({status:'running',startedAt:now.toISOString(),attempts}),contentHash:claimId}})}catch(error){
      if((error as {code?:string}).code!=='P2002')throw error
      const prior=await prisma.rawPayload.findUnique({where:{id:claimId}})
      if(!prior)continue
      const state=JSON.parse(prior.payload)
      if(state.status==='completed'||(state.attempts||1)>=3||now.getTime()-Date.parse(state.startedAt||prior.fetchedAt.toISOString())<5*60000)continue
      attempts=(state.attempts||1)+1
      const payload=encode({status:'running',startedAt:now.toISOString(),attempts}),hash=digest(payload)
      const claimed=await prisma.rawPayload.updateMany({where:{id:claimId,contentHash:prior.contentHash},data:{payload,contentHash:hash}})
      if(!claimed.count)continue
    }
    try{
      const {comprehensiveAnalysisWorkflow:workflow}=await import('@/lib/workflow/workflows/comprehensive-analysis')
      const previous=await latestEvaluation(row.targetCode)
      const parentRunId=previous?.workflow?.runId||null
      const runId=await workflow.createRun({industryId:row.targetCode,publicOnly:true,rulesOnly:true,parentRunId,baselineSnapshotId:previous?.snapshotId||null,kind:'review',createdBy:'local-scheduler',timestamp:now.toISOString()})
      await workflow.executeAll(runId)
      const run=await workflow.getRunDetails(runId,true)
      const raw=run?.steps.flatMap(s=>s.artifacts).find(a=>a.artifactKey==='research-evaluation')?.data
      if(!raw)throw new Error('规则复核没有生成决策产物')
      const evaluation=JSON.parse(raw)
      const result={status:'completed',runId,snapshotId:evaluation.snapshotId,changes:evaluation.changes.length,asOf:evaluation.asOf,attempts,startedAt:now.toISOString()}
      await prisma.rawPayload.update({where:{id:claimId},data:{payload:encode(result),contentHash:digest(result)}});results.push(result)
    }catch(error){
      const result={status:'failed',error:error instanceof Error?error.message:'本地复核失败',attempts,startedAt:now.toISOString()}
      await prisma.rawPayload.update({where:{id:claimId},data:{payload:encode(result),contentHash:digest(result)}});results.push(result)
    }
  }
  return results
}
