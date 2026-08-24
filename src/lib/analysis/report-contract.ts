export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive'
export type InvestmentHorizon = 'short' | 'medium' | 'long'
export type ActionType = 'buy' | 'add' | 'hold' | 'reduce' | 'sell' | 'watch' | 'no_action' | 'data_review'

export type QualityLevel = 'high' | 'medium' | 'low' | 'unknown'

export type AnalysisModuleName = 'market' | 'news' | 'company' | 'portfolio'

export type ModuleHealth = {
  status: 'success' | 'degraded' | 'failed'
  fetchedAt?: string
  durationMs?: number
  records?: number
  error?: string
}

export type DataQuality = {
  level: QualityLevel
  score: number
  coverage: number
  freshness: number
  integrity: number
  moduleScores: {
    market: number
    news: number
    company: number
    portfolio: number
    consistency: number
  }
  gates: {
    canAddRisk: boolean
    canCalculateAllocation: boolean
    requiresDataReview: boolean
  }
  moduleStatus?: Partial<Record<AnalysisModuleName, ModuleHealth>>
  abnormalSamples?: Array<{
    name: string
    symbol: string
    reasons: string[]
    source: '数据源' | '链路'
  }>
  diagnostics?: {
    validMarketSamples: number
    totalMarketSamples: number
    executableGate: '通过' | '阻断'
    nextActions: string[]
  }
  issues: string[]
  warnings: string[]
}

export type Evidence = {
  id: string
  type: 'market' | 'news' | 'company' | 'portfolio' | 'quality' | 'graph'
  title: string
  value?: string
  direction?: 'positive' | 'negative' | 'mixed' | 'neutral'
  confidence: number
  source?: string
  observedAt?: string
}

export type DecisionItem = {
  action: ActionType
  target: string
  symbol?: string
  targetType: 'etf' | 'index' | 'holding' | 'sector'
  reason: string
  evidenceIds: string[]
  currentWeight?: number
  targetWeight?: number
  deltaWeight?: number
  allocation?: number
  targetPrice?: number | null
  priority?: number
  amount?: number | null
  trigger?: string[]
  invalidation?: string[]
  horizon?: InvestmentHorizon
  confidence?: number
}

export type StructuredAdvice = {
  industry: string
  decision: 'increase' | 'maintain' | 'reduce' | 'wait' | 'mixed'
  strategy: string
  summary: string
  investmentConclusion?: string
  decisionBrief?: {
    headline: string
    negativeSignals: string[]
    positiveSignals: string[]
    dataIssues: string[]
    action: string
    waitFor: string[]
  }
  riskWarning: string
  recommendations: DecisionItem[]
  evidence: Evidence[]
  limitations: string[]
  generatedBy: 'ai' | 'rules' | 'hybrid'
  validation: {
    valid: boolean
    warnings: string[]
  }
}

export type NormalizedMarket = {
  industryName?: string
  analyzedAt?: string
  periodDays?: number
  etfs: Record<string, unknown>[]
  indices: Record<string, unknown>[]
  marketIndices: Record<string, unknown>[]
  overview: Record<string, unknown>
  sectorFlow: Record<string, unknown>
  dataQuality: Record<string, unknown>
  trendReport: string
  quantitativeScores: Record<string, unknown>
  source?: string
  etfSelection: Array<Record<string, unknown>>
}

export type NormalizedNewsItem = Record<string, unknown> & {
  id?: string
  title: string
  summary: string
  source?: string
  publishedAt?: string
  sentiment?: number
  impact?: number
  segmentCodes: string[]
}

export type NormalizedNews = {
  items: NormalizedNewsItem[]
  analysis: string
  source?: string
}

export type NormalizedCompany = {
  total: number
  analyzed: number
  topCompanies: Record<string, unknown>[]
  summaries: Record<string, unknown>[]
  segmentAnalysis: Record<string, unknown>[]
  coreConclusion: string
  trendReport: string
  trendJudgment?: string
  focusPoints?: string
  investmentConclusion?: string
  coverage: Record<string, unknown>
  source?: string
}

