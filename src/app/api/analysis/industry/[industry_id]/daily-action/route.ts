import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { aiClient } from '@/lib/ai/ai-factory'
import { prisma } from '@/lib/db'
import { assessReportQuality, buildEvidence, buildRuleBasedAdvice, buildStructureSummary, composeInvestmentConclusion, ensureDailyActionCoverage, mergeNewsInsightIntoAdvice, mergeQualityIntoRiskWarning, parseJsonObject, validateAdvice } from '@/lib/analysis/daily-action'
import { buildIndustryNewsInsightPrompt, buildNewsInsightFallback } from '@/lib/analysis/news-insight'
import {
  DailyActionReportData,
  InvestmentHorizon,
  ModuleHealth,
  RiskTolerance,
  localizeUserFacingText,
  normalizeAdvice,
  normalizeCompany,
  normalizeMarket,
  normalizeNews,
  normalizePortfolio,
  textValue,
} from '@/lib/analysis/report-contract'

export const maxDuration = 360

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

type ModuleResult = {
  success: boolean
  payload: Record<string, unknown>
  error?: string
  fetchedAt: string
  durationMs: number
}

const ALL_PAGES = ['overview', 'market', 'news', 'company', 'portfolio'] as const
type PageKey = typeof ALL_PAGES[number]
const skippedModule = (): ModuleResult => ({ success: true, payload: {}, fetchedAt: new Date().toISOString(), durationMs: 0 })

function errorMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const candidate of [record.error, record.message, record.detail]) {
      const message = errorMessage(candidate)
      if (message) return message
    }
  }
  return undefined
}

async function fetchModule(url: string): Promise<ModuleResult> {
  const startedAt = Date.now()
  const fetchedAt = new Date().toISOString()
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(300000),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      return { success: false, payload, error: errorMessage(payload.detail) || errorMessage(payload.error) || `HTTP ${response.status}`, fetchedAt, durationMs: Date.now() - startedAt }
    }
    return { success: true, payload, fetchedAt, durationMs: Date.now() - startedAt }
  } catch (error) {
    const isTimeout = error instanceof DOMException
      ? error.name === 'TimeoutError' || error.name === 'AbortError'
      : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || /abort|timeout/i.test(error.message))
    return {
      success: false,
      payload: {},
      error: isTimeout ? '数据服务请求超时（300秒），未返回可用结果' : error instanceof Error ? error.message : '数据服务不可用',
      fetchedAt,
      durationMs: Date.now() - startedAt,
    }
  }
}

function moduleHealth(result: ModuleResult, records: number, degradedReason?: string): ModuleHealth {
  return {
    status: result.success ? (records > 0 && !degradedReason ? 'success' : 'degraded') : 'failed',
    fetchedAt: result.fetchedAt,
    durationMs: result.durationMs,
    records,
    error: result.error || degradedReason,
  }
}

function portfolioDegradedReason(portfolio: ReturnType<typeof normalizePortfolio>) {
  const complete = portfolio.holdings.length > 0
    && portfolio.totalValue > 0
    && portfolio.holdings.every((holding) => holding.marketValue != null && holding.weight != null)
  return portfolio.holdings.length > 0 && !complete
    ? '持仓金额或权重字段不完整，无法形成精确调仓依据'
    : undefined
}

function numberFrom(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function pickRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pickRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(pickRecord)
  const record = pickRecord(value)
  for (const key of ['data', 'items', 'quotes', 'klines', 'daily']) {
    if (Array.isArray(record[key])) return record[key].map(pickRecord)
  }
  if (record.data && typeof record.data === 'object') return pickRows(record.data)
  return []
}

