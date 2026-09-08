import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const db = vi.hoisted(() => ({ rawPayload: { findFirst: vi.fn() }, marketQuote: { findUnique: vi.fn() }, indexDaily: { findMany: vi.fn() } }))
vi.mock('@/lib/db', () => ({ prisma: db }))
import { readStoredOverview, readStoredCapitalFlow, readCurrentCapitalFlow } from '../stored-market-data'
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
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-03T08:00:00Z'))
    db.rawPayload.findFirst.mockImplementation(({ where }: any) => where.datasetKey === 'sector_capital_flow' ? { payload: JSON.stringify({ source: 'AKShare', data: [{ 名称: '芯片', '今日主力净流入-净额': 800000000, 今日涨跌幅: -2, 日期: '2026-09-03' }] }), fetchedAt: new Date() } : null)
    const result = await readStoredCapitalFlow()
    expect(result.data?.topInflowSectors[0].netFlow).toBe(8)
    expect(result.data?.priceFlowDivergence?.divergenceType).toBe('bullish')
    expect(result.data?.northbound).toBeNull()
    expect(result.data?.institutionalBehavior.dragonTiger).toBeNull()
  })
  it('keeps only the latest AKShare sector snapshot and deduplicates names', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T08:00:00Z'))
    db.rawPayload.findFirst.mockImplementation(({ where }: any) => where.datasetKey === 'sector_capital_flow' ? { payload: JSON.stringify({ source: 'AKShare', data: [
      { 名称: '电子', '今日主力净流入-净额': 100000000, 今日涨跌幅: 1, 日期: '2026-09-03' },
      { 名称: '电子', '今日主力净流入-净额': 200000000, 今日涨跌幅: 2, 日期: '2026-09-04' },
      { 名称: '电子', '今日主力净流入-净额': 300000000, 今日涨跌幅: 3, 日期: '2026-09-04' },
    ] }), fetchedAt: new Date() } : null)
    const result = await readStoredCapitalFlow()
    expect(result.data?.topInflowSectors).toEqual([{ sector: '电子', netFlow: 3, changePct: 3, dataDate: '2026-09-04' }])
  })
  it('rejects stored sector rows from non-AKShare sources', async () => {
    db.rawPayload.findFirst.mockImplementation(({ where }: any) => where.datasetKey === 'sector_capital_flow' ? { payload: JSON.stringify({ source: 'Tushare', data: [{ 名称: '电子', '今日主力净流入-净额': 100000000, 今日涨跌幅: 1, 日期: '2026-09-04' }] }), fetchedAt: new Date() } : null)
    const result = await readStoredCapitalFlow()
    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
  })
  it('uses a fresh AKShare-only sector response during Shanghai trading hours', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T02:00:00Z'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, source: 'AKShare', data: [
      { sector: '电子', mainForceNet: 12, changePct: 1.5 },
      { sector: '电子', mainForceNet: 11, changePct: 1.4 },
      { sector: '银行', mainForceNet: -8, changePct: -0.6 },
    ], meta: { isRealtime: true, dataDate: '2026-09-08' } }), { status: 200 }))
    const result = await readCurrentCapitalFlow()
    expect(result.data?.topInflowSectors).toHaveLength(1)
    expect(result.data?.topOutflowSectors[0].sector).toBe('银行')
    expect(result.data?.sourceDetails.sectorFlow).toBe('AKShare')
    expect(result.data?.sectorRealtime).toBe(true)
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(String(url)).toContain('refresh=true')
    expect(init).toEqual(expect.objectContaining({ cache: 'no-store' }))
  })
})
