import { describe, expect, it } from 'vitest'
import { announcementView, financialView, marketDetail } from '@/lib/market-detail'

const bars = Array.from({ length: 140 }, (_, index) => ({ date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`, open: 10 + index, high: 12 + index, low: 9 + index, close: 11 + index, volume: 100 }))

describe('unified market detail', () => {
  it('normalizes real-time shares and yuan to historical lots and thousand yuan', () => {
    const quote = { price: 11, tradeDate: '2026-01-01', open: 10, high: 12, low: 9, volume: 10000, amount: 110000, source: 'tushare_rt_k' }
    const result = marketDetail([], quote, 120)
    expect(result.history[0].volume).toBe(100)
    expect(result.history[0].amount).toBe(110)
    expect(result.quote?.volume).toBe(10000)
  })
  it('does not treat an unverified split-like price break as investor drawdown', () => {
    const result = marketDetail([
      { date: '2026-07-06', open: 3, high: 3.1, low: 2.9, close: 3, volume: 100 },
      { date: '2026-07-07', open: 1.5, high: 1.6, low: 1.4, close: 1.5, volume: 200 },
      { date: '2026-07-08', open: 1.5, high: 1.6, low: 1.4, close: 1.52, volume: 200 },
    ], null, 120)
    expect(result.history).toHaveLength(3)
    expect(result.metrics.maxDrawdown).toBeNull()
    expect(result.metrics.volatility).toBeNull()
    expect(result.metrics.indicators).toBeNull()
    expect(result.metrics.discontinuities?.[0].date).toBe('2026-07-07')
    expect(result.metrics.latestChangePct).not.toBeNull()
  })
  it('applies the same exact limit and merges the latest quote', () => {
    const result = marketDetail(bars, { price: 151, tradeDate: '2026-05-28', open: 149, high: 152, low: 148, changePct: 2 }, 120, Date.parse('2026-05-28T04:00:00Z'))
    expect(result.history).toHaveLength(120)
    expect(result.history.at(-1)?.close).toBe(151)
    expect(result.metrics.dataPoints).toBe(120)
    expect(result.metrics.latestChangePct).toBe(2)
    expect(result.historyComplete).toBe(true)
  })
  it('does not fabricate a candle from a timestamp-less quote', () => {
    const result = marketDetail(bars.slice(0, 2), { price: 20 }, 120)
    expect(result.history).toHaveLength(2)
    expect(result.historyComplete).toBe(false)
  })
  it('preserves the final close against a same-day stale intraday quote',()=>{
    const result=marketDetail(bars,{price:151,tradeDate:'2026-05-28',changePct:2},120,Date.parse('2026-05-28T08:00:00Z'))
    expect(result.history.at(-1)?.close).toBe(150);expect(result.quote).toBeNull()
  })
  it('normalizes Prisma dates and ignores quotes older than daily history', () => {
    const result = marketDetail([{ ...bars[0], date: new Date('2026-09-03T00:00:00Z') }], { price: 99, tradeDate: '2026-09-02' }, 120)
    expect(result.history[0].date).toBe('2026-09-03')
    expect(result.history[0].close).toBe(bars[0].close)
    expect(result.quote).toBeNull()
  })
  it('extracts useful financial fields and announcement excerpts', () => {
    const report = financialView({ reportPeriod: '2026-06-30', reportType: 'income', publishDate: null, source: 'tushare', metricsJson: JSON.stringify({ total_revenue: 10, n_income: 2, irrelevant: 3 }) })
    expect(report.metrics.map((item) => item.label)).toEqual(['营业收入', '净利润'])
    expect(announcementView({ title: '公告', eventType: '重大事项', publishDate: null, url: 'https://example.com', source: 'test', content: '摘要正文' }).summary).toBe('摘要正文')
  })
  it('reads legacy Python NaN fields without losing valid metrics', () => {
    const report = financialView({ reportPeriod: '2026-06-30', reportType: 'income', publishDate: null, source: 'tushare', metricsJson: '{"total_revenue": 10, "netdebt": NaN, "note": "NaN remains quoted"}' })
    expect(report.metrics).toEqual([{ label: '营业收入', value: 10 }])
    expect(report.warning).toBeNull()
  })
})
