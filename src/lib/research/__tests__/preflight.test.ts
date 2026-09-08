/* eslint-disable @typescript-eslint/no-explicit-any -- Mutable scheduler doubles. */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
// Mutable scheduler doubles exercise claims, joining, polling and refresh ordering.
const state=vi.hoisted(()=>({subscriptions:[] as any[],runs:[] as any[],calendar:null as any,autoComplete:false}))
vi.mock('@/lib/db',()=>{
  const datasets=()=>state.subscriptions.flatMap(subscription=>subscription.datasets)
  const db:any={
    dataSubscription:{findMany:vi.fn(async()=>state.subscriptions)},
    rawPayload:{findFirst:vi.fn(async({where}:any)=>where.datasetKey==='research_calendar'?state.calendar:null)},
    subscriptionDataset:{
      updateMany:vi.fn(async({where,data}:any)=>{const row=datasets().find(item=>item.id===where.id);if(['running','queued'].includes(row.status))return {count:0};Object.assign(row,data);return {count:1}}),
      findMany:vi.fn(async()=>datasets()),
    },
    dataFetchRun:{
      create:vi.fn(async({data}:any)=>{const row={...data,id:'run-'+data.datasetId,dataset:datasets().find(item=>item.id===data.datasetId)};state.runs.push(row);return row}),
      findMany:vi.fn(async({where}:any)=>state.runs.filter(run=>(!where.id||where.id.in.includes(run.id))&&(!where.datasetId||where.datasetId.in.includes(run.datasetId))&&(!where.status||where.status.in.includes(run.status)))),
    },
    $transaction:vi.fn(async(fn:any)=>fn(db)),
  }
  return {prisma:db}
})
vi.mock('@/lib/subscription-dispatch',()=>({notifySubscriptionWorker:vi.fn(async()=>{
  if(state.autoComplete) for(const run of state.runs.filter(run=>run.status==='queued')) {run.status='success';run.dataset.status='success';run.dataset.lastSuccessAt=new Date()}
})}))
import {ensureResearchInputsFresh,researchDatasetWarnings,shouldRefreshResearchDataset} from '../preflight'

beforeEach(()=>{state.subscriptions=[];state.runs=[];state.calendar=null;state.autoComplete=false;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-07T06:17:00Z'))})
afterEach(()=>vi.useRealTimers())

describe('research preflight freshness',()=>{
  const now=new Date('2026-09-05T08:00:00Z')
  it('refreshes stale research data but not fresh or running datasets',()=>{
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:new Date('2026-09-05T05:00:00Z')},now)).toBe(true)
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:new Date('2026-09-05T07:30:00Z')},now)).toBe(false)
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:null},now)).toBe(false)
  })
  it('ignores non-research datasets',()=>expect(shouldRefreshResearchDataset({datasetKey:'etf_realtime',enabled:true,status:'success',lastSuccessAt:null},now)).toBe(false))
  it('keeps recent partial research bundles visible instead of calling them fresh',()=>{
    expect(researchDatasetWarnings([
      {datasetKey:'etf_research',enabled:true,status:'partial',lastError:'盘口数据不可用'},
      {datasetKey:'etf_research',enabled:true,status:'partial',lastError:'盘口数据不可用'},
      {datasetKey:'etf_daily',enabled:true,status:'success'},
    ])).toEqual(['etf_research：2个订阅仍为部分可用；盘口数据不可用'])
  })
  it('uses the local snapshot immediately for a quick rules review',async()=>{
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[{id:'d',datasetKey:'etf_research',enabled:true,status:'partial',lastSuccessAt:null,lastError:'盘口缺失'}]}]
    const result=await ensureResearchInputsFresh('industry-ai',{refresh:false})
    expect(result).toMatchObject({status:'warning',queued:0})
    expect(result.warnings[0]).toContain('未触发外部同步')
  })
})


describe('joining scheduler work',()=>{
  it('waits for an already running job instead of freezing its old data',async()=>{
    const dataset={id:'d',datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:null}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[dataset]}]
    state.runs=[{id:'existing',datasetId:'d',status:'running',dataset}]
    let resolved=false
    const pending=ensureResearchInputsFresh('industry-ai').then(result=>{resolved=true;return result})
    await vi.advanceTimersByTimeAsync(2000)
    expect(resolved).toBe(false)
    dataset.status='success';dataset.lastSuccessAt=new Date() as any;state.runs[0].status='success'
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toMatchObject({status:'fresh',queued:0,completed:1})
  })
  it('refreshes intraday quotes after the slow research job completes',async()=>{
    const slow={id:'slow',datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:null}
    const quote={id:'quote',datasetKey:'etf_realtime',enabled:true,status:'success',lastSuccessAt:new Date()}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[slow,quote]}]
    state.runs=[{id:'slow-run',datasetId:'slow',status:'running',dataset:slow}]
    state.calendar={payload:JSON.stringify([{date:'2026-09-07',is_open:1}])}
    state.autoComplete=true
    const pending=ensureResearchInputsFresh('industry-ai',{tradingSession:true})
    await vi.advanceTimersByTimeAsync(6*60*1000)
    expect(state.runs).toHaveLength(1)
    state.runs[0].status='success';slow.status='success'
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toMatchObject({status:'fresh',queued:1,completed:2})
    expect(quote.lastSuccessAt.getTime()).toBe(Date.now())
  })
  it('blocks a stuck existing job after the bounded wait',async()=>{
    const dataset={id:'d',datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:null}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[dataset]}]
    state.runs=[{id:'existing',datasetId:'d',status:'running',dataset}]
    const pending=ensureResearchInputsFresh('industry-ai')
    await vi.advanceTimersByTimeAsync(10*60*1000)
    expect(await pending).toMatchObject({status:'blocked'})
  })
})

it('checks the business session across partial bundles, not just their fetch time',async()=>{
  const {hasCurrentResearchSeries}=await import('../preflight')
  const payload=(data:unknown)=>JSON.stringify({data})
  expect(hasCurrentResearchSeries([payload({daily:[{trade_date:'20260904'}],factors:[{trade_date:'20260904'}],indexDaily:[{trade_date:'20260904'}]})],'2026-09-07')).toBe(false)
  expect(hasCurrentResearchSeries([payload({daily:[{trade_date:'20260907'}]}),payload({factors:[{trade_date:'20260907'}],indexDaily:[{trade_date:'20260907'}]})],'2026-09-07')).toBe(true)
})
