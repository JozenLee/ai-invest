/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately mutable Prisma test doubles; production boundaries are typed in store.ts. */
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({raw:[] as any[],daily:[] as any[],index:[] as any[],holdings:[] as any[],reports:[] as any[],historicalReports:[] as any[],announcements:[] as any[],subscriptions:[] as any[],quotes:[] as any[]}))
vi.mock('@/lib/db',()=>{
  const match=(r:any,w:any)=>!w||( (!w.id||r.id===w.id)&&(!w.datasetKey||typeof w.datasetKey==='object'||r.datasetKey===w.datasetKey)&&(!w.targetCode||typeof w.targetCode==='object'||r.targetCode===w.targetCode))
  const db:any={
    portfolio:{findFirst:vi.fn(async()=>null)},
    rawPayload:{findFirst:vi.fn(async({where}:any)=>state.raw.filter(r=>match(r,where)).sort((a,b)=>b.fetchedAt-a.fetchedAt)[0]||null),findMany:vi.fn(async()=>state.raw.filter(r=>!r.datasetKey.startsWith('research_evaluation')&&!r.datasetKey.startsWith('research_snapshot'))),findUnique:vi.fn(async({where}:any)=>state.raw.find(r=>r.id===where.id)||null),upsert:vi.fn(async({where,create}:any)=>{const existing=state.raw.find(r=>r.id===where.id);if(existing)return existing;const r={...create,fetchedAt:new Date()};state.raw.push(r);return r})},
    dataSubscription:{findMany:vi.fn(async()=>state.subscriptions)},eTFDaily:{findMany:vi.fn(async()=>state.daily)},indexDaily:{findMany:vi.fn(async()=>state.index)},eTFHolding:{findMany:vi.fn(async()=>state.holdings)},stockFinancialReport:{findMany:vi.fn(async()=>state.reports)},stockAnnouncement:{findMany:vi.fn(async()=>state.announcements)},stockDaily:{findMany:vi.fn(async()=>[])},marketQuote:{findMany:vi.fn(async()=>state.quotes)},newsArticle:{findMany:vi.fn(async()=>[])},aIAnalysisReport:{findMany:vi.fn(async()=>state.historicalReports)},
    $transaction:vi.fn(async(arg:any)=>typeof arg==='function'?arg(db):Promise.all(arg)),
  };return {prisma:db}
})
import {fixture} from './fixtures'
import {captureResearchSnapshot,persistEvaluation,readSnapshot,digest} from '../store'
import {evaluateResearch} from '../engine'
import {freezeResearchStep} from '@/lib/workflow/steps/freeze-research-step'
import {etfActionStep} from '@/lib/workflow/steps/etf-action-step'
import type {StepContext} from '@/lib/workflow/types'

beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-04T09:00:00Z'))
  for(const k of Object.keys(state) as Array<keyof typeof state>)state[k]=[]
  const f=fixture(),e=f.etfs[0],stamp=new Date('2026-09-04T08:00:00Z')
  const raw=(id:string,datasetKey:string,targetCode:string,payload:any)=>({id,datasetKey,targetCode,provider:'test-source',payload:JSON.stringify(payload),fetchedAt:stamp,contentHash:digest(payload)})
  state.raw=[raw('calendar','research_calendar','sh000001',{source:'Tushare/trade_cal',data:f.calendar.map(d=>({cal_date:d.date,is_open:d.open?1:0}))}),raw('profile','research_profile','ai',f.profile),raw('etf','etf_research',e.ticker,{data:{daily:e.bars.map(b=>({...b,trade_date:b.date,amount:b.amount/1000})),info:[{index_code:e.indexCode}],factors:e.factors.map(r=>({trade_date:r.date,adj_factor:r.factor})),indexDaily:e.indexBars,nav:[{nav_date:'20260904',ann_date:'20260904',unit_nav:e.product.nav,adj_nav:e.product.nav}]}}),raw('holdings','etf_holdings',e.ticker,[{stock_code:'600000',weight:60,report_period:'20260630',ann_date:'20260820',source:'Tushare/fund_portfolio'}])]
  state.raw.push(raw('graph','industry_graph','all',[{id:'ai',name:'测试领域',code:'test',version:1,revisionId:'revision-test',contentHash:'graph-hash',sourceUrls:['https://example.com/industry'],etfs:[{code:e.ticker}],stages:[{code:'upstream',name:'上游',segments:[{code:'a',name:'环节A',companies:[]},{code:'b',name:'环节B',companies:[]}]},{code:'midstream',name:'中游',segments:[{code:'c',name:'环节C',companies:[]},{code:'d',name:'环节D',companies:[]}]},{code:'downstream',name:'下游',segments:[{code:'e',name:'环节E',companies:[]},{code:'f',name:'环节F',companies:[]}]}],relations:[{sourceCode:'a',sourceName:'环节A',targetCode:'c',targetName:'环节C',type:'SUPPLIES',direction:'positive',weight:0.8,confidence:0.9,sourceUrls:['https://example.com/r1']},{sourceCode:'c',sourceName:'环节C',targetCode:'e',targetName:'环节E',type:'INFLUENCES',direction:'positive',weight:0.7,confidence:0.8,sourceUrls:['https://example.com/r2']}]}]))
  state.daily=e.bars.map(b=>({...b,ticker:e.ticker,date:new Date(b.date),id:b.date,amount:b.amount}))
  state.index=f.benchmarkBars.map(b=>({...b,code:'sh000300',date:new Date(b.date)}))
  state.holdings=[{id:'holding-one',etfCode:e.ticker,stockCode:'600000',stockName:'测试企业',weight:60,updateDate:stamp}]
  state.subscriptions=[{profile:JSON.stringify({industryId:'ai',industryName:'测试领域'}),instrument:{code:e.ticker,name:e.name}}]
  state.reports=['2026-06-30','2025-06-30'].map((period,i)=>({id:'financial-'+i,stockCode:'600000',reportPeriod:period,reportType:'income',publishDate:new Date(i?'2025-08-20':'2026-08-20'),fetchedAt:stamp,source:'Tushare',contentHash:'test',metricsJson:JSON.stringify({total_revenue:100,n_income:20,currency:'CNY'})}))
})
afterEach(()=>vi.useRealTimers())
describe('P0→P2 frozen workflow integration',()=>{
  it('captures source records, uses disclosed periods and replays without rereading mutable tables',async()=>{
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.etfs[0].holdings[0].period).toBe('2026-06-30')
    expect(snapshot.etfs[0].holdings[0].publishedAt).toBe('2026-08-20')
    expect(snapshot.etfs[0].bars[0].amount).toBe(50000000)
    expect(snapshot.companies[0].financialPeriods).toBe(2)
    expect(snapshot.records?.etf).toBeDefined()
    expect(snapshot.graphContext?.mappingRevisionId).toMatch(/^snapshot-/)
    expect(snapshot.graphContext?.mappingSource).toBe('frozen-graph-plus-disclosed-holdings')
    const result=await persistEvaluation(snapshot)
    state.daily=[];state.reports=[]
    const replay=await readSnapshot(snapshot.id)
    expect(evaluateResearch(replay)).toEqual(result)
    expect((await persistEvaluation(replay)).snapshotId).toBe(snapshot.id)
    expect(state.raw.filter(r=>r.datasetKey==='research_evaluation')).toHaveLength(1)
  })
  it('rejects checksum tampering and overwriting an existing snapshot',async()=>{
    const snapshot=await captureResearchSnapshot('ai');await persistEvaluation(snapshot)
    const altered=structuredClone(snapshot);altered.profile.rules.flowDays=10
    await expect(persistEvaluation(altered)).rejects.toThrow('禁止覆盖')
    state.raw.find(r=>r.id===snapshot.id).payload=JSON.stringify({...snapshot,asOf:'2020-01-01'})
    await expect(readSnapshot(snapshot.id)).rejects.toThrow('校验值')
  })
  it('merges independently successful fields across partial research bundles',async()=>{
    const old=state.raw.find(r=>r.id==='etf')
    const oldPayload=JSON.parse(old.payload)
    const newer={...old,id:'etf-partial',fetchedAt:new Date('2026-09-04T08:30:00Z'),payload:JSON.stringify({data:{daily:oldPayload.data.daily}})}
    state.raw.unshift(newer)
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.etfs[0].bars).toHaveLength(oldPayload.data.daily.length)
    expect(snapshot.etfs[0].factors).toHaveLength(oldPayload.data.factors.length)
    expect(snapshot.etfs[0].indexCode).toBe(oldPayload.data.info[0].index_code)
    expect(snapshot.etfs[0].evidenceIds).toEqual(expect.arrayContaining(['etf-partial','etf']))
  })
  it('keeps the newest available session when a later bundle regresses to an old capped page',async()=>{
    const old=state.raw.find(r=>r.id==='etf')
    const oldPayload=JSON.parse(old.payload)
    const staleDaily=oldPayload.data.daily.slice(0,90)
    state.raw.unshift({...old,id:'etf-stale-page',fetchedAt:new Date('2026-09-04T08:45:00Z'),payload:JSON.stringify({data:{daily:staleDaily}})})
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.etfs[0].bars).toHaveLength(oldPayload.data.daily.length)
    expect(snapshot.etfs[0].bars.at(-1)?.date).toBe('2026-09-04')
  })
  it('keeps normalized database amount units when research daily falls back to ETFDaily',async()=>{
    const raw=state.raw.find(r=>r.id==='etf'),payload=JSON.parse(raw.payload)
    payload.data.daily=[];raw.payload=JSON.stringify(payload)
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.etfs[0].bars[0].amount).toBe(50000000)
  })
  it('uses a verified close snapshot for the expected session after midnight and normalizes Tushare amount units',async()=>{
    vi.setSystemTime(new Date('2026-09-05T01:00:00Z'))
    const fetchedAt=new Date('2026-09-04T07:05:00Z')
    state.quotes=[
      {id:'etf-quote',instrumentType:'ETF',code:'159995',price:2,previousClose:1.9,open:1.95,high:2.01,low:1.94,volume:100,amount:123456,changePct:5,tradeDate:'2026-09-04',source:'tushare_daily',fetchedAt},
      {id:'index-quote',instrumentType:'INDEX',code:'sh000300',price:4500,previousClose:4450,open:4460,high:4510,low:4440,volume:100,amount:456789,changePct:1,tradeDate:'2026-09-04',source:'index_realtime',fetchedAt},
    ]
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.etfs[0].bars.at(-1)).toMatchObject({date:'2026-09-04',close:2,amount:123456000})
    expect(snapshot.benchmarkBars.at(-1)).toMatchObject({date:'2026-09-04',close:4500})
  })
  it('uses the latest current index valuation without inventing a historical percentile',async()=>{
    const current=state.raw.find(r=>r.id==='etf'),payload=JSON.parse(current.payload)
    payload.data.indexValuation=[{trade_date:'20260904',pe_ttm:20,pb:2}];current.payload=JSON.stringify(payload)
    state.raw.push({...current,id:'etf-valuation-older',fetchedAt:new Date('2026-09-03T08:00:00Z'),payload:JSON.stringify({data:{indexValuation:[{trade_date:'20260903',pe_ttm:19,pb:1.9}]}})})
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.etfs[0].product.pe).toBe(20)
    expect(snapshot.etfs[0].product.pePercentile5y).toBeUndefined()
  })
  it('computes a labelled percentile only from the available frozen valuation history',async()=>{
    const current=state.raw.find(r=>r.id==='etf'),payload=JSON.parse(current.payload)
    payload.data.indexValuation=Array.from({length:30},(_,index)=>({trade_date:`202608${String(index+1).padStart(2,'0')}`,pe_ttm:10+index,pb:1+index/10}))
    current.payload=JSON.stringify(payload)
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.etfs[0].product).toMatchObject({pe:39,pePercentileHistory:100,valuationSampleCount:30,valuationHistoryStart:'2026-08-01'})
  })
  it('runs freeze, all data projections and ETF decision steps without AI or collection',async()=>{
    const artifacts=new Map<string,any>()
    const ctx:StepContext={runId:'run',stepId:'step',input:{industryId:'ai'},artifacts,updateProgress:vi.fn(),saveArtifact:async(k,v)=>{artifacts.set(k,v)}}
    const network=vi.spyOn(globalThis,'fetch')
    await freezeResearchStep.execute(ctx)
    const snapshot=artifacts.get('research-snapshot')
    expect(snapshot.records).toBeUndefined()
    expect(state.raw.some(row=>row.id===snapshot.id&&row.datasetKey==='research_snapshot')).toBe(true)
    for(const projection of Object.values(snapshot.projections))for(const [key,value] of Object.entries(projection as object))await ctx.saveArtifact(key,value)
    await etfActionStep.execute(ctx)
    expect(artifacts.get('etf-actions')).toHaveLength(1)
    expect(artifacts.get('strategy-validation')).toMatchObject({validation:'insufficient-history'})
    expect(artifacts.get('research-evaluation').validation).toBe('experimental-not-backtest-validated')
    expect(network).not.toHaveBeenCalled();network.mockRestore()
  })
  it('freezes the latest report per trading day as historical analysis context',async()=>{
    state.historicalReports=[
      {id:'older',industryId:'ai',industryName:'测试领域',title:'旧版',summary:'旧',createdAt:new Date('2026-09-03T08:00:00Z'),dataJson:JSON.stringify({researchEvaluation:{expectedSession:'2026-09-03',decisions:[]}})},
      {id:'latest',industryId:'ai',industryName:'测试领域',title:'新版',summary:'新',createdAt:new Date('2026-09-03T09:00:00Z'),dataJson:JSON.stringify({researchEvaluation:{expectedSession:'2026-09-03',decisions:[]}})},
    ]
    const snapshot=await captureResearchSnapshot('ai')
    expect(snapshot.historicalReports?.map(item=>item.reportId)).toEqual(['latest'])
  })
})

