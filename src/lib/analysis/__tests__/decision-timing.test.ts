import { describe, expect, it } from 'vitest'
import { assessDecisionTiming, effectiveDecisionTiming, isTradingSessionTime, normalizeReportTimingText } from '../decision-timing'

const calendar = [
  { date: '2026-09-03', open: true },
  { date: '2026-09-04', open: true },
  { date: '2026-09-05', open: false },
  { date: '2026-09-06', open: false },
]

describe('decision timing', () => {
  it('allows a trading-session report only when quote and event checks are current', () => {
    const timing = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:27:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:15:00.000Z' }],
    })
    expect(timing).toMatchObject({ status: 'execution-ready', phase: 'trading', closeDataSession: '2026-09-03', executionReady: true })
    expect(timing.validUntil).toBe('2026-09-04T06:32:00.000Z')
  })

  it('blocks stale quotes and events even during a trading session', () => {
    const weekend = assessDecisionTiming({ asOf: '2026-09-05T06:30:00.000Z', calendar, expectedTickers: ['159995'], quotes: [], eventChecks: [] })
    expect(weekend.status).toBe('reference-only')
    expect(weekend.reasons).toContain('当前为非交易时间')
    const stale = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:20:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:00:00.000Z' }],
    })
    expect(stale.executionReady).toBe(false)
    expect(stale.reasons.join('；')).toContain('实时行情')
    expect(stale.reasons.join('；')).toContain('公告检查')
  })

  it('preserves the research baseline but expires execution freshness', () => {
    const current = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:29:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:20:00.000Z' }],
    })
    expect(effectiveDecisionTiming(current, '2026-09-04T06:33:59.000Z').executionReady).toBe(true)
    expect(effectiveDecisionTiming(current, '2026-09-05T06:34:01.000Z').executionReady).toBe(false)
    expect(current.executionReady).toBe(true)
    expect(normalizeReportTimingText('交易时段时效已通过：本报告的快照冻结于交易时段，报告生成耗时不改变其执行意义。',effectiveDecisionTiming(current,'2026-09-05T06:34:01.000Z'))).not.toContain('时效已通过')
    expect(effectiveDecisionTiming({...current,label:'仅供投资参考',executionReady:false,reasons:['图谱端到端验证使用当前本地数据快照，不可用于交易执行']}, '2026-09-04T06:34:01.000Z').executionReady).toBe(false)
    expect(isTradingSessionTime('2026-09-04T06:30:00.000Z')).toBe(true)
    expect(isTradingSessionTime('2026-09-04T04:00:00.000Z')).toBe(false)
  })
})
