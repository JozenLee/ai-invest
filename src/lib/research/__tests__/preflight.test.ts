/* eslint-disable @typescript-eslint/no-explicit-any -- Mutable scheduler doubles. */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
// Mutable scheduler doubles exercise claims, joining, polling and refresh ordering.
const state=vi.hoisted(()=>({subscriptions:[] as any[],runs:[] as any[],calendar:null as any,graph:null as any,profile:null as any,quotes:[] as any[],autoComplete:false,completionStatus:'success'}))
vi.mock('@/lib/db',()=>{
  const datasets=()=>state.subscriptions.flatMap(subscription=>subscription.datasets)
  const db:any={
    dataSubscription:{findMany:vi.fn(async()=>state.subscriptions)},
    rawPayload:{findFirst:vi.fn(async({where}:any)=>where.datasetKey==='research_calendar'?state.calendar:where.datasetKey==='industry_graph'?state.graph:where.datasetKey==='research_profile'?state.profile:null),findMany:vi.fn(async()=>[])},
    marketQuote:{findMany:vi.fn(async()=>state.quotes)},
    subscriptionDataset:{
      updateMany:vi.fn(async({where,data}:any)=>{const row=datasets().find(item=>item.id===where.id);if(['running','queued'].includes(row.status))return {count:0};Object.assign(row,data);return {count:1}}),
      findMany:vi.fn(async()=>datasets()),
    },
    dataFetchRun:{
      create:vi.fn(async({data}:any)=>{const row={...data,id:`run-${data.datasetId}-${state.runs.length}`,dataset:datasets().find(item=>item.id===data.datasetId)};state.runs.push(row);return row}),
      findMany:vi.fn(async({where}:any)=>state.runs.filter(run=>(!where.id||where.id.in.includes(run.id))&&(!where.datasetId||where.datasetId.in.includes(run.datasetId))&&(!where.status||where.status.in.includes(run.status)))),
    },
    $transaction:vi.fn(async(fn:any)=>fn(db)),
  }
  return {prisma:db}
})
vi.mock('@/lib/subscription-dispatch',()=>({notifySubscriptionWorker:vi.fn(async()=>{
  if(state.autoComplete) for(const run of state.runs.filter(run=>run.status==='queued')) {run.status=state.completionStatus;run.error=state.completionStatus==='success'?null:'瞬时失败';run.dataset.status=state.completionStatus;if(state.completionStatus==='success')run.dataset.lastSuccessAt=new Date()}
})}))
import {ensureResearchInputsFresh,researchDatasetWarnings,shouldRefreshResearchDataset} from '../preflight'

