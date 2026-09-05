import { prisma } from '@/lib/db'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'

// Only session-critical datasets block a new analysis. Financials and announcements
// are low-frequency evidence and continue on their subscription schedules.
const RESEARCH_KEYS=new Set(['research_calendar','index_daily','sector_capital_flow','etf_daily','etf_holdings','etf_research'])
const terminal=new Set(['success','failed','partial'])
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))

export function shouldRefreshResearchDataset(dataset:{datasetKey:string;enabled:boolean;status:string;lastSuccessAt:Date|null},now=new Date(),maxAgeMs=90*60*1000){
  return dataset.enabled&&RESEARCH_KEYS.has(dataset.datasetKey)&&!['queued','running'].includes(dataset.status)&&(!dataset.lastSuccessAt||now.getTime()-dataset.lastSuccessAt.getTime()>maxAgeMs)
}

export async function ensureResearchInputsFresh(industryId:string){
  const now=new Date()
  const subscriptions=await prisma.dataSubscription.findMany({where:{enabled:true},include:{instrument:true,datasets:true}})
  const selected=subscriptions.filter(subscription=>subscription.instrument.type==='INDEX'||subscription.instrument.type==='ETF'&&String(subscription.profile||'').includes(industryId))
  const targets=selected.flatMap(subscription=>subscription.datasets.filter(dataset=>shouldRefreshResearchDataset(dataset,now)).map(dataset=>({dataset,code:subscription.instrument.code})))
  if(!targets.length)return {status:'fresh',queued:0,completed:0,partial:0,failed:0,warnings:[] as string[]}
  const runIds=await prisma.$transaction(async tx=>{
    const ids:string[]=[]
    for(const target of targets){
      const claimed=await tx.subscriptionDataset.updateMany({where:{id:target.dataset.id,status:{notIn:['queued','running']}},data:{status:'queued',nextRunAt:now,lastError:null}})
      if(claimed.count){const run=await tx.dataFetchRun.create({data:{datasetId:target.dataset.id,targetCode:target.code,status:'queued',qualityStatus:'pending'}});ids.push(run.id)}
    }
    return ids
  })
  if(!runIds.length)return {status:'fresh',queued:0,completed:0,partial:0,failed:0,warnings:[] as string[]}
  try{await notifySubscriptionWorker()}catch(error){return {status:'blocked',queued:runIds.length,completed:0,partial:0,failed:runIds.length,warnings:[error instanceof Error?error.message:'数据服务不可用，不能冻结新的研究快照']}}
  for(let attempt=0;attempt<300;attempt++){
    const runs=await prisma.dataFetchRun.findMany({where:{id:{in:runIds}},include:{dataset:{select:{datasetKey:true}}}})
    if(runs.length===runIds.length&&runs.every(run=>terminal.has(run.status))){
      const failed=runs.filter(run=>run.status==='failed'),partial=runs.filter(run=>run.status==='partial')
      return {status:failed.length||partial.length?'warning':'fresh',queued:runIds.length,completed:runs.length-failed.length-partial.length,partial:partial.length,failed:failed.length,warnings:[...new Set([...failed,...partial].map(run=>`${run.dataset.datasetKey}：${run.error||'部分数据未取得'}`))].slice(0,8)}
    }
    await pause(2000)
  }
  return {status:'blocked',queued:runIds.length,completed:0,partial:0,failed:0,warnings:['关键数据同步等待超过10分钟；本轮不冻结快照，请在同步完成后继续执行']}
}
