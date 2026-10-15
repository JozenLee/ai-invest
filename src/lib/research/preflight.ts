import { prisma } from '@/lib/db'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'
import { analysisSessionBoundary, chinaDate, currentSessionQuoteCutoff, dateKey, sessionBoundary } from '@/lib/research/time'

// Financials are low-frequency, but they materially determine the report quality
// and rule gates. Join a stale/active financial refresh before freezing evidence;
// announcements remain on their own schedule and are checked again intraday.
const RESEARCH_KEYS=new Set(['research_calendar','index_daily','sector_capital_flow','etf_daily','etf_holdings','etf_research','stock_financial'])
// Only feeds that determine the frozen intraday bar participate in the hard
// session barrier. Announcements retain their own daily schedule and are
// represented with an explicit last-check timestamp in the snapshot.
const TRADING_SESSION_KEYS=new Set(['index_realtime','etf_realtime','sector_capital_flow'])
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

const DAY=24*60*60*1000
const maxAgeFor=(datasetKey:string,tradingSession:boolean)=>{
  if(datasetKey.endsWith('_realtime')||datasetKey==='sector_capital_flow')return tradingSession?5*60*1000:6*60*60*1000
  if(datasetKey==='stock_announcement')return tradingSession?20*60*1000:DAY
  // These datasets are scheduled daily or represent disclosure-period data.
  // A report must validate their business date, but must not turn every
  // 90-minute-old cache into dozens of synchronous upstream requests.
  return DAY
}

export function hasCurrentResearchSeries(payloads: string[], expectedSession: string) {
  const fields = new Set<string>()
  for (const payload of payloads) {
    try {
      const data = JSON.parse(payload)?.data || {}
      // ETF close and adjustment factor are the hard product boundary. The
      // tracked-index series may be unavailable independently; it remains an
      // explicit unknown signal instead of forcing repeated full-bundle refreshes.
      for (const field of ['daily','factors']) {
        if (Array.isArray(data[field]) && data[field].some((row:Record<string,unknown>)=>dateKey(row.trade_date||row.date)===expectedSession)) fields.add(field)
      }
    } catch { /* Unreadable bundles cannot establish freshness. */ }
  }
  return fields.size === 2
}

