import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const db = vi.hoisted(() => ({ rawPayload: { findFirst: vi.fn() }, marketQuote: { findUnique: vi.fn() }, indexDaily: { findMany: vi.fn() } }))
vi.mock('@/lib/db', () => ({ prisma: db }))
import { readStoredOverview, readStoredCapitalFlow } from '../stored-market-data'
describe('stored market readers', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => { vi.resetAllMocks(); db.rawPayload.findFirst.mockResolvedValue(null); db.marketQuote.findUnique.mockResolvedValue(null); db.indexDaily.findMany.mockResolvedValue([]) })
  it('does not collect or fabricate missing data', async () => {
    const network = vi.spyOn(globalThis, 'fetch')
    expect((await readStoredOverview()).data.indices).toEqual([])
    expect((await readStoredCapitalFlow()).data).toBeNull()
    expect(network).not.toHaveBeenCalled(); network.mockRestore()
  })
  it('keeps missing reference close unknown', async () => {
    db.marketQuote.findUnique.mockResolvedValue({ price: 12, previousClose: null, changePct: null, tradeDate: '2026-09-03', fetchedAt: new Date('2026-09-03') })
    const result = await readStoredOverview()
    expect(result.data.indices[0].changePct).toBeNull()
    expect(result.data.meta.isRealtime).toBe(false)
  })
  it('prefers the same-day final candle after Shanghai close', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T08:00:00Z'))
    db.marketQuote.findUnique.mockResolvedValue({ price: 4000, tradeDate: '2026-09-04', fetchedAt: new Date(), previousClose: 3900 })
    db.indexDaily.findMany.mockResolvedValue([{ date: new Date('2026-09-04'), close: 3930, changePct: -0.3 }, { date: new Date('2026-09-03'), close: 3942 }])
    const row = (await readStoredOverview()).data.indices[0]
    expect(row.price).toBe(3930)
    expect(row.changePct).toBe(-0.3)
  })
  it('keeps the current quote during lunch and uses the latest prior-day close', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T04:00:00Z'))
    db.marketQuote.findUnique.mockResolvedValue({ price: 4000, tradeDate: '2026-09-04', fetchedAt: new Date(), previousClose: null, changePct: null })
    db.indexDaily.findMany.mockResolvedValue([{ date: new Date('2026-09-03'), close: 3942 }, { date: new Date('2026-09-02'), close: 3900 }])
    const row = (await readStoredOverview()).data.indices[0]
    expect(row.price).toBe(4000)
    expect(row.change).toBe(58)
  })
  it('converts stored sector yuan to hundred-million yuan and preserves missing northbound', async () => {
    db.rawPayload.findFirst.mockImplementation(({ where }: any) => where.datasetKey === 'sector_capital_flow' ? { payload: JSON.stringify({ source: 'Tushare', data: [{ 名称: '芯片', '今日主力净流入-净额': 800000000, 今日涨跌幅: -2, 日期: '2026-09-03' }] }), fetchedAt: new Date() } : null)
    const result = await readStoredCapitalFlow()
    expect(result.data?.topInflowSectors[0].netFlow).toBe(8)
    expect(result.data?.priceFlowDivergence?.divergenceType).toBe('bullish')
    expect(result.data?.northbound).toBeNull()
    expect(result.data?.institutionalBehavior.dragonTiger).toBeNull()
  })
})
