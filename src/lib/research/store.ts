import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { financialView, calculateDetailMetrics } from '@/lib/market-detail'
import { financialRatios, summarizeMarketReference } from '@/lib/analysis/evidence'
import { MARKET_INDEXES } from '@/lib/subscription-config'
import { matchesNewsIndustry } from '@/lib/news-taxonomy'
import type { Bar, Evidence, ETFInput, EventInput, Evaluation, Profile, ResearchSnapshot, SourceRecord } from './contracts'
import { defaultProfile, validateProfile } from './profile'
import { clusterEvents } from './events'
import { adjustedBars, evaluateResearch } from './engine'
import { compactReplaySnapshot } from './replay'
import { chinaDate, dateKey, sessionBoundary } from './time'
import { matchesResearchDomain, researchTerms } from './relevance'

export const encode = (value: unknown) => JSON.stringify(value, (_key,v)=>typeof v==='bigint'?Number(v):v)
export const digest = (value: unknown) => createHash('sha256').update(encode(value)).digest('hex')
type WireRow = Record<string, string | number | boolean | null>
type SubscriptionProfile = {industryId?:string;industryName?:string}
type GraphGroup = {id:string;name:string;etfs?:Array<{code?:string}>}
type Bundle = {source?:string;data?:Record<string,WireRow[]>}
function parse<T = unknown>(value: string | null | undefined): T | null { try {return JSON.parse(value||'null') as T} catch {return null} }
const number = (value: unknown) => value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null
const symbol = (value: unknown) => String(value||'').replace(/^(sh|sz)/i,'').replace(/\.(SH|SZ)$/i,'')
const normalizedSector = (value: unknown) => String(value||'').trim().replace(/[ⅠⅡⅢⅣⅤⅥ]+$/u,'')
function bestSeries(bundles: Array<Record<string,WireRow[]>>, field: string, dateFields: string[]) {
  const candidates=bundles.map(bundle=>bundle[field]).filter((value):value is WireRow[]=>Array.isArray(value)&&value.length>0)
  const latest=(rows:WireRow[])=>rows.reduce((max,row)=>{const date=dateFields.map(key=>dateKey(row[key])).find(Boolean)||'';return date>max?date:max},'')
  return candidates.sort((a,b)=>latest(b).localeCompare(latest(a))||b.length-a.length)[0]||[]
}
function bestBundleEntry(entries: Array<{raw:SourceRecord;bundle:Record<string,WireRow[]>}>, field: string, dateFields: string[]) {
  const latest=(rows:WireRow[])=>rows.reduce((max,row)=>{const date=dateFields.map(key=>dateKey(row[key])).find(Boolean)||'';return date>max?date:max},'')
  return entries.filter(entry=>Array.isArray(entry.bundle[field])&&entry.bundle[field].length).sort((a,b)=>latest(b.bundle[field]).localeCompare(latest(a.bundle[field]))||b.bundle[field].length-a.bundle[field].length||b.raw.fetchedAt.localeCompare(a.raw.fetchedAt))[0]
}
function financialReportScore(row:{metricsJson:string;source:string|null}){
  const payload=parse<Record<string,unknown>>(row.metricsJson)||{}
  return (/^[A-Z]{3}$/.test(String(payload.currency||''))?4:0)+(row.source==='tushare'?2:0)
}
function bars(rows: Array<Record<string,unknown>>, amountMultiplier=1): Bar[] {
  return rows.map(r=>({date:dateKey(r.date||r.trade_date||r['日期'])||'',open:Number(r.open??r['开盘']),high:Number(r.high??r['最高']),low:Number(r.low??r['最低']),close:Number(r.close??r['收盘']),volume:Number(r.volume??r.vol??r['成交量']??0),amount:Number(r.amount??r['成交额']??0)*amountMultiplier}))
}
function rowsOf(raw?: SourceRecord): WireRow[] {const p=parse<{data?:WireRow[]} | WireRow[]>(raw?.payload);return Array.isArray(p)?p:Array.isArray(p?.data)?p.data:[]}
export async function getResearchProfile(industryId: string, name?: string): Promise<Profile> {
  const row=await prisma.rawPayload.findFirst({where:{datasetKey:'research_profile',targetCode:industryId},orderBy:{fetchedAt:'desc'}})
  if(row) return validateProfile(parse(row.payload),industryId)
  if(!name){
    const subscriptions=await prisma.dataSubscription.findMany({where:{enabled:true,instrument:{type:'ETF'}},select:{profile:true}})
    name=subscriptions.map(r=>parse<SubscriptionProfile>(r.profile)).find(p=>p?.industryId===industryId)?.industryName
  }
  if(!name) throw new Error('该领域没有已订阅ETF')
  return defaultProfile(industryId,name)
}
export async function saveResearchProfile(value: unknown, industryId: string) {
  await getResearchProfile(industryId) // Do not create arbitrary unbound industries.
  const profile=validateProfile(value,industryId)
  return prisma.rawPayload.create({data:{datasetKey:'research_profile',targetCode:industryId,provider:'user-config',payload:encode(profile),contentHash:digest(profile)}})
}

