import type { PlanningHolding } from './alternatives'

/** Private portfolio artifact only. Pure point-in-time parsing; no DB, network or trading.
 * Feed actual Holding rows and RawPayload rows fetchedAt <= asOf. The caller freezes
 * the result privately, then schedules requests (fund_* requests need a collector).
 * Existing etf_research {data:{nav:[]}} and etf_holdings {data:[]} are supported.
 * Normalized fund_research uses {data:{nav:[],holdings:[],assetAllocation:[]}}.
 * ETFHolding.updateDate and Holding.updatedAt are NOT disclosure/NAV dates.
 */
export type ProductType = 'etf' | 'feeder' | 'active' | 'index-enhanced' | 'index' | 'qdii' | 'other' | 'unknown'
export interface ProductEvidence {
  id: string
  source: string
  url: string | null
  observedAt: string
  publishedAt: string | null
  dataDate: string | null
  contentHash?: string
  locator?: string
}
export interface ProductIdentity {
  ticker: string
  productType: ProductType
  evidence: ProductEvidence[]
  /** Explicit relationships verified against the cited official documents, never a benchmark proxy. */
  targetEtfCode?: string
  targetIndexCode?: string
  targetIndexName?: string
}
export interface ActualProductHolding {
  portfolioId?: string
  ticker: string
  name: string
  fundType?: string | null
  category?: string | null
  quantity?: number | null
  targetEtfCode?: string | null
  targetIndexCode?: string | null
  mappingSource?: string | null
  mappingConfidence?: number | null
  unitNav?: number | null
  purchaseDate?: string | Date | null
  redemptionFeePct?: number | null
}
export interface ProductRawPayload {
  id: string
  datasetKey: string
  targetCode: string
  provider?: string | null
  payload: string
  contentHash: string
  fetchedAt: string | Date
}
export interface ProductGap { ticker: string; code: string; detail: string }
export interface ProductNavPoint {
  date: string
  nav: number
  /** Only explicitly adjusted NAV; accumulated NAV is not a total-return series. */
  adjustedNav: number | null
  evidence: ProductEvidence
}
export interface DisclosedProductHolding {
  code: string
  name: string
  kind: 'stock' | 'fund'
  weightPct: number | null
  weightBasis: 'net-assets' | 'unknown'
  evidence: ProductEvidence
}
export interface ProductAssetAllocation {
  asset: string
  weightPct: number
  weightBasis: 'net-assets' | 'total-assets'
  evidence: ProductEvidence
}
export interface ProductResearch {
  ticker: string
  name: string
  productType: ProductType
  classification: 'official' | 'source-verified' | 'local-hint' | 'unknown'
  identityEvidence: ProductEvidence[]
  officialMapping: { targetEtfCode: string | null; targetIndexCode: string | null; targetIndexName: string | null; evidence: ProductEvidence[] } | null
  navSeries: ProductNavPoint[]
  /** Latest contiguous explicit adjusted observations; no filled factors or rescaled joins. */
  riskNavSeries: ProductNavPoint[]
  disclosedHoldings: DisclosedProductHolding[]
  assetAllocation: ProductAssetAllocation[]
  /** Normalized, locally stored execution packets; raw fees without source/expiry stay absent. */
  executionMaterials: { buy?: ProductExecutionInput; sell?: ProductExecutionInput }
  exposure: {
    /** Report-date disclosed gross long weights, NOT a current-position estimate. */
    basis: 'disclosed-only'
    reportDate: string | null
    knownWeightPct: number | null
    unobservedWeightPct: number | null
    lookThrough: { code: string; weightPct: number; via: string[]; evidence: ProductEvidence[] }[]
    limitation: string
  }
  coverage: { nav: boolean; adjustedNav: boolean; holdings: boolean; allocation: boolean; mappingRequired: boolean; mapping: boolean
    adjustedNavWindow: { start: string | null; end: string | null; observations: number; fullHistoryObservations: number; excludedObservations: number; laggingObservations?: number; breakReason: 'missing-adjusted-nav' | 'conflict' | 'source-or-revision-change' | null; basis: string }
  }
  gaps: ProductGap[]
}
export interface ProductResearchRequest {
  targetType: 'fund' | 'etf' | 'index'
  targetCode: string
  datasetKey: 'fund_identity' | 'fund_nav' | 'fund_holdings' | 'fund_asset_allocation' | 'fund_execution' | 'etf_research' | 'etf_holdings' | 'index_daily'
  requiredBy: string[]
  reason: string
}

const verifiedAt = '2026-09-10T17:33:50Z'
const official = (id: string, url: string, publishedAt: string | null, locator: string): ProductEvidence => ({ id, source: 'official-document', url, observedAt: verifiedAt, publishedAt, dataDate: null, locator })
/** Only identity relationships are seeded; no holdings, live NAV or fee assumptions. */
export const VERIFIED_PRODUCT_IDENTITIES: readonly ProductIdentity[] = [
  { ticker: '017470', productType: 'feeder', targetEtfCode: '588200', targetIndexCode: '000685.SH', targetIndexName: '上证科创板芯片指数', evidence: [
    official('official:017470:feeder', 'https://www.jsfund.cn/main/a/20260107/484056.shtml', '2026-01-07', 'PART.3：588200，联接A/C 017469/017470'),
    official('official:588200:index', 'https://www.jsfund.cn/Services/cn/jsp/pcf/index.jsp?SiteID=1&fundcode=588200', '2024-08-23', '基本信息：基金代码588200；拟合指数代码000685'),
  ] },
  { ticker: '024975', productType: 'feeder', targetEtfCode: '588710', targetIndexCode: '950125.SH', targetIndexName: '上证科创板半导体材料设备主题指数', evidence: [
    official('official:024975:feeder', 'https://static.cninfo.com.cn/finalpage/2025-07-25/1224291662.PDF', '2025-07-25', '第1页C类代码024975；第2页目标ETF全称及标的指数名称'),
    official('official:588710:identity', 'https://www.sse.com.cn/disclosure/announcement/listing/c/c_20250603_10780706.shtml', '2025-06-03', '华泰柏瑞上证科创板半导体材料设备主题ETF证券代码588710'),
    official('official:950125:identity', 'https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/indices/detail/files/zh_CN/950125factsheet.pdf', null, '指数全称及指数代码950125'),
  ] },
  { ticker: '026633', productType: 'active', evidence: [
    official('official:026633:identity', 'https://fund.pingan.com/nasfile/1773794635984.pdf', null, '第73项：026633，平安半导体领航精选混合型发起式证券投资基金C类'),
    official('official:026633:strategy', 'https://fund.pingan.com/main/peanutFinance/yingPeanut/fundDetailV2/026632.shtml', null, '同一基金A类页面用于共享投资策略和投资范围；不用于C类净值、费率'),
  ] },
]

