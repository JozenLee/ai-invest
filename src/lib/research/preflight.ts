import { prisma } from '@/lib/db'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'
import { chinaDate, dateKey, sessionBoundary } from '@/lib/research/time'

// Only session-critical datasets block a new analysis. Financials and announcements
// are low-frequency evidence and continue on their subscription schedules.
const RESEARCH_KEYS=new Set(['research_calendar','index_daily','sector_capital_flow','etf_daily','etf_holdings','etf_research'])
const TRADING_SESSION_KEYS=new Set(['index_realtime','etf_realtime','sector_capital_flow','stock_announcement'])
const terminal=new Set(['success','failed','partial'])
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))

type ResearchDatasetStatus = {datasetKey:string;enabled:boolean;status:string;lastError?:string|null}

export function researchDatasetWarnings(datasets:ResearchDatasetStatus[]){
  const issues=datasets.filter(dataset=>dataset.enabled&&(RESEARCH_KEYS.has(dataset.datasetKey)||TRADING_SESSION_KEYS.has(dataset.datasetKey))&&['partial','failed'].includes(dataset.status))
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

const maxAgeFor=(datasetKey:string,tradingSession:boolean)=>tradingSession
  ? datasetKey.endsWith('_realtime')||datasetKey==='sector_capital_flow' ? 5*60*1000 : datasetKey==='stock_announcement' ? 20*60*1000 : 90*60*1000
  : 90*60*1000

export function hasCurrentResearchSeries(payloads: string[], expectedSession: string) {
  const fields = new Set<string>()
  for (const payload of payloads) {
    try {
      const data = JSON.parse(payload)?.data || {}
      for (const field of ['daily','factors','indexDaily']) {
        if (Array.isArray(data[field]) && data[field].some((row:Record<string,unknown>)=>dateKey(row.trade_date||row.date)===expectedSession)) fields.add(field)
      }
    } catch { /* Unreadable bundles cannot establish freshness. */ }
  }
  return fields.size === 3
}

export async function ensureResearchInputsFresh(industryId:string, options: { refresh?: boolean; tradingSession?: boolean; asOf?: string } = {}){
  const now=new Date(options.asOf||Date.now())
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
  const [calendarRow,profileRow]=await Promise.all([
    prisma.rawPayload.findFirst({where:{datasetKey:'research_calendar'},orderBy:{fetchedAt:'desc'}}),
    prisma.rawPayload.findFirst({where:{datasetKey:'research_profile',targetCode:industryId},orderBy:{fetchedAt:'desc'}}),
  ])
  let calendarOpen=false
  try{
    const payload=JSON.parse(calendarRow?.payload||'null')
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:[]
    const today=chinaDate(now.toISOString())
    calendarOpen=rows.some((row:Record<string,unknown>)=>dateKey(row.cal_date||row.date)===today&&Number(row.is_open??row.open)===1)
  }catch{/* A missing/unreadable calendar is conservatively non-trading. */}
  const tradingSession=options.tradingSession===true&&calendarOpen
  // Finish slow evidence collection before refreshing the five-minute feeds.
  // Observe existing jobs as well as jobs claimed by this invocation.
  let expectedSession: string | null = null
  try {
    const payload=JSON.parse(calendarRow?.payload||'null'),rows=Array.isArray(payload)?payload:payload?.data||[]
    expectedSession=sessionBoundary(rows.map((row:Record<string,unknown>)=>({date:dateKey(row.cal_date||row.date)||'',open:Number(row.is_open??row.open)===1})),now.toISOString()).expectedSession
  } catch { /* The frozen calendar gate handles missing calendar evidence. */ }
  const staleSeries=new Set<string>()
  if(expectedSession){
    const etfCodes=selected.filter(item=>item.instrument.type==='ETF').map(item=>item.instrument.code)
    const bundles=await prisma.rawPayload.findMany({where:{datasetKey:'etf_research',targetCode:{in:etfCodes},fetchedAt:{gte:new Date(now.getTime()-7*86400000),lte:now}},orderBy:{fetchedAt:'desc'}})
    for(const code of etfCodes)if(!hasCurrentResearchSeries(bundles.filter(row=>row.targetCode===code).map(row=>row.payload),expectedSession))staleSeries.add(code)
  }
  const stages = [RESEARCH_KEYS, ...(tradingSession ? [TRADING_SESSION_KEYS] : [])]
  const result = {status:'fresh',queued:0,completed:0,partial:0,failed:0,warnings:[] as string[]}
  const deadline = Date.now() + 10 * 60 * 1000
  let datasets = selected.flatMap(subscription=>subscription.datasets.map(dataset=>({...dataset,code:subscription.instrument.code})))
  for (const keys of stages) {
    const checkedAt = new Date()
    const eligible = datasets.filter(dataset=>dataset.enabled&&keys.has(dataset.datasetKey))
    const active = eligible.filter(dataset=>['queued','running'].includes(dataset.status))
    const targets = eligible.filter(dataset=>shouldRefreshResearchDataset(dataset,checkedAt,maxAgeFor(dataset.datasetKey,tradingSession),keys)||dataset.datasetKey==='etf_research'&&staleSeries.has(dataset.code)&&!['queued','running'].includes(dataset.status))
    const pendingIds = new Set([...active,...targets].map(dataset=>dataset.id))
    result.warnings.push(...researchDatasetWarnings(eligible.filter(dataset=>!pendingIds.has(dataset.id))))
    if (!pendingIds.size) continue
    const runIds = await prisma.$transaction(async tx=>{
      for (const target of targets) {
        const claimed = await tx.subscriptionDataset.updateMany({where:{id:target.id,status:{notIn:['queued','running']}},data:{status:'queued',nextRunAt:checkedAt,lastError:null}})
        if (claimed.count) {
          await tx.dataFetchRun.create({data:{datasetId:target.id,targetCode:target.code,status:'queued',qualityStatus:'pending'}})
          result.queued++
        }
      }
      // A scheduler may claim a target between the read and update. Join its run.
      const runs = await tx.dataFetchRun.findMany({where:{datasetId:{in:[...pendingIds]},status:{in:['queued','running']}}})
      const covered=new Set(runs.map(run=>run.datasetId))
      if ([...pendingIds].some(id=>!covered.has(id))) return []
      return runs.map(run=>run.id)
    })
    if (!runIds.length) {
      result.status='blocked'
      result.warnings.push('同步状态与任务记录不一致，不能冻结研究快照')
      return result
    }
    try { await notifySubscriptionWorker() } catch {
      result.status='blocked';result.warnings.push('数据服务不可用，不能冻结新的研究快照');return result
    }
    let finished = false
    while (Date.now() < deadline) {
      const runs = await prisma.dataFetchRun.findMany({where:{id:{in:runIds}},include:{dataset:{select:{datasetKey:true}}}})
      if (runs.length===runIds.length&&runs.every(run=>terminal.has(run.status))) {
        result.failed += runs.filter(run=>run.status==='failed').length
        result.partial += runs.filter(run=>run.status==='partial').length
        result.completed += runs.filter(run=>run.status==='success').length
        result.warnings.push(...runs.filter(run=>run.status!=='success').map(run=>`${run.dataset.datasetKey}：${run.error||'部分数据未取得'}`))
        finished=true;break
      }
      await pause(2000)
    }
    if (!finished) {
      result.status='blocked';result.warnings.push('关键数据同步等待超过10分钟；本轮不冻结快照，请在同步完成后继续执行');return result
    }
    const current = await prisma.subscriptionDataset.findMany({where:{id:{in:datasets.map(dataset=>dataset.id)}}})
    datasets = current.map(dataset=>({...dataset,code:datasets.find(item=>item.id===dataset.id)!.code}))
  }
  // Slow research and announcement collection can make quotes fetched at the
  // beginning of preflight stale again. Refresh only the report's ETF universe
  // and benchmark once more, then freeze immediately from this synchronized set.
  if(tradingSession){
    let benchmark='000300'
    try{benchmark=normalize(JSON.parse(profileRow?.payload||'{}').benchmark||benchmark)}catch{/* Default benchmark remains 沪深300. */}
    const selectedEtfCodes=new Set(selected.filter(item=>item.instrument.type==='ETF').map(item=>normalize(item.instrument.code)))
    const criticalIds=new Set(selected.flatMap(subscription=>subscription.datasets.filter(dataset=>dataset.enabled&&(
      dataset.datasetKey==='etf_realtime'&&selectedEtfCodes.has(normalize(subscription.instrument.code))||
      dataset.datasetKey==='index_realtime'&&normalize(subscription.instrument.code)===benchmark
    )).map(dataset=>dataset.id)))
    const critical=datasets.filter(dataset=>criticalIds.has(dataset.id))
    if(!critical.length){result.status='blocked';result.warnings.push('未配置盘中指数基金或基准实时行情订阅');return result}
    const finalTargets=critical.filter(dataset=>!dataset.lastSuccessAt||Date.now()-dataset.lastSuccessAt.getTime()>60_000||dataset.status!=='success')
    if(!finalTargets.length){
      // The regular realtime stage just synchronized every critical quote.
    }else{
    const synchronizedRunIds=await prisma.$transaction(async tx=>{
      const ids:string[]=[]
      for(const target of finalTargets){
        const active=(await tx.dataFetchRun.findMany({where:{datasetId:{in:[target.id]},status:{in:['queued','running']}}}))[0]
        if(active){ids.push(active.id);continue}
        const claimed=await tx.subscriptionDataset.updateMany({where:{id:target.id,status:{notIn:['queued','running']}},data:{status:'queued',nextRunAt:new Date(),lastError:null}})
        if(!claimed.count)continue
        const run=await tx.dataFetchRun.create({data:{datasetId:target.id,targetCode:target.code,status:'queued',qualityStatus:'pending'}})
        ids.push(run.id);result.queued++
      }
      return ids
    })
    if(synchronizedRunIds.length!==finalTargets.length){result.status='blocked';result.warnings.push('盘中行情临冻结同步未完整排队');return result}
    try{await notifySubscriptionWorker()}catch{result.status='blocked';result.warnings.push('数据服务不可用，盘中行情无法临冻结同步');return result}
    let synchronized=false
    const quoteDeadline=Math.min(deadline,Date.now()+5*60*1000)
    while(Date.now()<quoteDeadline){
      const runs=await prisma.dataFetchRun.findMany({where:{id:{in:synchronizedRunIds}}})
      if(runs.length===synchronizedRunIds.length&&runs.every(run=>terminal.has(run.status))){
        if(runs.some(run=>run.status!=='success')){result.status='blocked';result.warnings.push(...runs.filter(run=>run.status!=='success').map(run=>`盘中行情：${run.error||'实时数据未取得'}`));return result}
        result.completed+=runs.length
        synchronized=true;break
      }
      await pause(1000)
    }
    if(!synchronized){result.status='blocked';result.warnings.push('盘中行情临冻结同步超时');return result}
    }
    const today=chinaDate(now.toISOString()),codes=critical.map(item=>item.code)
    const quotes=typeof prisma.marketQuote?.findMany==='function'?await prisma.marketQuote.findMany({where:{code:{in:codes},tradeDate:today,fetchedAt:{gte:new Date(Date.now()-5*60*1000)}}}):[]
    const freshCodes=new Set(quotes.length?quotes.map(quote=>normalize(quote.code)):critical.filter(item=>item.lastSuccessAt&&Date.now()-item.lastSuccessAt.getTime()<=5*60*1000).map(item=>normalize(item.code)))
    const missing=critical.filter(item=>!freshCodes.has(normalize(item.code))).map(item=>item.code)
    if(missing.length){result.status='blocked';result.warnings.push(`盘中行情仍未达到5分钟时效：${missing.join('、')}`);return result}
  }
  // Successful jobs can still finish too early relative to other slow feeds.
  // Do not label that outcome fresh; the frozen timing gate remains authoritative.
  if (tradingSession) {
    const finishedAt=new Date()
    for (const dataset of datasets.filter(dataset=>dataset.enabled&&TRADING_SESSION_KEYS.has(dataset.datasetKey))) {
      if (!dataset.lastSuccessAt || finishedAt.getTime()-dataset.lastSuccessAt.getTime()>maxAgeFor(dataset.datasetKey,true)) {
        result.warnings.push(`${dataset.datasetKey}/${dataset.code}：同步结束时仍未满足时效要求`)
      }
    }
  }
  result.warnings=[...new Set(result.warnings)].slice(0,12)
  result.status=result.warnings.length?'warning':'fresh'
  return result
}
