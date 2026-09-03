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
  const normalized = String(value || '').trim().toLowerCase().replace(/^(sh|sz)/, '')
  const withoutCnSuffix = normalized.replace(/\.(sh|sz)$/, '')
  // 港股数据源会同时返回 0700.hk 和 00700.hk；前导零不代表不同证券。
  return withoutCnSuffix.replace(/^(\d+)\.hk$/, (_match, digits: string) => `${digits.replace(/^0+/, '') || '0'}.hk`)
}

function isPlaceholderStockName(name: unknown, stockCode: string) {
  const value = String(name || '').trim()
  return !value || ['nan', 'none', 'null'].includes(value.toLowerCase()) || normalizeCode(value) === normalizeCode(stockCode)
}

function isPlaceholderInstrumentName(name: unknown, code: string) {
  const value = String(name || '').trim()
  return !value || ['nan', 'none', 'null'].includes(value.toLowerCase()) || normalizeCode(value) === normalizeCode(code)
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
  const etfs = new Map<string, { code: string; name: string; industryId: string; industryName: string }>()
  for (const group of groups) for (const etf of group.etfs) {
    const code = normalizeCode(etf.code || etf.ticker)
    if (code && /^\d{6}$/.test(code)) etfs.set(code, { code, name: etf.name || code, industryId: group.id, industryName: group.name })
  }
  for (const etf of etfs.values()) {
    const existing = await prisma.instrument.findUnique({ where: { type_code: { type: 'ETF', code: etf.code } }, select: { name: true } })
    const graphName = isPlaceholderInstrumentName(etf.name, etf.code) ? null : etf.name
    const instrumentName = graphName || (!isPlaceholderInstrumentName(existing?.name, etf.code) ? existing?.name : etf.code)
    const instrument = await prisma.instrument.upsert({
      where: { type_code: { type: 'ETF', code: etf.code } },
      create: { type: 'ETF', code: etf.code, name: instrumentName },
      update: { ...(graphName ? { name: graphName } : {}), status: 'active' },
    })
    const subscription = await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, profile: JSON.stringify({ industryId: etf.industryId, industryName: etf.industryName }), datasets: { create: [
        { datasetKey: 'etf_realtime', tradingIntervalSeconds: 180, closedIntervalSeconds: 3600 },
        { datasetKey: 'etf_daily', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
        { datasetKey: 'etf_holdings', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
        { datasetKey: 'constituent_stock_realtime', tradingIntervalSeconds: 300, closedIntervalSeconds: 3600 },
        { datasetKey: 'constituent_stock_daily', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
        { datasetKey: 'stock_financial', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
        { datasetKey: 'stock_announcement', tradingIntervalSeconds: 900, closedIntervalSeconds: 3600 },
      ] } },
      update: { enabled: true, profile: JSON.stringify({ industryId: etf.industryId, industryName: etf.industryName }) },
    })
    for (const dataset of [
      { datasetKey: 'etf_realtime', tradingIntervalSeconds: 180, closedIntervalSeconds: 3600 },
      { datasetKey: 'etf_daily', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
      { datasetKey: 'etf_holdings', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
      { datasetKey: 'constituent_stock_realtime', tradingIntervalSeconds: 300, closedIntervalSeconds: 3600 },
      { datasetKey: 'constituent_stock_daily', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
      { datasetKey: 'stock_financial', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
      { datasetKey: 'stock_announcement', tradingIntervalSeconds: 900, closedIntervalSeconds: 3600 },
    ]) {
      await prisma.subscriptionDataset.upsert({
        where: { subscriptionId_datasetKey: { subscriptionId: subscription.id, datasetKey: dataset.datasetKey } },
        create: { subscriptionId: subscription.id, ...dataset },
        update: { enabled: true },
      })
    }
  }
  return { groups, etfCount: etfs.size }
}

export async function getSubscriptionOverview(syncGraph = false) {
  // Industry classification is metadata owned by the graph service. It is read
  // for grouping only; all market/holding/quote payloads below come from SQLite.
  let graphSnapshot: Awaited<ReturnType<typeof getGraphSnapshot>>
  if (syncGraph) {
    try {
      graphSnapshot = (await syncGraphEtfSubscriptions()).groups
    } catch {
      graphSnapshot = await getGraphSnapshot()
    }
  } else {
    graphSnapshot = await getGraphSnapshot()
  }
  const storedSubscriptions = await prisma.dataSubscription.findMany({ where: { instrument: { type: 'ETF' } }, include: { instrument: true, datasets: true } })
  const storedByCode = new Map(storedSubscriptions.map((subscription) => [normalizeCode(subscription.instrument.code), subscription]))
  const graphGroups = graphSnapshot.map((group) => ({
    id: group.id,
    name: group.name,
    // Keep empty industries visible; only show ETF rows that have a local subscription snapshot.
    etfs: group.etfs.filter((etf) => storedByCode.has(normalizeCode(etf.code || etf.ticker))),
  }))
  const storedGroups = new Map<string, { id: string; name: string; etfs: GraphEtf[] }>(graphGroups.map((group) => [group.id, group]))
  const graph = { groups: [...storedGroups.values()], etfCount: storedSubscriptions.length }
  const codes = [...new Set(graph.groups.flatMap((group) => group.etfs.map((etf) => normalizeCode(etf.code || etf.ticker)).filter(Boolean)))]
  const [schedules, subscriptions, marketRows, etfRows, holdingRows] = await Promise.all([
    prisma.dataSubscriptionSchedule.findMany({ orderBy: { scope: 'asc' } }),
    prisma.dataSubscription.findMany({ where: { instrument: { type: 'ETF', code: { in: codes } } }, include: { instrument: true, datasets: true } }),
    prisma.indexDaily.findMany({ where: { code: { in: MARKET_INDEXES.flatMap((item) => [item.code, item.code.slice(2)]) } }, orderBy: { date: 'desc' }, take: 100 }),
    prisma.eTFDaily.findMany({ where: { ticker: { in: codes } }, orderBy: { date: 'desc' } }),
    prisma.eTFHolding.findMany({ where: { etfCode: { in: codes } }, orderBy: { weight: 'desc' } }),
  ])
  const stockRows = holdingRows.length
    ? await prisma.stockDaily.findMany({ where: { ticker: { in: [...new Set(holdingRows.map((holding) => normalizeCode(holding.stockCode)))] } }, orderBy: { date: 'desc' } })
    : []
  const holdingCodes = [...new Set(holdingRows.map((holding) => normalizeCode(holding.stockCode)).filter(Boolean))]
  const graphStocks = await prisma.graphStock.findMany({ where: { stockCode: { in: holdingCodes } }, select: { stockCode: true, stockName: true } })
  // 企业是跨 ETF 复用的实体：按标准化证券代码建立唯一 STOCK Instrument，
  // 并将图谱/持仓中的名称收敛到同一份 canonical name。历史数据中名称可能为空
  // 或直接等于代码，不能把这类占位值写回实体。
  const existingStockInstruments = holdingCodes.length
    ? await prisma.instrument.findMany({ where: { type: 'STOCK', code: { in: holdingCodes } }, select: { code: true, name: true } })
    : []
  const graphNameMap = new Map(graphStocks.map((stock) => [normalizeCode(stock.stockCode), stock.stockName]))
  const instrumentNameMap = new Map(existingStockInstruments.map((stock) => [normalizeCode(stock.code), stock.name]))
  const uniqueHoldingCodes = [...new Set(holdingCodes.map((code) => normalizeCode(code)).filter(Boolean))]
  await Promise.all(uniqueHoldingCodes.map(async (code) => {
    const candidate = holdingRows
      .filter((row) => normalizeCode(row.stockCode) === code)
      .map((row) => row.stockName)
      .find((name) => !isPlaceholderStockName(name, code)) || graphNameMap.get(code)
    const existing = instrumentNameMap.get(code)
    const name = !isPlaceholderStockName(candidate, code)
      ? String(candidate).trim()
      : !isPlaceholderStockName(existing, code) ? existing : code
    const instrument = await prisma.instrument.upsert({
      where: { type_code: { type: 'STOCK', code } },
      create: { type: 'STOCK', code, name },
      update: { ...(name !== code ? { name } : {}), status: 'active' },
      select: { code: true, name: true },
    })
    instrumentNameMap.set(code, instrument.name)
  }))
  const stockNameMap = new Map(uniqueHoldingCodes.map((code) => [code, instrumentNameMap.get(code) || graphNameMap.get(code)]))
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.scope, schedule]))
  const settings = Object.entries(SUBSCRIPTION_SCOPES).map(([scope, defaults]) => ({ scope, ...defaults, ...(scheduleMap.get(scope) || {}) }))
  const market = MARKET_INDEXES.map((item) => {
    const rows = marketRows.filter((row) => normalizeCode(row.code) === normalizeCode(item.code)).sort((a, b) => b.date.getTime() - a.date.getTime())
    const latest = rows[0]
    return { ...item, price: latest?.close || null, changePct: latest?.changePct || 0, fetchedAt: latest?.date?.toISOString() || null, dataPoints: rows.length }
  })
  const subscriptionMap = new Map(subscriptions.map((item) => [normalizeCode(item.instrument.code), item]))
  const companyDatasetKeys = ['constituent_stock_realtime', 'constituent_stock_daily', 'stock_financial', 'stock_announcement']
  const companyDatasets = subscriptions.flatMap((subscription) => subscription.datasets.filter((dataset) => companyDatasetKeys.includes(dataset.datasetKey)))
  const companySyncStatus = companyDatasets.some((dataset) => ['queued', 'running'].includes(dataset.status))
    ? 'running'
    : companyDatasets.some((dataset) => dataset.status === 'failed')
      ? 'failed'
      : companyDatasets.length ? 'success' : 'pending'
  const etfByCode = new Map<string, (typeof etfRows)[number]>()
  for (const row of etfRows) {
    const code = normalizeCode(row.ticker)
    const current = etfByCode.get(code)
    if (!current || row.date > current.date) etfByCode.set(code, row)
  }
  const topHoldings = [...new Map(codes.flatMap((code) => holdingRows.filter((holding) => normalizeCode(holding.etfCode) === code).slice(0, 10).map((holding) => [`${code}:${normalizeCode(holding.stockCode)}`, holding] as const))).values()]
  const etfs = graph.groups.map((group) => ({
    industryId: group.id,
    industryName: group.name,
    etfs: group.etfs.map((etf) => {
      const code = normalizeCode(etf.code || etf.ticker)
      const row = etfByCode.get(code)
      const subscription = subscriptionMap.get(code)
      const previous = etfRows.find((candidate) => candidate.ticker === code && row && candidate.date < row.date)
      const changePct = row?.close && previous?.close ? ((row.close - previous.close) / previous.close) * 100 : null
      const relevantDatasets = subscription?.datasets.filter((candidate) => ['etf_realtime', 'etf_daily', 'etf_holdings'].includes(candidate.datasetKey)) || []
      const activeDataset = relevantDatasets.find((candidate) => ['queued', 'running'].includes(candidate.status))
      const failedDataset = relevantDatasets.find((candidate) => candidate.status === 'failed')
      const latestSuccess = relevantDatasets.reduce<Date | null>((latest, candidate) => candidate.lastSuccessAt && (!latest || candidate.lastSuccessAt > latest) ? candidate.lastSuccessAt : latest, null)
      const instrumentName = subscription?.instrument.name
      const name = !isPlaceholderInstrumentName(instrumentName, code) ? instrumentName : !isPlaceholderInstrumentName(etf.name, code) ? etf.name : !isPlaceholderInstrumentName(row?.name, code) ? row?.name : code
      return { code, name, relevance: etf.relevance || 0, price: row?.close || null, changePct, fetchedAt: row?.date?.toISOString() || null, dataPoints: etfRows.filter((candidate) => candidate.ticker === code).length, subscribed: Boolean(subscription?.enabled), status: activeDataset?.status || failedDataset?.status || (relevantDatasets.length ? 'success' : 'pending'), lastSyncedAt: latestSuccess?.toISOString() || row?.date?.toISOString() || null }
    }),
  }))
  const industryByEtf = new Map(graph.groups.flatMap((group) => group.etfs.map((etf) => [normalizeCode(etf.code || etf.ticker), group.name] as const)))
  const uniqueCompanies = new Map<string, { stockCode: string; stockName: string; etfs: string[]; industries: string[]; weight: number; fetchedAt: string | null }>()
  for (const holding of topHoldings) {
    const stockCode = normalizeCode(holding.stockCode)
    const current = uniqueCompanies.get(stockCode)
    const etfName = subscriptionMap.get(normalizeCode(holding.etfCode))?.instrument.name || holding.etfCode
    const industry = industryByEtf.get(normalizeCode(holding.etfCode)) || '未分类'
    if (current) { current.etfs.push(etfName); if (!current.industries.includes(industry)) current.industries.push(industry); current.weight = Math.max(current.weight, holding.weight); continue }
    const holdingName = stockNameMap.get(stockCode) || (!isPlaceholderStockName(holding.stockName, stockCode) ? holding.stockName : null)
    uniqueCompanies.set(stockCode, { stockCode, stockName: holdingName || `${stockCode}（名称待同步）`, etfs: [etfName], industries: [industry], weight: holding.weight, fetchedAt: holding.updateDate.toISOString() })
  }
  const stockByCode = new Map<string, (typeof stockRows)[number]>()
  for (const row of stockRows) {
    const code = normalizeCode(row.ticker)
    const current = stockByCode.get(code)
    if (!current || row.date > current.date) stockByCode.set(code, row)
  }
  return { market, etfs, companies: [...uniqueCompanies.values()].sort((a, b) => a.stockName.localeCompare(b.stockName, 'zh-CN')).map((company) => {
    const current = stockByCode.get(company.stockCode)
    const previous = stockRows.find((candidate) => normalizeCode(candidate.ticker) === company.stockCode && current && candidate.date < current.date)
    const changePct = current?.close && previous?.close ? ((current.close - previous.close) / previous.close) * 100 : null
    return { ...company, price: current?.close ?? null, changePct, dataPoints: stockRows.filter((row) => normalizeCode(row.ticker) === company.stockCode).length, lastSyncedAt: current?.date?.toISOString() || company.fetchedAt, status: companySyncStatus }
  }), settings, syncedEtfCount: graph.etfCount }
}