export type NormalizedHolding = Record<string, unknown> & {
  id?: string
  ticker?: string
  name?: string
  industryDomain?: string
  industryDomainCode?: string
  industryDomainSource?: string
  industryDomainConfidence?: number
  quantity: number
  unitNav: number
  currentPrice?: number
  marketValue?: number
  weight?: number
  profitLossPct?: number
  dailyChangePct?: number
  periodChangePct?: number
  trend?: string
  trendSignal?: 'strong_up' | 'up' | 'sideways' | 'down' | 'strong_down' | 'unknown'
  priceDataSource?: string
  priceDataAsOf?: string
  underlyingHoldings?: Array<{
    stock_code?: string
    stock_name?: string
    weight?: number
  }>
}

export type NormalizedPortfolio = {
  id?: string
  name?: string
  cashBalance: number
  holdings: NormalizedHolding[]
  totalValue: number
  analyzedAt: string
  valuationMode?: 'imported_nav' | 'current' | 'estimated'
  valuationSource?: string
  missingFields?: string[]
}

export type StructureSummary = {
  segmentCount: number
  taggedNewsCount: number
  positiveSegments: Record<string, unknown>[]
  negativeSegments: Record<string, unknown>[]
  segmentCoverage: number
  impactChains?: Array<{
    newsId?: string
    title: string
    direction: 'positive' | 'negative' | 'mixed'
    impact?: number
    segments: string[]
    companies: string[]
    evidence: string
  }>
}

