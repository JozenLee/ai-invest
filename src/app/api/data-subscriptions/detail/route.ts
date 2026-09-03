import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeInstrumentCode } from '@/lib/data-subscriptions'
import { calculateAllIndicators, type DailyData, type IndicatorResult } from '@/lib/indicators'

type DetailMetrics = {
  dataPoints: number
  latestChangePct: number | null
  periodChangePct: number | null
  volatility: number | null
  maxDrawdown: number | null
  indicators: IndicatorResult | null
}

// 120 个交易日约覆盖半年，足够支持 MA20、RSI24 等短中期指标，
// 同时避免订阅详情一次加载过长历史导致图表拥挤。
const DETAIL_HISTORY_LIMIT = 120

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? Number(item) : item)) as T
}

function normalizedCode(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^(sh|sz)/, '').replace(/\.(sh|sz)$/, '')
}

function placeholderName(name: unknown, code: string) {
  const value = String(name || '').trim()
  return !value || ['nan', 'none', 'null'].includes(value.toLowerCase()) || normalizedCode(value) === normalizedCode(code)
}

function toDailyData(rows: Array<Record<string, unknown>>): DailyData[] {
  return rows
    .map((row) => ({
      date: String(row.date || ''),
      open: Number(row.open || 0),
      high: Number(row.high || 0),
      low: Number(row.low || 0),
      close: Number(row.close || 0),
      volume: Number(row.volume || 0),
      amount: Number(row.amount || 0),
    }))
    .filter((row) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0))
}

function calculateDetailMetrics(rows: Array<Record<string, unknown>>): DetailMetrics {
  const data = toDailyData(rows)
  if (!data.length) return { dataPoints: 0, latestChangePct: null, periodChangePct: null, volatility: null, maxDrawdown: null, indicators: null }

  const latest = data[data.length - 1]
  const previous = data[data.length - 2]
  const first = data[0]
  const latestChangePct = previous?.close ? ((latest.close - previous.close) / previous.close) * 100 : null
  const periodChangePct = first.close ? ((latest.close - first.close) / first.close) * 100 : null
  const returns = data.slice(1).map((item, index) => (item.close - data[index].close) / data[index].close)
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length > 1 ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1) : 0
  const volatility = returns.length > 1 ? Math.sqrt(variance) * Math.sqrt(252) * 100 : null
  let peak = data[0].close
  let maxDrawdown = 0
  for (const item of data) {
    peak = Math.max(peak, item.close)
    maxDrawdown = Math.max(maxDrawdown, peak ? ((peak - item.close) / peak) * 100 : 0)
  }

  return {
    dataPoints: data.length,
    latestChangePct,
    periodChangePct,
    volatility,
    maxDrawdown,
    indicators: calculateAllIndicators(data),
  }
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const rawCode = request.nextUrl.searchParams.get('code')
  if (!type || !rawCode) return NextResponse.json({ success: false, error: '缺少详情参数' }, { status: 400 })
  const code = normalizeInstrumentCode(rawCode)
  if (type === 'etf') {
    const [history, holdings] = await Promise.all([
      prisma.eTFDaily.findMany({ where: { ticker: code }, orderBy: { date: 'desc' }, take: DETAIL_HISTORY_LIMIT }),
      prisma.eTFHolding.findMany({ where: { etfCode: code }, orderBy: { weight: 'desc' }, take: 10 }),
    ])
    const holdingCodes = holdings.map((holding) => normalizedCode(holding.stockCode))
    const [graphStocks, stockInstruments] = await Promise.all([
      holdingCodes.length ? prisma.graphStock.findMany({ where: { stockCode: { in: holdingCodes } }, select: { stockCode: true, stockName: true } }) : Promise.resolve([]),
      holdingCodes.length ? prisma.instrument.findMany({ where: { type: 'STOCK', code: { in: holdingCodes } }, select: { code: true, name: true } }) : Promise.resolve([]),
    ])
    const nameMap = new Map([
      ...graphStocks.map((stock) => [normalizedCode(stock.stockCode), stock.stockName] as const),
      ...stockInstruments.map((stock) => [normalizedCode(stock.code), stock.name] as const),
    ])
    const namedHoldings = holdings.map((holding) => {
      const canonicalName = nameMap.get(normalizedCode(holding.stockCode))
      return { ...holding, stockName: canonicalName && !placeholderName(canonicalName, holding.stockCode) ? canonicalName : holding.stockName }
    })
    const orderedHistory = [...history].reverse()
    return NextResponse.json({ success: true, data: jsonSafe({ history: orderedHistory, holdings: namedHoldings, metrics: calculateDetailMetrics(orderedHistory as unknown as Array<Record<string, unknown>>) }) })
  }
  if (type === 'company') {
    const [history, financials, announcements] = await Promise.all([
      prisma.stockDaily.findMany({ where: { ticker: code }, orderBy: { date: 'desc' }, take: DETAIL_HISTORY_LIMIT }),
      prisma.stockFinancialReport.findMany({ where: { stockCode: code }, orderBy: { publishDate: 'desc' }, take: 4 }),
      prisma.stockAnnouncement.findMany({ where: { stockCode: code }, orderBy: { publishDate: 'desc' }, take: 5 }),
    ])
    const orderedHistory = [...history].reverse()
    return NextResponse.json({ success: true, data: jsonSafe({ history: orderedHistory, financials, announcements, metrics: calculateDetailMetrics(orderedHistory as unknown as Array<Record<string, unknown>>) }) })
  }
  if (type === 'market') {
    const history = await prisma.indexDaily.findMany({ where: { code: { in: [rawCode, rawCode.toLowerCase(), code] } }, orderBy: { date: 'desc' }, take: DETAIL_HISTORY_LIMIT })
    const orderedHistory = [...history].reverse()
    return NextResponse.json({ success: true, data: jsonSafe({ history: orderedHistory, metrics: calculateDetailMetrics(orderedHistory as unknown as Array<Record<string, unknown>>) }) })
  }
  return NextResponse.json({ success: false, error: '无效详情类型' }, { status: 400 })
}