async function enrichPortfolioMarketData(portfolio: ReturnType<typeof normalizePortfolio>) {
  if (!portfolio.holdings.length) return portfolio
  const enriched = await Promise.all(portfolio.holdings.map(async (holding) => {
    const ticker = holding.ticker
    if (!ticker) return holding
    try {
      const [quoteResponse, klineResponse, holdingsResponse] = await Promise.all([
        fetch(`${DATA_SERVICE_URL}/api/etf/realtime?symbols=${encodeURIComponent(ticker)}`, { signal: AbortSignal.timeout(12000), cache: 'no-store' }),
        fetch(`${DATA_SERVICE_URL}/api/market/kline?code=${encodeURIComponent(ticker)}&period=daily&count=60`, { signal: AbortSignal.timeout(12000), cache: 'no-store' }),
        fetch(`${DATA_SERVICE_URL}/api/etf/${encodeURIComponent(ticker)}/holdings`, { signal: AbortSignal.timeout(12000), cache: 'no-store' }),
      ])
      const quotePayload = await quoteResponse.json().catch(() => ({}))
      const klinePayload = await klineResponse.json().catch(() => ({}))
      const holdingsPayload = await holdingsResponse.json().catch(() => ({}))
      const quote = pickRows(quotePayload)[0] || {}
      const underlyingHoldings = pickRows(holdingsPayload)
        .map((row) => ({ stock_code: String(row.stock_code ?? row.code ?? ''), stock_name: String(row.stock_name ?? row.name ?? ''), weight: numberFrom(row.weight) }))
        .filter((row) => row.stock_code || row.stock_name)
      const klines = pickRows(klinePayload)
      const latest = klines.at(-1) || {}
      const previous = klines.at(-2) || {}
      const first = klines[0] || {}
      const currentPrice = numberFrom(quote.price ?? quote.current_price ?? quote.nav ?? latest.close)
      const dailyChangePct = numberFrom(quote.changePct ?? quote.change_pct ?? quote.daily_change_pct)
        ?? (numberFrom(latest.close) != null && numberFrom(previous.close) ? ((numberFrom(latest.close)! / numberFrom(previous.close)! - 1) * 100) : undefined)
      const periodChangePct = numberFrom(latest.close) != null && numberFrom(first.close) ? ((numberFrom(latest.close)! / numberFrom(first.close)! - 1) * 100) : undefined
      const closes = klines.map((row) => numberFrom(row.close)).filter((value): value is number => value != null)
      const shortAverage = closes.length >= 5 ? closes.slice(-5).reduce((sum, value) => sum + value, 0) / 5 : undefined
      const longAverage = closes.length >= 20 ? closes.slice(-20).reduce((sum, value) => sum + value, 0) / 20 : undefined
      const trendSignal: 'strong_up' | 'up' | 'sideways' | 'down' | 'strong_down' | 'unknown' = shortAverage == null || longAverage == null
        ? (dailyChangePct == null ? 'unknown' : dailyChangePct > 1 ? 'up' : dailyChangePct < -1 ? 'down' : 'sideways')
        : shortAverage > longAverage * 1.015 ? 'strong_up'
          : shortAverage > longAverage ? 'up'
            : shortAverage < longAverage * 0.985 ? 'strong_down'
              : shortAverage < longAverage ? 'down' : 'sideways'
      return {
        ...holding,
        ...(currentPrice != null ? { currentPrice, marketValue: currentPrice * holding.quantity } : {}),
        dailyChangePct,
        periodChangePct,
        trendSignal,
        trend: trendSignal,
        priceDataSource: quoteResponse.ok || klineResponse.ok ? '行情服务' : undefined,
        priceDataAsOf: new Date().toISOString(),
        underlyingHoldings,
      }
    } catch {
      return holding
    }
  }))
  const totalValue = enriched.reduce((sum, item) => sum + (item.marketValue ?? item.quantity * item.unitNav), 0) + portfolio.cashBalance
  return {
    ...portfolio,
    holdings: enriched.map((item) => ({
      ...item,
      weight: item.weight ?? (totalValue > 0 && item.marketValue != null ? item.marketValue / totalValue * 100 : undefined),
    })),
    totalValue,
    valuationMode: enriched.some((item) => item.currentPrice != null) ? 'current' as const : portfolio.valuationMode,
    valuationSource: enriched.some((item) => item.currentPrice != null) ? '行情服务实时价格与组合份额' : portfolio.valuationSource,
  }
}

function buildNewsGraphContext(company: ReturnType<typeof normalizeCompany>) {
  return {
    stages: [{
      name: '产业链环节',
      segments: company.segmentAnalysis.map((item) => String(item.segment || '')).filter(Boolean),
      companyCount: company.analyzed,
    }],
    totalSegments: company.segmentAnalysis.length,
    totalCompanies: company.total,
    companyNames: company.topCompanies.map((item) => String(item.name || '')).filter(Boolean).slice(0, 30),
  }
}