export type DailyActionReportData = {
  schemaVersion: '1.0' | '2.0'
  snapshot: {
    runId: string
    asOf: string
    periodDays: number
    industryId: string
    industryName: string
    timezone?: string
    companySource?: 'graph' | 'etf_holdings'
    marketToCompany?: {
      selectedEtfCodes: string[]
      companySource: 'graph' | 'etf_holdings'
    }
    modules?: Partial<Record<AnalysisModuleName, ModuleHealth>>
    preferences: {
      riskTolerance: RiskTolerance
      investmentHorizon: InvestmentHorizon
    }
  }
  quality: DataQuality
  market: NormalizedMarket
  news: NormalizedNews
  company: NormalizedCompany
  portfolio: NormalizedPortfolio
  structure: StructureSummary
  advice: StructuredAdvice
  evidence: Evidence[]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function extractMarkdownSection(value: string, heading: string) {
  const start = value.indexOf(heading)
  if (start < 0) return ''
  const contentStart = start + heading.length
  const remainder = value.slice(contentStart).replace(/^\s+/, '')
  const headingLevel = heading.match(/^#+/)?.[0].length ?? 1
  const nextHeading = remainder.search(new RegExp(`\\n#{1,${headingLevel}}\\s+`))
  const contentEnd = nextHeading >= 0 ? nextHeading : remainder.length
  return remainder.slice(0, contentEnd).trim()
}

export function localizeUserFacingText(value: string) {
  return value
    .replace(/\bpositive\b/gi, '利好')
    .replace(/\bnegative\b/gi, '利空')
    .replace(/\bneutral\b/gi, '中性')
    .replace(/\bmixed\b/gi, '混合')
    .replace(/\bleader\b/gi, '头部')
    .replace(/\bmajor\b/gi, '主要')
    .replace(/\bemerging\b/gi, '新兴')
    .replace(/\brelated\b/gi, '相关')
    .replace(/\bstrong_downtrend\b/gi, '强势下跌')
    .replace(/\bstrong_uptrend\b/gi, '强势上涨')
    .replace(/\bdowntrend\b/gi, '下跌趋势')
    .replace(/\buptrend\b/gi, '上涨趋势')
    .replace(/\bsideways\b/gi, '震荡')
    .replace(/\bunknown\b/gi, '未知')
    .replace(/\bdata_review\b/gi, '数据复核')
    .replace(/\bno_action\b/gi, '今日不动')
    .replace(/\bmaintain\b/gi, '维持仓位')
    .replace(/\bincrease\b/gi, '增加')
    .replace(/\bdecrease\b/gi, '减少')
    .replace(/\breduce\b/gi, '降低风险')
    .replace(/\bwatch\b/gi, '观察')
    .replace(/\bhold\b/gi, '持有')
    .replace(/\bbuy\b/gi, '建仓')
    .replace(/\badd\b/gi, '加仓')
    .replace(/\bsell\b/gi, '减仓')
    .replace(/\bwait\b/gi, '等待')
    .replace(/\bmixed\b/gi, '混合')
    .replace(/\bhigh\b/gi, '高')
    .replace(/\bmedium\b/gi, '中')
    .replace(/\blow\b/gi, '低')
    .replace(/\bsuccess\b/gi, '成功')
    .replace(/\bdegraded\b/gi, '降级')
    .replace(/\bfailed\b/gi, '失败')
    .replace(/\bshort\b/gi, '短期')
    .replace(/\blong\b/gi, '长期')
    .replace(/\bcurrentPrice\b/g, '当前价格')
    .replace(/\bprofitLossPct\b/g, '盈亏比例')
    .replace(/\bweight\b/g, '组合权重')
    .replace(/\bcanAddRisk\b/g, '新增风险门禁')
}

/**
 * Advice fields are rendered as plain text in the report overview. Strip
 * presentation-only Markdown markers here so historical and newly generated
 * reports follow the same display contract.
 */
export function cleanAdviceText(value: string) {
  return localizeUserFacingText(value)
    .replace(/(?:\*\*|__|~~|`)/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gmu, '')
    .replace(/^\s*[-*+]\s+/gmu, '')
    .replace(/\s+([，。！？；：、])/gu, '$1')
    .replace(/([。！？]){2,}/gu, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[%,$¥￥\s]/g, '')
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function textValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function normalizeRow(value: unknown): Record<string, unknown> {
  const row = record(value)
  return {
    ...row,
    code: row.code ?? row.symbol ?? row.ticker,
    symbol: row.symbol ?? row.code ?? row.ticker,
    name: row.name ?? row.title,
    price_change_pct: numberValue(row.price_change_pct ?? row.priceChangePct ?? row.change_pct ?? row.changePct),
    current_price: numberValue(row.current_price ?? row.currentPrice ?? row.price),
    daily_change_pct: numberValue(row.daily_change_pct ?? row.dailyChangePct ?? row.changePct),
    latest_change_pct: numberValue(row.latest_change_pct ?? row.latestChangePct ?? row.daily_change_pct ?? row.dailyChangePct ?? row.changePct),
    volatility: numberValue(row.volatility),
    max_drawdown: numberValue(row.max_drawdown ?? row.maxDrawdown),
  }
}

function normalizeSectorFlow(value: unknown): Record<string, unknown> {
  const raw = record(value)
  const hasSnapshot = [
    raw.topInflowSectors,
    raw.top_inflow_sectors,
    raw.inflowSectors,
    raw.topOutflowSectors,
    raw.top_outflow_sectors,
    raw.outflowSectors,
  ].some((item) => item !== undefined)
  if (!hasSnapshot) return raw
  const normalizeRows = (items: unknown) => array(items).map((item) => {
    const row = record(item)
    const rawFlow = row.netFlow ?? row.net_flow ?? row.flow ?? row['今日主力净流入-净额'] ?? row['主力净流入'] ?? row['净流入']
    return {
      ...row,
      sector: textValue(row.sector ?? row.name ?? row['名称'], '未命名板块'),
      netFlow: numberValue(rawFlow),
      changePct: numberValue(row.changePct ?? row.change_pct ?? row['今日涨跌幅'] ?? row['涨跌幅']),
      trend: textValue(row.trend) || ((numberValue(rawFlow) ?? 0) > 0 ? 'inflow' : (numberValue(rawFlow) ?? 0) < 0 ? 'outflow' : 'flat'),
    }
  })
  const topInflowSectors = normalizeRows(raw.topInflowSectors ?? raw.top_inflow_sectors ?? raw.inflowSectors)
  const topOutflowSectors = normalizeRows(raw.topOutflowSectors ?? raw.top_outflow_sectors ?? raw.outflowSectors)
  return {
    ...raw,
    topInflowSectors,
    topOutflowSectors,
  }
}

export function normalizeMarket(value: unknown): NormalizedMarket {
  const raw = record(value)
  const overview = record(raw.market_overview ?? raw.marketOverview)
  return {
    industryName: textValue(raw.industry_name ?? raw.industryName),
    analyzedAt: textValue(raw.analyzed_at ?? raw.analyzedAt),
    periodDays: numberValue(raw.analysis_period_days ?? raw.periodDays),
    etfs: array(raw.etf_analysis ?? raw.etfs).map(normalizeRow),
    indices: array(raw.index_analysis ?? raw.indices).map(normalizeRow),
    marketIndices: array(raw.market_indices ?? overview.indices).map(normalizeRow),
    overview,
    sectorFlow: normalizeSectorFlow(raw.sector_flow ?? raw.sectorFlow),
    dataQuality: record(raw.data_quality ?? raw.dataQuality),
    trendReport: textValue(raw.trend_report ?? raw.trendReport),
    quantitativeScores: record(raw.quantitative_scores ?? raw.quantitativeScores),
    source: textValue(raw.etf_source ?? raw.source),
    etfSelection: array(raw.etf_selection ?? raw.etfSelection).map(normalizeRow),
  }
}

function isAbnormalMarketRow(row: Record<string, unknown>) {
  return Boolean(row.is_fallback)
    || (numberValue(row.price_change_pct) != null && Math.abs(numberValue(row.price_change_pct) as number) > 50)
    || (numberValue(row.volatility) != null && (numberValue(row.volatility) as number) > 150)
    || (numberValue(row.max_drawdown) != null && (numberValue(row.max_drawdown) as number) > 70)
}

export function deriveMarketQualitySnapshot(market: NormalizedMarket, fallbackLevel = '未知') {
  const source = market.dataQuality
  const totalEtfs = market.etfs.length
  const abnormalEtfs = market.etfs.filter(isAbnormalMarketRow).length
  const dataPointValues = market.etfs
    .map((row) => numberValue(row.data_points ?? row.dataPoints))
    .filter((value): value is number => value != null)
  const averageDataPoints = dataPointValues.length > 0
    ? dataPointValues.reduce((sum, value) => sum + value, 0) / dataPointValues.length
    : 0
  const sourceLevel = textValue(source.level)
  const level = sourceLevel
    || (totalEtfs === 0 ? '低' : averageDataPoints < 30 ? '中' : abnormalEtfs > 0 ? '中' : fallbackLevel)
  return {
    ...source,
    level,
    total_etfs: numberValue(source.total_etfs) ?? totalEtfs,
    abnormal_etfs: numberValue(source.abnormal_etfs) ?? abnormalEtfs,
    eligible_etfs: numberValue(source.eligible_etfs) ?? totalEtfs - abnormalEtfs,
    avg_data_points: numberValue(source.avg_data_points) ?? averageDataPoints,
  }
}

export function normalizeMarketReportText(value: unknown, market: NormalizedMarket, fallbackLevel = '未知') {
  const text = textValue(value)
  if (!text) return text

  const quality = deriveMarketQualitySnapshot(market, fallbackLevel)
  const qualityLabel = localizeUserFacingText(textValue(quality.level, fallbackLevel))
  const totalEtfs = numberValue(quality.total_etfs) ?? market.etfs.length
  const averageDataPoints = numberValue(quality.avg_data_points) ?? 0
  const abnormalEtfs = numberValue(quality.abnormal_etfs) ?? 0
  const qualityDetail = abnormalEtfs > 0
    ? `数据质量：${qualityLabel}（${totalEtfs}只ETF，平均${averageDataPoints.toFixed(0)}天数据；其中${abnormalEtfs}只存在异常收益、波动或回撤，异常样本不参与动作排序）`
    : `数据质量：${qualityLabel}（${totalEtfs}只ETF，平均${averageDataPoints.toFixed(0)}天数据，样本充足）`

  let normalized = localizeUserFacingText(text)
  normalized = normalized.replace(
    /数据质量[：:]\s*\*{0,2}(?:高|中|低|未知|high|medium|low|unknown)\*{0,2}(?:（[^）\n]*）|\([^\)\n]*\))?/gi,
    qualityDetail,
  )

  const sectorFlow = market.sectorFlow
  const hasSectorFlowSnapshot = Array.isArray(sectorFlow.topInflowSectors) || Array.isArray(sectorFlow.topOutflowSectors)
  const inflowCount = Array.isArray(sectorFlow.topInflowSectors) ? sectorFlow.topInflowSectors.length : 0
  const outflowCount = Array.isArray(sectorFlow.topOutflowSectors) ? sectorFlow.topOutflowSectors.length : 0
  const flowNotice = hasSectorFlowSnapshot
    ? `板块资金流向快照已获取（净流入${inflowCount}个板块、净流出${outflowCount}个板块），可用于辅助判断市场情绪。`
    : '历史报告未保存板块资金流向快照，当前不据此判断资金轮动；请重新生成报告以纳入该数据。'
  let flowNoticeInserted = false
  normalized = normalized.replace(/(?:⚠️\s*)?板块资金流向数据缺失，影响市场情绪判断完整性|数据缺失无法判断资金轮动方向，但从大盘表现看，科技板块处于资金流出周期/g, () => {
    if (flowNoticeInserted) return ''
    flowNoticeInserted = true
    return flowNotice
  })
  return normalized.replace(/\n{3,}/g, '\n\n').trim()
}

export function normalizeNews(value: unknown): NormalizedNews {
  const raw = record(value)
  const items = array(raw.news ?? raw.items).map((item) => {
    const row = record(item)
    return {
      ...row,
      id: textValue(row.id),
      title: textValue(row.title, '未命名资讯'),
      summary: textValue(row.summary ?? row.content, textValue(row.title, '暂无摘要')),
      source: textValue(row.source),
      publishedAt: textValue(row.published_at ?? row.publishTime ?? row.publish_time),
      sentiment: numberValue(row.sentiment),
      impact: numberValue(row.impact),
      segmentCodes: array(row.segmentCodes ?? row.segment_codes).map((item) => textValue(item)).filter(Boolean),
    }
  })
  return {
    items,
    analysis: localizeUserFacingText(textValue(raw.analysis)),
    source: textValue(raw.source),
  }
}

export function normalizeCompany(value: unknown): NormalizedCompany {
  const raw = record(value)
  const trendReport = textValue(raw.trend_report ?? raw.trendReport)
  const trendJudgment = localizeUserFacingText(
    textValue(raw.trend_judgment ?? raw.trendJudgment)
      || extractMarkdownSection(trendReport, '## 一、趋势判断')
      || extractMarkdownSection(trendReport, '## 一、所选企业趋势判断')
      || extractMarkdownSection(trendReport, '### 2. 产业趋势判断')
      || extractMarkdownSection(trendReport, '### 3. 核心判断')
      || extractMarkdownSection(trendReport, '## 一、核心结论'),
  )
  const focusPoints = localizeUserFacingText(
    textValue(raw.focus_points ?? raw.focusPoints)
      || extractMarkdownSection(trendReport, '## 二、关注重点')
      || extractMarkdownSection(trendReport, '### 5. 后续跟踪清单')
      || extractMarkdownSection(trendReport, '### 5. 后续跟踪触发条件')
      || '',
  )
  const investmentConclusion = localizeUserFacingText(
    textValue(raw.investment_conclusion ?? raw.investmentConclusion)
      || extractMarkdownSection(trendReport, '## 三、投资建议结论'),
  )
  return {
    total: numberValue(raw.total_companies ?? raw.total) ?? 0,
    analyzed: numberValue(raw.analyzed_companies ?? raw.analyzed) ?? 0,
    topCompanies: array(raw.selected_companies ?? raw.selectedCompanies ?? raw.top_companies ?? raw.topCompanies).map(normalizeRow),
    summaries: array(raw.company_summaries ?? raw.summaries).map(normalizeRow),
    segmentAnalysis: array(raw.segment_analysis ?? raw.segmentAnalysis).map(normalizeRow),
    coreConclusion: localizeUserFacingText(textValue(raw.core_conclusion ?? raw.coreConclusion) || extractMarkdownSection(trendReport, '## 一、核心结论') || trendReport),
    trendReport: localizeUserFacingText(trendReport),
    trendJudgment,
    focusPoints,
    investmentConclusion,
    coverage: record(raw.data_coverage ?? raw.coverage),
    source: textValue(raw.source),
  }
}

export function normalizePortfolio(value: unknown): NormalizedPortfolio {
  const raw = record(value)
  const holdings = array(raw.holdings).map((item) => {
    const row = record(item)
    const currentPrice = numberValue(row.currentPrice ?? row.current_price)
    const unitNav = numberValue(row.unitNav ?? row.unit_nav) ?? 0
    const marketValue = numberValue(row.marketValue ?? row.market_value)
    return {
      ...row,
      id: textValue(row.id),
      ticker: textValue(row.ticker ?? row.symbol),
      name: textValue(row.name, '未命名持仓'),
      industryDomain: textValue(row.industryDomain ?? row.industry_domain),
      industryDomainCode: textValue(row.industryDomainCode ?? row.industry_domain_code),
      industryDomainSource: textValue(row.industryDomainSource ?? row.industry_domain_source),
      industryDomainConfidence: numberValue(row.industryDomainConfidence ?? row.industry_domain_confidence),
      quantity: numberValue(row.quantity) ?? 0,
      unitNav,
      currentPrice,
      marketValue: marketValue ?? (currentPrice ?? unitNav) * (numberValue(row.quantity) ?? 0),
      weight: numberValue(row.weight),
      profitLossPct: numberValue(row.profitLossPct ?? row.profit_loss_pct),
    }
  })
  const cashBalance = numberValue(raw.cashBalance ?? raw.cash_balance) ?? 0
  const totalValue = holdings.reduce((sum, item) => sum + (item.marketValue ?? item.quantity * item.unitNav), 0) + cashBalance
  const hasImportedValuation = holdings.length > 0 && holdings.every((item) => item.marketValue != null && Number.isFinite(item.marketValue))
  const normalizedHoldings = holdings.map((item) => ({
    ...item,
    weight: item.weight ?? (totalValue > 0 && item.marketValue != null ? item.marketValue / totalValue * 100 : undefined),
  }))
  return {
    id: textValue(raw.id),
    name: textValue(raw.name),
    cashBalance,
    holdings: normalizedHoldings,
    totalValue,
    analyzedAt: textValue(raw.analyzedAt ?? raw.analyzed_at, new Date().toISOString()),
    valuationMode: hasImportedValuation ? (holdings.some((item) => item.currentPrice != null) ? 'current' : 'imported_nav') : 'estimated',
    valuationSource: hasImportedValuation ? '个人账号导入的单位净值与份额' : '估算数据',
    missingFields: [
      holdings.some((item) => item.currentPrice == null) ? 'currentPrice' : '',
      holdings.some((item) => item.profitLossPct == null) ? 'profitLossPct' : '',
    ].filter(Boolean),
  }
}

export function normalizeAdvice(value: unknown, industryName: string): Partial<StructuredAdvice> {
  const raw = record(value)
  const recommendations = array(raw.recommendations).map((item) => {
    const row = record(item)
    const action = textValue(row.action, 'watch') as ActionType
    const isPositionAction = ['buy', 'add', 'reduce', 'sell'].includes(action)
    return {
      action: ['buy', 'add', 'hold', 'reduce', 'sell', 'watch', 'no_action', 'data_review'].includes(action) ? action : 'watch',
      target: textValue(row.target ?? row.name, '未指定标的'),
      symbol: textValue(row.symbol ?? row.code),
      targetType: ['etf', 'index', 'holding', 'sector'].includes(textValue(row.targetType))
        ? textValue(row.targetType) as DecisionItem['targetType']
        : 'etf',
      reason: cleanAdviceText(textValue(row.reason, '暂无执行理由')),
      evidenceIds: array(row.evidenceIds).map((id) => textValue(id)).filter(Boolean),
      currentWeight: isPositionAction ? numberValue(row.currentWeight) : undefined,
      targetWeight: isPositionAction ? numberValue(row.targetWeight) : undefined,
      deltaWeight: isPositionAction ? numberValue(row.deltaWeight) : undefined,
      allocation: isPositionAction ? numberValue(row.allocation) : undefined,
      targetPrice: numberValue(row.targetPrice) ?? null,
      priority: numberValue(row.priority),
      amount: isPositionAction ? numberValue(row.amount) : null,
      trigger: array(row.trigger).map((item) => cleanAdviceText(textValue(item))).filter(Boolean),
      invalidation: array(row.invalidation).map((item) => cleanAdviceText(textValue(item))).filter(Boolean),
      horizon: ['short', 'medium', 'long'].includes(textValue(row.horizon))
        ? textValue(row.horizon) as InvestmentHorizon
        : undefined,
      confidence: numberValue(row.confidence),
    } satisfies DecisionItem
  })
  const briefRaw = record(raw.decisionBrief ?? raw.decision_brief)
  const decisionBrief = briefRaw.headline
    ? {
        headline: cleanAdviceText(textValue(briefRaw.headline)),
        negativeSignals: array(briefRaw.negativeSignals ?? briefRaw.negative_signals).map((item) => cleanAdviceText(textValue(item))).filter(Boolean),
        positiveSignals: array(briefRaw.positiveSignals ?? briefRaw.positive_signals).map((item) => cleanAdviceText(textValue(item))).filter(Boolean),
        dataIssues: array(briefRaw.dataIssues ?? briefRaw.data_issues).map((item) => cleanAdviceText(textValue(item))).filter(Boolean),
        action: cleanAdviceText(textValue(briefRaw.action)),
        waitFor: array(briefRaw.waitFor ?? briefRaw.wait_for).map((item) => cleanAdviceText(textValue(item))).filter(Boolean),
      }
    : undefined
  const summary = cleanAdviceText(textValue(raw.summary)) || decisionBrief?.headline || ''
  const strategy = cleanAdviceText(textValue(raw.strategy)) || [decisionBrief?.action, decisionBrief?.waitFor.length ? `下一步等待：${decisionBrief.waitFor.join('；')}` : ''].filter(Boolean).join('；')
  return {
    industry: textValue(raw.industry, industryName),
    decision: ['increase', 'maintain', 'reduce', 'wait', 'mixed'].includes(textValue(raw.decision))
      ? textValue(raw.decision) as StructuredAdvice['decision']
      : 'mixed',
    strategy,
    summary,
    investmentConclusion: cleanAdviceText(textValue(raw.investmentConclusion ?? raw.investment_conclusion)),
    decisionBrief,
    riskWarning: cleanAdviceText(textValue(raw.riskWarning)),
    recommendations,
    evidence: array(raw.evidence).map((item) => {
      const evidence = record(item)
      return {
        ...evidence,
        title: localizeUserFacingText(textValue(evidence.title)),
        value: localizeUserFacingText(textValue(evidence.value)),
      } as Evidence
    }),
    limitations: array(raw.limitations).map((item) => localizeUserFacingText(textValue(item))).filter(Boolean),
    generatedBy: ['ai', 'rules', 'hybrid'].includes(textValue(raw.generatedBy))
      ? textValue(raw.generatedBy) as StructuredAdvice['generatedBy']
      : 'rules',
    validation: record(raw.validation) as StructuredAdvice['validation'],
  }
}