it('uses fresh realtime books even when the research bundle has no book',async()=>{
  vi.setSystemTime(new Date('2026-09-07T06:17:00Z'))
  const base=state.raw.find(row=>row.id==='etf')
  state.raw.unshift({...base,id:'live-book',datasetKey:'etf_realtime',fetchedAt:new Date('2026-09-07T06:16:30Z'),payload:JSON.stringify([
    {'代码':'159995',bid:1,ask:1.001,bookDate:'2026-09-07',bookPublishedAt:'2026-09-07T06:16:00Z',bookSource:'tencent/orderbook'},
  ])})
  const snapshot=await captureResearchSnapshot('ai')
  expect(snapshot.etfs[0].product.bookDate).toBe('2026-09-07')
  expect(snapshot.etfs[0].product.spreadBps).toBeCloseTo(9.995)
  expect(snapshot.etfs[0].product.evidenceIds).toContain('live-book')
  expect(evaluateResearch(snapshot).decisions[0].conditions.find(item=>item.key==='spread')?.status).toBe('met')
})

it('preserves actual public observation time without inventing publication dates',async()=>{
  const raw=state.raw.find(row=>row.id==='holdings')
  raw.payload=JSON.stringify([{stock_code:'600000',weight:60,weight_available:true,report_period:'2026年2季度 截止至：2026-06-30',source:'eastmoney_public_direct'}])
  const snapshot=await captureResearchSnapshot('ai')
  expect(snapshot.etfs[0].holdings[0]).toMatchObject({period:'2026-06-30',publishedAt:null,observedAt:'2026-09-04T08:00:00.000Z'})
  expect(evaluateResearch(snapshot).decisions[0].conditions.find(item=>item.key==='holdings')?.value).toBe(60)
})

