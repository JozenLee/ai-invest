/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately mutable Prisma test doubles; production boundaries are typed in store.ts. */
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({raw:[] as any[],daily:[] as any[],index:[] as any[],holdings:[] as any[],reports:[] as any[],announcements:[] as any[],subscriptions:[] as any[]}))
vi.mock('@/lib/db',()=>{
  const match=(r:any,w:any)=>!w||( (!w.id||r.id===w.id)&&(!w.datasetKey||typeof w.datasetKey==='object'||r.datasetKey===w.datasetKey)&&(!w.targetCode||typeof w.targetCode==='object'||r.targetCode===w.targetCode))
  const db:any={
    rawPayload:{findFirst:vi.fn(async({where}:any)=>state.raw.filter(r=>match(r,where)).sort((a,b)=>b.fetchedAt-a.fetchedAt)[0]||null),findMany:vi.fn(async()=>state.raw.filter(r=>!r.datasetKey.startsWith('research_evaluation')&&!r.datasetKey.startsWith('research_snapshot'))),findUnique:vi.fn(async({where}:any)=>state.raw.find(r=>r.id===where.id)||null),upsert:vi.fn(async({where,create}:any)=>{const existing=state.raw.find(r=>r.id===where.id);if(existing)return existing;const r={...create,fetchedAt:new Date()};state.raw.push(r);return r})},
    dataSubscription:{findMany:vi.fn(async()=>state.subscriptions)},eTFDaily:{findMany:vi.fn(async()=>state.daily)},indexDaily:{findMany:vi.fn(async()=>state.index)},eTFHolding:{findMany:vi.fn(async()=>state.holdings)},stockFinancialReport:{findMany:vi.fn(async()=>state.reports)},stockAnnouncement:{findMany:vi.fn(async()=>state.announcements)},stockDaily:{findMany:vi.fn(async()=>[])},newsArticle:{findMany:vi.fn(async()=>[])},
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
  state.daily=e.bars.map(b=>({...b,ticker:e.ticker,date:new Date(b.date),id:b.date,amount:b.amount/1000}))
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
  it('runs freeze, all data projections and ETF decision steps without AI or collection',async()=>{
    const artifacts=new Map<string,any>()
    const ctx:StepContext={runId:'run',stepId:'step',input:{industryId:'ai'},artifacts,updateProgress:vi.fn(),saveArtifact:async(k,v)=>{artifacts.set(k,v)}}
    const network=vi.spyOn(globalThis,'fetch')
    await freezeResearchStep.execute(ctx)
    const snapshot=artifacts.get('research-snapshot')
    for(const projection of Object.values(snapshot.projections))for(const [key,value] of Object.entries(projection as object))await ctx.saveArtifact(key,value)
    await etfActionStep.execute(ctx)
    expect(artifacts.get('etf-actions')).toHaveLength(1)
    expect(artifacts.get('research-evaluation').validation).toBe('experimental-not-backtest-validated')
    expect(network).not.toHaveBeenCalled();network.mockRestore()
  })
})
