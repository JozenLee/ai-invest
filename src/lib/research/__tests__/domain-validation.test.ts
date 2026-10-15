import { describe, expect, it, vi } from 'vitest'
import type { ResearchSnapshot } from '../contracts'
import type { DomainResearch } from '@/lib/workflow/domain-research'
vi.mock('../engine',()=>({adjustedBars:(etf:{bars:unknown[]})=>({adjusted:true,discontinuity:false,bars:etf.bars}),validBars:(bars:unknown[])=>bars}))
import { validateDomainHistory } from '../domain-validation'
const bars=Array.from({length:20},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,open:100,close:110}))
const snapshot={asOf:'2026-10-15T08:00:00Z',benchmarkBars:bars.map(row=>({...row,close:105})),etfs:[{ticker:'588200',bars}]} as unknown as ResearchSnapshot
const history={version:1,status:'completed',inputHash:'h',snapshotId:'s',asOf:'2026-08-30T08:00:00Z',generatedAt:'2026-08-31T08:00:00Z',opinion:{products:[{ticker:'588200'}],tactical:{stance:'等待确认'}}} as DomainResearch
describe('domain forward observation',()=>{
  it('starts after generation, deduplicates and does not invent a strategy winner',()=>{
    const result=validateDomainHistory([history,history],snapshot)
    expect(result.matured).toBe(1)
    expect(result.samples[0].proxyReturnPct).toBeCloseTo(10)
    expect(result.samples[0].excessReturnPct).toBeCloseTo(5)
    expect(result.performanceWinner).toBeNull()
  })
  it('does not score historical replays against prices known before generation',()=>{
    expect(validateDomainHistory([{...history,generatedAt:'2026-10-15T01:00:00Z'}],snapshot)).toMatchObject({matured:0,pending:1})
  })
  it('excludes inconsistent timestamps and unavailable proxies',()=>{
    expect(validateDomainHistory([{...history,generatedAt:'2026-01-01T00:00:00Z'}],snapshot).excluded).toBe(1)
    expect(validateDomainHistory([history],{...snapshot,etfs:[]}).excluded).toBe(1)
  })
})
