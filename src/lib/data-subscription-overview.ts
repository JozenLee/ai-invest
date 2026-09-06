import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { companySyncState } from '@/lib/subscription-sync-status'
import { DEFAULT_SUBSCRIPTION_CONFIG, MARKET_INDEXES } from '@/lib/subscription-config'
import { ensureMarketIndexSubscriptions } from '@/lib/market-index-subscriptions'
import { readStoredOverview } from '@/lib/stored-market-data'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

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

async function latestPrices(table: 'StockDaily' | 'ETFDaily', codes: string[]) {
  if (!codes.length) return []
  const rows = await prisma.$queryRaw<Array<{ ticker: string; name: string | null; date: string | number; close: number }>>(Prisma.sql`
    SELECT ticker, name, date, close FROM (
      SELECT ticker, ${table === 'ETFDaily' ? Prisma.sql`name` : Prisma.sql`NULL`} AS name, date, close,
        ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY date DESC) AS rank
      FROM ${Prisma.raw(table)} WHERE ticker IN (${Prisma.join(codes)}) AND close > 0
    ) WHERE rank <= 2`)
  return rows.map((row) => ({ ...row, date: new Date(row.date) })).sort((a, b) => b.date.getTime() - a.date.getTime())
}

let cachedGraph: Array<Industry & { etfs: GraphEtf[] }> = []
let graphCachedAt = 0

