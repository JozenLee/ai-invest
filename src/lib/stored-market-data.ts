import { prisma } from '@/lib/db'
import { MARKET_INDEXES } from '@/lib/subscription-config'
import { calculateVolumeAmplification } from '@/lib/market-calculations'

export async function readMarketDataset(key: string) {
  const row = await prisma.rawPayload.findFirst({ where: { datasetKey: key }, orderBy: { fetchedAt: 'desc' } })
  if (!row) return null
  try {
    const payload = JSON.parse(row.payload)
    const data = payload.data ?? payload
    const first = Array.isArray(data) ? data[0] : data
    const rawDate = String(first?.['日期'] || first?.date || first?.trade_date || '')
    const dataDate = rawDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    const dataTime = Date.parse(dataDate)
    return { data, dataDate: dataDate || null, source: payload.source || row.provider, fetchedAt: row.fetchedAt.toISOString(), stale: Date.now() - row.fetchedAt.getTime() > 72 * 3600000 || (key !== 'market_news' && (!Number.isFinite(dataTime) || Date.now() - dataTime > 72 * 3600000)) }
  } catch { return null }
}

export async function readStoredOverview() {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const part = (name: string) => local.find((item) => item.type === name)!.value
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const beforeClose = Number(part('hour')) < 15
  const indices = (await Promise.all(MARKET_INDEXES.map(async (index) => {
    let quote = await prisma.marketQuote.findUnique({ where: { instrumentType_code: { instrumentType: 'INDEX', code: index.code } } })
    const daily = await prisma.indexDaily.findMany({ where: { code: { in: [index.code, index.code.slice(2)] }, close: { gt: 0 } }, orderBy: { date: 'desc' }, take: 2 })
    const latest = daily[0]
    const dailyDate = latest?.date.toISOString().slice(0, 10)
    // A completed daily candle wins over an intraday quote from the same day.
    if (quote && dailyDate && (!quote.tradeDate || quote.tradeDate < dailyDate || (quote.tradeDate === dailyDate && (dailyDate < today || !beforeClose)))) quote = null
    if (!quote && !latest) return null
    const price = quote?.price ?? latest!.close
    const dataDate = quote?.tradeDate || dailyDate
    const previous = quote?.previousClose ?? daily.find((row) => row.date.toISOString().slice(0, 10) < (dataDate || ''))?.close
    const dailyPayload = !quote ? await prisma.rawPayload.findFirst({ where: { datasetKey: 'index_daily', targetCode: index.code }, orderBy: { fetchedAt: 'desc' } }) : null
    return { ...index, price, change: previous ? price - previous : null, changePct: quote ? quote.changePct ?? (previous ? (price / previous - 1) * 100 : null) : latest?.changePct ?? (previous ? (price / previous - 1) * 100 : null), dataDate, fetchedAt: quote?.fetchedAt.toISOString() || dailyPayload?.fetchedAt.toISOString() || null, source: quote?.source || 'subscription-database' }
  }))).filter((row) => row !== null)
  const dates = indices.map((row) => row.dataDate || '').filter(Boolean).sort()
  const times = indices.map((row) => row.fetchedAt || '').filter(Boolean).sort()
  const meta = { isOpen: false, isPreMarket: false, isPostMarket: false, status: 'stored', statusText: '订阅数据库快照', isRealtime: false, lastTradingDate: dates.at(-1) || '', dataDate: dates.at(-1) || '' }
  return { success: indices.length > 0, data: { indices, meta, timestamp: times.at(-1) || null }, source: 'subscription-database', error: indices.length ? undefined : '暂无已入库指数，请在数据订阅中更新' }
}

export async function readStoredCapitalFlow() {
  const [sector, north, volume, dragon] = await Promise.all(['sector_capital_flow', 'northbound_flow', 'market_volume', 'dragon_tiger'].map(readMarketDataset))
  const rows = !sector?.stale && Array.isArray(sector?.data) ? sector.data : []
  const sectors = rows.map((row: Record<string, any>) => ({ sector: row['名称'] || row.sector, netFlow: Number(row['今日主力净流入-净额']) / 1e8, changePct: Number(row['今日涨跌幅']), dataDate: row['日期'] || row.date || null })).filter((row: any) => row.sector && Number.isFinite(row.netFlow) && Number.isFinite(row.changePct))
  sectors.sort((a: any, b: any) => b.netFlow - a.netFlow)
  const hot = [...sectors].sort((a: any, b: any) => Math.abs(b.netFlow) - Math.abs(a.netFlow)).slice(0, 5)
  const lead = hot[0]
  const bullish = lead && lead.netFlow > 5 && lead.changePct < -1
  const bearish = lead && lead.netFlow < -5 && lead.changePct > 1
  const nb = north?.data
  const lhb = Array.isArray(dragon?.data) ? dragon.data : null
  const northbound = nb && nb.semanticStatus === 'verified-net-flow' && nb.unit === '亿元' && !north?.stale && !nb.stale && nb.value != null && Number.isFinite(Number(nb.value)) ? { net: Number(nb.value), shConnect: nb.shConnect ?? null, szConnect: nb.szConnect ?? null, dataDate: nb.date || '', stale: false, source: north!.source } : null
  const sources = { sectorFlow: sector?.source || 'unavailable', northbound: north?.source || 'unavailable', volume: volume?.source || 'unavailable', dragonTiger: dragon?.source || 'unavailable' }
  const data = {
    topInflowSectors: sectors.filter((row: any) => row.netFlow > 0).slice(0, 10),
    topOutflowSectors: [...sectors].reverse().filter((row: any) => row.netFlow < 0).slice(0, 10),
    // The current snapshot is a cross section, not a multi-day time series.
    consecutiveTrend: null,
    priceFlowDivergence: lead ? { priceChange: lead.changePct, flowNet: lead.netFlow, isDivergent: Boolean(bullish || bearish), divergenceType: bullish ? 'bullish' : bearish ? 'bearish' : 'none' } : null,
    volumeAmplification: !volume?.stale && Array.isArray(volume?.data) ? { ...calculateVolumeAmplification(volume.data), scope: '上证指数成交额，非全A成交额' } : null,
    institutionalBehavior: { dragonTiger: null, northboundCapital: northbound },
    publicTradingActivity: { dragonTigerRows: !dragon?.stale ? lhb?.length ?? null : null, interpretation: '龙虎榜公开交易，未经机构席位识别，不推断机构净买入' },
    limitations: ['当日板块横截面不代表连续资金趋势', '北向资金只有来源单位和净流口径均经核验才进入分析', '缺失字段不补零'],
    northbound, sourceDetails: sources, source: 'subscription-database', sectorRealtime: false,
    dataQuality: [sector, north, volume, dragon].some((row) => row?.stale) ? 'cached' : 'close',
    sectorDataDate: sectors[0]?.dataDate || null,
    evidence: { sector, northbound: north, volume, dragonTiger: dragon },
  }
  return { success: Boolean(sector || north || volume || dragon), data: sector || north || volume || dragon ? data : null, source: 'subscription-database', error: sector || north || volume || dragon ? undefined : '暂无已入库资金数据，请在数据订阅中更新' }
}
