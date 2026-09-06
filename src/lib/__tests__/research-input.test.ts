import { describe, it, expect } from 'vitest'
import { compactEvidence, marketSignals, newsSignals, researchEvidence } from '../workflow/research-input'
import type { StepContext } from '../workflow/types'

describe('decision-focused evidence', () => {
  it('removes operational noise while preserving zero, dates, sources and limitations', () => {
    expect(compactEvidence({ dataPoints: 100, history: [1,2], rules: {a:1}, missing: null, empty: [], price: 0, source: '交易所', date: '2026-09-04', stale: true })).toEqual({ price: 0, source: '交易所', date: '2026-09-04', stale: true })
  })
  it('preserves upstream claim citations instead of confusing them with raw snapshots', () => {
    const citations=[{claim:'观察',source:'交易所',date:'2026-09-04'}]
    expect(compactEvidence({evidence:citations})).toEqual({evidence:citations})
  })
  it('turns MA levels into distance and removes unverified technicals', () => {
    const row = { ticker: 'ETF',price:110,changePct:0,keyIndicators:{trend:{ma:{ma20:100}}},volatility:25,data_points:60 }
    expect(marketSignals([row])[0].indicators.distanceToMA20Pct).toBe(10)
    expect(marketSignals([{...row,qualityWarning:'断点'}])[0].indicators).toBeUndefined()
    expect(marketSignals([row])[0].dailyChangePct).toBe(0)
  })
  it('deduplicates and bounds news snippets', () => {
    const rows = Array.from({length:30},(_,i)=>({title:'新闻'+i,content:'甲'.repeat(1000)}))
    const result=newsSignals([...rows,rows[0]])
    expect(result).toHaveLength(16)
    expect(result.every(r=>r.excerpt.length<=320)).toBe(true)
  })
  it('public evidence never includes private portfolio and expands upstream JSON once', () => {
    const context={artifacts:new Map<string,any>([['industry-info',{name:'AI算力硬件'}],['market-analysis','{"analysis":"观察","score":null}'],['portfolio-evidence',{secret:'PRIVATE'}]])} as StepContext
    const evidence=researchEvidence(context,'industry-overview')
    expect(evidence.market).toEqual({analysis:'观察'})
    expect(JSON.stringify(evidence)).not.toContain('PRIVATE')
  })
})