/** A transaction freezes mutable tables NOW. Historical runs must replay a saved snapshot,
 * never query today's revised fundamentals under an arbitrary past asOf. */
export async function captureResearchSnapshot(industryId: string): Promise<ResearchSnapshot> {
  return prisma.$transaction(async tx=>{
    const asOf=new Date().toISOString(), id=randomUUID()
    const subscriptions=await tx.dataSubscription.findMany({where:{enabled:true,instrument:{type:'ETF'}},include:{instrument:true}})
    const graphRow=await tx.rawPayload.findFirst({where:{datasetKey:'industry_graph'},orderBy:{fetchedAt:'desc'}})
    const group=(parse<GraphGroup[]>(graphRow?.payload)||[]).find(g=>g.id===industryId)
    const selected=subscriptions.filter(s=>parse<SubscriptionProfile>(s.profile)?.industryId===industryId || group?.etfs?.some(e=>symbol(e.code)===s.instrument.code))
    if(!selected.length) throw new Error('该领域没有已订阅ETF，请先同步领域映射')
    const configRow=await tx.rawPayload.findFirst({where:{datasetKey:'research_profile',targetCode:industryId},orderBy:{fetchedAt:'desc'}})
    const profile=configRow?validateProfile(parse(configRow.payload),industryId):defaultProfile(industryId,group?.name||parse<SubscriptionProfile>(selected[0].profile)?.industryName||industryId)
    const tickers=selected.map(s=>s.instrument.code)
    const earliest=new Date(Date.parse(asOf)-800*86400000)
    const rawDb=await tx.rawPayload.findMany({where:{fetchedAt:{lte:new Date(asOf),gte:earliest},OR:[{targetCode:{in:tickers},datasetKey:{in:['etf_daily','etf_holdings','etf_research']}},{datasetKey:{in:['research_calendar','sector_capital_flow','market_main_flow','margin_balance','market_volume','news_taxonomy','index_daily']}}]},orderBy:{fetchedAt:'desc'}})
    const raw:SourceRecord[]=rawDb.map(r=>({...r,fetchedAt:r.fetchedAt.toISOString()}))
    const latest=(key:string,code?:string)=>raw.find(r=>r.datasetKey===key&&(!code||symbol(r.targetCode)===symbol(code)))
    const calendar=rowsOf(latest('research_calendar')).map(r=>({date:dateKey(r.cal_date||r.date)||'',open:Number(r.is_open)===1})).filter(r=>r.date)
    const boundary=sessionBoundary(calendar,asOf)
    // Missing calendar permits diagnostics, but the engine blocks all actions.
    const cutoff=boundary.expectedSession||chinaDate(asOf)
    const evidence:Evidence[]=[], evidenceSet=new Set<string>(),records:Record<string,unknown>={}
    const add=(e:Evidence)=>{if(!evidenceSet.has(e.id)){evidence.push(e);evidenceSet.add(e.id)}return e.id}
    const sourceEvidence=(r:SourceRecord,unit?:string)=>{
      const p=parse<{source?:string;data?:WireRow|Record<string,WireRow[]>}>(r.payload),data=rowsOf(r)
      const nested=p?.data&&!Array.isArray(p.data)&&typeof p.data==='object'?Object.values(p.data).flatMap(value=>Array.isArray(value)?value:[]):[]
      const rows=[...data,...nested],dataDate=rows.reduce<string|null>((latest,row)=>{const value=dateKey(row.trade_date||row.nav_date||row.ann_date||row.date||row['日期']);return value&&(!latest||value>latest)?value:latest},null)
      records[r.id]={...r,payload:p}
      return add({id:r.id,source:p?.source||r.provider||'unknown',dataDate,publishedAt:null,fetchedAt:r.fetchedAt,hash:r.contentHash,unit})
    }
    if(latest('research_calendar')) sourceEvidence(latest('research_calendar')!)
    const daily=await tx.eTFDaily.findMany({where:{ticker:{in:tickers},date:{gte:earliest,lte:new Date(cutoff+'T23:59:59Z')}},orderBy:{date:'asc'}})
    const holdings=await tx.eTFHolding.findMany({where:{etfCode:{in:tickers}},orderBy:{weight:'desc'}})
    const etfs:ETFInput[]=selected.map(s=>{
      const ticker=s.instrument.code
      const researchRaws=raw.filter(r=>r.datasetKey==='etf_research'&&symbol(r.targetCode)===symbol(ticker))
      const researchEntries=researchRaws.map(raw=>({raw,bundle:parse<Bundle>(raw.payload)?.data||{}}))
      // Promax endpoints fail independently. Merge immutable bundles field by
      // field so a later partial retry cannot erase a previously verified
      // factor, index or NAV series. Date/continuity gates below still reject
      // stale data; this only prevents regression to an empty field.
      const chosen=Object.fromEntries([
        ['info',bestBundleEntry(researchEntries,'info',[])],['daily',bestBundleEntry(researchEntries,'daily',['trade_date','date'])],['factors',bestBundleEntry(researchEntries,'factors',['trade_date','date'])],
        ['shares',bestBundleEntry(researchEntries,'shares',['trade_date','date'])],['nav',bestBundleEntry(researchEntries,'nav',['nav_date','ann_date'])],['orderbook',bestBundleEntry(researchEntries,'orderbook',['date','publishedAt'])],
        ['indexDaily',bestBundleEntry(researchEntries,'indexDaily',['trade_date','date'])],['indexWeights',bestBundleEntry(researchEntries,'indexWeights',['trade_date','date'])],['indexValuation',bestBundleEntry(researchEntries,'indexValuation',['trade_date','date'])],
      ]) as Record<string,{raw:SourceRecord;bundle:Record<string,WireRow[]>}|undefined>
      const research=Object.fromEntries(Object.entries(chosen).map(([field,entry])=>[field,entry?.bundle[field]||[]])) as Record<string,WireRow[]>
      const selectedResearchRaws=[...new Map(Object.values(chosen).filter(Boolean).map(entry=>[entry!.raw.id,entry!.raw])).values()]
      const historyRaw=latest('etf_daily',ticker), holdingRaw=latest('etf_holdings',ticker)
      const localRows=daily.filter(r=>r.ticker===ticker)
      records[`${id}:bars:${ticker}`]=localRows
      const etfEvidence=[add({id:`${id}:bars:${ticker}`,source:'frozen-local-daily',dataDate:dateKey(localRows.at(-1)?.date),publishedAt:null,fetchedAt:asOf,hash:digest(localRows)})]
      if(historyRaw) etfEvidence.push(sourceEvidence(historyRaw,'日线amount:千元，归一化为元'))
      for(const researchRaw of selectedResearchRaws) etfEvidence.push(sourceEvidence(researchRaw))
      if(holdingRaw) sourceEvidence(holdingRaw)
      const rawHoldings=rowsOf(holdingRaw)
      const latestNav=(research.nav||[]).filter(n=>dateKey(n.nav_date)&&dateKey(n.nav_date)!<=cutoff&&dateKey(n.ann_date)&&dateKey(n.ann_date)!<=chinaDate(asOf)).sort((a,b)=>String(b.nav_date).localeCompare(String(a.nav_date)))[0]
      const latestValuation=(research.indexValuation||[]).filter(row=>dateKey(row.trade_date||row.date)&&dateKey(row.trade_date||row.date)!<=cutoff).sort((a,b)=>String(b.trade_date||b.date).localeCompare(String(a.trade_date||a.date)))[0]
      const valuationHistory=(research.indexValuation||[]).filter(row=>dateKey(row.trade_date||row.date)&&dateKey(row.trade_date||row.date)!<=cutoff).sort((a,b)=>String(a.trade_date||a.date).localeCompare(String(b.trade_date||b.date)))
      const fiveYearCutoff=new Date(Date.parse(cutoff+'T00:00:00Z')-5*365.25*86400000).toISOString().slice(0,10)
      const fiveYearValuations=valuationHistory.filter(row=>dateKey(row.trade_date||row.date)!>=fiveYearCutoff)
      const percentile=(field:string,current:number|null)=>{const values=fiveYearValuations.map(row=>number(row[field])).filter((value):value is number=>value!==null&&value>0);return current!==null&&values.length>=500?values.filter(value=>value<=current).length/values.length*100:null}
      const currentPe=number(latestValuation?.pe_ttm),currentPb=number(latestValuation?.pb)
      const shareRows=(research.shares||[]).filter(n=>dateKey(n.trade_date)&&dateKey(n.trade_date)!<=cutoff).sort((a,b)=>String(b.trade_date).localeCompare(String(a.trade_date)))
      const info=research.info?.[0]||{}
      const productDate=dateKey(latestNav?.nav_date)
      const book=(research.orderbook||[]).find(r=>String(r.code)===ticker&&dateKey(r.date)===cutoff&&Date.parse(String(r.publishedAt))<=Date.parse(asOf))
      const localBars=daily.filter(r=>r.ticker===ticker).slice(-profile.rules.minHistory-30)
      // Research collectors explicitly normalize amount to CNY; legacy daily amount is not trusted.
      const researchBars=bars(research.daily||[],1000)
      const mapped=String(info.index_code||'').toUpperCase()
      return {ticker,name:s.instrument.name||ticker,bars:researchBars.length?researchBars:bars(localBars,historyRaw?1000:0),evidenceIds:etfEvidence,
        factors:(research.factors||[]).map(f=>({date:dateKey(f.trade_date)||'',factor:Number(f.adj_factor)})),adjustmentSource:research.factors?.length?'Tushare/fund_adj':undefined,
        indexCode:/^[A-Z0-9]{6}\.(SH|SZ|CSI)$/.test(mapped)?mapped:null,indexName:typeof info.index_name==='string'?info.index_name:undefined,indexBars:bars(research.indexDaily||[],1000),
        navHistory:(research.nav||[]).filter(r=>dateKey(r.nav_date)&&dateKey(r.nav_date)!<=cutoff&&dateKey(r.ann_date)&&dateKey(r.ann_date)!<=chinaDate(asOf)).flatMap(r=>{const nav=number(r.adj_nav??r.accum_nav);return nav!==null&&nav>0?[{date:dateKey(r.nav_date)!,nav}]:[]}),
        indexConstituents:(research.indexWeights||[]).filter(r=>dateKey(r.trade_date)&&dateKey(r.trade_date)!<=cutoff).map(r=>({code:symbol(r.con_code),weight:Number(r.weight),date:dateKey(r.trade_date)!})),
        holdings:holdings.filter(h=>h.etfCode===ticker).slice(0,10).map(h=>{
          const origin=rawHoldings.find(r=>symbol(r.stock_code||r.stockCode||r.code)===h.stockCode)
          // A provider trade_date may be a PCF basket date, not a disclosed portfolio period.
          const period=dateKey(origin?.report_period||origin?.end_date||origin?.reportPeriod)
          return {code:h.stockCode,name:h.stockName,weight:origin?.weight_available===false?null:number(origin?.weight),period,publishedAt:dateKey(origin?.ann_date||origin?.publish_date),source:String(origin?.source||'legacy-holdings-period-unknown'),evidenceId:holdingRaw?.id||add({id:`${id}:holding:${h.id}`,source:'legacy-holdings-period-unknown',dataDate:null,publishedAt:null,fetchedAt:h.updateDate.toISOString(),hash:digest(h)})}
        }),
        product:{date:productDate,nav:number(latestNav?.unit_nav),shares:number(shareRows[0]?.total_share),previousShares:number(shareRows[1]?.total_share),shareDate:dateKey(shareRows[0]?.trade_date),previousShareDate:dateKey(shareRows[1]?.trade_date),bookDate:dateKey(book?.date),valuationDate:dateKey(latestValuation?.trade_date||latestValuation?.date),valuationSource:latestValuation?.source?String(latestValuation.source):currentPe!==null||currentPb!==null?'Tushare/index_dailybasic':null,pePercentile5y:percentile('pe_ttm',currentPe),pbPercentile5y:percentile('pb',currentPb),valuationSampleCount:fiveYearValuations.length,spreadBps:book&&number(book.bid)!>0&&number(book.ask)!>=number(book.bid)!?(Number(book.ask)-Number(book.bid))/((Number(book.ask)+Number(book.bid))/2)*10000:null,feePct:number(info.mgt_fee),pe:currentPe,pb:currentPb,evidenceIds:selectedResearchRaws.map(r=>r.id)}}
    })
    const holdingCodes=[...new Set(etfs.flatMap(e=>e.holdings.map(h=>h.code)))],companyCodes=[...new Set([...holdingCodes,...profile.leaders.map(l=>l.code)])]
    const reportRows=await tx.stockFinancialReport.findMany({where:{stockCode:{in:companyCodes},fetchedAt:{lte:new Date(asOf)},publishDate:{gte:earliest,lte:new Date(asOf)}},orderBy:{fetchedAt:'desc'}})
    const reports=[...reportRows.reduce((items,row)=>{const period=dateKey(row.reportPeriod);if(!period)return items;const key=`${row.stockCode}:${row.reportType}:${period}`,current=items.get(key);if(!current||financialReportScore(row)>financialReportScore(current))items.set(key,{...row,reportPeriod:period});return items},new Map<string,typeof reportRows[number]>()).values()].sort((a,b)=>b.reportPeriod.localeCompare(a.reportPeriod)||a.reportType.localeCompare(b.reportType))
    const announcementRows=await tx.stockAnnouncement.findMany({where:{stockCode:{in:companyCodes},fetchedAt:{lte:new Date(asOf)},publishDate:{gte:new Date(Date.parse(asOf)-90*86400000),lte:new Date(asOf)}},orderBy:{publishDate:'desc'}})
    const taxonomy=rowsOf(latest('news_taxonomy')),segmentCodes=new Set<string>(taxonomy.filter(r=>r.industry_id===industryId).map(r=>String(r.segment_code)))
    const terms=researchTerms([profile.name,...profile.sectors,...profile.segments.map(s=>s.name),...profile.leaders.map(l=>l.name),...taxonomy.filter(r=>r.industry_id===industryId).map(r=>r.segment_name),...etfs.flatMap(e=>e.holdings.map(h=>h.name))])
    const news=segmentCodes.size?await tx.newsArticle.findMany({where:{aiProcessed:true,createdAt:{lte:new Date(asOf)},publishTime:{gte:new Date(Date.parse(asOf)-90*86400000),lte:new Date(asOf)},OR:[...segmentCodes].map(code=>({segmentCodes:{contains:JSON.stringify(code)}}))},orderBy:{publishTime:'desc'},take:1000}):[]
    const eventsInput:EventInput[]=[]
    const eventRecords=new Map<string,{record:unknown;evidence:Evidence}>()
    for(const r of announcementRows){
      eventRecords.set(r.id,{record:r,evidence:{id:r.id,source:r.source||'unknown',dataDate:dateKey(r.publishDate),publishedAt:r.publishDate!.toISOString(),fetchedAt:r.fetchedAt.toISOString(),hash:r.contentHash}})
      eventsInput.push({id:r.id,title:r.title,content:r.content||'',source:r.source||'unknown',url:r.url,publishedAt:r.publishDate!.toISOString(),fetchedAt:r.fetchedAt.toISOString(),company:r.stockCode,kind:'announcement',segments:profile.segments.filter(s=>s.companies.includes(r.stockCode)).map(s=>s.name)})
    }
    const relevantNews=news.filter(n=>matchesNewsIndustry(n.segmentCodes,segmentCodes)&&matchesResearchDomain(n.title,n.content,terms))
    for(const r of relevantNews){
      const record={id:r.id,title:r.title,content:r.content,url:r.url,source:r.source,publishTime:r.publishTime,createdAt:r.createdAt}
      eventRecords.set(r.id,{record,evidence:{id:r.id,source:r.source,dataDate:dateKey(r.publishTime),publishedAt:r.publishTime.toISOString(),fetchedAt:r.createdAt.toISOString(),hash:digest({title:r.title,content:r.content,url:r.url})}})
      eventsInput.push({id:r.id,title:r.title,content:r.content,source:r.source,url:r.url,publishedAt:r.publishTime.toISOString(),fetchedAt:r.createdAt.toISOString(),kind:'news',segments:parse<string[]>(r.segmentCodes)||[]})
    }
    const events=clusterEvents(eventsInput,asOf).filter(event=>{
      if(event.status!=='evidence'||event.category==='administrative')return false
      if(event.companies.length)return true
      const text=(event.title+' '+event.excerpt).toLowerCase()
      return new Set(terms.filter(term=>text.includes(term.toLowerCase()))).size>=2
    })
    for(const evidenceId of new Set(events.flatMap(event=>event.evidenceIds))){const item=eventRecords.get(evidenceId);if(item){records[evidenceId]=item.record;add(item.evidence)}}
    const companies=companyCodes.map(code=>{
      const rs=reports.filter(r=>r.stockCode===code).slice(0,24)
      const ids=rs.map(r=>{records[r.id]=r;return add({id:r.id,source:r.source||'unknown',dataDate:dateKey(r.reportPeriod),publishedAt:r.publishDate?.toISOString()||null,fetchedAt:r.fetchedAt.toISOString(),hash:r.contentHash})})
      const leader=profile.leaders.find(l=>l.code===code),holding=etfs.flatMap(e=>e.holdings).find(h=>h.code===code)
      const views=rs.map(financialView),income=views.find(r=>r.reportType==='income')
      const priorPeriod=income?.period.replace(/^\d{4}/,year=>String(Number(year)-1))
      const knownCurrency=typeof income?.currency==='string'&&/^[A-Z]{3}$/.test(income.currency)
      const prior=knownCurrency?views.find(r=>r.reportType==='income'&&r.period===priorPeriod&&r.currency===income.currency):null
      const cash=knownCurrency?views.find(r=>r.reportType==='cashflow'&&r.period===income.period&&r.currency===income.currency):null
      const profit=number(income?.metrics.find(m=>m.label==='净利润')?.value),oldProfit=number(prior?.metrics.find(m=>m.label==='净利润')?.value),cashFlow=number(cash?.metrics.find(m=>m.label==='经营现金流')?.value)
      const profitGrowthPct=profit!==null&&oldProfit!==null&&oldProfit>0?(profit/oldProfit-1)*100:null
      const cashConversionPct=profit!==null&&profit>0&&cashFlow!==null?cashFlow/profit*100:null
      return {code,name:leader?.name||holding?.name||code,segment:leader?.segment||profile.segments.find(s=>s.companies.includes(code))?.name||'未映射',pool:leader?(holding?'both':'leader') as 'both'|'leader':'holding' as const,financialPeriods:new Set(views.filter(r=>r.metrics.length).map(r=>r.period)).size,announcementCount:events.filter(e=>e.companies.includes(code)&&e.status==='evidence').length,profitGrowthPct,cashConversionPct,evidenceIds:ids}
    })
    const sectorFlowMap=new Map<string,ResearchSnapshot['sectorFlows'][number]>()
    for(const r of raw.filter(r=>r.datasetKey==='sector_capital_flow')){
      const evidenceId=sourceEvidence(r,'元；主力成交分类，不等于新增资金')
      for(const row of rowsOf(r)){
        const date=dateKey(row['日期']||row.trade_date||row.date),incoming=normalizedSector(row['名称']||row.sector),sector=profile.sectors.find(item=>normalizedSector(item)===incoming),net=number(row['今日主力净流入-净额'])
        const netPct=number(row['今日主力净流入-净占比'])
        if(date&&sector&&date<=cutoff&&net!==null){const key=date+':'+sector,current=sectorFlowMap.get(key);if(!current||(current.netPct===null&&netPct!==null))sectorFlowMap.set(key,{date,sector,net,netPct,evidenceId})}
      }
    }
    const sectorFlows=[...sectorFlowMap.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.sector.localeCompare(b.sector,'zh-CN'))
    const indexLocal=await tx.indexDaily.findMany({where:{code:{in:[...MARKET_INDEXES.flatMap(i=>[i.code,symbol(i.code)]),profile.benchmark,symbol(profile.benchmark),'sh'+symbol(profile.benchmark),'sz'+symbol(profile.benchmark)]},date:{gte:earliest,lte:new Date(cutoff+'T23:59:59Z')}},orderBy:{date:'asc'}})
    const benchmarkBars=bars(indexLocal.filter(r=>symbol(r.code)===symbol(profile.benchmark)))
    const benchmarkId=add({id:`${id}:benchmark`,source:'local-index-daily',dataDate:dateKey(indexLocal.at(-1)?.date),publishedAt:null,fetchedAt:asOf,hash:digest(indexLocal)})
    records[benchmarkId]=indexLocal
    etfs.forEach(e=>e.evidenceIds.push(benchmarkId))
    const snapshot:ResearchSnapshot={version:1,id,asOf,capturedAt:asOf,profile,calendar,evidence,etfs,benchmarkBars,sectorFlows,events,companies,projections:{},records}
    const evaluation=evaluateResearch(snapshot)
    const marketData=etfs.map(e=>{
      const series=adjustedBars(e,boundary.expectedSession||cutoff),d=evaluation.decisions.find(d=>d.ticker===e.ticker)!,metrics=calculateDetailMetrics(series.bars)
      return {ticker:e.ticker,name:e.name,price:series.bars.at(-1)?.close||null,changePct:metrics.latestChangePct,history:series.bars,keyIndicators:series.adjusted&&!series.discontinuity?metrics.indicators:null,volatility:d.metrics.volatilityPct,max_drawdown:series.adjusted?metrics.maxDrawdown:null,data_points:series.bars.length,source:e.adjustmentSource||'subscription-database',dataDate:series.bars.at(-1)?.date,quality:d.state==='blocked'?'unverified-adjustment':'available',qualityWarning:d.state==='blocked'?d.gaps.join('；'):undefined,evidenceIds:e.evidenceIds}
    })
    const stockDaily=await tx.stockDaily.findMany({where:{ticker:{in:companyCodes},date:{gte:earliest,lte:new Date(cutoff+'T23:59:59Z')}},orderBy:{date:'asc'}})
    const companyData=companies.map(c=>{
      const dailyRows=stockDaily.filter(r=>r.ticker===c.code).slice(-profile.rules.minHistory),history=bars(dailyRows),metrics=calculateDetailMetrics(history)
      const evidenceId=`${id}:company:${c.code}`;records[evidenceId]=dailyRows
      if(dailyRows.length)add({id:evidenceId,source:'local-company-daily',dataDate:history.at(-1)?.date||null,publishedAt:null,fetchedAt:asOf,hash:digest(dailyRows)})
      return {...c,stockCode:c.code,stockName:c.name,source:c.pool,marketData:history.at(-1)?.date===cutoff?{...history.at(-1),price:history.at(-1)?.close,changePct:metrics.latestChangePct,source:'local-company-daily',evidenceId}:null,history,indicators:metrics,financials:reports.filter(r=>r.stockCode===c.code).slice(0,24).map(r=>{const v=financialView(r);return {...v,evidenceId:r.id,calculated:financialRatios(v.metrics)}}),announcements:events.filter(e=>e.companies.includes(c.code)).slice(0,6).map(e=>({...e,publishDate:e.publishedAt,source:e.sources.join(' / '),url:e.urls[0]||null,summary:e.excerpt})),quality:{source:'frozen-research-snapshot'}}
    })
    const marketIndices=MARKET_INDEXES.map(index=>{const series=bars(indexLocal.filter(r=>symbol(r.code)===symbol(index.code))),last=series.at(-1);return {...index,price:last?.date===cutoff?last.close:null,dataDate:last?.date||null,aligned:last?.date===cutoff}})
    const reference=(key:string)=>{const r=latest(key);if(!r)return null;sourceEvidence(r);const data=rowsOf(r).filter(row=>dateKey(row.trade_date)&&dateKey(row.trade_date)!<=cutoff);return {data,source:parse<Bundle>(r.payload)?.source||r.provider,dataDate:dateKey(data[0]?.trade_date),fetchedAt:r.fetchedAt,stale:!data.length||Date.parse(asOf)-Date.parse(dateKey(data[0]?.trade_date)!)>7*86400000}}
    const references={mainFlow:reference('market_main_flow'),margin:reference('margin_balance')}
    const allHoldings=etfs.flatMap(e=>e.holdings.map(h=>({...h,etfCode:e.ticker,stock_code:h.code,stock_name:h.name,trade_date:h.period})))
    const articleData=events.filter(e=>!e.companies.length).slice(0,40).map(e=>({...e,content:e.excerpt,summary:e.excerpt,publishTime:e.publishedAt,source:e.sources.join(' / '),url:e.urls[0],sentiment:null}))
    const trackingAnomalies=evaluation.products?.filter(product=>typeof product.trackingErrorPct==='number'&&product.trackingErrorPct>20).map(product=>({ticker:product.ticker,metric:'trackingErrorPct',value:product.trackingErrorPct,reason:'年化跟踪误差超过20%，疑似净值或指数序列口径异常'}))||[]
    const perEtf=evaluation.decisions.map(d=>{const dataGaps=d.conditions.filter(condition=>condition.status==='unknown').map(condition=>condition.label),signalGaps=d.conditions.filter(condition=>condition.status==='unmet').map(condition=>condition.label);return {ticker:d.ticker,status:d.state==='blocked'?'blocked':dataGaps.length?'limited':'available',dataGaps,signalGaps,signalState:d.state}})
    const hasDataGaps=perEtf.some(item=>item.status!=='available')||Boolean(evaluation.omittedConditions?.length)||trackingAnomalies.length>0
    const quality={status:evaluation.decisions.every(d=>d.state==='blocked')?'blocked':hasDataGaps?'limited':'available',requested:etfs.length,available:etfs.filter(e=>e.bars.length).length,usable:evaluation.decisions.filter(d=>d.state!=='blocked').length,coverage:etfs.length?evaluation.decisions.filter(d=>d.state!=='blocked').length/etfs.length:0,asOf,expectedSession:boundary.expectedSession,calendarVerified:boundary.verified,perEtf,modules:evaluation.modules,companyCoverage:{total:companies.length,financials:companies.filter(c=>c.financialPeriods>=2).length,profitGrowth:companies.filter(c=>number(c.profitGrowthPct)!==null).length,cashQuality:companies.filter(c=>number(c.cashConversionPct)!==null).length,announcements:companies.filter(c=>c.announcementCount>0).length},newsCount:articleData.length,dataAnomalies:trackingAnomalies}
    snapshot.projections={
      'fetch-etfs':{'industry-info':{id:industryId,name:profile.name,source:'frozen-snapshot'},'etf-bindings':etfs.map(e=>({etf_code:e.ticker,etf_name:e.name,indexCode:e.indexCode,indexName:e.indexName,holdings:e.holdings})),'etf-codes':tickers.join(',')},
      'fetch-market-snapshot':{'market-snapshot':{source:'frozen-snapshot',asOf,overview:{indices:marketIndices},capitalFlow:{scope:'配置的领域板块，不代表全市场新增资金',series:sectorFlows},quality:evaluation.modules.market},'market-reference-data':references,'market-reference-indicators':{flow:evaluation.modules.flow,mainFlow:summarizeMarketReference(references.mainFlow),margin:summarizeMarketReference(references.margin)}},
      'fetch-etf-data':{'etf-market-data':marketData,'etf-data-gaps':{missingCodes:etfs.filter(e=>!e.bars.length).map(e=>e.ticker),requested:etfs.length,available:marketData.length}},
      'fetch-etf-holdings':{'etf-holdings':allHoldings,'holdings-summary':{totalETFs:etfs.length,totalHoldings:allHoldings.length,uniqueStocks:holdingCodes.length}},
      'fetch-companies':{'companies':companyData.map(c=>({stockCode:c.code,stockName:c.name,source:c.pool,segment:c.segment})),'company-codes':companyCodes.join(',')},
      'fetch-company-data':{'company-market-data':companyData},
      'fetch-news':{'news-articles':articleData,'news-events':events,'news-evidence-gaps':{candidates:news.length,textRelevant:relevantNews.length,excludedByTextRelevance:news.length-relevantNews.length,eventClusters:articleData.length,leads:events.filter(e=>e.status==='lead').length,taxonomyAvailable:segmentCodes.size>0},'news-trends':{},'news-sentiment':{avgSentiment:null}},
      'calculate-market-trends':{'market-trends':{indexBreadth:evaluation.indexBreadth,source:'one-vote-per-index'}},
      'assess-data-quality':{'data-quality':quality},
    }
    return JSON.parse(encode(snapshot)) as ResearchSnapshot
  },{timeout:60000})
}