it('deduplicates legacy Hong Kong holdings and retains financial explanations',async()=>{
  const raw=state.raw.find(row=>row.id==='holdings')
  raw.payload=JSON.stringify(['00700.HK','0700.HK'].map(stock_code=>({stock_code,weight:10,report_period:'20260630',ann_date:'20260820'})))
  const snapshot=await captureResearchSnapshot('ai')
  expect(snapshot.companies.filter(company=>company.code==='700.hk')).toHaveLength(1)
  expect(snapshot.companies.find(company=>company.code==='700.hk')?.financialGaps).toContain('缺少利润表')
})

it('combines a newly fetched session with existing history and factors',async()=>{
  vi.setSystemTime(new Date('2026-09-07T09:00:00Z'))
  const prior=state.raw.find(row=>row.id==='etf'),data=JSON.parse(prior.payload).data
  const last=data.daily.at(-1)
  state.raw.unshift({...prior,id:'current-session',fetchedAt:new Date('2026-09-07T08:00:00Z'),payload:JSON.stringify({data:{
    daily:[{...last,date:'2026-09-07',trade_date:'20260907'}],
    factors:[{trade_date:'20260907',adj_factor:1}],
    indexDaily:[{...data.indexDaily.at(-1),date:'2026-09-07',trade_date:'20260907'}],
  }})})
  const snapshot=await captureResearchSnapshot('ai')
  expect(snapshot.etfs[0].bars.length).toBeGreaterThan(120)
  expect(snapshot.etfs[0].bars.at(-1)?.date).toBe('2026-09-07')
  expect(snapshot.etfs[0].factors.at(-1)?.date).toBe('2026-09-07')
  expect(snapshot.etfs[0].evidenceIds).toEqual(expect.arrayContaining(['current-session','etf']))
})

