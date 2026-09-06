import { describe, expect, it } from 'vitest'
import { assessDecisionTiming, effectiveDecisionTiming, isNearCloseDecisionWindow } from '../decision-timing'

const calendar = [
  { date: '2026-09-03', open: true },
  { date: '2026-09-04', open: true },
  { date: '2026-09-05', open: false },
  { date: '2026-09-06', open: false },
]

describe('decision timing', () => {
  it('allows a near-close report only when quote and event checks are current', () => {
    const timing = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:27:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:15:00.000Z' }],
    })
    expect(timing).toMatchObject({ status: 'execution-ready', phase: 'decision-window', closeDataSession: '2026-09-03', executionReady: true })
    expect(timing.validUntil).toBe('2026-09-04T06:55:00.000Z')
  })

  it('downgrades non-trading and stale intraday inputs to reference only', () => {
    const weekend = assessDecisionTiming({ asOf: '2026-09-05T06:30:00.000Z', calendar, expectedTickers: ['159995'], quotes: [], eventChecks: [] })
    expect(weekend.status).toBe('reference-only')
    expect(weekend.reasons).toContain('生成时点不是沪深交易日')
    const stale = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:20:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:00:00.000Z' }],
    })
    expect(stale.executionReady).toBe(false)
    expect(stale.reasons.join('；')).toContain('实时行情')
    expect(stale.reasons.join('；')).toContain('公告检查')
  })

  it('expires an otherwise executable report after the order buffer', () => {
    const current = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:29:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:20:00.000Z' }],
    })
    expect(effectiveDecisionTiming(current, '2026-09-04T06:54:59.000Z').executionReady).toBe(true)
    expect(effectiveDecisionTiming(current, '2026-09-04T06:55:01.000Z').executionReady).toBe(false)
    expect(isNearCloseDecisionWindow('2026-09-04T06:30:00.000Z')).toBe(true)
  })
})
