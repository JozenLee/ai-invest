import {describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({subscriptions:[] as Array<{instrument:{type:string;code:string};profile:string;datasets:Array<{id:string;datasetKey:string;enabled:boolean;status:string;lastSuccessAt:Date|null;lastError?:string|null}>}>}))
vi.mock('@/lib/db',()=>({prisma:{dataSubscription:{findMany:vi.fn(async()=>state.subscriptions)},rawPayload:{findFirst:vi.fn(async()=>null)}}}))
vi.mock('@/lib/subscription-dispatch',()=>({notifySubscriptionWorker:vi.fn()}))
import {ensureResearchInputsFresh,researchDatasetWarnings,shouldRefreshResearchDataset} from '../preflight'

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