it('does not count the same Hong Kong holding twice under legacy codes',async()=>{
  const raw=state.raw.find(row=>row.id==='holdings')
  raw.payload=JSON.stringify(['00700.HK','0700.HK'].map(stock_code=>({stock_code,weight:10,report_period:'20260630',ann_date:'20260820'})))
  const snapshot=await captureResearchSnapshot('ai')
  expect(snapshot.etfs[0].holdings).toHaveLength(1)
  expect(evaluateResearch(snapshot).decisions[0].metrics.disclosedWeightPct).toBe(10)
})

it('chooses a completed report baseline instead of a newer intermediate evaluation',async()=>{
  const {latestReportEvaluation}=await import('../store')
  const completed=evaluateResearch(fixture())
  completed.asOf='2026-09-04T07:00:00Z'
  state.historicalReports=[{id:'completed-report',title:'完整报告',createdAt:new Date('2026-09-04T08:00:00Z'),dataJson:JSON.stringify({researchEvaluation:completed,metadata:{kind:'analysis'}})}]
  const intermediate={...completed,snapshotId:'unfinished',asOf:'2026-09-04T08:30:00Z'}
  state.raw.push({id:'unfinished:evaluation',datasetKey:'research_evaluation',targetCode:'ai',payload:JSON.stringify(intermediate),fetchedAt:new Date('2026-09-04T08:30:00Z')})
  expect(await latestReportEvaluation('ai','2026-09-04T09:00:00Z')).toMatchObject({snapshotId:completed.snapshotId,baselineReport:{id:'completed-report'}})
  expect(await latestReportEvaluation('ai','2026-09-04T09:00:00Z','unfinished')).toBeNull()
})

it('hides paper returns until the walk-forward sample threshold is met',async()=>{
  const {historicalStrategyValidation}=await import('../store')
  const snapshot=fixture(),current=evaluateResearch(snapshot),previous=structuredClone(current)
  previous.snapshotId='prior';previous.asOf='2026-09-03T09:00:00.000Z';previous.expectedSession='2026-09-03'
  state.historicalReports=[{id:'prior-report',industryId:'ai',industryName:'测试领域',title:'前序报告',createdAt:new Date(previous.asOf),dataJson:JSON.stringify({researchEvaluation:previous})}]
  const validation=await historicalStrategyValidation(snapshot,current)
  expect(validation).toMatchObject({validation:'insufficient-history',status:'insufficient',thresholds:{minimumObservations:252,minimumTrades:30},forecastCalibration:{status:'insufficient-outcomes',minimumOutcomes:30}})
  expect(validation.results.every((row:any)=>row.performanceUsable===false&&row.returnPct===null&&row.excessReturnPct===null)).toBe(true)
})

it('reuses only explicitly matching index observations without importing another ETF factors',async()=>{
  const source=state.raw.find(r=>r.id==='etf'),payload=JSON.parse(source.payload)
  const indexCode=payload.data.info[0].index_code
  const missing=payload.data.indexDaily.pop()
  source.payload=JSON.stringify(payload)
  state.raw.unshift({...source,id:'shared-index',targetCode:'159801',payload:JSON.stringify({data:{indexDaily:[{...missing,ts_code:indexCode}],factors:[{trade_date:missing.trade_date,adj_factor:999}]}})})
  const snapshot=await captureResearchSnapshot('ai')
  expect(snapshot.etfs[0].indexBars.at(-1)?.date).toBe('2026-09-04')
  expect(snapshot.etfs[0].factors.some(item=>item.factor===999)).toBe(false)
})
