/* eslint-disable @typescript-eslint/no-explicit-any -- Graph API supports legacy snake_case and current camelCase payloads. */
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { companySyncState } from '@/lib/subscription-sync-status'
import { DEFAULT_SUBSCRIPTION_CONFIG, MARKET_INDEXES } from '@/lib/subscription-config'
import { ensureIndexSubscriptions, ensureMarketIndexSubscriptions } from '@/lib/market-index-subscriptions'
import { readStoredOverview } from '@/lib/stored-market-data'
import { createHash } from 'node:crypto'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

type GraphEtf = { code?: string; ticker?: string; name?: string; etfName?: string; relevance?: number }
type GraphIndex = { code?: string; name?: string; indexName?: string; relevance?: number }
type Industry = { id: string; name: string; code?: string; version?: number; revisionId?: string; revision_id?: string; contentHash?: string; content_hash?: string; mappingRevisionId?: string; mapping_revision_id?: string; mappingContentHash?: string; mapping_content_hash?: string; mappingPublishedAt?: string; mapping_published_at?: string; publishedAt?: string; published_at?: string }

function normalizeCode(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase().replace(/^(sh|sz)/, '')
  const withoutCnSuffix = normalized.replace(/\.(sh|sz)$/, '')
  // 港股数据源会同时返回 0700.hk 和 00700.hk；前导零不代表不同证券。
  return withoutCnSuffix.replace(/^(\d+)\.hk$/, (_match, digits: string) => `${digits.replace(/^0+/, '') || '0'}.hk`)
}

function normalizeIndexCode(value: unknown) {
  const code = String(value || '').trim().toLowerCase()
  if (/^(sh|sz)\d{6}$/.test(code)) return code
  const suffix = code.match(/^(\d{6})\.(sh|sz)$/)
  return suffix ? `${suffix[2]}${suffix[1]}` : ''
}

function isPlaceholderStockName(name: unknown, stockCode: string) {
  const value = String(name || '').trim()
  return !value || ['nan', 'none', 'null'].includes(value.toLowerCase()) || normalizeCode(value) === normalizeCode(stockCode)
}

function isPlaceholderInstrumentName(name: unknown, code: string) {
  const value = String(name || '').trim()
  return !value || ['nan', 'none', 'null'].includes(value.toLowerCase()) || normalizeCode(value) === normalizeCode(code)
}

function datasetState(datasets: Array<{ status: string; lastError?: string | null; lastSuccessAt?: Date | null }>) {
  const active = datasets.find(dataset => ['queued', 'running'].includes(dataset.status))
  const failed = datasets.filter(dataset => ['failed', 'partial'].includes(dataset.status))
  const succeeded = datasets.filter(dataset => dataset.status === 'success')
  const latestSuccess = datasets.reduce<Date | null>((latest, dataset) => dataset.lastSuccessAt && (!latest || dataset.lastSuccessAt > latest) ? dataset.lastSuccessAt : latest, null)
  const status = active?.status || (failed.length ? (succeeded.length ? 'partial' : failed.some(dataset => dataset.status === 'partial') ? 'partial' : 'failed') : datasets.some(dataset => dataset.status === 'pending') ? 'pending' : datasets.length ? 'success' : 'pending')
  return { status, lastError: failed.find(dataset => dataset.lastError)?.lastError || null, lastSuccessAt: latestSuccess?.toISOString() || null }
}

