import { prisma } from '@/lib/db'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'

// Only session-critical datasets block a new analysis. Financials and announcements
// are low-frequency evidence and continue on their subscription schedules.
const RESEARCH_KEYS=new Set(['research_calendar','index_daily','sector_capital_flow','etf_daily','etf_holdings','etf_research'])
const DECISION_WINDOW_KEYS=new Set(['index_realtime','etf_realtime','constituent_stock_realtime','sector_capital_flow','stock_announcement'])
const terminal=new Set(['success','failed','partial'])
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))

type ResearchDatasetStatus = {datasetKey:string;enabled:boolean;status:string;lastError?:string|null}

export function researchDatasetWarnings(datasets:ResearchDatasetStatus[]){
  const issues=datasets.filter(dataset=>dataset.enabled&&RESEARCH_KEYS.has(dataset.datasetKey)&&['partial','failed'].includes(dataset.status))
  const groups=new Map<string,ResearchDatasetStatus[]>()
  for(const issue of issues)groups.set(issue.datasetKey,[...(groups.get(issue.datasetKey)||[]),issue])
  return [...groups].map(([key,rows])=>{
    const failed=rows.filter(row=>row.status==='failed').length
    const detail=[...new Set(rows.map(row=>row.lastError?.trim()).filter(Boolean))][0]
    return `${key}：${rows.length}个订阅${failed?`（${failed}个失败）`:''}仍为部分可用${detail?`；${detail}`:''}`
  })
}

export function shouldRefreshResearchDataset(dataset:{datasetKey:string;enabled:boolean;status:string;lastSuccessAt:Date|null},now=new Date(),maxAgeMs=90*60*1000,keys=RESEARCH_KEYS){
  return dataset.enabled&&keys.has(dataset.datasetKey)&&!['queued','running'].includes(dataset.status)&&(!dataset.lastSuccessAt||now.getTime()-dataset.lastSuccessAt.getTime()>maxAgeMs)
}

const maxAgeFor=(datasetKey:string,decisionWindow:boolean)=>decisionWindow
  ? datasetKey.endsWith('_realtime')||datasetKey==='sector_capital_flow' ? 5*60*1000 : datasetKey==='stock_announcement' ? 20*60*1000 : 90*60*1000
  : 90*60*1000

export async function ensureResearchInputsFresh(industryId:string, options: { refresh?: boolean; decisionWindow?: boolean } = {}){
  const now=new Date()
  const [subscriptions,graphRow]=await Promise.all([
    prisma.dataSubscription.findMany({where:{enabled:true},include:{instrument:true,datasets:true}}),
    prisma.rawPayload.findFirst({where:{datasetKey:'industry_graph'},orderBy:{fetchedAt:'desc'}}),
  ])
  const normalize=(value:unknown)=>String(value||'').toLowerCase().replace(/^(sh|sz)/,'').replace(/\.(sh|sz)$/,'')
  let graphCodes=new Set<string>()
  try{const groups=JSON.parse(graphRow?.payload||'[]');const group=groups.find((item:{id?:string})=>item.id===industryId);graphCodes=new Set((group?.analysisEtfs||group?.etfs||[]).map((item:{code?:string;ticker?:string})=>normalize(item.code||item.ticker)).filter(Boolean))}catch{/* Fall back to subscription profiles below. */}
  const selected=subscriptions.filter(subscription=>subscription.instrument.type==='INDEX'||subscription.instrument.type==='ETF'&&(graphCodes.size?graphCodes.has(normalize(subscription.instrument.code)):String(subscription.profile||'').includes(industryId)))
  if (options.refresh === false) {
    const warnings = researchDatasetWarnings(selected.flatMap(subscription => subscription.datasets))
    return { status: 'warning', queued: 0, completed: 0, partial: 0, failed: 0, warnings: [...new Set(['本轮未触发外部同步，使用当前本地订阅快照', ...warnings])].slice(0, 8) }
  }
  const decisionWindow=options.decisionWindow===true
  const eligibleKeys=new Set([...RESEARCH_KEYS,...(decisionWindow?[...DECISION_WINDOW_KEYS]:[])])
  const targets=selected.flatMap(subscription=>subscription.datasets.filter(dataset=>shouldRefreshResearchDataset(dataset,now,maxAgeFor(dataset.datasetKey,decisionWindow),eligibleKeys)).map(dataset=>({dataset,code:subscription.instrument.code})))
  const targetIds=new Set(targets.map(target=>target.dataset.id))
  const existingWarnings=researchDatasetWarnings(selected.flatMap(subscription=>subscription.datasets).filter(dataset=>!targetIds.has(dataset.id)))
  if(!targets.length)return {status:existingWarnings.length?'warning':'fresh',queued:0,completed:0,partial:0,failed:0,warnings:existingWarnings.slice(0,8)}
  const runIds=await prisma.$transaction(async tx=>{
    const ids:string[]=[]
    for(const target of targets){
      const claimed=await tx.subscriptionDataset.updateMany({where:{id:target.dataset.id,status:{notIn:['queued','running']}},data:{status:'queued',nextRunAt:now,lastError:null}})
      if(claimed.count){const run=await tx.dataFetchRun.create({data:{datasetId:target.dataset.id,targetCode:target.code,status:'queued',qualityStatus:'pending'}});ids.push(run.id)}
    }
    return ids
  })
  if(!runIds.length)return {status:existingWarnings.length?'warning':'fresh',queued:0,completed:0,partial:0,failed:0,warnings:existingWarnings.slice(0,8)}
  try{await notifySubscriptionWorker()}catch(error){return {status:'blocked',queued:runIds.length,completed:0,partial:0,failed:runIds.length,warnings:[error instanceof Error?error.message:'数据服务不可用，不能冻结新的研究快照']}}
  for(let attempt=0;attempt<300;attempt++){
    const runs=await prisma.dataFetchRun.findMany({where:{id:{in:runIds}},include:{dataset:{select:{datasetKey:true}}}})
    if(runs.length===runIds.length&&runs.every(run=>terminal.has(run.status))){
      const failed=runs.filter(run=>run.status==='failed'),partial=runs.filter(run=>run.status==='partial')
      const currentWarnings=[...new Set([...failed,...partial].map(run=>`${run.dataset.datasetKey}：${run.error||'部分数据未取得'}`))]
      const warnings=[...new Set([...currentWarnings,...existingWarnings])].slice(0,8)
      return {status:warnings.length?'warning':'fresh',queued:runIds.length,completed:runs.length-failed.length-partial.length,partial:partial.length,failed:failed.length,warnings}
    }
    await pause(2000)
  }
  return {status:'blocked',queued:runIds.length,completed:0,partial:0,failed:0,warnings:['关键数据同步等待超过10分钟；本轮不冻结快照，请在同步完成后继续执行']}
}
