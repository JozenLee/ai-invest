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

  it('does not manufacture an independent session from an invalid calendar fallback',()=>{
    const snapshot=fixture(),valid=evaluateResearch(snapshot),invalid={...structuredClone(valid),expectedSession:null,calendarVerified:false}
    const summary=summarizeValidation([
      {snapshot:compactReplaySnapshot(snapshot),evaluation:valid},
      {snapshot:{...compactReplaySnapshot(snapshot),id:'invalid',asOf:'2026-09-05T09:00:00Z'},evaluation:invalid},
    ])
    expect(summary.sessionCount).toBe(1)
    expect(summary.usableSnapshotCount).toBe(1)
  })

  it('deduplicates repeated reviews from the same trading session',()=>{
    const snapshot=fixture(),evaluation=evaluateResearch(snapshot),compact=compactReplaySnapshot(snapshot)
    const repeated={...structuredClone(compact),id:'repeat',asOf:'2026-09-05T10:00:00Z'}
    const repeatedEvaluation={...structuredClone(evaluation),snapshotId:'repeat'}
    const summary=summarizeValidation([{snapshot:compact,evaluation},{snapshot:repeated,evaluation:repeatedEvaluation}])
    expect(summary.snapshotCount).toBe(2)
    expect(summary.usableSnapshotCount).toBe(1)
    expect(summary.duplicateSnapshotCount).toBe(1)
    expect(summary.lookAheadViolations).toBe(0)
  })
})
