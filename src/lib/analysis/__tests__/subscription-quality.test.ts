import { describe, it, expect } from 'vitest'
import { assessSubscriptionQuality } from '../subscription-quality'
describe('subscription quality gate', () => {
  const now = Date.parse('2026-09-04T12:00:00Z')
  const valid = { dataDate: '2026-09-03', history: Array(60).fill({}) }
  it('blocks empty, stale, future and short history', () => {
    for (const rows of [[], [{ ...valid, dataDate: '2020-01-01' }], [{ ...valid, dataDate: '2030-01-01' }], [{ ...valid, history: [] }]]) expect(assessSubscriptionQuality(rows, 1, now).status).toBe('blocked')
  })
  it('limits conclusions for low coverage', () => { expect(assessSubscriptionQuality([valid], 5, now).status).toBe('limited') })
  it('allows sufficient coverage', () => { expect(assessSubscriptionQuality([valid], 1, now).status).toBe('available') })
})