type Row = Record<string, unknown>
const obj = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(obj) : []
const str = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const num = (value: unknown): number | null => {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
const positive = (value: unknown) => { const n = num(value); return n !== null && n > 0 ? n : null }
const pct = (value: unknown) => { const n = num(value); return n !== null && n >= 0 && n <= 100 ? n : null }
const code = (value: unknown) => str(value).replace(/\.(OF|SH|SZ)$/i, '')
const iso = (value: string | Date) => value instanceof Date ? value.toISOString() : value
function day(value: unknown): string | null {
  const s = value instanceof Date ? value.toISOString() : str(value)
  const d = /^\d{8}$/.test(s) ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}` : s.slice(0,10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d ? d : null
}
const chinaDay = (asOf: string) => new Date(Date.parse(asOf) + 8 * 3600000).toISOString().slice(0,10)
const before = (time: string | null, asOf: string) => !!time && Number.isFinite(Date.parse(time)) && Date.parse(time) <= Date.parse(asOf)
function available(e: ProductEvidence, asOf: string): boolean {
  return !!e.id && !!e.source && before(e.observedAt, asOf) && (!e.publishedAt || (!!day(e.publishedAt) && day(e.publishedAt)! <= chinaDay(asOf))) && (!e.dataDate || (!!day(e.dataDate) && day(e.dataDate)! <= chinaDay(asOf)))
}
function officialEvidence(e: ProductEvidence, asOf: string): boolean {
  if (!available(e, asOf) || !e.url || !e.locator) return false
  try {
    const u = new URL(e.url)
    return u.protocol === 'https:' && ['jsfund.cn', 'huatai-pb.com', 'fund.pingan.com', 'sse.com.cn', 'szse.cn', 'cninfo.com.cn', 'csindex.com.cn'].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))
  } catch { return false }
}
function trustedIdentityEvidence(e:ProductEvidence,asOf:string):boolean{
  if(officialEvidence(e,asOf))return true
  if(!available(e,asOf)||!e.url||!e.locator||!/^eastmoney\//.test(e.source))return false
  try{const host=new URL(e.url).hostname;return host==='eastmoney.com'||host.endsWith('.eastmoney.com')}catch{return false}
}
function hintedType(h: ActualProductHolding): ProductType {
  if (['etf','feeder','active','index-enhanced','index','qdii','other'].includes(h.fundType || '')) return h.fundType as ProductType
  const name = `${h.name} ${h.category || ''}`
  if (/联接/.test(name)) return 'feeder'
  if (/增强/.test(name)) return 'index-enhanced'
  if (/QDII/i.test(name)) return 'qdii'
  if (/ETF/i.test(name)) return 'etf'
  if (/混合|主动/.test(name)) return 'active'
  if (/指数/.test(name)) return 'index'
  return 'unknown'
}

/** Explicit structured claims only: fund_profile/fund_identity {identity:{...}}.
 * A source tag such as "manual" or "provider" alone is deliberately insufficient.
 * Caller/collector must verify the claim at its document locator before persisting.
 */
function localIdentity(raw: ProductRawPayload): ProductIdentity | null {
  if (!['fund_identity','fund_profile'].includes(raw.datasetKey)) return null
  let payload: Row
  try { payload = obj(JSON.parse(raw.payload)) } catch { return null }
  if (payload.success === false) return null
  const data = obj(payload.data ?? payload), i = obj(data.identity ?? data)
  const ticker = code(i.ticker || i.fund_code)
  const productType = str(i.productType)
  if (ticker !== code(raw.targetCode) || !['etf','feeder','active','index-enhanced','index','qdii','other'].includes(productType)) return null
  const evidence = list(i.evidence).flatMap(e => {
    if (!str(e.url) || !str(e.locator) || !str(e.source)) return []
    // Original reviewed observation stays visible; the raw fetchedAt is checked separately.
    const observedAt = str(e.observedAt) || iso(raw.fetchedAt)
    return [{id:raw.id,source:str(e.source),url:str(e.url),locator:str(e.locator),observedAt,publishedAt:day(e.publishedAt),dataDate:day(e.dataDate),contentHash:raw.contentHash}]
  })
  const targetEtfCode = code(i.targetEtfCode), targetIndexCode = str(i.targetIndexCode)
  if ((targetEtfCode && !/^\d{6}$/.test(targetEtfCode)) || (targetIndexCode && !/^[A-Z0-9]{6}\.(SH|SZ|CSI)$/.test(targetIndexCode))) return null
  return {ticker,productType:productType as ProductType,evidence,targetEtfCode:targetEtfCode || undefined,targetIndexCode:targetIndexCode || undefined,targetIndexName:str(i.targetIndexName) || undefined}
}

// Execution JSON is accepted only in this normalized schema, with explicit source
// and validity for each field. Never convert Holding.redemptionFeePct implicitly.
function localExecution(raw: ProductRawPayload, ticker: string, productType: ProductType, asOf: string): {buy?: ProductExecutionInput; sell?: ProductExecutionInput} {
  if (raw.datasetKey !== 'fund_execution') return {}
  let payload: Row
  try { payload = obj(JSON.parse(raw.payload)) } catch { return {} }
  if (payload.success === false) return {}
  const data = obj(payload.data ?? payload)
  const result: {buy?: ProductExecutionInput; sell?: ProductExecutionInput} = {}
  const fact = <T>(value: unknown, parse: (value: unknown) => T | null): ExecutionFact<T> | undefined => {
    const f = obj(value), e = obj(f.evidence), parsed = parse(f.value)
    if (parsed === null || !str(f.validUntil) || !str(e.source)) return undefined
    return {value:parsed,validUntil:str(f.validUntil),evidence:{id:raw.id,source:str(e.source),url:str(e.url) || null,observedAt:str(e.observedAt) || iso(raw.fetchedAt),publishedAt:day(e.publishedAt),dataDate:day(e.dataDate),contentHash:raw.contentHash,locator:str(e.locator) || undefined}}
  }
  const textValue = (value: unknown) => str(value) || null
  const feeValue = (value: unknown) => { const f=obj(value), ratePct=pct(f.ratePct), fixedAmount=num(f.fixedAmount); return ratePct !== null && fixedAmount !== null && fixedAmount >= 0 ? {ratePct,fixedAmount} : null }
  for (const side of ['buy','sell'] as const) {
    const v=obj(data[side]), o=obj(v.otc)
    if (str(v.ticker) !== ticker || v.productType !== productType || v.side !== side) continue
    if(productType==='etf'){
      const x=obj(v.exchange)
      result[side]={ticker,productType,side,asOf,exchange:{
        quote:fact(x.quote,value=>{const q=obj(value),bid=positive(q.bid),ask=positive(q.ask),availableQuantity=positive(q.availableQuantity);return bid!==null&&ask!==null&&availableQuantity!==null?{bid,ask,availableQuantity}:null}),
        status:fact(x.status,value=>value==='open'||value==='suspended'?value:null),
        commission:fact(x.commission,value=>{const f=obj(value),ratePct=pct(f.ratePct),minimumAmount=num(f.minimumAmount);return ratePct!==null&&minimumAmount!==null&&minimumAmount>=0?{ratePct,minimumAmount}:null}),
        settlement:fact(x.settlement,textValue),
      }}
      continue
    }
    const lots = list(o.lots).flatMap(l => {
      const quantity=positive(l.quantity), fee=fact(l.fee,feeValue), e=obj(l.evidence)
      if (!str(l.id) || quantity === null || !str(l.acquiredAt) || !fee || !str(e.source)) return []
      return [{id:str(l.id),quantity,acquiredAt:str(l.acquiredAt),fee,evidence:{id:raw.id,source:str(e.source),url:str(e.url)||null,observedAt:str(e.observedAt) || iso(raw.fetchedAt),publishedAt:day(e.publishedAt),dataDate:day(e.dataDate),contentHash:raw.contentHash}}]
    })
    result[side]={ticker,productType,side,asOf,otc:{channel:str(o.channel),
      status:fact(o.status, value => value === 'open' || value === 'suspended' || value === 'limited' ? value : null),
      cutoff:fact(o.cutoff,textValue),
      settlement:fact(o.settlement, value => { const s=obj(value); return str(s.confirmation) && str(s.cashArrival) ? {confirmation:str(s.confirmation),cashArrival:str(s.cashArrival),cashArrivalBusinessDays:num(s.cashArrivalBusinessDays)} : null }),
      subscriptionFee:fact(o.subscriptionFee,feeValue),lots,redemptionQuantity:positive(o.redemptionQuantity) || undefined,
    }}
  }
  return result
}

/** Scope result privately: it reveals which products the account owns even without balances. */
export function buildPortfolioResearchUniverse(input: {
  /** Required to consume account-scoped execution materials; never publish this ID. */
  portfolioId?: string
  holdings: readonly ActualProductHolding[]
  rawPayloads?: readonly ProductRawPayload[]
  asOf: string
  /** Additional reviewed official identities; conflicts fail closed, never overwrite silently. */
  identities?: readonly ProductIdentity[]
  maxDisclosureAgeDays?: number
  maxNavAgeDays?: number
}) {
  if (!Number.isFinite(Date.parse(input.asOf))) throw new Error('Invalid portfolio research asOf')
  const { asOf } = input
  const requests: ProductResearchRequest[] = []
  const request = (targetType: ProductResearchRequest['targetType'], targetCode: string, datasetKey: ProductResearchRequest['datasetKey'], requiredBy: string, reason: string) => {
    const old = requests.find(r => r.targetCode === targetCode && r.datasetKey === datasetKey && r.targetType === targetType)
    if (old) { if (!old.requiredBy.includes(requiredBy)) old.requiredBy.push(requiredBy) }
    else requests.push({targetType, targetCode, datasetKey, requiredBy: [requiredBy], reason})
  }
  const raw = (input.rawPayloads || []).filter(r => before(iso(r.fetchedAt), asOf)).sort((a,b) => Date.parse(iso(b.fetchedAt)) - Date.parse(iso(a.fetchedAt)))
  const storedIdentities = raw.flatMap(r => { const identity=localIdentity(r); return identity ? [identity] : [] })
  const products: ProductResearch[] = []
  const parseProduct = (ticker: string, h?: ActualProductHolding): ProductResearch => {
    const gaps: ProductGap[] = []
    const gap = (code: string, detail: string) => { if (!gaps.some(g => g.code === code)) gaps.push({ ticker, code, detail }) }
    const identities = [...storedIdentities, ...VERIFIED_PRODUCT_IDENTITIES, ...(input.identities || [])].filter(i => i.ticker === ticker && i.evidence.length > 0 && i.evidence.every(e => trustedIdentityEvidence(e, asOf)))
    const signatures = new Set(identities.map(i => JSON.stringify([i.productType, i.targetEtfCode || null, i.targetIndexCode || null])))
    if (signatures.size > 1) gap('identity-conflict', '正式产品资料存在相互冲突的类型或映射；需人工核对版本与生效日')
    const identity = signatures.size === 1 ? identities[0] : undefined
    const productType = signatures.size > 1 ? 'unknown' : identity?.productType || (h ? hintedType(h) : 'etf')
    const sourceVerified = raw.some(r => {
      if (r.datasetKey !== 'fund_research' || code(r.targetCode) !== ticker) return false
      try { const data=obj(obj(JSON.parse(r.payload)).data); return str(data.ticker) === ticker && !!str(data.name) } catch { return false }
    })
    const mapping = identity && ['feeder','etf','index','index-enhanced'].includes(productType) && (identity.targetEtfCode || identity.targetIndexCode)
      ? { targetEtfCode: identity.targetEtfCode || null, targetIndexCode: identity.targetIndexCode || null, targetIndexName: identity.targetIndexName || null, evidence: identity.evidence } : null
    if (!identity && (!sourceVerified || productType === 'feeder')) gap('identity-unverified', productType === 'feeder' ? '已核验基金代码与名称，但联接关系仍需发行人或交易所正式资料确认' : '本地类型只作研究路由线索；需数据源身份记录或正式产品资料确认')
    if (h?.targetEtfCode && h.targetEtfCode !== mapping?.targetEtfCode) gap('local-mapping-unverified', '本地目标ETF与官方映射不一致或缺少官方证据，未采用本地映射')
    if (h?.targetIndexCode && h.targetIndexCode !== mapping?.targetIndexCode) gap('local-index-unverified', '本地指数映射未通过官方关系核验；业绩基准不视为持仓')
    if (productType === 'feeder' && !mapping?.targetEtfCode) gap('target-etf-missing', '联接基金缺少正式目标ETF关系')
    const navCandidates: ProductNavPoint[] = [], holdCandidates: DisclosedProductHolding[] = [], allocations: ProductAssetAllocation[] = []
    for (const r of raw.filter(r => code(r.targetCode) === ticker)) {
      if (!['etf_research','fund_research','fund_profile','fund_nav','fund_holdings','etf_holdings','fund_asset_allocation'].includes(r.datasetKey)) continue
      let payload: unknown
      try { payload = JSON.parse(r.payload) } catch { gap('invalid-payload', `原始记录${r.id}无法解析`); continue }
      const root = obj(payload), data = root.data ?? payload, bundle = obj(data)
      if (root.success === false || /mock|simulat|模拟/i.test(`${r.provider || ''} ${str(root.source)}`)) { gap('unusable-source', `原始记录${r.id}失败或为模拟数据`); continue }
      const evidence = (row: Row, field: string, dataDate: string | null): ProductEvidence => ({
        id: r.id, source: str(row.source) || str(obj(root.sources)[field]) || r.provider || r.datasetKey,
        url: str(row.source_url || root.source_url) || null, observedAt: iso(r.fetchedAt), publishedAt: day(row.ann_date || row.publish_date || row.publishedAt), dataDate, contentHash: r.contentHash, locator: field,
      })
      const sameFund = (row: Row) => !row.ts_code || code(row.ts_code) === ticker
      const navRows = r.datasetKey === 'fund_nav' ? list(data) : list(bundle.nav)
      for (const row of navRows.filter(sameFund)) {
        const date = day(row.nav_date || row.date), nav = positive(row.unit_nav ?? row.nav)
        const e = evidence(row, 'nav', date)
        if (date && nav !== null && available(e, asOf) && !/mock|simulat|模拟/i.test(e.source)) navCandidates.push({ date, nav, adjustedNav: positive(row.adj_nav ?? row.adjustedNav), evidence: e })
      }
      const holdRows = ['fund_holdings','etf_holdings'].includes(r.datasetKey) ? list(data) : list(bundle.holdings)
      for (const row of holdRows.filter(sameFund)) {
        const reportDate = day(row.report_period || row.end_date || row.reportPeriod)
        const e = evidence(row, 'holdings', reportDate)
        const security = code(row.stock_code || row.stockCode || row.symbol || row.code)
        if (!security || !available(e, asOf) || /mock|simulat|模拟/i.test(e.source)) continue
        // Legacy ETFHoldings/weights without a report period are not promoted to today's holdings.
        if (!reportDate) { gap('holding-period-missing', `原始持仓${r.id}缺少报告期，未用于暴露`); continue }
        const explicitBasis = str(row.weight_basis || row.weightBasis)
        const basis = explicitBasis === 'net-assets' || (!explicitBasis && (row.stk_mkv_ratio !== undefined || r.datasetKey === 'etf_holdings')) ? 'net-assets' : 'unknown'
        holdCandidates.push({ code: security, name: str(row.stock_name || row.stockName || row.name) || security, kind: row.kind === 'fund' || security === mapping?.targetEtfCode ? 'fund' : 'stock', weightPct: row.weight_available === false ? null : pct(row.weightPct ?? row.weight ?? row.stk_mkv_ratio), weightBasis: basis, evidence: e })
      }
      const allocationRows = r.datasetKey === 'fund_asset_allocation' ? list(data) : list(bundle.assetAllocation)
      for (const row of allocationRows.filter(sameFund)) {
        const e = evidence(row, 'assetAllocation', day(row.report_period || row.end_date || row.reportPeriod))
        const weightPct = pct(row.weightPct ?? row.weight), basis = row.weightBasis || row.weight_basis, asset = str(row.asset)
        if (asset && e.dataDate && weightPct !== null && (basis === 'net-assets' || basis === 'total-assets') && available(e, asOf) && !/mock|simulat|模拟/i.test(e.source)) allocations.push({asset, weightPct, weightBasis: basis, evidence: e})
      }
    }
    // Latest observed revision per business date; conflicting rows in one revision are excluded.
    const navSeries: ProductNavPoint[] = [], conflictDates = new Set<string>()
    for (const date of [...new Set(navCandidates.map(n => n.date))].sort()) {
      const points = navCandidates.filter(n => n.date === date), first = points[0]
      const current = points.filter(n => n.evidence.observedAt === first.evidence.observedAt)
      if (current.some(n => n.nav !== first.nav || n.adjustedNav !== first.adjustedNav)) { gap('nav-conflict', `${date}同一观察时间净值不一致`); conflictDates.add(date) }
      else navSeries.push(first)
    }
    const riskNavSeries: ProductNavPoint[] = []
    let breakReason: ProductResearch['coverage']['adjustedNavWindow']['breakReason'] = null
    let laggingObservations = 0
    let started = false
    const byNavDate = new Map(navSeries.map(n=>[n.date,n]))
    // A newly published unit NAV can lead the adjusted source. Skip only that
    // leading publication lag; once the adjusted series starts, gaps still end it.
    for (const date of [...new Set(navCandidates.map(n=>n.date))].sort().reverse()) {
      const n=byNavDate.get(date)
      if (conflictDates.has(date)) { if (!started) { laggingObservations++; continue }; breakReason='conflict'; break }
      if (!n || n.adjustedNav===null) { if (!started) { laggingObservations++; continue }; breakReason='missing-adjusted-nav'; break }
      started = true
      const newest=riskNavSeries[0]
      if (newest && (n.evidence.source!==newest.evidence.source || n.evidence.id!==newest.evidence.id)) { breakReason='source-or-revision-change'; break }
      riskNavSeries.push(n)
    }
    riskNavSeries.reverse()
    const adjustedNavWindow: ProductResearch['coverage']['adjustedNavWindow'] = {
      start:riskNavSeries[0]?.date || null,end:riskNavSeries.at(-1)?.date || null,observations:riskNavSeries.length,
      fullHistoryObservations:navSeries.length,excludedObservations:navSeries.length-riskNavSeries.length,laggingObservations,breakReason,
      basis:'截至最近已发布复权净值日的连续显式复权区间；允许普通净值领先复权源，但不为领先日期填补因子；交易日交集与最少60个样本由风险层校验',
    }
    const reportDate = holdCandidates.map(h => h.evidence.dataDate!).sort().at(-1) || null
    const period = holdCandidates.filter(h => h.evidence.dataDate === reportDate)
    // Select a complete raw disclosure revision, do not merge stale constituents into a new revision.
    const revision = period[0]?.evidence.id
    const disclosedHoldings: DisclosedProductHolding[] = []
    for (const item of period.filter(h => h.evidence.id === revision)) {
      const old = disclosedHoldings.find(h => h.code === item.code)
      if (!old) disclosedHoldings.push({...item})
      else if (old.weightPct !== item.weightPct || old.weightBasis !== item.weightBasis) { old.weightPct = null; gap('holding-conflict', '同份披露存在重复证券权重冲突') }
    }
    const allocationDate = allocations.map(a => a.evidence.dataDate!).sort().at(-1)
    const allocationRevision = allocations.find(a => a.evidence.dataDate === allocationDate)?.evidence.id
    const assetAllocation = allocations.filter(a => a.evidence.dataDate === allocationDate && a.evidence.id === allocationRevision)
    let known = disclosedHoldings.length ? disclosedHoldings.reduce((sum,h) => sum + (h.weightBasis === 'net-assets' ? h.weightPct || 0 : 0),0) : null
    if (known !== null && known > 100 + 0.01) { known = null; gap('exposure-over-100', '披露权重超过100%，需处理杠杆/重复或口径冲突，未计算剩余暴露') }
    if (disclosedHoldings.some(h => h.weightBasis === 'unknown' || h.weightPct === null)) gap('holding-weight-unknown', '部分持仓权重或净资产分母缺失，不做归一化推算')
    if (reportDate && (Date.parse(chinaDay(asOf)) - Date.parse(reportDate)) / 86400000 > (input.maxDisclosureAgeDays ?? 120)) gap('holdings-stale', '持仓报告期已超过新鲜度阈值，仅作历史暴露')
    if (!navSeries.length) gap('nav-missing', '缺少有日期和来源的基金净值；持仓邮件中的单次净值不能代替历史数据')
    if (navSeries.length && (Date.parse(chinaDay(asOf)) - Date.parse(navSeries.at(-1)!.date)) / 86400000 > (input.maxNavAgeDays ?? 7)) gap('nav-stale', '最近净值已超过新鲜度阈值，需刷新基金自身净值')
    if (!riskNavSeries.length) gap('adjusted-nav-missing', '缺少可用的连续显式复权净值区间；不以累计净值或指数价格替代')
    else if (laggingObservations) gap('adjusted-nav-lagging', `复权净值比最新普通净值少${laggingObservations}个观测日；历史风险截至${riskNavSeries.at(-1)!.date}`)
    if (!disclosedHoldings.length) gap('holdings-missing', '缺少可用已披露持仓，不根据基金名、基准或行业分类编造暴露')
    if (!assetAllocation.length) gap('allocation-missing', '缺少同报告期且明确分母的资产配置')
    const mappingRequired = productType === 'feeder'
    const executionRaw = raw.find(r => {
      if (code(r.targetCode) !== ticker || r.datasetKey !== 'fund_execution') return false
      try { const payload=obj(JSON.parse(r.payload)); return !!input.portfolioId && payload.portfolioId === input.portfolioId } catch { return false }
    })
    const executionMaterials = executionRaw ? localExecution(executionRaw,ticker,productType,asOf) : {}
    const classification=identity?(identity.evidence.every(e=>/^official(?:-document)?$/.test(e.source))?'official':'source-verified'):sourceVerified?'source-verified':productType==='unknown'?'unknown':'local-hint'
    return { ticker, name: h?.name || ticker, productType, classification, identityEvidence: identity?.evidence || [], officialMapping: mapping, navSeries, riskNavSeries, disclosedHoldings, assetAllocation, executionMaterials,
      exposure: {basis: 'disclosed-only', reportDate, knownWeightPct: known === null ? null : Math.min(100,known), unobservedWeightPct: known === null ? null : Math.max(0,100-known), lookThrough: [], limitation: '仅报告日已披露、未归一化的多头权重；未披露部分未知。不能视为当前持仓、合同下限或业绩基准配置。'},
      coverage: { nav: navSeries.length > 0, adjustedNav: riskNavSeries.length > 0, adjustedNavWindow, holdings: disclosedHoldings.length > 0, allocation: assetAllocation.length > 0, mappingRequired, mapping: !mappingRequired || !!mapping?.targetEtfCode }, gaps }
  }
  for (const h of input.holdings) {
    if (h.quantity != null && (!Number.isFinite(h.quantity) || h.quantity <= 0)) continue
    const ticker = code(h.ticker)
    if (!/^\d{6}$/.test(ticker) || products.some(p => p.ticker === ticker)) continue
    const p = parseProduct(ticker, h)
    products.push(p)
    request('fund', ticker, 'fund_identity', ticker, '核验实际持有份额的类型、正式关系和产品变更')
    request('fund', ticker, 'fund_nav', ticker, '实际基金净值与复权净值；支持全账户前向基线')
    request('fund', ticker, 'fund_holdings', ticker, '获取实际基金已披露股票/基金持仓及报告期')
    request('fund', ticker, 'fund_asset_allocation', ticker, '独立获取资产配置，保留净资产/总资产分母')
    request('fund', ticker, 'fund_execution', ticker, '按份额类别和实际渠道获取交易状态、费用及到账规则')
    const target = p.productType === 'etf' ? ticker : p.officialMapping?.targetEtfCode
    if (target) {
      request('etf', target, 'etf_research', ticker, '实际持仓反向发现的目标ETF行情与研究资料')
      request('etf', target, 'etf_holdings', ticker, '目标ETF定期披露；不等于联接基金100%投资该ETF')
      if (p.productType === 'feeder') {
        const underlying = parseProduct(target)
        const stake = p.disclosedHoldings.find(h => h.kind === 'fund' && h.code === target && h.weightBasis === 'net-assets')
        if (stake?.weightPct !== null && stake?.weightPct !== undefined && underlying.exposure.knownWeightPct !== null && underlying.exposure.reportDate === p.exposure.reportDate) {
          p.exposure.lookThrough = underlying.disclosedHoldings.filter(h => h.kind === 'stock' && h.weightBasis === 'net-assets' && h.weightPct !== null).map(h => ({code: h.code, weightPct: stake.weightPct! * h.weightPct! / 100, via: [ticker,target], evidence: [stake.evidence,h.evidence]}))
        } else p.gaps.push({ticker, code:'look-through-incomplete', detail:'缺少同报告期目标ETF实际配置比例或底层披露；不使用90%合同下限或95%基准权重代替'})
      }
    }
    if (p.officialMapping?.targetIndexCode) request('index', p.officialMapping.targetIndexCode, 'index_daily', ticker, '官方跟踪关系用于比较，不作为基金实际持仓')
  }
  return { asOf, scope: 'private-portfolio' as const, products, requests,
    requiredEtfCodes: [...new Set(requests.filter(r=>r.targetType==='etf').map(r=>r.targetCode))],
    requiredIndexCodes: [...new Set(requests.filter(r=>r.targetType==='index').map(r=>r.targetCode))],
    gaps: products.flatMap(p => p.gaps) }
}

export interface ExecutionFact<T> { value: T; evidence: ProductEvidence; validUntil: string }
export interface RedemptionLot { id: string; quantity: number; acquiredAt: string; evidence: ProductEvidence; fee: ExecutionFact<{ ratePct: number; fixedAmount: number }> }
export interface ProductExecutionInput {
  ticker: string
  productType: ProductType
  asOf: string
  side: 'buy' | 'sell'
  exchange?: {
    quote?: ExecutionFact<{ bid: number; ask: number; availableQuantity: number }>
    status?: ExecutionFact<'open' | 'suspended'>
    commission?: ExecutionFact<{ ratePct: number; minimumAmount: number }>
    settlement?: ExecutionFact<string>
  }
  otc?: {
    channel: string
    status?: ExecutionFact<'open' | 'suspended' | 'limited'>
    cutoff?: ExecutionFact<string>
    settlement?: ExecutionFact<{ confirmation: string; cashArrival: string; cashArrivalBusinessDays?: number | null }>
    subscriptionFee?: ExecutionFact<{ ratePct: number; fixedAmount: number }>
    lots?: RedemptionLot[]
    /** Requested redemption shares, validated against the selected lots only. */
    redemptionQuantity?: number
  }
}
/** Readiness of execution INFORMATION, not an order authorization or investment recommendation. */
export function validateProductExecution(input: ProductExecutionInput) {
  const gaps: ProductGap[] = [], evidenceIds = new Set<string>()
  const gap = (code: string, detail: string) => gaps.push({ ticker: input.ticker, code, detail })
  const valid = <T>(fact: ExecutionFact<T> | undefined): fact is ExecutionFact<T> => {
    if (!fact || !available(fact.evidence,input.asOf) || !before(input.asOf,fact.validUntil)) return false
    evidenceIds.add(fact.evidence.id)
    return true
  }
  const feeOK = (f: {ratePct: number; fixedAmount?: number; minimumAmount?: number}) => pct(f.ratePct) !== null && num(f.fixedAmount ?? f.minimumAmount) !== null && (f.fixedAmount ?? f.minimumAmount)! >= 0
  const mechanism = input.productType === 'etf' ? 'exchange-quote' : ['feeder','active','index','index-enhanced'].includes(input.productType) ? 'otc-unknown-nav' : 'unresolved'
  if (!Number.isFinite(Date.parse(input.asOf))) gap('invalid-as-of','执行观察时间无效')
  if (mechanism === 'unresolved') gap('execution-type-unresolved','需确认实际交易渠道与产品交易方式')
  if (mechanism === 'exchange-quote') {
    const e = input.exchange
    if (!valid(e?.quote) || !positive(e.quote.value.bid) || !positive(e.quote.value.ask) || e.quote.value.bid > e.quote.value.ask || !positive(e.quote.value.availableQuantity)) gap('exchange-quote','需要有效买卖报价、价差和可成交数量')
    if (!valid(e?.status) || e.status.value !== 'open') gap('exchange-status','需确认场内交易开放状态')
    if (!valid(e?.commission) || !feeOK(e.commission.value)) gap('exchange-commission','需要实际券商佣金及最低费用证据')
    if (!valid(e?.settlement) || !e.settlement.value.trim()) gap('exchange-settlement','需要可用资金及结算规则')
  }
  if (mechanism === 'otc-unknown-nav') {
    const o = input.otc
    if (!o?.channel.trim()) gap('otc-channel','需要实际销售渠道')
    if (!valid(o?.status) || o.status.value !== 'open') gap('otc-status','需核实本次申购/赎回状态或限额')
    if (!valid(o?.cutoff) || !o.cutoff.value.trim()) gap('otc-cutoff','需要申请截止时间及非开放日处理规则')
    if (!valid(o?.settlement) || !o.settlement.value.confirmation.trim() || !o.settlement.value.cashArrival.trim()) gap('otc-settlement','需要确认及现金到账安排，不能将赎回申请视为立即可用现金')
    if (input.side === 'buy') {
      if (!valid(o?.subscriptionFee) || !feeOK(o.subscriptionFee.value)) gap('subscription-fee','需要当前份额类别、金额档位及渠道适用申购费，零费率也需证据')
    } else {
      if (!o?.lots?.length || !positive(o.redemptionQuantity)) gap('redemption-lots','需要本次赎回份额和所选持有批次')
      else {
        if (new Set(o.lots.map(l => l.id)).size !== o.lots.length || o.lots.some(l => !l.id || !positive(l.quantity) || !before(l.acquiredAt,input.asOf) || !available(l.evidence,input.asOf))) gap('redemption-lots','批次日期、数量或来源无效，不能以单个purchaseDate代替完整批次')
        if (o.lots.reduce((sum,l) => sum+l.quantity,0) + 1e-8 < o.redemptionQuantity!) gap('redemption-quantity','所选批次不足以覆盖赎回份额')
        if (o.lots.some(l => !valid(l.fee) || !feeOK(l.fee.value))) gap('redemption-fee','每个所选批次都需当前适用费用依据；不预设满7天免费')
        o.lots.forEach(l => evidenceIds.add(l.evidence.id))
      }
    }
  }
  return { ticker: input.ticker, mechanism, informationReady: gaps.length === 0, gaps, evidenceIds: [...evidenceIds], priceKnownBeforeExecution: mechanism === 'exchange-quote' }
}

export type PortfolioResearchUniverse = ReturnType<typeof buildPortfolioResearchUniverse>

/** Deterministic compatibility for pre-window frozen JSON. Never consult live DB/time.
 * Older snapshots discarded conflict points; stop at their dated gap messages too.
 */
function frozenRiskNavSeries(p: ProductResearch): ProductNavPoint[] {
  if (Array.isArray(p.riskNavSeries)) return p.riskNavSeries
  const conflicts=(p.gaps || []).filter(g=>g.code==='nav-conflict').flatMap(g=>g.detail.match(/\d{4}-\d{2}-\d{2}/g) || [])
  if ((p.gaps || []).some(g=>g.code==='nav-conflict') && !conflicts.length) return []
  const points=new Map(p.navSeries.map(n=>[n.date,n])), result: ProductNavPoint[]=[]
  for (const date of [...new Set([...points.keys(),...conflicts])].sort().reverse()) {
    const n=points.get(date), newest=result[0]
    if (conflicts.includes(date) || !n || n.adjustedNav===null || !Number.isFinite(n.adjustedNav) || n.adjustedNav<=0) break
    if (newest && (newest.evidence.source!==n.evidence.source || newest.evidence.id!==n.evidence.id)) break
    result.push(n)
  }
  return result.reverse()
}

/** Private integration adapter. Monetary fields are preserved only in planningHoldings;
 * evidencePackets have public product facts, never balances, quantities, lots or channels.
 * Consumers must authorize sending even product selection to an AI separately.
 */
export function buildPortfolioPlanningHoldings(input: {
  holdings: readonly PlanningHolding[]
  universe: PortfolioResearchUniverse
  executionByTicker?: Record<string, { buy?: ProductExecutionInput; sell?: ProductExecutionInput }>
}) {
  const products=input.universe.products.map(p=>{
    if(p.coverage.adjustedNavWindow && Array.isArray(p.riskNavSeries)) return p
    const series=frozenRiskNavSeries(p)
    return {...p,riskNavSeries:series,coverage:{...p.coverage,adjustedNav:series.length>0,adjustedNavWindow:{
      start:series[0]?.date || null,end:series.at(-1)?.date || null,observations:series.length,fullHistoryObservations:p.navSeries.length,
      excludedObservations:p.navSeries.length-series.length,breakReason:null,
      basis:'从旧冻结JSON内净值及冲突记录确定性恢复；未查询当前数据库，未补因子',
    }},gaps:series.length?p.gaps.filter(g=>g.code!=='adjusted-nav-missing'):p.gaps}
  })
  const planningHoldings: PlanningHolding[] = input.holdings.map(h => {
    const p = products.find(p => p.ticker === h.ticker)
    if (!p) return {...h,researchReady:false,researchEvidenceIds:[],navHistory:[],navDate:null,buyFeePct:null,redemptionFeePct:null,settlementDays:null,executionGaps:['基金未纳入冻结产品研究范围']}
    const material = input.executionByTicker?.[h.ticker] || p.executionMaterials || {}
    const execution = (side: 'buy' | 'sell') => {
      const supplied = material[side]
      return validateProductExecution(supplied && supplied.ticker === h.ticker && supplied.productType === p.productType && supplied.side === side
        ? {...supplied,asOf:input.universe.asOf} : {ticker:h.ticker,productType:p.productType,side,asOf:input.universe.asOf})
    }
    const buy=execution('buy'),sell=execution('sell'),buyFee=material.buy?.otc?.subscriptionFee?.value,lots=material.sell?.otc?.lots
    // Scalar legacy fee fields cannot represent minimum/fixed fees or heterogeneous batches.
    const buyFeePct = buy.informationReady && buyFee?.fixedAmount === 0 ? buyFee.ratePct : null
    const fullPositionCovered = h.quantity != null && h.quantity > 0 && lots && lots.reduce((sum,l)=>sum+l.quantity,0) + 1e-8 >= h.quantity
    const trustedLegacyFee=['manual','provider-observed-floor'].includes(h.redemptionFeeSource||'')?h.redemptionFeePct??null:null
    const redemptionFeePct = sell.informationReady && fullPositionCovered && lots?.length && lots.every(l=>l.fee.value.fixedAmount===0 && l.fee.value.ratePct===lots[0].fee.value.ratePct) ? lots[0].fee.value.ratePct : trustedLegacyFee
    const days=material.sell?.otc?.settlement?.value.cashArrivalBusinessDays
    const settlementDays=sell.informationReady && days != null && Number.isInteger(days) && days >= 0 ? days : null
    const executionGapsBySide={buy:[...new Set(buy.gaps.map(g=>g.detail))],sell:[...new Set(sell.gaps.map(g=>g.detail))]}
    if (buyFeePct === null) executionGapsBySide.buy.push('买入成本不可用单一百分比表示或尚未核验')
    if (redemptionFeePct === null) executionGapsBySide.sell.push('赎回成本缺失、批次未覆盖全仓或存在固定费用/不同批次费率，需按具体方案计算')
    if (settlementDays === null) executionGapsBySide.sell.push('未核验具体到账工作日数')
    const executionGaps = p.productType === 'unknown' ? ['产品执行类型尚未核验'] : []
    const bad = new Set(['identity-conflict','holding-conflict','nav-conflict','nav-stale','holding-weight-unknown','exposure-over-100','holdings-stale','look-through-incomplete'])
    const identityReady = p.classification === 'official' || p.classification === 'source-verified' && p.productType !== 'feeder'
    // Explicit adjusted NAV remains required for covariance/risk estimates, but
    // its publication lag must not erase an otherwise auditable fund-level hold
    // or exposure decision. Risk consumers still receive an empty navHistory.
    const researchReady = identityReady && p.coverage.nav && p.coverage.holdings && p.coverage.mapping && p.coverage.allocation && !p.gaps.some(g=>bad.has(g.code))
    const ids = new Set([...p.identityEvidence,...p.navSeries.map(n=>n.evidence),...p.disclosedHoldings.map(h=>h.evidence),...p.assetAllocation.map(a=>a.evidence),...p.exposure.lookThrough.flatMap(h=>h.evidence)].map(e=>e.id))
    return {...h,fundType:p.productType,targetEtfCode:p.officialMapping?.targetEtfCode || null,targetIndexCode:p.officialMapping?.targetIndexCode || null,
      mappingSource:p.officialMapping?(p.classification==='official'?'official-document':'provider-cross-check'):h.mappingSource||null,mappingConfidence:p.officialMapping?(p.classification==='official'?1:.9):h.mappingConfidence??null,
      researchReady,researchEvidenceIds:[...ids],buyFeePct,redemptionFeePct,settlementDays,executionGaps,executionGapsBySide,
      navHistory:frozenRiskNavSeries(p).map(n=>({date:n.date,nav:n.adjustedNav!})),navDate:p.navSeries.at(-1)?.date || null,
    }
  })
  const evidencePackets=products.map(p=>({ticker:p.ticker,name:p.name,productType:p.productType,classification:p.classification,identityEvidence:p.identityEvidence,officialMapping:p.officialMapping,navSeries:p.navSeries,riskNavSeries:p.riskNavSeries,disclosedHoldings:p.disclosedHoldings,assetAllocation:p.assetAllocation,exposure:p.exposure,coverage:p.coverage,gaps:p.gaps}))
  return {planningHoldings,evidencePackets}
}
