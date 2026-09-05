import { describe, expect, it } from 'vitest'
import { fixture } from './fixtures'
import { evaluateResearch } from '../engine'
import { compactReplaySnapshot } from '../replay'
import { summarizeValidation } from '../validation'

describe('walk-forward validation gate', () => {
  it('keeps a short history at watch-only', () => {
    const snapshot = fixture()
    const summary = summarizeValidation([{ snapshot: compactReplaySnapshot(snapshot), evaluation: evaluateResearch(snapshot) }])
    expect(summary.tradeApproved).toBe(false)
    expect(summary.requirements.find(item => item.key === 'sessions')?.met).toBe(false)
  })

  it('removes non-replay evidence from the compact ledger', () => {
    const compact = compactReplaySnapshot(fixture())
    expect(compact.evidence).toEqual([])
    expect(compact.etfs[0].bars.length).toBeGreaterThan(100)
    expect(compact.etfs[0].holdings).toEqual([])
  })
})
