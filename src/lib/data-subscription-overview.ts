import { prisma } from '@/lib/db'

export const SUBSCRIPTION_SCOPES = {
  market_index: { label: '市场指数', tradingIntervalSeconds: 30, closedIntervalSeconds: 120 },
  etf_index: { label: 'ETF指数', tradingIntervalSeconds: 180, closedIntervalSeconds: 3600 },
  company_quote: { label: '企业行情', tradingIntervalSeconds: 1800, closedIntervalSeconds: 86400 },
} as const

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const MARKET_INDEXES = [
  { code: 'sh000001', name: '上证指数' },
  { code: 'sz399001', name: '深证成指' },
  { code: 'sz399006', name: '创业板指' },
  { code: 'sh000688', name: '科创50' },
  { code: 'sh000300', name: '沪深300' },
]

type GraphEtf = { code?: string; ticker?: string; name?: string; etfName?: string; relevance?: number }
type Industry = { id: string; name: string; code?: string }

function normalizeCode(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^(sh|sz)/, '')
}

async function getGraphSnapshot() {
  let response: Response
  try {
    response = await fetch(`${DATA_SERVICE_URL}/api/v1/industries`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  } catch {
    return []
  }
  if (!response.ok) return []
  const payload = await response.json() as Industry[]
  const industries = Array.isArray(payload) ? payload : []
  const groups = await Promise.all(industries.map(async (industry) => {
    try {
      const graphResponse = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${encodeURIComponent(industry.id)}/swimlane`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      if (!graphResponse.ok) return { ...industry, etfs: [] as GraphEtf[] }
      const graph = await graphResponse.json() as { lanes?: Record<string, { segments?: Array<{ matched_etfs?: GraphEtf[]; matchedEtfs?: GraphEtf[] }> }> }
      const etfs = Object.values(graph.lanes || {}).flatMap((lane) => (lane.segments || []).flatMap((segment) => segment.matched_etfs || segment.matchedEtfs || []))
      const unique = new Map<string, GraphEtf>()
      for (const etf of etfs) {
        const code = normalizeCode(etf.code || etf.ticker)
        if (code && !unique.has(code)) unique.set(code, { ...etf, code, name: etf.name || etf.etfName || code })
      }
      return { ...industry, etfs: [...unique.values()] }
    } catch {
      return { ...industry, etfs: [] as GraphEtf[] }
    }
  }))
  return groups
}

export async function syncGraphEtfSubscriptions() {
  const groups = await getGraphSnapshot()
  const etfs = new Map<string, { code: string; name: string }>()
  for (const group of groups) for (const etf of group.etfs) {
    const code = normalizeCode(etf.code || etf.ticker)
    if (code && /^\d{6}$/.test(code)) etfs.set(code, { code, name: etf.name || code })
  }
  for (const etf of etfs.values()) {
    const instrument = await prisma.instrument.upsert({
      where: { type_code: { type: 'ETF', code: etf.code } },
      create: { type: 'ETF', code: etf.code, name: etf.name },
      update: { name: etf.name, status: 'active' },
    })
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, datasets: { create: [
        { datasetKey: 'etf_realtime', tradingIntervalSeconds: 180, closedIntervalSeconds: 3600 },
        { datasetKey: 'etf_holdings', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
        { datasetKey: 'constituent_stock_realtime', tradingIntervalSeconds: 300, closedIntervalSeconds: 3600 },
      ] } },
      update: { enabled: true },
    })
  }
  return { groups, etfCount: etfs.size }
}

export async function getSubscriptionOverview(syncGraph = false) {
  const graph = syncGraph ? await syncGraphEtfSubscriptions().catch(async () => ({ groups: await getGraphSnapshot(), etfCount: 0 })) : { groups: await getGraphSnapshot(), etfCount: 0 }
  const codes = [...new Set(graph.groups.flatMap((group) => group.etfs.map((etf) => normalizeCode(etf.code || etf.ticker)).filter(Boolean)))]
  const [schedules, subscriptions, marketRows, etfRows, holdingRows] = await Promise.all([
    prisma.dataSubscriptionSchedule.findMany({ orderBy: { scope: 'asc' } }),
    prisma.dataSubscription.findMany({ where: { instrument: { type: 'ETF', code: { in: codes } } }, include: { instrument: true, datasets: true } }),
    prisma.indexDaily.findMany({ where: { code: { in: MARKET_INDEXES.flatMap((item) => [item.code, item.code.slice(2)]) } }, orderBy: { date: 'desc' }, take: 100 }),
    prisma.eTFDaily.findMany({ where: { ticker: { in: codes } }, orderBy: { date: 'desc' }, take: 500 }),
    prisma.eTFHolding.findMany({ where: { etfCode: { in: codes } }, orderBy: { weight: 'desc' } }),
  ])
  const stockRows = holdingRows.length
    ? await prisma.stockDaily.findMany({ where: { ticker: { in: [...new Set(holdingRows.map((holding) => holding.stockCode))] } }, orderBy: { date: 'desc' } })
    : []
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.scope, schedule]))
  const settings = Object.entries(SUBSCRIPTION_SCOPES).map(([scope, defaults]) => ({ scope, ...defaults, ...(scheduleMap.get(scope) || {}) }))
  const market = MARKET_INDEXES.map((item) => {
    const rows = marketRows.filter((row) => normalizeCode(row.code) === normalizeCode(item.code)).sort((a, b) => b.date.getTime() - a.date.getTime())
    const latest = rows[0]
    return { ...item, price: latest?.close || null, changePct: latest?.changePct || 0, fetchedAt: latest?.date?.toISOString() || null }
  })
  const subscriptionMap = new Map(subscriptions.map((item) => [item.instrument.code, item]))
  const etfByCode = new Map(etfRows.map((row) => [row.ticker, row]))
  const topHoldings = [...new Map(codes.flatMap((code) => holdingRows.filter((holding) => holding.etfCode === code).slice(0, 10).map((holding) => [`${code}:${holding.stockCode}`, holding] as const))).values()]
  const etfs = graph.groups.map((group) => ({
    industryId: group.id,
    industryName: group.name,
    etfs: group.etfs.map((etf) => {
      const code = normalizeCode(etf.code || etf.ticker)
      const row = etfByCode.get(code)
      const subscription = subscriptionMap.get(code)
      const previous = etfRows.find((candidate) => candidate.ticker === code && row && candidate.date < row.date)
      const changePct = row?.close && previous?.close ? ((row.close - previous.close) / previous.close) * 100 : null
      return { code, name: etf.name || row?.name || code, relevance: etf.relevance || 0, price: row?.close || null, changePct, fetchedAt: row?.date?.toISOString() || null, subscribed: Boolean(subscription?.enabled), status: subscription?.datasets.find((dataset) => dataset.datasetKey === 'etf_holdings')?.status || 'pending' }
    }),
  }))
  const uniqueCompanies = new Map<string, { stockCode: string; stockName: string; etfs: string[]; weight: number; fetchedAt: string | null }>()
  for (const holding of topHoldings) {
    const current = uniqueCompanies.get(holding.stockCode)
    const etfName = subscriptionMap.get(holding.etfCode)?.instrument.name || holding.etfCode
    if (current) { current.etfs.push(etfName); current.weight = Math.max(current.weight, holding.weight); continue }
    uniqueCompanies.set(holding.stockCode, { stockCode: holding.stockCode, stockName: holding.stockName, etfs: [etfName], weight: holding.weight, fetchedAt: holding.updateDate.toISOString() })
  }
  const stockByCode = new Map(stockRows.map((row) => [row.ticker, row]))
  return { market, etfs, companies: [...uniqueCompanies.values()].sort((a, b) => b.weight - a.weight).map((company) => ({ ...company, price: stockByCode.get(company.stockCode)?.close || null, changePct: null })), settings, syncedEtfCount: graph.etfCount }
}