function graphSubscriptionIndices(groups: Array<Record<string, any>>) {
  const result = new Map<string, { code: string; name: string }>()
  for (const group of groups) {
    const legacy = (group.stages || []).flatMap((stage: any) => (stage.segments || []).flatMap((segment: any) => segment.matched_indices || segment.matchedIndices || []))
    const candidates = (group.analysisIndices?.length ? group.analysisIndices : legacy) as GraphIndex[]
    let accepted = 0
    for (const index of candidates) {
      const code = normalizeIndexCode(index.code)
      if (!code || result.has(code)) continue
      result.set(code, { code, name: index.name || index.indexName || code })
      accepted++
      if (!group.analysisIndices?.length && accepted >= Math.max(1, Number(process.env.GRAPH_INDEX_LIMIT_PER_INDUSTRY || 8))) break
    }
  }
  return [...result.values()]
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

let cachedGraph: Array<Industry & { etfs: GraphEtf[]; indices?: GraphIndex[]; analysisIndices?: GraphIndex[]; companies?: Array<Record<string, unknown>>; stages?: Array<Record<string, unknown>> }> = []
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
      if (!graphResponse.ok) return { ...industry, etfs: [] as GraphEtf[], indices: [] as GraphIndex[], analysisIndices: [] as GraphIndex[], companies: [], stages: [] as Array<Record<string, unknown>>, relations: [] as Array<Record<string, unknown>> }
      const graph = await graphResponse.json() as { lanes?: Record<string, { segments?: Array<{ code?: string; matched_etfs?: GraphEtf[]; matchedEtfs?: GraphEtf[]; matched_indices?: GraphIndex[]; matchedIndices?: GraphIndex[] }> }> }
      const segments = Object.values(graph.lanes || {}).flatMap(lane => lane.segments || [])
      const etfs = segments.flatMap(segment => segment.matched_etfs || segment.matchedEtfs || [])
      const indices = segments.flatMap(segment => segment.matched_indices || segment.matchedIndices || [])
      const unique = new Map<string, GraphEtf & { matchCount: number }>()
      for (const etf of etfs) {
        const code = normalizeCode(etf.code || etf.ticker)
        if (!code) continue
        const current = unique.get(code)
        unique.set(code, { ...(current && Number(current.relevance || 0) > Number(etf.relevance || 0) ? current : etf), code, name: etf.name || etf.etfName || current?.name || code, matchCount: (current?.matchCount || 0) + 1 })
      }
      const representativeEtfs = [...unique.values()].sort((a, b) => b.matchCount - a.matchCount || Number(b.relevance || 0) - Number(a.relevance || 0) || a.code!.localeCompare(b.code!)).slice(0, Math.max(1, Number(process.env.GRAPH_ETF_LIMIT_PER_INDUSTRY || 8)))
      const uniqueIndices = new Map<string, GraphIndex & { matchCount: number }>()
      for (const index of indices) {
        const code = normalizeIndexCode(index.code)
        if (!code) continue
        const current = uniqueIndices.get(code)
        uniqueIndices.set(code, { ...(current && Number(current.relevance || 0) > Number(index.relevance || 0) ? current : index), code, name: index.name || index.indexName || current?.name || code, matchCount: (current?.matchCount || 0) + 1 })
      }
      const representativeIndices = [...uniqueIndices.values()].sort((a, b) => b.matchCount - a.matchCount || Number(b.relevance || 0) - Number(a.relevance || 0) || a.code!.localeCompare(b.code!)).slice(0, Math.max(1, Number(process.env.GRAPH_INDEX_LIMIT_PER_INDUSTRY || 8)))
      let companies: Array<Record<string, unknown>> = []
      let stages: Array<Record<string, unknown>> = []
      let relations: Array<Record<string, unknown>> = []
      let graphIndustry: Record<string, unknown> = {}
      if (force) {
        try {
          const companyResponse = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${encodeURIComponent(industry.id)}/graph`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
          if (companyResponse.ok) {
            const payload = await companyResponse.json()
            const nodes = payload.nodes || (payload.stages || []).flatMap((stage: any) => stage.segments || [])
            companies = nodes.flatMap((node: any) => (node.companies || []).map((company: any) => ({ ...company, nodeName: node.name })))
            const matches = new Map(Object.values(graph.lanes || {}).flatMap(lane => lane.segments || []).map(segment => [segment.code, segment] as const))
            stages = (payload.stages || []).map((stage: any) => ({
              ...stage,
              segments: (stage.segments || []).map((segment: any) => {
                const match = matches.get(segment.code)
                return { ...segment, matched_etfs: match?.matched_etfs || match?.matchedEtfs || [], matched_indices: match?.matched_indices || match?.matchedIndices || [] }
              }),
            }))
            relations = payload.relations || []
            graphIndustry = payload.industry || {}
          }
        } catch { /* Missing company metadata must not discard valid ETF bindings. */ }
      }
      return {
        ...industry,
        ...graphIndustry,
        etfs: [...unique.values()],
        analysisEtfs: representativeEtfs,
        indices: [...uniqueIndices.values()],
        analysisIndices: representativeIndices,
        companies,
        stages,
        relations,
        revisionId: String(graphIndustry.revisionId || graphIndustry.revision_id || industry.revisionId || industry.revision_id || '') || undefined,
        contentHash: String(graphIndustry.contentHash || graphIndustry.content_hash || industry.contentHash || industry.content_hash || '') || undefined,
        mappingRevisionId: String(graphIndustry.mappingRevisionId || graphIndustry.mapping_revision_id || industry.mappingRevisionId || industry.mapping_revision_id || '') || undefined,
        mappingContentHash: String(graphIndustry.mappingContentHash || graphIndustry.mapping_content_hash || industry.mappingContentHash || industry.mapping_content_hash || '') || undefined,
        mappingPublishedAt: String(graphIndustry.mappingPublishedAt || graphIndustry.mapping_published_at || industry.mappingPublishedAt || industry.mapping_published_at || '') || undefined,
      }
    } catch {
      return { ...industry, etfs: [] as GraphEtf[], indices: [] as GraphIndex[], analysisIndices: [] as GraphIndex[], companies: [], stages: [] }
    }
  }))
  if (groups.length) { cachedGraph = groups; graphCachedAt = Date.now() }
  return groups
}

export async function syncGraphEtfSubscriptions() {
  const groups = await getGraphSnapshot(true)
  if (groups.length) {
    const payload = JSON.stringify(groups)
    const contentHash = createHash('sha256').update(payload).digest('hex')
    const latest = await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph', targetCode: 'all' }, orderBy: { fetchedAt: 'desc' }, select: { contentHash: true } })
    if (latest?.contentHash !== contentHash) await prisma.rawPayload.create({ data: { datasetKey: 'industry_graph', targetCode: 'all', provider: 'neo4j-projection', payload, contentHash } })
    const taxonomy = groups.flatMap((group: any) => (group.stages || []).flatMap((stage: any) => (stage.segments || []).map((segment: any) => ({ industry_id: group.id, industry_code: group.code, industry_name: group.name, segment_code: segment.code, segment_name: segment.name }))))
    if (taxonomy.length) {
      const taxonomyPayload = JSON.stringify(taxonomy)
      const taxonomyHash = createHash('sha256').update(taxonomyPayload).digest('hex')
      await prisma.rawPayload.upsert({ where: { id: 'news-taxonomy' }, create: { id: 'news-taxonomy', datasetKey: 'news_taxonomy', targetCode: 'all', provider: 'neo4j-projection', payload: taxonomyPayload, contentHash: taxonomyHash }, update: { provider: 'neo4j-projection', payload: taxonomyPayload, contentHash: taxonomyHash, fetchedAt: new Date() } })
    }
  }
  const etfs = new Map<string, { code: string; name: string; industryId: string; industryName: string }>()
  for (const group of groups) for (const etf of group.etfs) {
    const code = normalizeCode(etf.code || etf.ticker)
    if (code && /^\d{6}$/.test(code)) etfs.set(code, { code, name: etf.name || code, industryId: group.id, industryName: group.name })
  }
  const indices = graphSubscriptionIndices(groups)
  await ensureIndexSubscriptions(indices)
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
      create: { instrumentId: instrument.id, profile: JSON.stringify({ industryId: etf.industryId, industryName: etf.industryName }), datasets: { create: Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).filter(([, policy]) => ['etf_index','company_quote'].includes(policy.scope)).map(([datasetKey, policy]) => ({ datasetKey, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds })) } },
      update: { enabled: true, profile: JSON.stringify({ industryId: etf.industryId, industryName: etf.industryName }) },
    })
    for (const [datasetKey, policy] of Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).filter(([, item]) => ['etf_index','company_quote'].includes(item.scope))) {
      const dataset = { datasetKey, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds }
      await prisma.subscriptionDataset.upsert({
        where: { subscriptionId_datasetKey: { subscriptionId: subscription.id, datasetKey: dataset.datasetKey } },
        create: { subscriptionId: subscription.id, ...dataset },
        update: { enabled: true },
      })
    }
  }
  return { groups, etfCount: etfs.size, indexCount: indices.length }
}

export async function getSubscriptionOverview(syncGraph = false) {
  await ensureMarketIndexSubscriptions()
  // Polling reads only the persisted subscription snapshot. Graph sync is explicit.
  let graphSnapshot: Awaited<ReturnType<typeof getGraphSnapshot>>
  let graphFetchedAt: string | null = null
  if (syncGraph) {
    try {
      graphSnapshot = (await syncGraphEtfSubscriptions()).groups
    } catch {
      graphSnapshot = []
    }
  } else {
    const snapshot = await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } })
    graphSnapshot = snapshot ? JSON.parse(snapshot.payload) : []
    graphFetchedAt = snapshot?.fetchedAt.toISOString() || null
  }
  // A stored graph revision may predate this page visit. Reconcile its selected
  // indices without requiring a remote fetch or a separate manual setup step.
  await ensureIndexSubscriptions(graphSubscriptionIndices(graphSnapshot))
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
  const indexSubscriptions = await prisma.dataSubscription.findMany({ where: { instrument: { type: 'INDEX' } }, include: { instrument: true, datasets: true } })
  const marketInstruments = [...new Map([...MARKET_INDEXES, ...indexSubscriptions.map(subscription => ({ code: subscription.instrument.code, name: subscription.instrument.name || subscription.instrument.code }))].map(index => [index.code, index])).values()]
  const [subscriptions, marketRows, etfRows, allHoldingRows, quotes] = await Promise.all([
    prisma.dataSubscription.findMany({ where: { instrument: { type: 'ETF', code: { in: codes } } }, include: { instrument: true, datasets: true } }),
    prisma.indexDaily.findMany({ where: { code: { in: marketInstruments.flatMap(item => [item.code, item.code.slice(2)]) } }, orderBy: { date: 'desc' }, take: Math.max(100, marketInstruments.length * 4) }),
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
  const graphCompanies = graphSnapshot.flatMap(group => {
    const direct = group.companies || []
    const nested = (group.stages || []).flatMap((stage: any) => (stage.segments || []).flatMap((segment: any) => (segment.companies || []).map((company: any) => ({ ...company, segmentName: segment.name }))))
    const etfs = graph.groups.find(item => item.id === group.id)?.etfs || []
    return [...direct, ...nested].map(company => ({ company, industryId: group.id, industryName: group.name, etfs }))
  })
  const graphCompanyCodes = graphCompanies.map(item => normalizeCode(item.company.code || item.company.ticker || item.company.stockCode || item.company.stock_code)).filter(code => /^\d{6}$/.test(code))
  const holdingCodes = [...new Set([...holdingRows.map(holding => normalizeCode(holding.stockCode)), ...graphCompanyCodes].filter(Boolean))]
  const stockRows = await latestPrices('StockDaily', holdingCodes)
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
  const market = marketInstruments.map((item) => {
    const rows = marketRows.filter((row) => normalizeCode(row.code) === normalizeCode(item.code)).sort((a, b) => b.date.getTime() - a.date.getTime())
    const latest = rows[0]
    const quote = quoteMap.get(`INDEX:${normalizeCode(item.code)}`)
    const subscription = indexSubscriptions.find((candidate) => normalizeCode(candidate.instrument.code) === normalizeCode(item.code))
    const datasets = subscription?.datasets.filter(dataset => dataset.datasetKey === 'index_realtime' || dataset.datasetKey === 'index_daily') || []
    const state = datasetState(datasets)
    const canonical = canonicalOverview.data.indices.find(row=>row.code===item.code)
    const previous = rows[1]
    const price = canonical?.price ?? quote?.price ?? latest?.close ?? null
    const changePct = canonical?.changePct ?? quote?.changePct ?? (latest?.close && previous?.close ? (latest.close / previous.close - 1) * 100 : latest?.changePct ?? null)
    return { ...item, price, changePct, dataDate: canonical?.dataDate || quote?.tradeDate || latest?.date.toISOString().slice(0, 10) || null, fetchedAt: canonical?.fetchedAt || quote?.fetchedAt.toISOString() || latest?.date.toISOString() || null, status: state.status, lastError: state.lastError }
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
      const state = datasetState(relevantDatasets)
      const instrumentName = subscription?.instrument.name
      const name = !isPlaceholderInstrumentName(instrumentName, code) ? instrumentName : !isPlaceholderInstrumentName(etf.name, code) ? etf.name : !isPlaceholderInstrumentName(row?.name, code) ? row?.name : code
      const quote = quoteMap.get(`ETF:${code}`)
      return { code, name, relevance: etf.relevance || 0, price: quote?.price ?? row?.close ?? null, changePct: quote?.changePct ?? changePct, fetchedAt: quote?.fetchedAt.toISOString() || row?.date?.toISOString() || null, subscribed: Boolean(subscription?.enabled), status: state.status, lastError: state.lastError, lastSyncedAt: state.lastSuccessAt || quote?.fetchedAt.toISOString() || row?.date?.toISOString() || null }
    }),
  }))
  const industryByEtf = new Map(graph.groups.flatMap((group) => group.etfs.map((etf) => [normalizeCode(etf.code || etf.ticker), group.name] as const)))
  const uniqueCompanies = new Map<string, { stockCode: string; stockName: string; etfs: string[]; industries: string[]; weight: number; fetchedAt: string | null }>()
  for (const item of graphCompanies) {
    const stockCode = normalizeCode(item.company.code || item.company.ticker || item.company.stockCode || item.company.stock_code)
    if (!/^\d{6}$/.test(stockCode)) continue
    const name = String(item.company.name || item.company.stockName || stockNameMap.get(stockCode) || stockCode)
    const etfNames = item.etfs.map(etf => etf.name || etf.etfName || etf.code || etf.ticker || '').filter(Boolean) as string[]
    const current = uniqueCompanies.get(stockCode)
    if (current) {
      current.etfs = [...new Set([...current.etfs, ...etfNames])]
      current.industries = [...new Set([...current.industries, item.industryName])]
    } else uniqueCompanies.set(stockCode, { stockCode, stockName: name, etfs: [...new Set(etfNames)], industries: [item.industryName], weight: 0, fetchedAt: graphFetchedAt })
  }
  for (const holding of topHoldings) {
    const stockCode = normalizeCode(holding.stockCode)
    const current = uniqueCompanies.get(stockCode)
    const etfName = subscriptionMap.get(normalizeCode(holding.etfCode))?.instrument.name || holding.etfCode
    const industry = industryByEtf.get(normalizeCode(holding.etfCode)) || '未分类'
    if (current) { current.etfs = [...new Set([...current.etfs, etfName])]; if (!current.industries.includes(industry)) current.industries.push(industry); current.weight = Math.max(current.weight, holding.weight); current.fetchedAt = holding.updateDate.toISOString(); continue }
    const holdingName = stockNameMap.get(stockCode) || (!isPlaceholderStockName(holding.stockName, stockCode) ? holding.stockName : null)
    uniqueCompanies.set(stockCode, { stockCode, stockName: holdingName || `${stockCode}（名称待同步）`, etfs: [etfName], industries: [industry], weight: holding.weight, fetchedAt: holding.updateDate.toISOString() })
  }
  const stockByCode = new Map<string, (typeof stockRows)[number]>()
  for (const row of stockRows) {
    const code = normalizeCode(row.ticker)
    const current = stockByCode.get(code)
    if (!current || row.date > current.date) stockByCode.set(code, row)
  }
  const fundSubscriptions = await prisma.dataSubscription.findMany({ where: { instrument: { type: 'FUND' } }, include: { instrument: true, datasets: true } })
  const funds = fundSubscriptions.map(subscription => {
    const datasets = subscription.datasets.filter(dataset => dataset.datasetKey === 'fund_research')
    const state = datasetState(datasets)
    return { code: subscription.instrument.code, name: subscription.instrument.name || subscription.instrument.code, price: null, changePct: null, fetchedAt: state.lastSuccessAt, status: state.status, lastError: state.lastError }
  })
  return { market, etfs, funds, companies: [...uniqueCompanies.values()].sort((a, b) => a.stockName.localeCompare(b.stockName, 'zh-CN')).map((company) => {
    const current = stockByCode.get(company.stockCode)
    const previous = stockRows.find((candidate) => normalizeCode(candidate.ticker) === company.stockCode && current && candidate.date < current.date)
    const changePct = current?.close && previous?.close ? ((current.close - previous.close) / previous.close) * 100 : null
    const relatedEtfs = new Set([
      ...topHoldings.filter(holding => normalizeCode(holding.stockCode) === company.stockCode).map(holding => normalizeCode(holding.etfCode)),
      ...graph.groups.filter(group => company.industries.includes(group.name)).flatMap(group => group.etfs.map(etf => normalizeCode(etf.code || etf.ticker))),
    ])
    const datasets = subscriptions.filter((subscription) => subscription.enabled && relatedEtfs.has(normalizeCode(subscription.instrument.code))).flatMap((subscription) => subscription.datasets)
    const state = companySyncState(company.stockCode, datasets)
    const quote = quoteMap.get(`STOCK:${company.stockCode}`)
    return { ...company, price: quote?.price ?? current?.close ?? null, changePct: quote?.changePct ?? changePct, ...state, lastSyncedAt: quote?.fetchedAt.toISOString() || state.lastSyncedAt || current?.date?.toISOString() || company.fetchedAt }
  }), syncedEtfCount: graph.etfCount }
}
