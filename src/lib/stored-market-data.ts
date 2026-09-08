import { prisma } from '@/lib/db'
import { MARKET_INDEXES } from '@/lib/subscription-config'
import { calculateVolumeAmplification } from '@/lib/market-calculations'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

function normalizeDate(value: unknown) {
  return String(value || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3').slice(0, 10)
}

function isAkshareSource(source: unknown) {
  return String(source || '').toLowerCase().includes('akshare')
}

function normalizeStoredSectorRows(rows: unknown[], source: unknown) {
  if (!isAkshareSource(source)) return []
  const normalized = rows.map((row: any) => ({
    sector: String(row?.['名称'] || row?.sector || '').trim(),
    netFlow: Number(row?.['今日主力净流入-净额']) / 1e8,
    changePct: Number(row?.['今日涨跌幅']),
    dataDate: normalizeDate(row?.['日期'] || row?.date) || null,
  })).filter((row) => row.sector && Number.isFinite(row.netFlow) && Number.isFinite(row.changePct))
  const latestDate = normalized.map((row) => row.dataDate || '').sort().at(-1) || ''
  const latest = latestDate ? normalized.filter((row) => row.dataDate === latestDate) : normalized
  return [...new Map(latest.map((row) => [row.sector, row])).values()]
}

function normalizeLiveSectorRows(rows: unknown[]) {
  const normalized = rows.map((row: any) => ({
    sector: String(row?.sector || '').trim(),
    netFlow: Number(row?.mainForceNet),
    changePct: Number(row?.changePct),
    dataDate: normalizeDate(row?.dataDate) || null,
  })).filter((row) => row.sector && Number.isFinite(row.netFlow) && Number.isFinite(row.changePct))
  return [...new Map(normalized.map((row) => [row.sector, row])).values()]
}

function shanghaiMarketIsTrading(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
  if (['Sat', 'Sun'].includes(value('weekday'))) return false
  const minutes = Number(value('hour')) * 60 + Number(value('minute'))
  return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900)
}

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
  const sectors = normalizeStoredSectorRows(rows, sector?.source)
  sectors.sort((a: any, b: any) => b.netFlow - a.netFlow)
  const hot = [...sectors].sort((a: any, b: any) => Math.abs(b.netFlow) - Math.abs(a.netFlow)).slice(0, 5)
  const lead = hot[0]
  const bullish = lead && lead.netFlow > 5 && lead.changePct < -1
  const bearish = lead && lead.netFlow < -5 && lead.changePct > 1
  const nb = north?.data
  const lhb = Array.isArray(dragon?.data) ? dragon.data : null
  const northbound = nb && nb.semanticStatus === 'verified-net-flow' && nb.unit === '亿元' && !north?.stale && !nb.stale && nb.value != null && Number.isFinite(Number(nb.value)) ? { net: Number(nb.value), shConnect: nb.shConnect ?? null, szConnect: nb.szConnect ?? null, dataDate: nb.date || '', stale: false, source: north!.source } : null
  const sources = { sectorFlow: sectors.length ? sector?.source || 'AKShare' : 'unavailable', northbound: north?.source || 'unavailable', volume: volume?.source || 'unavailable', dragonTiger: dragon?.source || 'unavailable' }
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
    timestamp: [sector, north, volume, dragon].map((row) => row?.fetchedAt || '').sort().at(-1) || null,
    evidence: { sector: sectors.length ? sector : null, northbound: north, volume, dragonTiger: dragon },
  }
  const hasUsableData = Boolean(sectors.length || north || volume || dragon)
  return { success: hasUsableData, data: hasUsableData ? data : null, source: 'subscription-database', error: hasUsableData ? undefined : '暂无可用资金数据；板块资金仅接受 AKShare 数据源' }
}

export async function readCurrentCapitalFlow() {
  const stored = await readStoredCapitalFlow()
  if (!shanghaiMarketIsTrading()) return stored

  try {
    const url = new URL('/api/capital-flow/sector', DATA_SERVICE_URL)
    url.searchParams.set('indicator', '今日')
    url.searchParams.set('refresh', 'true')
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!response.ok) return stored
    const payload = await response.json()
    if (!payload?.success || !isAkshareSource(payload?.source) || !Array.isArray(payload?.data)) return stored
    const sectors = normalizeLiveSectorRows(payload.data).sort((a, b) => b.netFlow - a.netFlow)
    if (!sectors.length) return stored

    const base: any = stored.data || {
      consecutiveTrend: null,
      volumeAmplification: null,
      priceFlowDivergence: null,
      institutionalBehavior: null,
      northbound: null,
      sourceDetails: { northbound: 'unavailable', volume: 'unavailable', dragonTiger: 'unavailable' },
      source: 'subscription-database',
      dataQuality: 'close',
    }
    const hot = [...sectors].sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow)).slice(0, 5)
    const lead = hot[0]
    const bullish = lead.netFlow > 5 && lead.changePct < -1
    const bearish = lead.netFlow < -5 && lead.changePct > 1
    const dataDate = normalizeDate(payload?.meta?.dataDate) || sectors[0]?.dataDate || null
    const fetchedAt = new Date().toISOString()
    return {
      success: true,
      data: {
        ...base,
        topInflowSectors: sectors.filter((row) => row.netFlow > 0).slice(0, 10),
        topOutflowSectors: [...sectors].reverse().filter((row) => row.netFlow < 0).slice(0, 10),
        priceFlowDivergence: { priceChange: lead.changePct, flowNet: lead.netFlow, isDivergent: Boolean(bullish || bearish), divergenceType: bullish ? 'bullish' : bearish ? 'bearish' : 'none' },
        sourceDetails: { ...base.sourceDetails, sectorFlow: 'AKShare' },
        sectorDataDate: dataDate,
        sectorRealtime: payload?.meta?.isRealtime === true,
        sectorDataQuality: 'realtime',
        timestamp: fetchedAt,
        evidence: { ...base.evidence, sector: { source: 'AKShare', fetchedAt, dataDate } },
      },
      source: 'subscription-database+akshare-live',
    }
  } catch {
    return stored
  }
}
