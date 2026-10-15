import { describe, expect, it } from 'vitest'
import { assessDecisionTiming, effectiveDecisionTiming, finalizeDecisionTiming, normalizeReportTimingText } from '../decision-timing'

const calendar = [
  { date: '2026-09-03', open: true },
  { date: '2026-09-04', open: true },
  { date: '2026-09-05', open: false },
  { date: '2026-09-06', open: false },
]

describe('decision timing', () => {
  it('labels a trading-session report as realtime data without gating the flow', () => {
    const timing = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:27:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:15:00.000Z' }],
    })
    expect(timing).toMatchObject({ status: 'execution-ready', phase: 'trading', label: '交易时段 · 实时数据', closeDataSession: '2026-09-03', executionReady: true })
    expect(timing.validUntil).toBe('2026-09-04T06:32:00.000Z')
  })

  it('keeps closed-session execution semantics but downgrades stale intraday quotes', () => {
    const weekend = assessDecisionTiming({ asOf: '2026-09-05T06:30:00.000Z', calendar, expectedTickers: ['159995'], quotes: [], eventChecks: [] })
    expect(weekend).toMatchObject({ status: 'execution-ready', executionReady: true, label: '非交易时段 · 最新收盘数据' })
    expect(weekend.reasons).toEqual([])
    const stale = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:20:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:00:00.000Z' }],
    })
    expect(stale).toMatchObject({executionReady:false,status:'reference-only',label:'仅供投资参考'})
    expect(stale.reasons.join('；')).toContain('实时行情未全部达到5分钟时效')
    expect(stale.quoteCoverage.fresh).toBe(0)
    expect(stale.eventCheckCoverage.fresh).toBe(0)
  })

  it('uses a refreshed current-session quote during the lunch recess', () => {
    const lunchCalendar = [{date:'2026-09-15',open:true},{date:'2026-09-16',open:true}]
    const timing = assessDecisionTiming({
      asOf:'2026-09-16T03:38:00.000Z',calendar:lunchCalendar,expectedTickers:['159995'],
      quotes:[{code:'159995',tradeDate:'2026-09-16',fetchedAt:'2026-09-16T03:37:30.000Z'}],eventChecks:[],
    })
    expect(timing).toMatchObject({phase:'trading',label:'交易时段 · 实时数据',executionReady:true,tradingDate:'2026-09-16',closeDataSession:'2026-09-15'})
    expect(timing.quoteCoverage).toMatchObject({fresh:1,total:1})
  })

  it('keeps the verified morning-close snapshot current throughout lunch', () => {
    const lunchCalendar = [{date:'2026-09-15',open:true},{date:'2026-09-16',open:true}]
    const timing = assessDecisionTiming({
      asOf:'2026-09-16T04:55:00.000Z',calendar:lunchCalendar,expectedTickers:['159995'],
      quotes:[{code:'159995',tradeDate:'2026-09-16',fetchedAt:'2026-09-16T03:31:00.000Z'}],eventChecks:[],
    })
    expect(timing).toMatchObject({phase:'trading',executionReady:true,quoteCoverage:{fresh:1,total:1}})
  })

  it('expires an old trading-session snapshot when generation or viewing takes time', () => {
    const current = assessDecisionTiming({
      asOf: '2026-09-04T06:30:00.000Z', calendar, expectedTickers: ['159995'],
      quotes: [{ code: '159995', tradeDate: '2026-09-04', fetchedAt: '2026-09-04T06:29:00.000Z' }],
      eventChecks: [{ key: 'stock_announcement:159995', lastSuccessAt: '2026-09-04T06:20:00.000Z' }],
    })
    expect(effectiveDecisionTiming(current, '2026-09-04T06:33:59.000Z').executionReady).toBe(true)
    expect(effectiveDecisionTiming(current, '2026-09-05T06:34:01.000Z').executionReady).toBe(false)
    expect(normalizeReportTimingText('交易时段数据待补齐：实时行情已超过5分钟时效，请重新生成报告。 结论',effectiveDecisionTiming(current, '2026-09-04T06:35:00.000Z'))).toBe('仅供投资参考。结论')
    expect(effectiveDecisionTiming({...current,label:'仅供投资参考',executionReady:false,reasons:['图谱端到端验证使用当前本地数据快照，不可用于交易执行']}, '2026-09-04T06:34:01.000Z').executionReady).toBe(false)
  })
})

it('downgrades a pre-open report that completes during trading', () => {
  const timing = assessDecisionTiming({asOf:'2026-09-04T00:00:00Z',calendar,expectedTickers:['159995'],quotes:[]})
  expect(timing.validUntil).toBe('2026-09-04T01:30:00.000Z')
  expect(finalizeDecisionTiming(timing,'2026-09-04T05:19:00Z')).toMatchObject({executionReady:false,label:'仅供投资参考'})
})
it('does not grant execution permission when the exchange calendar is unknown', () => {
  expect(assessDecisionTiming({asOf:'2026-09-04T00:00:00Z',calendar:[],expectedTickers:[],quotes:[]}).executionReady).toBe(false)
})
it('does not revive legacy reports with an unbounded expiry', () => {
  const timing = assessDecisionTiming({asOf:'2026-09-04T00:00:00Z',calendar,expectedTickers:[],quotes:[]})
  expect(effectiveDecisionTiming({...timing,validUntil:null},'2026-09-04T05:19:00Z').executionReady).toBe(false)
})

it('does not let a holiday label hide an outdated material-event check',()=>{
  const timing=assessDecisionTiming({asOf:'2026-09-04T08:00:00Z',calendar,expectedTickers:['159995'],quotes:[],eventChecks:[{key:'news',lastSuccessAt:'2026-09-03T08:00:00Z'}]})
  expect(timing.executionReady).toBe(false)
  expect(timing.reasons.join('')).toContain('事件检查')
  const fresh=assessDecisionTiming({asOf:'2026-09-04T08:00:00Z',calendar,expectedTickers:['159995'],quotes:[],eventChecks:[{key:'news',lastSuccessAt:'2026-09-04T07:59:00Z'}]})
  expect(fresh.executionReady).toBe(true)
  expect(effectiveDecisionTiming(fresh,'2026-09-04T08:25:00Z').executionReady).toBe(false)
})