export async function ensureResearchInputsFresh(industryId:string, options: { refresh?: boolean; tradingSession?: boolean; asOf?: string; maxWaitMs?:number } = {}){
  const now=new Date(options.asOf||Date.now())
  const [subscriptions,graphRow,calendarRow,profileRow]=await Promise.all([
    prisma.dataSubscription.findMany({where:{enabled:true},include:{instrument:true,datasets:true}}),
    prisma.rawPayload.findFirst({where:{datasetKey:'industry_graph'},orderBy:{fetchedAt:'desc'}}),
    prisma.rawPayload.findFirst({where:{datasetKey:'research_calendar'},orderBy:{fetchedAt:'desc'}}),
    prisma.rawPayload.findFirst({where:{datasetKey:'research_profile',targetCode:industryId},orderBy:{fetchedAt:'desc'}}),
  ])
  const normalize=(value:unknown)=>String(value||'').toLowerCase().replace(/^(sh|sz)/,'').replace(/\.(sh|sz)$/,'')
  let benchmark='000300'
  try{benchmark=normalize(JSON.parse(profileRow?.payload||'{}').benchmark||benchmark)}catch{/* Default benchmark remains 沪深300. */}
  let graphCodes=new Set<string>()
  try{const groups=JSON.parse(graphRow?.payload||'[]');const group=groups.find((item:{id?:string})=>item.id===industryId);graphCodes=new Set((group?.analysisEtfs||group?.etfs||[]).map((item:{code?:string;ticker?:string})=>normalize(item.code||item.ticker)).filter(Boolean))}catch{/* Fall back to subscription profiles below. */}
  const selected=subscriptions.filter(subscription=>subscription.instrument.type==='INDEX'
    ? [benchmark,'000001'].includes(normalize(subscription.instrument.code))
    : subscription.instrument.type==='ETF'&&(graphCodes.has(normalize(subscription.instrument.code))||(!graphCodes.size&&String(subscription.profile||'').includes(industryId))||(()=>{try{const profile=JSON.parse(subscription.profile||'{}');return profile.source==='verified-portfolio-underlying'&&profile.industryId===industryId}catch{return false}})()))
  // Global calendar/flow datasets are attached to sh000001, while index prices
  // are only required for the configured benchmark. Do not let unrelated index
  // subscriptions participate in (and delay) an industry's freeze barrier.
  const scopedDatasets=selected.flatMap(subscription=>subscription.datasets.map(dataset=>({...dataset,code:subscription.instrument.code,instrumentType:subscription.instrument.type}))).filter(dataset=>{
    if(dataset.instrumentType==='ETF')return true
    if(['index_daily','index_realtime'].includes(dataset.datasetKey))return normalize(dataset.code)===benchmark
    return normalize(dataset.code)==='000001'
  })
  if (options.refresh === false) {
    const warnings = researchDatasetWarnings(scopedDatasets)
    return { status: 'warning', queued: 0, completed: 0, partial: 0, failed: 0, warnings: [...new Set(['本轮未触发外部同步，使用当前本地订阅快照', ...warnings])].slice(0, 8) }
  }
  let calendarOpen=false
  let calendar:Array<{date:string;open:boolean}>=[]
  try{
    const payload=JSON.parse(calendarRow?.payload||'null')
    const rows:Record<string,unknown>[]=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:[]
    const today=chinaDate(now.toISOString())
    calendar=rows.map((row:Record<string,unknown>)=>({date:dateKey(row.cal_date||row.date)||'',open:Number(row.is_open??row.open)===1})).filter(row=>Boolean(row.date))
    calendarOpen=calendar.some(row=>row.date===today&&row.open)
  }catch{/* A missing/unreadable calendar is conservatively non-trading. */}
  const detectedTradingSession=analysisSessionBoundary(calendar,now.toISOString()).intraday
  const tradingSession=(options.tradingSession??detectedTradingSession)&&calendarOpen
  // Finish slow evidence collection before refreshing the five-minute feeds.
  // Observe existing jobs as well as jobs claimed by this invocation.
  let expectedSession: string | null = null
  try {
    expectedSession=sessionBoundary(calendar,now.toISOString()).expectedSession
  } catch { /* The frozen calendar gate handles missing calendar evidence. */ }
  const today=chinaDate(now.toISOString())
  const calendarCoverageEnd=calendar.map(day=>day.date).sort().at(-1)||''
  const verifiedCalendarCurrent=calendar.some(day=>day.date===today)&&calendarCoverageEnd>=today
  const staleSeries=new Set<string>()
  if(expectedSession){
    const etfCodes=selected.filter(item=>item.instrument.type==='ETF').map(item=>item.instrument.code)
    const [bundles,closeQuotes]=await Promise.all([
      prisma.rawPayload.findMany({where:{datasetKey:'etf_research',targetCode:{in:etfCodes},fetchedAt:{gte:new Date(now.getTime()-7*86400000),lte:now}},orderBy:{fetchedAt:'desc'}}),
      typeof prisma.marketQuote?.findMany==='function'?prisma.marketQuote.findMany({where:{instrumentType:'ETF',code:{in:etfCodes},tradeDate:expectedSession,fetchedAt:{lte:now}}}):Promise.resolve([]),
    ])
    const quoteCodes=new Set(closeQuotes.map(quote=>normalize(quote.code)))
    for(const code of etfCodes){
      const payloads=bundles.filter(row=>row.targetCode===code).map(row=>row.payload)
      if(quoteCodes.has(normalize(code)))payloads.push(JSON.stringify({data:{daily:[{trade_date:expectedSession}]}}))
      if(!hasCurrentResearchSeries(payloads,expectedSession))staleSeries.add(code)
    }
  }
  const stages = [RESEARCH_KEYS, ...(tradingSession ? [TRADING_SESSION_KEYS] : [])]
  const result = {status:'fresh',queued:0,completed:0,partial:0,failed:0,warnings:[] as string[]}
  const deadline = Date.now() + Math.max(1000,Math.min(12*60*1000,options.maxWaitMs??12*60*1000))
  let datasets = scopedDatasets
  for (const keys of stages) {
    const checkedAt = new Date()
    const eligible = datasets.filter(dataset=>dataset.enabled&&keys.has(dataset.datasetKey)&&!(dataset.datasetKey==='research_calendar'&&verifiedCalendarCurrent))
    const active = eligible.filter(dataset=>['queued','running'].includes(dataset.status)&&(
      !dataset.lastSuccessAt||checkedAt.getTime()-dataset.lastSuccessAt.getTime()>maxAgeFor(dataset.datasetKey,tradingSession)||dataset.datasetKey==='etf_research'&&staleSeries.has(dataset.code)
    ))
    const targets = eligible.filter(dataset=>shouldRefreshResearchDataset(dataset,checkedAt,maxAgeFor(dataset.datasetKey,tradingSession),keys)||dataset.datasetKey==='etf_research'&&staleSeries.has(dataset.code)&&!['queued','running'].includes(dataset.status))
    const pendingIds = new Set([...active,...targets].map(dataset=>dataset.id))
    const warningCandidates=eligible.filter(dataset=>!pendingIds.has(dataset.id)&&!(dataset.status==='partial'&&dataset.lastSuccessAt&&checkedAt.getTime()-dataset.lastSuccessAt.getTime()<=maxAgeFor(dataset.datasetKey,tradingSession)))
    result.warnings.push(...researchDatasetWarnings(warningCandidates))
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
      const runs = await prisma.dataFetchRun.findMany({where:{id:{in:runIds}},include:{dataset:{select:{datasetKey:true,lastSuccessAt:true}}}})
      const outstanding=runs.filter(run=>!terminal.has(run.status))
      if(runs.length===runIds.length&&outstanding.length&&outstanding.every(run=>run.dataset.datasetKey==='stock_financial')){
        const settled=runs.filter(run=>terminal.has(run.status))
        const failed=settled.filter(run=>run.status==='failed')
        const unavailable=failed.filter(run=>!run.dataset.lastSuccessAt)
        const cacheBacked=failed.filter(run=>run.dataset.lastSuccessAt)
        result.failed+=unavailable.length
        result.partial+=settled.filter(run=>run.status==='partial').length+cacheBacked.length
        result.completed+=settled.filter(run=>run.status==='success').length
        result.warnings.push(...settled.filter(run=>run.status==='partial').map(run=>`${run.dataset.datasetKey}：${run.error||'部分数据未取得'}`))
        result.warnings.push(...unavailable.map(run=>`${run.dataset.datasetKey}：${run.error||'数据未取得且无有效缓存'}`))
        result.warnings.push(...cacheBacked.map(run=>`${run.dataset.datasetKey}：刷新瞬时失败，已沿用最近成功快照；${run.error||'上游暂时不可用'}`))
        result.warnings.push('财报回填仍在后台继续；本轮冻结最近完整财报缓存，不读取半写入结果')
        finished=true;break
      }
      if (runs.length===runIds.length&&runs.every(run=>terminal.has(run.status))) {
        const failed=runs.filter(run=>run.status==='failed')
        const unavailable=failed.filter(run=>!run.dataset.lastSuccessAt)
        const cacheBacked=failed.filter(run=>run.dataset.lastSuccessAt)
        result.failed += unavailable.length
        result.partial += runs.filter(run=>run.status==='partial').length+cacheBacked.length
        result.completed += runs.filter(run=>run.status==='success').length
        result.warnings.push(...runs.filter(run=>run.status==='partial').map(run=>`${run.dataset.datasetKey}：${run.error||'部分数据未取得'}`))
        result.warnings.push(...unavailable.map(run=>`${run.dataset.datasetKey}：${run.error||'数据未取得且无有效缓存'}`))
        result.warnings.push(...cacheBacked.map(run=>`${run.dataset.datasetKey}：刷新瞬时失败，已沿用最近成功快照；${run.error||'上游暂时不可用'}`))
        finished=true;break
      }
      await pause(2000)
    }
    if (!finished) {
      const outstanding=await prisma.dataFetchRun.findMany({where:{id:{in:runIds},status:{in:['queued','running']}},include:{dataset:{select:{datasetKey:true}}}})
      const hardOutstanding=outstanding.filter(run=>run.dataset.datasetKey!=='stock_financial')
      if(hardOutstanding.length){result.status='blocked';result.warnings.push(`关键数据同步达到本轮${Math.ceil((options.maxWaitMs??12*60*1000)/1000)}秒等待上限；本轮不冻结快照，请在同步完成后继续执行`);return result}
      // A large overlapping company universe may legitimately exceed the
      // session-data barrier. Keep its jobs running and freeze the last complete
      // financial cache with an explicit warning; quality gates will remain
      // limited until a later review consumes the completed refresh.
      result.warnings.push('财报回填仍在后台继续；本轮冻结最近完整财报缓存，不读取半写入结果')
    }
    const current = await prisma.subscriptionDataset.findMany({where:{id:{in:datasets.map(dataset=>dataset.id)}}})
    datasets = current.map(dataset=>{const previous=datasets.find(item=>item.id===dataset.id)!;return {...dataset,code:previous.code,instrumentType:previous.instrumentType}})
  }
  // Slow research and announcement collection can make quotes fetched at the
  // beginning of preflight stale again. Refresh only the report's ETF universe
  // and benchmark once more, then freeze immediately from this synchronized set.
  if(tradingSession){
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
        const unsuccessful=runs.filter(run=>run.status!=='success')
        if(unsuccessful.length){
          const failedTargets=unsuccessful.map(run=>finalTargets.find(target=>target.id===run.datasetId)).filter((target):target is typeof finalTargets[number]=>!!target)
          const cached=typeof prisma.marketQuote?.findMany==='function'?await prisma.marketQuote.findMany({where:{code:{in:failedTargets.map(target=>target.code)},tradeDate:chinaDate(now.toISOString()),fetchedAt:{gte:currentSessionQuoteCutoff(new Date().toISOString())}}}):[]
          const freshCodes=new Set(cached.map(quote=>normalize(quote.code)))
          const unavailable=failedTargets.filter(target=>!freshCodes.has(normalize(target.code)))
          result.failed+=unsuccessful.length
          if(unavailable.length){result.status='blocked';result.warnings.push(...unsuccessful.filter(run=>unavailable.some(target=>target.id===run.datasetId)).map(run=>`盘中行情：${run.error||'实时数据未取得'}`));return result}
          result.warnings.push(`盘中行情刷新瞬时失败，沿用5分钟内已验证快照：${failedTargets.map(target=>target.code).join('、')}`)
        }
        result.completed+=runs.filter(run=>run.status==='success').length
        synchronized=true;break
      }
      await pause(1000)
    }
    if(!synchronized){result.status='blocked';result.warnings.push('盘中行情临冻结同步超时');return result}
    }
    const verificationAsOf=new Date().toISOString(),today=chinaDate(verificationAsOf),codes=critical.map(item=>item.code),quoteCutoff=currentSessionQuoteCutoff(verificationAsOf)
    const quotes=typeof prisma.marketQuote?.findMany==='function'?await prisma.marketQuote.findMany({where:{code:{in:codes},tradeDate:today,fetchedAt:{gte:quoteCutoff}}}):[]
    const freshCodes=new Set(quotes.length?quotes.map(quote=>normalize(quote.code)):critical.filter(item=>item.lastSuccessAt&&item.lastSuccessAt>=quoteCutoff).map(item=>normalize(item.code)))
    const missing=critical.filter(item=>!freshCodes.has(normalize(item.code))).map(item=>item.code)
    if(missing.length){result.status='blocked';result.warnings.push(`盘中行情仍未达到5分钟时效：${missing.join('、')}`);return result}
  }
  // Successful jobs can still finish too early relative to other slow feeds.
  // Do not label that outcome fresh; the frozen timing gate remains authoritative.
  if (tradingSession) {
    const finishedAt=new Date()
    for (const dataset of datasets.filter(dataset=>dataset.enabled&&TRADING_SESSION_KEYS.has(dataset.datasetKey))) {
      const freshAfter=dataset.datasetKey.endsWith('_realtime')?currentSessionQuoteCutoff(finishedAt.toISOString()).getTime():finishedAt.getTime()-maxAgeFor(dataset.datasetKey,true)
      if (!dataset.lastSuccessAt || dataset.lastSuccessAt.getTime()<freshAfter) {
        result.warnings.push(`${dataset.datasetKey}/${dataset.code}：同步结束时仍未满足时效要求`)
      }
    }
  }
  result.warnings=[...new Set(result.warnings)].slice(0,12)
  result.status=result.warnings.length?'warning':'fresh'
  return result
}