beforeEach(()=>{state.subscriptions=[];state.runs=[];state.calendar=null;state.graph=null;state.profile=null;state.quotes=[];state.autoComplete=false;state.completionStatus='success';vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-07T06:17:00Z'))})
afterEach(()=>vi.useRealTimers())

describe('research preflight freshness',()=>{
  const now=new Date('2026-09-05T08:00:00Z')
  it('refreshes stale research data but not fresh or running datasets',()=>{
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:new Date('2026-09-04T07:00:00Z')},now,24*60*60*1000)).toBe(true)
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:new Date('2026-09-05T05:00:00Z')},now,24*60*60*1000)).toBe(false)
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:new Date('2026-09-05T07:30:00Z')},now)).toBe(false)
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:null},now)).toBe(false)
  })
  it('ignores non-research datasets',()=>expect(shouldRefreshResearchDataset({datasetKey:'etf_realtime',enabled:true,status:'success',lastSuccessAt:null},now)).toBe(false))
  it('joins stale financial evidence before freezing a quality-scored report',()=>expect(shouldRefreshResearchDataset({datasetKey:'stock_financial',enabled:true,status:'partial',lastSuccessAt:new Date('2026-09-03T00:00:00Z')},now)).toBe(true))
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
  it('scopes index subscriptions to the global anchor and configured benchmark',async()=>{
    const dataset=(id:string)=>({id,datasetKey:'index_realtime',enabled:true,status:'failed',lastSuccessAt:null,lastError:'empty'})
    state.subscriptions=[
      {instrument:{type:'INDEX',code:'sh000001'},profile:'market_index',datasets:[dataset('global')]},
      {instrument:{type:'INDEX',code:'sh000300'},profile:'market_index',datasets:[dataset('benchmark')]},
      {instrument:{type:'INDEX',code:'sz399363'},profile:'market_index',datasets:[dataset('unrelated')]},
    ]
    const result=await ensureResearchInputsFresh('industry-ai',{refresh:false})
    expect(result.warnings).toEqual(['本轮未触发外部同步，使用当前本地订阅快照','index_realtime：1个订阅（1个失败）仍为部分可用；empty'])
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
    const pending=ensureResearchInputsFresh('industry-ai')
    await vi.advanceTimersByTimeAsync(6*60*1000)
    expect(state.runs).toHaveLength(1)
    state.runs[0].status='success';slow.status='success'
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toMatchObject({status:'fresh',queued:1,completed:2})
    expect(quote.lastSuccessAt.getTime()).toBe(Date.now())
  })
  it('refreshes current-session quotes during the lunch recess',async()=>{
    vi.setSystemTime(new Date('2026-09-16T03:38:00Z'))
    const quote={id:'quote',datasetKey:'etf_realtime',enabled:true,status:'success',lastSuccessAt:new Date(Date.now()-10*60*1000)}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[quote]}]
    state.calendar={payload:JSON.stringify([{date:'2026-09-16',is_open:1}])}
    state.autoComplete=true
    const result=await ensureResearchInputsFresh('industry-ai')
    expect(result).toMatchObject({status:'fresh',queued:1,completed:1})
    expect(quote.lastSuccessAt.getTime()).toBe(Date.now())
  })
  it('does not join an in-flight refresh when its verified snapshot is still fresh',async()=>{
    const dataset={id:'d',datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:new Date()}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[dataset]}]
    state.runs=[{id:'existing',datasetId:'d',status:'running',dataset}]
    await expect(ensureResearchInputsFresh('industry-ai')).resolves.toMatchObject({status:'fresh',queued:0,completed:0})
  })
  it('reuses verified five-minute quotes when the final refresh fails transiently',async()=>{
    const old=new Date(Date.now()-6*60*1000)
    const etf={id:'etf-live',datasetKey:'etf_realtime',enabled:true,status:'success',lastSuccessAt:old}
    const index={id:'index-live',datasetKey:'index_realtime',enabled:true,status:'success',lastSuccessAt:old}
    state.subscriptions=[
      {instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[etf]},
      {instrument:{type:'INDEX',code:'sh000300'},profile:'market_index',datasets:[index]},
    ]
    state.calendar={payload:JSON.stringify([{date:'2026-09-07',is_open:1}])}
    state.quotes=[{code:'159995'},{code:'sh000300'}]
    state.autoComplete=true
    state.completionStatus='failed'
    const result=await ensureResearchInputsFresh('industry-ai',{tradingSession:true})
    expect(result.status).toBe('warning')
    expect(result.warnings.some(message=>message.includes('沿用5分钟内已验证快照'))).toBe(true)
  })
  it('does not count a transient research refresh failure as unavailable when a prior snapshot exists',async()=>{
    const prior=new Date(Date.now()-25*60*60*1000)
    const dataset={id:'research',datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:prior}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[dataset]}]
    state.autoComplete=true
    state.completionStatus='failed'
    const result=await ensureResearchInputsFresh('industry-ai')
    expect(result).toMatchObject({status:'warning',failed:0,partial:1})
    expect(result.warnings.some(message=>message.includes('沿用最近成功快照'))).toBe(true)
  })
  it('blocks a stuck existing job after the bounded wait',async()=>{
    const dataset={id:'d',datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:null}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[dataset]}]
    state.runs=[{id:'existing',datasetId:'d',status:'running',dataset}]
    const pending=ensureResearchInputsFresh('industry-ai')
    await vi.advanceTimersByTimeAsync(12*60*1000)
    expect(await pending).toMatchObject({status:'blocked'})
  })
  it('keeps a slow financial refresh as a quality warning instead of blocking session data',async()=>{
    const dataset={id:'financial',datasetKey:'stock_financial',enabled:true,status:'running',lastSuccessAt:new Date('2026-09-01T00:00:00Z')}
    state.subscriptions=[{instrument:{type:'ETF',code:'159995'},profile:'industry-ai',datasets:[dataset]}]
    state.runs=[{id:'financial-run',datasetId:'financial',status:'running',dataset}]
    const result=await ensureResearchInputsFresh('industry-ai')
    expect(result.status).toBe('warning')
    expect(result.warnings).toContain('财报回填仍在后台继续；本轮冻结最近完整财报缓存，不读取半写入结果')
  })
})

it('checks the business session across partial bundles, not just their fetch time',async()=>{
  const {hasCurrentResearchSeries}=await import('../preflight')
  const payload=(data:unknown)=>JSON.stringify({data})
  expect(hasCurrentResearchSeries([payload({daily:[{trade_date:'20260904'}],factors:[{trade_date:'20260904'}],indexDaily:[{trade_date:'20260904'}]})],'2026-09-07')).toBe(false)
  expect(hasCurrentResearchSeries([payload({daily:[{trade_date:'20260907'}]}),payload({factors:[{trade_date:'20260907'}],indexDaily:[{trade_date:'20260907'}]})],'2026-09-07')).toBe(true)
  expect(hasCurrentResearchSeries([payload({daily:[{trade_date:'20260907'}],factors:[{trade_date:'20260907'}]})],'2026-09-07')).toBe(true)
})