export async function persistEvaluation(snapshot: ResearchSnapshot, previous?: Evaluation|null) {
  const existing=await prisma.rawPayload.findUnique({where:{id:snapshot.id+':evaluation'}})
  if(existing){const stored=JSON.parse(existing.payload) as Evaluation;const original=await readSnapshot(snapshot.id);if(digest(original)!==digest(snapshot))throw new Error('禁止覆盖已冻结的研究快照');return stored}
  const result=evaluateResearch(snapshot,previous&&previous.asOf<snapshot.asOf&&previous.profile.industryId===snapshot.profile.industryId?previous:null)
  await prisma.$transaction([
    prisma.rawPayload.upsert({where:{id:snapshot.id},create:{id:snapshot.id,datasetKey:'research_snapshot',targetCode:snapshot.profile.industryId,provider:'frozen-local-v1',payload:encode(snapshot),contentHash:digest(snapshot)},update:{}}),
    prisma.rawPayload.upsert({where:{id:snapshot.id+':evaluation'},create:{id:snapshot.id+':evaluation',datasetKey:'research_evaluation',targetCode:snapshot.profile.industryId,provider:'rules-v1',payload:encode(result),contentHash:digest(result)},update:{}}),
    prisma.rawPayload.upsert({where:{id:snapshot.id+':validation-ledger'},create:{id:snapshot.id+':validation-ledger',datasetKey:'research_validation_ledger',targetCode:snapshot.profile.industryId,provider:'paper-ledger-v1',payload:encode({snapshot:compactReplaySnapshot(snapshot),evaluation:result}),contentHash:digest({snapshotId:snapshot.id,evaluation:result})},update:{}}),
  ])
  return result
}
export async function latestEvaluation(industryId: string): Promise<Evaluation|null> {
  const row=await prisma.rawPayload.findFirst({where:{datasetKey:'research_evaluation',targetCode:industryId},orderBy:{fetchedAt:'desc'}})
  return row?parse<Evaluation>(row.payload):null
}
export async function readSnapshot(id: string): Promise<ResearchSnapshot> {
  const row=await prisma.rawPayload.findUnique({where:{id}})
  if(!row||row.datasetKey!=='research_snapshot') throw new Error('研究快照不存在')
  const snapshot=parse<ResearchSnapshot>(row.payload)
  if(snapshot?.version!==1||digest(snapshot)!==row.contentHash) throw new Error('研究快照版本或校验值不匹配')
  return snapshot
}