async function getGraphSnapshot(force = false) {
  if (!force && cachedGraph.length && Date.now() - graphCachedAt < 300000) return cachedGraph
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
      let companies: Array<Record<string, unknown>> = []
      if (force) {
        try {
          const companyResponse = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${encodeURIComponent(industry.id)}/graph`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
          if (companyResponse.ok) {
            const payload = await companyResponse.json()
            const nodes = payload.nodes || (payload.stages || []).flatMap((stage: any) => stage.segments || [])
            companies = nodes.flatMap((node: any) => (node.companies || []).map((company: any) => ({ ...company, nodeName: node.name })))
          }
        } catch { /* Missing company metadata must not discard valid ETF bindings. */ }
      }
      return { ...industry, etfs: [...unique.values()], companies }
    } catch {
      return { ...industry, etfs: [] as GraphEtf[] }
    }
  }))
  if (groups.length) { cachedGraph = groups; graphCachedAt = Date.now() }
  return groups
}

export async function syncGraphEtfSubscriptions() {
  const groups = await getGraphSnapshot(true)
  if (groups.length) await prisma.rawPayload.create({ data: { datasetKey: 'industry_graph', targetCode: 'all', provider: 'graph', payload: JSON.stringify(groups), contentHash: 'graph-snapshot' } })
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
      create: { instrumentId: instrument.id, profile: JSON.stringify({ industryId: etf.industryId, industryName: etf.industryName }), datasets: { create: Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).filter(([, policy]) => policy.scope !== 'market_index').map(([datasetKey, policy]) => ({ datasetKey, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds })) } },
      update: { enabled: true, profile: JSON.stringify({ industryId: etf.industryId, industryName: etf.industryName }) },
    })
    for (const [datasetKey, policy] of Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).filter(([, item]) => item.scope !== 'market_index')) {
      const dataset = { datasetKey, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds }
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
  await ensureMarketIndexSubscriptions()
  // Polling reads only the persisted subscription snapshot. Graph sync is explicit.
  let graphSnapshot: Awaited<ReturnType<typeof getGraphSnapshot>>
  if (syncGraph) {
    try {
      graphSnapshot = (await syncGraphEtfSubscriptions()).groups
    } catch {
      graphSnapshot = []
    }
  } else {
    const snapshot = await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } })
    graphSnapshot = snapshot ? JSON.parse(snapshot.payload) : []
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
  const groupedCodes = new Set(graphGroups.flatMap((group) => group.etfs.map((etf) => normalizeCode(etf.code || etf.ticker))))
  for (const subscription of storedSubscriptions) {
    const code = normalizeCode(subscription.instrument.code)
    if (groupedCodes.has(code)) continue
    let profile: { industryId?: string; industryName?: string } = {}
    try { profile = JSON.parse(subscription.profile || '{}') } catch { /* Legacy profile. */ }
    const id = profile.industryId || 'unclassified'
    const group = storedGroups.get(id) || { id, name: profile.industryName || '未分类订阅', etfs: [] }
    group.etfs.push({ code, name: subscription.instrument.name || code })
    storedGroups.set(id, group)
  }
  const graph = { groups: [...storedGroups.values()], etfCount: storedSubscriptions.length }
  const codes = [...new Set(graph.groups.flatMap((group) => group.etfs.map((etf) => normalizeCode(etf.code || etf.ticker)).filter(Boolean)))]
  const [subscriptions, indexSubscriptions, marketRows, etfRows, allHoldingRows, quotes] = await Promise.all([
    prisma.dataSubscription.findMany({ where: { instrument: { type: 'ETF', code: { in: codes } } }, include: { instrument: true, datasets: true } }),
    prisma.dataSubscription.findMany({ where: { instrument: { type: 'INDEX' } }, include: { instrument: true, datasets: true } }),
    prisma.indexDaily.findMany({ where: { code: { in: MARKET_INDEXES.flatMap((item) => [item.code, item.code.slice(2)]) } }, orderBy: { date: 'desc' }, take: 100 }),
    latestPrices('ETFDaily', codes),
    prisma.eTFHolding.findMany({ where: { etfCode: { in: codes } }, orderBy: { weight: 'desc' } }),
    prisma.marketQuote.findMany({ where: { OR: [{ instrumentType: 'INDEX' }, { instrumentType: 'ETF', code: { in: codes } }, { instrumentType: 'STOCK' }] } }),
  ])
  const holdingRows = codes.flatMap((code) => {
    const unique = new Map<string, (typeof allHoldingRows)[number]>()
    for (const holding of allHoldingRows.filter((row) => normalizeCode(row.etfCode) === code)) {
      const symbol = normalizeCode(holding.stockCode)
      if (!unique.has(symbol)) unique.set(symbol, holding)
      if (unique.size === 10) break
    }
    return [...unique.values()]
  })
  const stockRows = await latestPrices('StockDaily', [...new Set(holdingRows.map((holding) => normalizeCode(holding.stockCode)))])
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
    // Polling must not rewrite every instrument every two seconds.
    if (existing === name) return
    const instrument = await prisma.instrument.upsert({
      where: { type_code: { type: 'STOCK', code } },
      create: { type: 'STOCK', code, name },
      update: { ...(name !== code ? { name } : {}), status: 'active' },
      select: { code: true, name: true },
    })
    instrumentNameMap.set(code, instrument.name)
  }))
  const stockNameMap = new Map(uniqueHoldingCodes.map((code) => [code, instrumentNameMap.get(code) || graphNameMap.get(code)]))
  const quoteMap = new Map(quotes.map((quote) => [`${quote.instrumentType}:${normalizeCode(quote.code)}`, quote]))
  const canonicalOverview = await readStoredOverview()
  const market = MARKET_INDEXES.map((item) => {
    const rows = marketRows.filter((row) => normalizeCode(row.code) === normalizeCode(item.code)).sort((a, b) => b.date.getTime() - a.date.getTime())
    const latest = rows[0]
    const quote = quoteMap.get(`INDEX:${normalizeCode(item.code)}`)
    const subscription = indexSubscriptions.find((candidate) => normalizeCode(candidate.instrument.code) === normalizeCode(item.code))
    const datasets = subscription?.datasets || []
    const active = datasets.find((dataset) => ['queued', 'running'].includes(dataset.status))
    const failed = datasets.find((dataset) => ['failed', 'partial'].includes(dataset.status))
    const canonical = canonicalOverview.data.indices.find(row=>row.code===item.code)
    return { ...item, price: canonical?.price ?? null, changePct: canonical?.changePct ?? null, dataDate: canonical?.dataDate, fetchedAt: canonical?.fetchedAt || null, status: active?.status || failed?.status || (datasets.length ? 'success' : 'pending'), lastError: failed?.lastError || null }
  })
  const subscriptionMap = new Map(subscriptions.map((item) => [normalizeCode(item.instrument.code), item]))
  const etfByCode = new Map<string, (typeof etfRows)[number]>()
  for (const row of etfRows) {
    const code = normalizeCode(row.ticker)
    const current = etfByCode.get(code)
    if (!current || row.date > current.date) etfByCode.set(code, row)
  }
  const topHoldings = codes.flatMap((code) => [...new Map(holdingRows.filter((holding) => normalizeCode(holding.etfCode) === code).map((holding) => [normalizeCode(holding.stockCode), holding] as const)).values()].slice(0, 10))
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
      const quote = quoteMap.get(`ETF:${code}`)
      return { code, name, relevance: etf.relevance || 0, price: quote?.price ?? row?.close ?? null, changePct: quote?.changePct ?? changePct, fetchedAt: quote?.fetchedAt.toISOString() || row?.date?.toISOString() || null, subscribed: Boolean(subscription?.enabled), status: activeDataset?.status || failedDataset?.status || (relevantDatasets.length ? 'success' : 'pending'), lastError: failedDataset?.lastError || null, lastSyncedAt: latestSuccess?.toISOString() || quote?.fetchedAt.toISOString() || row?.date?.toISOString() || null }
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
    const relatedEtfs = new Set(topHoldings.filter((holding) => normalizeCode(holding.stockCode) === company.stockCode).map((holding) => normalizeCode(holding.etfCode)))
    const datasets = subscriptions.filter((subscription) => subscription.enabled && relatedEtfs.has(normalizeCode(subscription.instrument.code))).flatMap((subscription) => subscription.datasets)
    const state = companySyncState(company.stockCode, datasets)
    const quote = quoteMap.get(`STOCK:${company.stockCode}`)
    return { ...company, price: quote?.price ?? current?.close ?? null, changePct: quote?.changePct ?? changePct, ...state, lastSyncedAt: quote?.fetchedAt.toISOString() || state.lastSyncedAt || current?.date?.toISOString() || company.fetchedAt }
  }), syncedEtfCount: graph.etfCount }
}
