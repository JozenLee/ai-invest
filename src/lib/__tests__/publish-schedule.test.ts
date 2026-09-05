import { describe, it, expect } from 'vitest'
import { DEFAULT_PUBLISH_SCHEDULE, dueSlots, validatePublishSchedule } from '../publish-schedule-config'
import { financialRatios, freshEvidence } from '../analysis/evidence'
import { toDailyData } from '../market-detail'

describe('automated publishing safety', () => {
  it('defaults to private and requires explicit activation and industries', () => {
    expect(DEFAULT_PUBLISH_SCHEDULE.visibility).toBe('仅自己可见')
    expect(DEFAULT_PUBLISH_SCHEDULE.times).toEqual(['12:30', '14:30'])
    expect(dueSlots(DEFAULT_PUBLISH_SCHEDULE, new Date('2026-09-04T04:30:00Z'))).toEqual([])
    expect(() => validatePublishSchedule({ ...DEFAULT_PUBLISH_SCHEDULE, enabled: true })).toThrow()
  })
  it('uses Shanghai time with a bounded missed-run window', () => {
    const schedule = { ...DEFAULT_PUBLISH_SCHEDULE, enabled: true }
    expect(dueSlots(schedule, new Date('2026-09-04T04:31:00Z'))).toEqual(['2026-09-04T12:30+08:00'])
    expect(dueSlots(schedule, new Date('2026-09-04T06:30:00Z'))).toEqual(['2026-09-04T14:30+08:00'])
    expect(dueSlots(schedule, new Date('2026-09-04T04:35:00Z'))).toEqual([])
  })
  it('rejects malformed times and scopes', () => {
    expect(() => validatePublishSchedule({ ...DEFAULT_PUBLISH_SCHEDULE, times: ['24:30'] })).toThrow()
    expect(() => validatePublishSchedule({ ...DEFAULT_PUBLISH_SCHEDULE, visibility: 'invalid' as any })).toThrow()
  })
})
describe('analysis evidence cleaning', () => {
  it('discards impossible candles and computes ratios without fabricating missing values', () => {
    const bar = { date: '2026-01-01', open: 10, close: 11, high: 12, low: 9, volume: 100 }
    expect(toDailyData([bar, { ...bar, date: '2026-01-02', high: 8 }, { ...bar, date: '2026-01-03', volume: -1 }])).toHaveLength(1)
    const ratios = financialRatios([{ label: '营业收入', value: 100 }, { label: '净利润', value: 10 }])
    expect(ratios.netMarginPct).toBe(10)
    expect(ratios.debtToAssetsPct).toBeNull()
    expect(freshEvidence('2026-01-01', 7, Date.parse('2026-09-04'))).toBe(false)
    expect(freshEvidence('2026-09-05', 7, Date.parse('2026-09-04'))).toBe(false)
  })
})
