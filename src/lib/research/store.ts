import { withDisclosedHoldings } from '@/lib/graph/holding-mappings'
import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { financialView, calculateDetailMetrics } from '@/lib/market-detail'
import { financialRatios, summarizeMarketReference } from '@/lib/analysis/evidence'
import { MARKET_INDEXES } from '@/lib/subscription-config'
import { matchesNewsIndustry } from '@/lib/news-taxonomy'
import type { Bar, Evidence, ETFInput, EventInput, Evaluation, Profile, ResearchSnapshot, SourceRecord } from './contracts'
import { defaultProfile, validateProfile } from './profile'
import { clusterEvents } from './events'
import { adjustedBars, evaluateResearch, selectProductNav } from './engine'
import { chinaDate, dateKey, sessionBoundary } from './time'
import { securityCode, securityAliases, holdingPeriod } from './normalization'
import { selectResearchOrderbook } from './orderbook'
import { selectHistoricalReports } from './history-reports'
import { assessDecisionTiming } from '@/lib/analysis/decision-timing'
import { buildFrozenGraphContext, graphCompanyCandidates, type RawGraphGroup } from '@/lib/graph/research-context'

export const encode = (value: unknown) => JSON.stringify(value, (_key,v)=>typeof v==='bigint'?Number(v):v)
export const digest = (value: unknown) => createHash('sha256').update(encode(value)).digest('hex')
type WireRow = Record<string, string | number | boolean | null>
type SubscriptionProfile = {industryId?:string;industryName?:string;industryIds?:string[];industryNames?:string[]}
type GraphGroup = RawGraphGroup & {etfs?:Array<{code?:string}>;analysisEtfs?:Array<{code?:string}>}
type Bundle = {source?:string;data?:Record<string,WireRow[]>}
function parse<T = unknown>(value: string | null | undefined): T | null { try {return JSON.parse(value||'null') as T} catch {return null} }
const number = (value: unknown) => value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null
const symbol = securityCode
const normalizedSector = (value: unknown) => String(value||'').trim().replace(/[ⅠⅡⅢⅣⅤⅥ]+$/u,'')
function bestBundleEntry(entries: Array<{raw:SourceRecord;bundle:Record<string,WireRow[]>}>, field: string, dateFields: string[]) {
  const latest=(rows:WireRow[])=>rows.reduce((max,row)=>{const date=dateFields.map(key=>dateKey(row[key])).find(Boolean)||'';return date>max?date:max},'')
  return entries.filter(entry=>Array.isArray(entry.bundle[field])&&entry.bundle[field].length).sort((a,b)=>latest(b.bundle[field]).localeCompare(latest(a.bundle[field]))||b.bundle[field].length-a.bundle[field].length||b.raw.fetchedAt.localeCompare(a.raw.fetchedAt))[0]
}
function financialReportScore(row:{metricsJson:string;source:string|null;reportType:string;reportPeriod:string;publishDate:Date|null}){
  const payload=parse<Record<string,unknown>>(row.metricsJson)||{}
  const view=financialView(row)
  const required=row.reportType==='income'?'净利润':row.reportType==='cashflow'?'经营现金流':'总资产'
  return (view.metrics.some(metric=>metric.label===required)?100:0)+(/^[A-Z]{3}$/.test(String(view.currency||payload.currency||''))?4:0)+(row.source==='tushare'?2:0)
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
    const matched=subscriptions.map(r=>parse<SubscriptionProfile>(r.profile)).find(p=>p?.industryId===industryId||p?.industryIds?.includes(industryId))
    const matchedIndex=matched?.industryIds?.indexOf(industryId)??-1
    name=(matchedIndex>=0?matched?.industryNames?.[matchedIndex]:undefined)||matched?.industryName
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
    const subscriptions=await tx.dataSubscription.findMany({where:{enabled:true,instrument:{type:'ETF'}},include:{instrument:true,datasets:true}})
    const graphRow=await tx.rawPayload.findFirst({where:{datasetKey:'industry_graph'},orderBy:{fetchedAt:'desc'}})
    const group=(parse<GraphGroup[]>(graphRow?.payload)||[]).find(g=>g.id===industryId)
    let graphCompanies=graphCompanyCandidates(group).sort((a,b)=>{
      const verifiedA=a.representativeEtfs?.filter(item=>item.holdingVerified).length||0,verifiedB=b.representativeEtfs?.filter(item=>item.holdingVerified).length||0
      return verifiedB-verifiedA||(b.representativenessScore||0)-(a.representativenessScore||0)||a.code.localeCompare(b.code)
    }).slice(0,100)
    const selected=subscriptions.filter(s=>group ? (group.analysisEtfs||group.etfs)?.some(e=>symbol(e.code)===s.instrument.code) : (()=>{const profile=parse<SubscriptionProfile>(s.profile);return profile?.industryId===industryId||profile?.industryIds?.includes(industryId)})())
    if(!selected.length) throw new Error('该领域没有已订阅ETF，请先同步领域映射')
    const configRow=await tx.rawPayload.findFirst({where:{datasetKey:'research_profile',targetCode:industryId},orderBy:{fetchedAt:'desc'}})
    const profile=configRow?validateProfile(parse(configRow.payload),industryId):defaultProfile(industryId,group?.name||parse<SubscriptionProfile>(selected[0].profile)?.industryName||industryId)
    const tickers=selected.map(s=>s.instrument.code)
    const earliest=new Date(Date.parse(asOf)-800*86400000)
    const rawDb=await tx.rawPayload.findMany({where:{fetchedAt:{lte:new Date(asOf),gte:earliest},OR:[{targetCode:{in:tickers},datasetKey:{in:['etf_daily','etf_holdings','etf_research','etf_realtime']}},{datasetKey:{in:['research_calendar','sector_capital_flow','market_main_flow','margin_balance','market_volume','news_taxonomy','index_daily']}}]},orderBy:{fetchedAt:'desc'}})
    const raw:SourceRecord[]=rawDb.map(r=>({...r,fetchedAt:r.fetchedAt.toISOString()}))
    const latest=(key:string,code?:string)=>raw.find(r=>r.datasetKey===key&&(!code||symbol(r.targetCode)===symbol(code)))
    const calendar=rowsOf(latest('research_calendar')).map(r=>({date:dateKey(r.cal_date||r.date)||'',open:Number(r.is_open)===1})).filter(r=>r.date)
    const boundary=sessionBoundary(calendar,asOf)
    // Missing calendar permits diagnostics, but the engine blocks all actions.
    const cutoff=boundary.expectedSession||chinaDate(asOf)
    // Older replay fixtures predate MarketQuote/subscription dataset auditing;
    // their missing audit data must safely downgrade to reference-only.
    const quoteRows=typeof tx.marketQuote?.findMany==='function'?await tx.marketQuote.findMany({where:{instrumentType:'ETF',code:{in:tickers},fetchedAt:{lte:new Date(asOf)}}}):[]
    const eventChecks=selected.flatMap(subscription=>(subscription.datasets||[]).filter(dataset=>dataset.enabled&&dataset.datasetKey==='stock_announcement').map(dataset=>({key:`${dataset.datasetKey}:${subscription.instrument.code}`,lastSuccessAt:dataset.lastSuccessAt?.toISOString()||null})))
    const decisionTiming=assessDecisionTiming({asOf,calendar,expectedTickers:tickers,quotes:quoteRows.map(quote=>({code:quote.code,tradeDate:quote.tradeDate||null,fetchedAt:quote.fetchedAt.toISOString()})),eventChecks})
    const evidence:Evidence[]=[], evidenceSet=new Set<string>(),records:Record<string,unknown>={}
    const add=(e:Evidence)=>{if(!evidenceSet.has(e.id)){evidence.push(e);evidenceSet.add(e.id)}return e.id}
    const graphEvidenceId=group&&graphRow?add({id:`graph:${group.revisionId||group.revision_id||graphRow.id}`,source:'neo4j-versioned-industry-graph',dataDate:null,publishedAt:group.publishedAt||group.published_at||null,fetchedAt:graphRow.fetchedAt.toISOString(),hash:group.contentHash||group.content_hash||graphRow.contentHash}):null
    if(graphEvidenceId)records[graphEvidenceId]={industryId:group?.id,revisionId:group?.revisionId||group?.revision_id,mappingRevisionId:group?.mappingRevisionId||group?.mapping_revision_id,version:group?.version,contentHash:group?.contentHash||group?.content_hash}
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
      researchEntries.push(...raw.filter(r=>r.datasetKey==='etf_realtime'&&symbol(r.targetCode)===ticker).map(raw=>({raw,bundle:{orderbook:rowsOf(raw).filter(row=>row.bookPublishedAt).map(row=>({code:ticker,bid:row.bid,ask:row.ask,publishedAt:row.bookPublishedAt,date:row.bookDate,source:row.bookSource}))}})))
      // Promax endpoints fail independently. Merge immutable bundles field by
      // field so a later partial retry cannot erase a previously verified
      // factor, index or NAV series. Date/continuity gates below still reject
      // stale data; this only prevents regression to an empty field.
      const chosen=Object.fromEntries([
        ['info',bestBundleEntry(researchEntries,'info',[])],['daily',bestBundleEntry(researchEntries,'daily',['trade_date','date'])],['factors',bestBundleEntry(researchEntries,'factors',['trade_date','date'])],
        ['shares',bestBundleEntry(researchEntries,'shares',['trade_date','date'])],['nav',bestBundleEntry(researchEntries,'nav',['nav_date','ann_date'])],['orderbook',bestBundleEntry(researchEntries,'orderbook',['date','publishedAt'])],
        ['indexDaily',bestBundleEntry(researchEntries,'indexDaily',['trade_date','date'])],['indexWeights',bestBundleEntry(researchEntries,'indexWeights',['trade_date','date'])],['indexValuation',bestBundleEntry(researchEntries,'indexValuation',['trade_date','date'])],
      ]) as Record<string,{raw:SourceRecord;bundle:Record<string,WireRow[]>}|undefined>
      const book=selectResearchOrderbook(researchEntries.flatMap(entry=>entry.bundle.orderbook||[]),ticker,asOf,cutoff,decisionTiming.phase==='trading')
      chosen.orderbook=book?researchEntries.find(entry=>entry.bundle.orderbook?.includes(book)):undefined
      const research=Object.fromEntries(Object.entries(chosen).map(([field,entry])=>[field,entry?.bundle[field]||[]])) as Record<string,WireRow[]>
      const seriesSources=new Map<string,SourceRecord>()
      for(const field of ['daily','factors','indexDaily']){
        const byDate=new Map<string,{row:WireRow;raw:SourceRecord}>()
        for(const entry of researchEntries)for(const row of entry.bundle[field]||[]){
          const date=dateKey(row.trade_date||row.date)
          const valid=field==='factors'?(number(row.adj_factor)||0)>0:['open','high','low','close'].every(key=>(number(row[key])||0)>0)
          if(date&&date<=cutoff&&valid&&!byDate.has(date))byDate.set(date,{row,raw:entry.raw})
        }
        const selected=[...byDate.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-profile.rules.minHistory-40).map(([,value])=>value)
        research[field]=selected.map(item=>item.row)
        selected.forEach(item=>seriesSources.set(item.raw.id,item.raw))
      }
      const selectedResearchRaws=[...new Map([...Object.values(chosen).filter(Boolean).map(entry=>[entry!.raw.id,entry!.raw] as const),...seriesSources.entries()]).values()]
      const historyRaw=latest('etf_daily',ticker), holdingRaw=latest('etf_holdings',ticker)
      const localRows=daily.filter(r=>r.ticker===ticker)
      const mergedPriceRows=[...new Map([...bars(localRows.slice(-profile.rules.minHistory-30)),...bars(research.daily,1000)].map(bar=>[bar.date,bar])).values()].sort((a,b)=>a.date.localeCompare(b.date))
      records[`${id}:bars:${ticker}`]=mergedPriceRows
      const etfEvidence=[add({id:`${id}:bars:${ticker}`,source:research.daily.length?'Tushare/fund_daily':'frozen-local-daily',dataDate:mergedPriceRows.at(-1)?.date||null,publishedAt:null,fetchedAt:asOf,hash:digest(mergedPriceRows)})]
      if(historyRaw) etfEvidence.push(sourceEvidence(historyRaw,'日线amount:千元，归一化为元'))
      for(const researchRaw of selectedResearchRaws) etfEvidence.push(sourceEvidence(researchRaw))
      if(holdingRaw) sourceEvidence(holdingRaw)
      const rawHoldings=rowsOf(holdingRaw)
      const persistedHoldings=holdings.filter(row=>row.etfCode===ticker)
      const persistedNames=new Map(persistedHoldings.map(row=>[symbol(row.stockCode),row.stockName]))
      const rawHoldingPeriods=rawHoldings.map(row=>holdingPeriod(row.report_period||row.end_date||row.reportPeriod)).filter((value):value is string=>!!value)
      const latestHoldingPeriod=rawHoldingPeriods.sort().at(-1)||null
      const periodHoldings=latestHoldingPeriod?rawHoldings.filter(row=>holdingPeriod(row.report_period||row.end_date||row.reportPeriod)===latestHoldingPeriod):rawHoldings
      const uniqueHoldings=new Map<string,WireRow>()
      for(const row of periodHoldings){
        const code=symbol(row.stock_code||row.stockCode||row.code),prior=uniqueHoldings.get(code)
        if(!prior)uniqueHoldings.set(code,row)
        else if(number(prior.weight??prior.stk_mkv_ratio)!==number(row.weight??row.stk_mkv_ratio))uniqueHoldings.set(code,{...prior,weight_available:false})
      }
      const disclosedHoldings=[...uniqueHoldings.values()]
        .sort((a,b)=>(number(b.weight??b.stk_mkv_ratio)||0)-(number(a.weight??a.stk_mkv_ratio)||0)).slice(0,10)
      const latestNav=(research.nav||[]).filter(n=>dateKey(n.nav_date)&&dateKey(n.nav_date)!<=cutoff&&dateKey(n.ann_date)&&dateKey(n.ann_date)!<=chinaDate(asOf)).sort((a,b)=>String(b.nav_date).localeCompare(String(a.nav_date)))[0]
      const shareRows=(research.shares||[]).filter(n=>dateKey(n.trade_date)&&dateKey(n.trade_date)!<=cutoff).sort((a,b)=>String(b.trade_date).localeCompare(String(a.trade_date)))
      const productNav=selectProductNav({cutoff,officialDate:dateKey(latestNav?.nav_date),officialNav:number(latestNav?.unit_nav),shareDate:dateKey(shareRows[0]?.trade_date),shareNav:number(shareRows[0]?.nav),shareClose:number(shareRows[0]?.close)})
      const latestValuation=(research.indexValuation||[]).filter(row=>dateKey(row.trade_date||row.date)&&dateKey(row.trade_date||row.date)!<=cutoff).sort((a,b)=>String(b.trade_date||b.date).localeCompare(String(a.trade_date||a.date)))[0]
      const currentPe=number(latestValuation?.pe_ttm),currentPb=number(latestValuation?.pb)
      const info=research.info?.[0]||{}
      const productDate=productNav.date
      const latestAudit=parse<{fieldStatus?:Record<string,{status:string;detail?:string;expectedAt?:string}>}>(researchEntries[0]?.raw.payload)?.fieldStatus||{}
      const publicationNotes=Object.entries(latestAudit).filter(([,item])=>item.status==='pending-publication').map(([key,item])=>`${key==='shares'?'份额':'净值'}：${item.detail||'等待发布'}${item.expectedAt?'；预期 '+item.expectedAt:''}`)
      const localBars=daily.filter(r=>r.ticker===ticker).slice(-profile.rules.minHistory-30)
      // Research collectors explicitly normalize amount to CNY; legacy daily amount is not trusted.
      const researchBars=bars(research.daily||[],1000)
      const mapped=String(info.index_code||'').toUpperCase()
      const normalizedHoldings:ETFInput['holdings']=disclosedHoldings.length?disclosedHoldings.map((row,index)=>{
        const code=symbol(row.stock_code||row.stockCode||row.code)
        const period=holdingPeriod(row.report_period||row.end_date||row.reportPeriod)
        const fallbackId=`${id}:holding:${ticker}:${code}:${index}`
        return {code,name:String(row.stock_name||row.name||persistedNames.get(code)||code),weight:row.weight_available===false?null:number(row.weight??row.stk_mkv_ratio),period,publishedAt:dateKey(row.ann_date||row.publish_date),observedAt:holdingRaw?.fetchedAt||null,source:String(row.source||'legacy-holdings-period-unknown'),evidenceId:holdingRaw?.id||add({id:fallbackId,source:'legacy-holdings-period-unknown',dataDate:period,publishedAt:null,fetchedAt:holdingRaw?.fetchedAt||asOf,hash:digest(row)})}
      }):persistedHoldings.slice(0,10).map(row=>({code:symbol(row.stockCode),name:String(row.stockName),weight:number(row.weight),period:null,publishedAt:null,source:'legacy-holdings-period-unknown',evidenceId:holdingRaw?.id||add({id:`${id}:holding:${row.id}`,source:'legacy-holdings-period-unknown',dataDate:null,publishedAt:null,fetchedAt:row.updateDate.toISOString(),hash:digest(row)})}))
      return {ticker,name:s.instrument.name||ticker,bars:[...new Map([...bars(localBars),...researchBars].map(bar=>[bar.date,bar])).values()].sort((a,b)=>a.date.localeCompare(b.date)),evidenceIds:etfEvidence,
        factors:(research.factors||[]).map(f=>({date:dateKey(f.trade_date)||'',factor:Number(f.adj_factor)})),adjustmentSource:research.factors?.length?'Tushare/fund_adj':undefined,
        indexCode:/^[A-Z0-9]{6}\.(SH|SZ|CSI)$/.test(mapped)?mapped:null,indexName:typeof info.index_name==='string'?info.index_name:undefined,indexBars:bars(research.indexDaily||[],1000),
        navHistory:(research.nav||[]).filter(r=>dateKey(r.nav_date)&&dateKey(r.nav_date)!<=cutoff&&dateKey(r.ann_date)&&dateKey(r.ann_date)!<=chinaDate(asOf)).flatMap(r=>{const nav=number(r.adj_nav??r.accum_nav);return nav!==null&&nav>0?[{date:dateKey(r.nav_date)!,nav}]:[]}),
        indexConstituents:(research.indexWeights||[]).filter(r=>dateKey(r.trade_date)&&dateKey(r.trade_date)!<=cutoff).map(r=>({code:symbol(r.con_code),weight:Number(r.weight),date:dateKey(r.trade_date)!})),
        holdings:normalizedHoldings,
        product:{publicationNotes,navSource:productNav.source,navStatus:productDate===cutoff?'available':latestAudit.nav?.status==='failed'?'failed':!productDate?'missing':calendar.filter(day=>day.open&&day.date>productDate!&&day.date<=cutoff).length>1?'stale':'pending-publication',navDetail:productDate===cutoff?'收盘价与净值同日':`收盘价 ${cutoff}；最近净值 ${productDate||'缺失'}，不能计算同日折溢价`,date:productDate,nav:productNav.nav,shares:number(shareRows[0]?.total_share),previousShares:number(shareRows[1]?.total_share),shareDate:dateKey(shareRows[0]?.trade_date),previousShareDate:dateKey(shareRows[1]?.trade_date),bookDate:dateKey(book?.date),bookPublishedAt:book?.publishedAt?String(book.publishedAt):null,valuationDate:dateKey(latestValuation?.trade_date||latestValuation?.date),valuationSource:latestValuation?.source?String(latestValuation.source):currentPe!==null||currentPb!==null?'Tushare/index_dailybasic':null,spreadBps:book&&number(book.bid)!>0&&number(book.ask)!>=number(book.bid)!?(Number(book.ask)-Number(book.bid))/((Number(book.ask)+Number(book.bid))/2)*10000:null,feePct:number(info.mgt_fee),pe:currentPe,pb:currentPb,evidenceIds:selectedResearchRaws.map(r=>r.id)}}
    })
    const mappedGroup=group?withDisclosedHoldings(group,etfs,asOf,cutoff):undefined
    if(mappedGroup)graphCompanies=graphCompanyCandidates(mappedGroup)
    const holdingCodes=[...new Set(etfs.flatMap(e=>e.holdings.map(h=>h.code)))],companyCodes=[...new Set([...holdingCodes,...profile.leaders.map(l=>symbol(l.code)),...graphCompanies.map(company=>symbol(company.code))])]
    const companyAliases=companyCodes.flatMap(securityAliases)
    const reportRows=await tx.stockFinancialReport.findMany({where:{stockCode:{in:companyAliases},fetchedAt:{lte:new Date(asOf)},publishDate:{gte:earliest,lte:new Date(asOf)}},orderBy:{fetchedAt:'desc'}})
    const reports=[...reportRows.reduce((items,row)=>{const period=dateKey(row.reportPeriod);if(!period)return items;const key=`${symbol(row.stockCode)}:${row.reportType}:${period}`,current=items.get(key);if(!current||financialReportScore(row)>financialReportScore(current))items.set(key,{...row,stockCode:symbol(row.stockCode),reportPeriod:period});return items},new Map<string,typeof reportRows[number]>()).values()].sort((a,b)=>b.reportPeriod.localeCompare(a.reportPeriod)||a.reportType.localeCompare(b.reportType))
    const announcementRows=await tx.stockAnnouncement.findMany({where:{stockCode:{in:companyAliases},fetchedAt:{lte:new Date(asOf)},publishDate:{gte:new Date(Date.parse(asOf)-90*86400000),lte:new Date(asOf)}},orderBy:{publishDate:'desc'}})
    const taxonomy=rowsOf(latest('news_taxonomy')),segmentCodes=new Set<string>(taxonomy.filter(r=>r.industry_id===industryId).map(r=>String(r.segment_code)))
    const news=segmentCodes.size?await tx.newsArticle.findMany({where:{aiProcessed:true,createdAt:{lte:new Date(asOf)},publishTime:{gte:new Date(Date.parse(asOf)-90*86400000),lte:new Date(asOf)},OR:[...segmentCodes].map(code=>({segmentCodes:{contains:JSON.stringify(code)}}))},orderBy:{publishTime:'desc'},take:1000}):[]
    const eventsInput:EventInput[]=[]
    const eventRecords=new Map<string,{record:unknown;evidence:Evidence}>()
    for(const r of announcementRows){
      eventRecords.set(r.id,{record:r,evidence:{id:r.id,source:r.source||'unknown',dataDate:dateKey(r.publishDate),publishedAt:r.publishDate!.toISOString(),fetchedAt:r.fetchedAt.toISOString(),hash:r.contentHash}})
      eventsInput.push({id:r.id,title:r.title,content:r.content||'',source:r.source||'unknown',url:r.url,publishedAt:r.publishDate!.toISOString(),fetchedAt:r.fetchedAt.toISOString(),company:symbol(r.stockCode),kind:'announcement',segments:profile.segments.filter(s=>s.companies.includes(r.stockCode)).map(s=>s.name)})
    }
    const relevantNews=news.filter(n=>matchesNewsIndustry(n.segmentCodes,segmentCodes))
    for(const r of relevantNews){
      const record={id:r.id,title:r.title,content:r.content,url:r.url,source:r.source,publishTime:r.publishTime,createdAt:r.createdAt}
      eventRecords.set(r.id,{record,evidence:{id:r.id,source:r.source,dataDate:dateKey(r.publishTime),publishedAt:r.publishTime.toISOString(),fetchedAt:r.createdAt.toISOString(),hash:digest({title:r.title,content:r.content,url:r.url})}})
      eventsInput.push({id:r.id,title:r.title,content:r.content,source:r.source,url:r.url,publishedAt:r.publishTime.toISOString(),fetchedAt:r.createdAt.toISOString(),kind:'news',segments:parse<string[]>(r.segmentCodes)||[]})
    }
    // Keep leads and excluded categories auditable; the decision selector alone
    // decides what reaches the model. A verified domain tag is sufficient recall.
    const events=clusterEvents(eventsInput,asOf)
    for(const evidenceId of new Set(events.flatMap(event=>event.evidenceIds))){const item=eventRecords.get(evidenceId);if(item){records[evidenceId]=item.record;add(item.evidence)}}
    const companies=companyCodes.map(code=>{
      const rs=reports.filter(r=>r.stockCode===code).slice(0,24)
      const ids=rs.map(r=>{records[r.id]=r;return add({id:r.id,source:r.source||'unknown',dataDate:dateKey(r.reportPeriod),publishedAt:r.publishDate?.toISOString()||null,fetchedAt:r.fetchedAt.toISOString(),hash:r.contentHash})})
      const leader=profile.leaders.find(l=>symbol(l.code)===code),holding=etfs.flatMap(e=>e.holdings).find(h=>h.code===code),graphCompany=graphCompanies.find(company=>symbol(company.code)===code)
      const views=rs.map(financialView),income=views.find(r=>r.reportType==='income')
      const priorPeriod=income?.period.replace(/^\d{4}/,year=>String(Number(year)-1))
      const knownCurrency=typeof income?.currency==='string'&&/^[A-Z]{3}$/.test(income.currency)
      const prior=knownCurrency?views.find(r=>r.reportType==='income'&&r.period===priorPeriod&&r.currency===income.currency):null
      const cash=knownCurrency?views.find(r=>r.reportType==='cashflow'&&r.period===income.period&&r.currency===income.currency):null
      const profit=number(income?.metrics.find(m=>m.label==='净利润')?.value),oldProfit=number(prior?.metrics.find(m=>m.label==='净利润')?.value),cashFlow=number(cash?.metrics.find(m=>m.label==='经营现金流')?.value)
      const profitGrowthPct=profit!==null&&oldProfit!==null&&oldProfit>0?(profit/oldProfit-1)*100:null
      const cashConversionPct=profit!==null&&profit>0&&cashFlow!==null?cashFlow/profit*100:null
      const financialGaps = [
        !income && '缺少利润表',
        income && !knownCurrency && '财报币种未标注',
        income && profit===null && '利润表缺少净利润金额',
        knownCurrency && !prior && '缺少同币种上年同期利润表',
        oldProfit!==null && oldProfit<=0 && '上年同期净利润非正，利润同比不适用',
        profit!==null && profit<=0 && '当期净利润非正，现金利润比不适用',
        knownCurrency && !cash && '缺少同币种同期现金流量表',
        cash && cashFlow===null && '现金流量表缺少经营现金流金额',
      ].filter(Boolean) as string[]
      if(graphEvidenceId&&(leader||graphCompany))ids.push(graphEvidenceId)
      return {code,name:leader?.name||graphCompany?.name||holding?.name||code,stage:graphCompany?.stage,stageCode:graphCompany?.stageCode,segment:leader?.segment||graphCompany?.segment||profile.segments.find(s=>s.companies.includes(code))?.name||'未映射',segmentCode:graphCompany?.segmentCode,pool:holding&&(leader||graphCompany)?'both' as const:leader?'leader' as const:graphCompany?'graph' as const:'holding' as const,financialPeriods:new Set(views.filter(r=>r.metrics.length).map(r=>r.period)).size,announcementCount:events.filter(e=>e.companies.includes(code)&&e.status==='evidence').length,profitGrowthPct,cashConversionPct,financialGaps,evidenceIds:[...new Set(ids)],representativeEtfs:graphCompany?.representativeEtfs,representativeIndices:graphCompany?.representativeIndices,matchSource:graphCompany?.matchSource,matchConfidence:graphCompany?.matchConfidence,representativenessScore:graphCompany?.representativenessScore,selectionReason:graphCompany?.selectionReason}
    })
    const sectorFlowMap=new Map<string,ResearchSnapshot['sectorFlows'][number]>()
    for(const r of raw.filter(r=>r.datasetKey==='sector_capital_flow')){
      let evidenceId:string|undefined
      for(const row of rowsOf(r)){
        const date=dateKey(row['日期']||row.trade_date||row.date),incoming=normalizedSector(row['名称']||row.sector),sector=profile.sectors.find(item=>normalizedSector(item)===incoming),net=number(row['今日主力净流入-净额'])
        const netPct=number(row['今日主力净流入-净占比'])
        if(date&&sector&&date<=cutoff&&net!==null){evidenceId??=sourceEvidence(r,'元；主力成交分类，不等于新增资金');const key=date+':'+sector,current=sectorFlowMap.get(key);if(!current||(current.netPct===null&&netPct!==null))sectorFlowMap.set(key,{date,sector,net,netPct,evidenceId})}
      }
    }
    const sectorFlows=[...sectorFlowMap.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.sector.localeCompare(b.sector,'zh-CN'))
    const indexLocal=await tx.indexDaily.findMany({where:{code:{in:[...MARKET_INDEXES.flatMap(i=>[i.code,symbol(i.code)]),profile.benchmark,symbol(profile.benchmark),'sh'+symbol(profile.benchmark),'sz'+symbol(profile.benchmark)]},date:{gte:earliest,lte:new Date(cutoff+'T23:59:59Z')}},orderBy:{date:'asc'}})
    const benchmarkBars=bars(indexLocal.filter(r=>symbol(r.code)===symbol(profile.benchmark)))
    const benchmarkId=add({id:`${id}:benchmark`,source:'local-index-daily',dataDate:dateKey(indexLocal.at(-1)?.date),publishedAt:null,fetchedAt:asOf,hash:digest(indexLocal)})
    records[benchmarkId]=indexLocal
    etfs.forEach(e=>e.evidenceIds.push(benchmarkId))
    const historicalCandidates=profile.historyReports?.enabled===false?[]:await tx.aIAnalysisReport.findMany({where:{type:'comprehensive',industryId,createdAt:{lte:new Date(asOf)}},orderBy:{createdAt:'desc'},take:300,select:{id:true,industryId:true,industryName:true,title:true,summary:true,dataJson:true,createdAt:true}})
    const historicalReports=selectHistoricalReports({candidates:historicalCandidates,profile,tradingSessions:calendar.filter(day=>day.open).map(day=>day.date),cutoff:boundary.expectedSession,asOf})
    const graphContext=mappedGroup?buildFrozenGraphContext(mappedGroup,{fetchedAt:graphRow?.fetchedAt,contentHash:graphRow?.contentHash},events):undefined
    const snapshot:ResearchSnapshot={version:1,id,asOf,capturedAt:asOf,profile,calendar,evidence,etfs,benchmarkBars,sectorFlows,events,companies,graphContext,historicalReports,decisionTiming,projections:{},records}
    const evaluation=evaluateResearch(snapshot)
    const marketData=etfs.map(e=>{
      const series=adjustedBars(e,boundary.expectedSession||cutoff),d=evaluation.decisions.find(d=>d.ticker===e.ticker)!,metrics=calculateDetailMetrics(series.bars)
      const quote=quoteRows.find(row=>row.code===e.ticker)
      return {ticker:e.ticker,name:e.name,price:series.bars.at(-1)?.close||null,changePct:metrics.latestChangePct,history:series.bars,keyIndicators:series.adjusted&&!series.discontinuity?metrics.indicators:null,volatility:d.metrics.volatilityPct,max_drawdown:series.adjusted?metrics.maxDrawdown:null,data_points:series.bars.length,source:e.adjustmentSource?'Tushare/fund_daily+fund_adj':'subscription-database',dataDate:series.bars.at(-1)?.date,intradayQuote:quote&&quote.tradeDate===decisionTiming.tradingDate?{price:quote.price,changePct:quote.changePct,tradeDate:quote.tradeDate,source:quote.source,fetchedAt:quote.fetchedAt.toISOString()}:null,quality:d.state==='blocked'?'unverified-adjustment':'available',qualityWarning:d.state==='blocked'?d.gaps.join('；'):undefined,evidenceIds:e.evidenceIds}
    })
    const stockDaily=await tx.stockDaily.findMany({where:{ticker:{in:companyAliases},date:{gte:earliest,lte:new Date(cutoff+'T23:59:59Z')}},orderBy:{date:'asc'}})
    const companyData=companies.map(c=>{
      const dailyRows=stockDaily.filter(r=>symbol(r.ticker)===c.code).slice(-profile.rules.minHistory),history=bars(dailyRows),metrics=calculateDetailMetrics(history)
      const evidenceId=`${id}:company:${c.code}`;records[evidenceId]=dailyRows
      if(dailyRows.length)add({id:evidenceId,source:'local-company-daily',dataDate:history.at(-1)?.date||null,publishedAt:null,fetchedAt:asOf,hash:digest(dailyRows)})
      return {...c,stockCode:c.code,stockName:c.name,source:c.pool,marketData:history.at(-1)?.date===cutoff?{...history.at(-1),price:history.at(-1)?.close,changePct:metrics.latestChangePct,source:'local-company-daily',evidenceId}:null,history,indicators:metrics,financials:reports.filter(r=>r.stockCode===c.code).slice(0,24).map(r=>{const v=financialView(r);return {...v,evidenceId:r.id,calculated:financialRatios(v.metrics)}}),announcements:events.filter(e=>e.companies.includes(c.code)).slice(0,6).map(e=>({...e,publishDate:e.publishedAt,source:e.sources.join(' / '),url:e.urls[0]||null,summary:e.excerpt})),quality:{source:'frozen-research-snapshot'}}
    })
    const marketIndices=MARKET_INDEXES.map(index=>{const series=bars(indexLocal.filter(r=>symbol(r.code)===symbol(index.code))),last=series.at(-1);return {...index,price:last?.date===cutoff?last.close:null,dataDate:last?.date||null,aligned:last?.date===cutoff}})
    const reference=(key:string)=>{const r=latest(key);if(!r)return null;sourceEvidence(r);const data=rowsOf(r).filter(row=>dateKey(row.trade_date)&&dateKey(row.trade_date)!<=cutoff);return {data,source:parse<Bundle>(r.payload)?.source||r.provider,dataDate:dateKey(data[0]?.trade_date),fetchedAt:r.fetchedAt,stale:!data.length||Date.parse(asOf)-Date.parse(dateKey(data[0]?.trade_date)!)>7*86400000}}
    const references={mainFlow:reference('market_main_flow'),margin:reference('margin_balance')}
    const allHoldings=etfs.flatMap(e=>e.holdings.map(h=>({...h,etfCode:e.ticker,stock_code:h.code,stock_name:h.name,trade_date:h.period})))
    const articleData=events.filter(e=>!e.companies.length&&e.status==='evidence'&&e.category!=='administrative').map(e=>({...e,content:e.excerpt,summary:e.excerpt,publishTime:e.publishedAt,source:e.sources.join(' / '),url:e.urls[0],sentiment:null}))
    const trackingAnomalies=evaluation.products?.filter(product=>typeof product.trackingErrorPct==='number'&&product.trackingErrorPct>20).map(product=>({ticker:product.ticker,metric:'trackingErrorPct',value:product.trackingErrorPct,reason:'年化跟踪误差超过20%，疑似净值或指数序列口径异常'}))||[]
    const perEtf=evaluation.decisions.map(d=>{const dataGaps=[...d.conditions.filter(condition=>condition.status==='unknown').map(condition=>condition.label),...(evaluation.omittedConditions||[]).map(condition=>condition.label)],signalGaps=d.conditions.filter(condition=>condition.status==='unmet').map(condition=>condition.label);return {ticker:d.ticker,status:d.state==='blocked'?'blocked':dataGaps.length?'limited':'available',dataGaps,signalGaps,signalState:d.state}})
    const hasDataGaps=perEtf.some(item=>item.status!=='available')||Boolean(evaluation.omittedConditions?.length)||trackingAnomalies.length>0
    const quality={status:evaluation.decisions.every(d=>d.state==='blocked')?'blocked':hasDataGaps?'limited':'available',requested:etfs.length,available:etfs.filter(e=>e.bars.length).length,usable:evaluation.decisions.filter(d=>d.state!=='blocked').length,coverage:etfs.length?evaluation.decisions.filter(d=>d.state!=='blocked').length/etfs.length:0,asOf,expectedSession:boundary.expectedSession,calendarVerified:boundary.verified,perEtf,modules:evaluation.modules,companyCoverage:{total:companies.length,financials:companies.filter(c=>c.financialPeriods>=2).length,profitGrowth:companies.filter(c=>number(c.profitGrowthPct)!==null).length,cashQuality:companies.filter(c=>number(c.cashConversionPct)!==null).length,announcements:companies.filter(c=>c.announcementCount>0).length},newsCount:articleData.length,dataAnomalies:trackingAnomalies}
    snapshot.projections={
      'freeze-research':{'historical-report-context':historicalReports,'historical-report-policy':profile.historyReports,'decision-timing':decisionTiming,'graph-context':graphContext},
      'fetch-etfs':{'industry-info':{id:industryId,name:profile.name,source:'frozen-snapshot',graphRevisionId:graphContext?.revisionId,graphVersion:graphContext?.version},'etf-bindings':etfs.map(e=>({etf_code:e.ticker,etf_name:e.name,indexCode:e.indexCode,indexName:e.indexName,holdings:e.holdings})),'etf-codes':tickers.join(',')},
      'fetch-market-snapshot':{'market-snapshot':{source:'frozen-snapshot',asOf,decisionTiming,overview:{indices:marketIndices},capitalFlow:{scope:'配置的领域板块，不代表全市场新增资金',series:sectorFlows},quality:evaluation.modules.market},'market-reference-data':references,'market-reference-indicators':{flow:evaluation.modules.flow,mainFlow:summarizeMarketReference(references.mainFlow),margin:summarizeMarketReference(references.margin)}},
      'fetch-etf-data':{'etf-market-data':marketData,'etf-data-gaps':{missingCodes:etfs.filter(e=>!e.bars.length).map(e=>e.ticker),requested:etfs.length,available:marketData.length}},
      'fetch-etf-holdings':{'etf-holdings':allHoldings,'holdings-summary':{totalETFs:etfs.length,totalHoldings:allHoldings.length,uniqueStocks:holdingCodes.length}},
      'fetch-companies':{'companies':companyData.map(c=>({stockCode:c.code,stockName:c.name,source:c.pool,stage:c.stage,stageCode:c.stageCode,segment:c.segment,segmentCode:c.segmentCode,matchSource:c.matchSource,matchConfidence:c.matchConfidence,representativenessScore:c.representativenessScore,selectionReason:c.selectionReason,representativeEtfs:c.representativeEtfs,representativeIndices:c.representativeIndices})),'company-codes':companyCodes.join(',')},
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

/** A report comparison must never pick an unfinished worker's intermediate evaluation. */
export async function latestReportEvaluation(industryId:string,asOf:string,baselineSnapshotId?:string):Promise<Evaluation|null>{
  const rows=await prisma.aIAnalysisReport.findMany({where:{type:'comprehensive',industryId,createdAt:{lt:new Date(asOf)}},orderBy:{createdAt:'desc'},take:100,select:{id:true,title:true,createdAt:true,dataJson:true}})
  for(const row of rows){
    const data=parse<{researchEvaluation?:Evaluation;metadata?:{verificationMode?:string}}>(row.dataJson)
    const evaluation=data?.researchEvaluation
    if(!evaluation||data?.metadata?.verificationMode||evaluation.asOf>=asOf||evaluation.profile.industryId!==industryId||baselineSnapshotId&&evaluation.snapshotId!==baselineSnapshotId)continue
    return {...evaluation,baselineReport:{id:row.id,title:row.title,createdAt:row.createdAt.toISOString()}}
  }
  return null
}