async function enrichNewsAnalysis(
  industryName: string,
  news: ReturnType<typeof normalizeNews>,
  company: ReturnType<typeof normalizeCompany>,
  structure: ReturnType<typeof buildStructureSummary>,
) {
  const fallback = buildNewsInsightFallback(news, company, structure)
  if (!news.items.length) return fallback

  try {
    const raw = await aiClient.complete({
      prompt: buildIndustryNewsInsightPrompt(industryName, news.items.slice(0, 50) as Array<Record<string, unknown>>, buildNewsGraphContext(company)),
      maxTokens: 2400,
      system: '只返回中文资讯与产业链分析报告，不要输出英文标签、代码、买卖指令或未提供的事实。',
    })
    return raw.trim() || fallback
  } catch (error) {
    console.warn('资讯与产业链分析生成失败，使用结构化兜底:', error)
    return fallback
  }
}

function buildPrompt(data: DailyActionReportData) {
  const marketRows = data.market.etfs.slice(0, 20).map((item) => ({
    name: item.name,
    symbol: item.code || item.symbol,
    change: item.price_change_pct,
    dailyChange: item.daily_change_pct ?? item.latest_change_pct,
    trend: item.trend,
    volatility: item.volatility,
    maxDrawdown: item.max_drawdown,
    fallback: item.is_fallback,
  }))
  const newsRows = data.news.items.slice(0, 20).map((item) => ({
    title: item.title,
    summary: item.summary,
    sentiment: item.sentiment,
    impact: item.impact,
    publishedAt: item.publishedAt,
  }))
  const companyRows = data.company.topCompanies.slice(0, 10).map((item) => ({
    name: item.name,
    symbol: item.symbol,
    score: item.overall_score ?? item.overallScore,
    representativenessScore: item.representativeness_score ?? item.representativenessScore,
    representativenessBasis: item.representativeness_basis ?? item.representativenessBasis,
    marketPosition: item.market_position ?? item.marketPosition,
    segments: Array.isArray(item.node_refs) ? item.node_refs.map((ref) => (ref as Record<string, unknown>).segment_name).filter(Boolean).slice(0, 3) : [],
    change: (item.price_metrics as Record<string, unknown> | undefined)?.price_change_pct,
    latestChange: (item.price_metrics as Record<string, unknown> | undefined)?.latest_change_pct,
    financialMetrics: item.financial_metrics,
    financialSamples: item.financial_samples,
    announcementSamples: item.announcement_samples,
    latestAnnouncementSamples: item.latest_announcement_samples,
    announcementSignal: item.announcement_signal,
    confidence: item.score_confidence ?? item.scoreConfidence,
  }))
  const holdingRows = data.portfolio.holdings.slice(0, 30).map((item) => ({
    ticker: item.ticker,
    name: item.name,
    quantity: item.quantity,
    weight: item.weight,
    industryDomain: item.industryDomain,
    industryDomainCode: item.industryDomainCode,
    industryDomainSource: item.industryDomainSource,
    currentPrice: item.currentPrice,
    dailyChangePct: item.dailyChangePct,
    periodChangePct: item.periodChangePct,
    trend: item.trend,
    trendSignal: item.trendSignal,
    priceDataSource: item.priceDataSource,
    priceDataAsOf: item.priceDataAsOf,
    underlyingHoldings: item.underlyingHoldings,
  }))
  return `你是严格的投研决策助手。请基于以下已经标准化的数据，生成“每日投资行动报告”的结构化 JSON。

硬性要求：
1. 只允许引用输入中存在的标的、数字和事实，不得补造价格、估值或财报结论。
2. 只有当 quality.gates.canAddRisk 为 true 时才能给出 buy/add；否则只能给出 hold、watch、no_action 或 data_review。
3. 每条建议必须给出 symbol、action、reason、trigger、invalidation、confidence 和 evidenceIds。
4. targetPrice 没有可靠计算依据时必须为 null。
5. 返回纯 JSON，不要 Markdown，不要代码围栏。
6. 企业列表中的 score 是近期数据综合分，不等于行业影响力；优先参考 representativeness_score、representativeness_basis 和产业链环节判断企业代表性。
7. 不得因为短期涨幅或公告数量较高，就把企业称为行业龙头；行业地位、产业链关键性与近期表现必须分别表述。
7.1 利空/利好信号必须优先根据最新交易日涨跌（dailyChange）和资讯情绪/影响判断；price_change 仅代表分析区间，不得当作当天涨跌。
8. 所有自然语言字段必须使用中文；趋势、质量、状态、动作和周期等标签必须翻译成中文，不得输出 sideways、high、medium、success、buy、hold 等英文标签。
9. summary 与 strategy 只输出完整的纯文本内容，不要自行添加 Markdown、Emoji、标题或重复句末标点；系统会在展示层统一编排阅读格式。
10. decisionBrief 必须完整填写 headline、positiveSignals、negativeSignals、dataIssues、action、waitFor；每个信号数组至少给出 1 条，若没有充分证据则明确写“暂无足够证据”，不得留空。
11. 四段式语义必须严格区分：positiveSignals 只放利好信号，negativeSignals 只放利空信号，headline 只放核心判断，action 与 waitFor 只放投资策略和后续触发条件。
12. 持仓中的 industryDomain 是知识图谱产业领域匹配结果。若该字段与当前产业一致，应视为已完成产业映射，可输出持仓级持有/观察判断，不要再声称“无法映射”。
13. 企业代表性只能引用输入企业列表中的 name、symbol、representativenessScore、representativenessBasis；AI不得新增企业或把未在输入列表中的企业写成代表性企业。报告中的企业名称必须与输入快照完全一致。
14. 财报分析必须引用 financialMetrics 与 financialSamples 中的实际字段；明确说明最新期、对比期、增长口径、净利润基数和经营现金流是否存在。公告分析必须引用 announcementSamples/latestAnnouncementSamples 的日期、事件类型、方向和标题，不能只写公告数量。
15. 若财报期字段缺失或经营现金流缺失，必须明确写“报告期/现金流证据缺失”，不得把增长率写成已确认同比或盈利质量改善。

产业：${data.snapshot.industryName}
风险偏好：${data.snapshot.preferences.riskTolerance}
投资周期：${data.snapshot.preferences.investmentHorizon}
数据质量：${JSON.stringify(data.quality)}
市场：${JSON.stringify(marketRows)}
资讯：${JSON.stringify(newsRows)}
资讯与产业链分析：${data.news.analysis.slice(0, 3000)}
企业：${JSON.stringify(companyRows)}
企业核心结论：${data.company.coreConclusion.slice(0, 3000)}
企业覆盖：${JSON.stringify(data.company.coverage)}
结构：${JSON.stringify(data.structure)}
持仓：${JSON.stringify(holdingRows)}
已有证据：${JSON.stringify(data.evidence)}

JSON 结构：
{
  "industry": "产业名称",
  "decision": "increase|maintain|reduce|wait|mixed",
  "strategy": "不超过200字",
  "summary": "不超过300字",
  "decisionBrief": {
    "headline": "一句话判断",
    "negativeSignals": ["负面信号"],
    "positiveSignals": ["正面信号"],
    "dataIssues": ["数据限制"],
    "action": "今天怎么做",
    "waitFor": ["下一步等待条件"]
  },
  "riskWarning": "风险提示",
  "recommendations": [{
    "action": "buy|add|hold|reduce|sell|watch|no_action|data_review",
    "target": "标的名称",
    "symbol": "标准代码",
    "targetType": "etf|index|holding|sector",
    "reason": "理由",
    "evidenceIds": ["证据ID"],
    "currentWeight": 0,
    "targetWeight": 0,
    "deltaWeight": 0,
    "allocation": 0,
    "priority": 1,
    "amount": null,
    "targetPrice": null,
    "trigger": ["执行条件"],
    "invalidation": ["失效条件"],
    "horizon": "short|medium|long",
    "confidence": 0.5
  }],
  "limitations": ["限制"],
  "evidence": [],
  "generatedBy": "ai"
}`
}

