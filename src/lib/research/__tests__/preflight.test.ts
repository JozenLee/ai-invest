import {describe,expect,it,vi} from 'vitest'
vi.mock('@/lib/db',()=>({prisma:{}}))
vi.mock('@/lib/subscription-dispatch',()=>({notifySubscriptionWorker:vi.fn()}))
import {shouldRefreshResearchDataset} from '../preflight'

describe('research preflight freshness',()=>{
  const now=new Date('2026-09-05T08:00:00Z')
  it('refreshes stale research data but not fresh or running datasets',()=>{
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:new Date('2026-09-05T05:00:00Z')},now)).toBe(true)
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'success',lastSuccessAt:new Date('2026-09-05T07:30:00Z')},now)).toBe(false)
    expect(shouldRefreshResearchDataset({datasetKey:'etf_research',enabled:true,status:'running',lastSuccessAt:null},now)).toBe(false)
  })
  it('ignores non-research datasets',()=>expect(shouldRefreshResearchDataset({datasetKey:'etf_realtime',enabled:true,status:'success',lastSuccessAt:null},now)).toBe(false))
})