function buildMarkdown(data: DailyActionReportData) {
  const actionLabels: Record<string, string> = {
    buy: '建仓', add: '加仓', hold: '持有', reduce: '减仓', sell: '减仓', watch: '观察', no_action: '今日不动', data_review: '数据复核',
  }
  const moduleLabels: Record<string, string> = { market: '市场', news: '资讯', company: '企业', portfolio: '持仓' }
  const statusLabels: Record<string, string> = { success: '成功', degraded: '降级', failed: '失败' }
  const recommendations = data.advice.recommendations.length
    ? data.advice.recommendations.map((item) => {
      const reason = localizeUserFacingText(item.reason)
      const ending = /[。！？]$/.test(reason) ? '' : '。'
      return `- **${actionLabels[item.action] || '观察'} ${item.target}（${item.symbol || '无代码'}）**：${reason}${ending}${item.amount != null ? `金额：${item.amount.toFixed(2)}。` : ''}执行条件：${item.trigger?.join('；') || '按数据变化复核'}。失效条件：${item.invalidation?.join('；') || '信号反转时复核'}。`
    }).join('\n')
    : '- 当前没有通过质量门禁的可执行买卖建议，请先完成数据复核。'
  const qualityLimitations = [
    `市场有效样本：${data.quality.diagnostics?.validMarketSamples ?? '暂无'}/${data.quality.diagnostics?.totalMarketSamples ?? '暂无'}；可执行门禁：${data.quality.diagnostics?.executableGate || '需复核'}`,
    ...(data.quality.diagnostics?.nextActions || []),
    ...(data.quality.abnormalSamples || []).map((item) => `${item.name}（${item.symbol}）异常：${item.source}；${item.reasons.join('；')}`),
  ]
  return [
    `# ${data.snapshot.industryName} 每日投资行动报告`,
    '',
    `- 分析时点：${data.snapshot.asOf}`,
    `- 分析周期：${data.snapshot.periodDays} 天`,
    `- 数据可执行性：${data.quality.diagnostics?.executableGate || '需复核'}（有效行情 ${data.quality.diagnostics?.validMarketSamples ?? '暂无'}/${data.quality.diagnostics?.totalMarketSamples ?? '暂无'}；企业综合覆盖 ${(data.quality.coverage * 100).toFixed(0)}%）`,
    `- 模块状态：${Object.entries(data.snapshot.modules || {}).map(([name, status]) => `${moduleLabels[name] || name}：${statusLabels[status.status] || '未知'}${status.records != null ? `（${status.records}条）` : ''}`).join('；') || '未记录'}`,
    '',
    '## 核心结论与投资策略',
    localizeUserFacingText(data.advice.investmentConclusion || composeInvestmentConclusion(data.advice.summary, data.advice.strategy) || '暂无有效的核心结论与投资策略'),
    '',
    '## 执行动作',
    recommendations,
    '',
    '## 风险与质量提示',
    localizeUserFacingText(data.advice.riskWarning || data.advice.limitations.join('；')),
    '',
    '数据覆盖与限制：',
    [...data.advice.limitations, ...qualityLimitations].map((item) => `- ${item}`).join('\n') || '- 暂无额外限制',
    '',
    '## 证据摘要',
    data.evidence.map((item) => `- ${localizeUserFacingText(item.title)}：${localizeUserFacingText(item.value || '暂无')}（置信度 ${(item.confidence * 100).toFixed(0)}%${item.observedAt ? `，观察于 ${item.observedAt}` : ''}）`).join('\n'),
  ].join('\n')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ industry_id: string }> },
) {
  try {
    const { industry_id: industryId } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const industryName = typeof body.industryName === 'string' ? body.industryName.trim() : ''
    const periodDays = Math.min(Math.max(Number(body.periodDays || 90), 30), 365)
    const riskTolerance = (body.riskTolerance || 'balanced') as RiskTolerance
    const investmentHorizon = (body.investmentHorizon || 'short') as InvestmentHorizon
    const companySource: 'graph' | 'etf_holdings' = body.companySource === 'graph' ? 'graph' : 'etf_holdings'
    const requestedPages = Array.isArray(body.selectedPages)
      ? body.selectedPages.filter((value): value is PageKey => typeof value === 'string' && ALL_PAGES.includes(value as PageKey))
      : [...ALL_PAGES]
    const selectedPages = Array.from(new Set(requestedPages)) as PageKey[]
    const generateAiReport = body.generateAiReport !== false
    const marketIndexCodes = Array.isArray(body.marketIndexCodes)
      ? body.marketIndexCodes.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join(',')
      : ''
    if (!industryName) return NextResponse.json({ success: false, error: 'industryName is required' }, { status: 400 })
    if (selectedPages.length === 0) return NextResponse.json({ success: false, error: '请至少选择一个要生成的页面' }, { status: 400 })

    const pageSet = new Set(selectedPages)
    const needsMarket = pageSet.has('market') || (pageSet.has('company') && companySource === 'etf_holdings')
    const needsNews = pageSet.has('news')
    const needsCompany = pageSet.has('company')
    const needsPortfolio = pageSet.has('portfolio')

    const reportMode = `generate_ai_report=${generateAiReport}`
    const marketUrl = `${DATA_SERVICE_URL}/api/industry-analysis/${encodeURIComponent(industryId)}/market?industry_name=${encodeURIComponent(industryName)}&period_days=${periodDays}&market_index_codes=${encodeURIComponent(marketIndexCodes)}&${reportMode}`
    const newsUrl = `${DATA_SERVICE_URL}/api/industry-analysis/${encodeURIComponent(industryId)}/news?industry_name=${encodeURIComponent(industryName)}&limit=50&${reportMode}`
    const [marketResult, newsResult, portfolios] = await Promise.all([
      needsMarket ? fetchModule(marketUrl) : Promise.resolve(skippedModule()),
      needsNews ? fetchModule(newsUrl) : Promise.resolve(skippedModule()),
      needsPortfolio ? prisma.portfolio.findMany({ include: { holdings: true }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    ])

    const market = normalizeMarket(marketResult.payload)
    const representativeEtfCodes = Array.from(new Set([
      ...market.etfSelection.map((row) => textValue(row.code || row.symbol)),
      ...market.etfs.map((row) => textValue(row.code || row.symbol)),
    ].filter(Boolean)))
    // 企业分析使用知识图谱中的全部 ETF 候选；代表 ETF 仅用于市场展示和排序。
    const graphEtfCodes = Array.from(new Set(
      market.etfCandidates.map((row) => textValue(row.code || row.symbol)).filter(Boolean),
    ))
    const selectedEtfCodes = graphEtfCodes.length > 0 ? graphEtfCodes : representativeEtfCodes
    if (needsCompany && companySource === 'etf_holdings' && !marketResult.success) {
      const upstreamError = marketResult.error || '市场分析服务未返回可用结果'
      return NextResponse.json({
        success: false,
        error: `市场分析失败：${upstreamError}`,
        stage: 'market',
        error_code: typeof marketResult.payload.error_code === 'string' ? marketResult.payload.error_code : 'MARKET_ANALYSIS_FAILED',
        upstream: marketResult.payload,
      }, { status: 502 })
    }
    if (needsCompany && companySource === 'etf_holdings' && selectedEtfCodes.length === 0) {
      return NextResponse.json({
        success: false,
        error: '市场分析未返回代表性ETF，无法继续读取ETF持仓企业',
        stage: 'market_to_company',
        error_code: 'MARKET_ETF_SELECTION_EMPTY',
      }, { status: 502 })
    }
    const companyUrl = `${DATA_SERVICE_URL}/api/industry-analysis/${encodeURIComponent(industryId)}/companies?period_days=${periodDays}&source=${companySource}&etf_codes=${encodeURIComponent(selectedEtfCodes.join(','))}&${reportMode}`
    const companyResult = needsCompany
      ? await fetchModule(companyUrl)
      : skippedModule()

    const portfolio = await enrichPortfolioMarketData(normalizePortfolio(portfolios.find((item) => item.isDefault) ?? portfolios[0] ?? {}))
    const news = normalizeNews(newsResult.payload)
    const company = normalizeCompany(companyResult.payload)
    const structure = buildStructureSummary(company, news)
    if (needsNews && generateAiReport) news.analysis = await enrichNewsAnalysis(industryName, news, company, structure)
    const modules = {
      market: moduleHealth(marketResult, market.etfs.length + market.indices.length),
      news: moduleHealth(newsResult, news.items.length),
      company: moduleHealth(companyResult, company.analyzed, typeof companyResult.payload.report_warning === 'string' ? companyResult.payload.report_warning : undefined),
      portfolio: {
        status: portfolio.holdings.length > 0 && !portfolioDegradedReason(portfolio) ? 'success' : 'degraded',
        fetchedAt: new Date().toISOString(),
        records: portfolio.holdings.length,
        error: portfolioDegradedReason(portfolio),
      },
    } satisfies DailyActionReportData['snapshot']['modules']
    const quality = assessReportQuality(market, news, company, portfolio, modules, industryName)
    const evidence = buildEvidence(market, news, company, quality)
    const ruleAdvice = buildRuleBasedAdvice(industryName, market, news, company, portfolio, quality, riskTolerance, investmentHorizon)
    ruleAdvice.evidence = evidence

    const snapshot = {
      runId: randomUUID(),
      asOf: new Date().toISOString(),
      periodDays,
      industryId,
      industryName,
      modules,
      preferences: { riskTolerance, investmentHorizon },
      companySource,
      selectedPages,
      generateAiReport,
      marketToCompany: {
        selectedEtfCodes,
        representativeEtfCodes,
        graphEtfCodes,
        companySource,
      },
    }
    const baseData: DailyActionReportData = {
      schemaVersion: '2.0', snapshot: { ...snapshot, timezone: 'Asia/Shanghai' }, quality, market, news, company, portfolio, structure,
      advice: ruleAdvice, evidence,
    }

    let advice = ruleAdvice
    let aiWarning = ''
    if (!generateAiReport) {
      advice = {
        ...ruleAdvice,
        summary: '本次未生成 AI 分析报告，仅展示所选页面的整理数据。',
        strategy: '',
        investmentConclusion: '',
        recommendations: [],
        generatedBy: 'rules',
        validation: { valid: true, warnings: ['已按设置跳过 AI 分析报告生成'] },
      }
    } else try {
      const raw = await aiClient.complete({
        prompt: buildPrompt(baseData),
        maxTokens: 5000,
        system: '你只返回符合要求的 JSON。任何无法由证据支持的内容都要写入 limitations，不要猜测。所有自然语言字段必须完整收束，不得截断；不要使用 Markdown 加粗、标题、列表符号或代码围栏。',
      })
      const parsed = parseJsonObject(raw)
      const normalized = mergeNewsInsightIntoAdvice(normalizeAdvice(parsed, industryName), news)
      const validation = validateAdvice(normalized, ruleAdvice, { quality, market, portfolio, evidence })
      if (validation.narrativeValid && normalized.summary && normalized.strategy) {
        const riskWarning = mergeQualityIntoRiskWarning(normalized.riskWarning || ruleAdvice.riskWarning, quality)
        const validatedRecommendations = validation.advice.recommendations
        // AI 叙事可以保留，但如果 AI 引用的标的全部无法与当前输入映射，必须回退到规则引擎动作，不能让总览丢失执行动作模块。
        const recommendations = validatedRecommendations.length > 0 ? validatedRecommendations : ruleAdvice.recommendations
        advice = {
          ...ruleAdvice,
          ...normalized,
          recommendations,
          investmentConclusion: composeInvestmentConclusion(normalized.summary, normalized.strategy),
          riskWarning,
          evidence,
          generatedBy: 'hybrid',
          validation: { valid: validation.valid, warnings: [...quality.warnings, ...validation.warnings] },
        } as typeof ruleAdvice
      } else {
        aiWarning = `AI 输出未形成可用的总结文本，已使用规则引擎结果${validation.warnings.length ? `：${validation.warnings.slice(0, 3).join('；')}` : '。'}`
      }
    } catch (error) {
      aiWarning = error instanceof Error ? `AI 暂不可用，已使用规则引擎结果：${error.message}` : 'AI 暂不可用，已使用规则引擎结果。'
    }
    if (aiWarning) advice.validation.warnings = [...advice.validation.warnings, aiWarning]

    if (generateAiReport) ensureDailyActionCoverage(advice, market, portfolio, industryName, quality, investmentHorizon)
    const reportData: DailyActionReportData = { ...baseData, advice }
    const content = buildMarkdown(reportData)
    const report = await prisma.aIAnalysisReport.create({
      data: {
        type: 'comprehensive', industryId, industryName,
        title: `${industryName} 每日投资行动报告`,
        summary: advice.summary,
        content,
        dataJson: JSON.stringify(reportData),
      },
    })

    return NextResponse.json({
      success: true,
      runId: snapshot.runId,
      report: { id: report.id, createdAt: report.createdAt.toISOString(), title: report.title },
      data: reportData,
      modules: {
        market: { success: marketResult.success, error: marketResult.error },
        news: { success: newsResult.success, error: newsResult.error },
        company: { success: companyResult.success, error: companyResult.error, warning: typeof companyResult.payload.report_warning === 'string' ? companyResult.payload.report_warning : undefined },
        portfolio: { success: portfolio.holdings.length > 0 },
      },
    })
  } catch (error) {
    console.error('Daily action report error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '每日投资行动报告生成失败' }, { status: 500 })
  }
}
