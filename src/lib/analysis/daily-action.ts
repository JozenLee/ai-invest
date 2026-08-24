import {
  ActionType,
  DataQuality,
  DecisionItem,
  Evidence,
  NormalizedCompany,
  NormalizedMarket,
  NormalizedNews,
  NormalizedPortfolio,
  AnalysisModuleName,
  StructureSummary,
  StructuredAdvice,
  ModuleHealth,
  localizeUserFacingText,
  cleanAdviceText,
  numberValue,
  textValue,
} from './report-contract'
import { summarizeNewsForAdvice } from './news-insight'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function percent(value: number | undefined) {
  return value == null || !Number.isFinite(value) ? '暂无' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function trendLabel(value: unknown) {
  const labels: Record<string, string> = {
    strong_uptrend: '强势上涨',
    uptrend: '上涨趋势',
    sideways: '震荡',
    downtrend: '下跌趋势',
    strong_downtrend: '强势下跌',
    unknown: '趋势未知',
  }
  return labels[textValue(value).toLowerCase()] || localizeUserFacingText(textValue(value, '趋势未知'))
}

function positionAction(action: ActionType) {
  return ['buy', 'add', 'reduce', 'sell'].includes(action)
}

function suspiciousMarketRow(row: Record<string, unknown>) {
  const change = numberValue(row.price_change_pct)
  const volatility = numberValue(row.volatility)
  const drawdown = numberValue(row.max_drawdown)
  return Boolean(row.is_fallback) || (change != null && Math.abs(change) > 50) || (volatility != null && volatility > 150) || (drawdown != null && drawdown > 70)
}

function suspiciousMarketReasons(row: Record<string, unknown>) {
  const reasons: string[] = []
  const change = numberValue(row.price_change_pct)
  const volatility = numberValue(row.volatility)
  const drawdown = numberValue(row.max_drawdown)
  if (row.is_fallback) reasons.push('数据源返回回退值')
  if (!textValue(row.code || row.symbol)) reasons.push('缺少标的代码，无法可靠映射')
  if (change != null && Math.abs(change) > 50) reasons.push(`区间涨跌 ${change.toFixed(2)}% 超过校验阈值`)
  if (volatility != null && volatility > 150) reasons.push(`年化波动率 ${volatility.toFixed(2)}% 超过校验阈值`)
  if (drawdown != null && drawdown > 70) reasons.push(`最大回撤 ${drawdown.toFixed(2)}% 超过校验阈值`)
  const historyQuality = row.history_quality as Record<string, unknown> | undefined
  const historyFlags = Array.isArray(historyQuality?.flags) ? historyQuality.flags.map((item) => textValue(item)).filter(Boolean) : []
  reasons.push(...historyFlags)
  if (textValue(row.code || row.symbol) && numberValue(row.price_change_pct) == null) reasons.push('缺少区间涨跌字段，无法参与排序')
  return reasons
}

function validEtfs(market: NormalizedMarket) {
  return market.etfs.filter((row) => !suspiciousMarketRow(row) && textValue(row.code || row.symbol) && numberValue(row.price_change_pct) != null)
}

export function getValidMarketSymbols(market: NormalizedMarket) {
  return new Set(validEtfs(market).map((row) => textValue(row.code || row.symbol)).filter(Boolean))
}

function getModuleStatus(moduleStatus?: Partial<Record<AnalysisModuleName, ModuleHealth>>) {
  return moduleStatus || {}
}

function median(values: number[]) {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function portfolioHasCompleteAllocation(portfolio: NormalizedPortfolio) {
  return portfolio.holdings.length > 0 && portfolio.totalValue > 0 && portfolio.holdings.every((holding) => holding.marketValue != null && holding.weight != null)
}

function normalizeIndustryName(value: unknown) {
  return textValue(value).toLowerCase().replace(/[\s·•/\\|_|-]+/gu, '')
}

function holdingMatchesIndustry(holding: NormalizedPortfolio['holdings'][number], industryName: string) {
  const holdingDomain = normalizeIndustryName(holding.industryDomain)
  const currentIndustry = normalizeIndustryName(industryName)
  return Boolean(holdingDomain && currentIndustry && (holdingDomain === currentIndustry || holdingDomain.includes(currentIndustry) || currentIndustry.includes(holdingDomain)))
}

function sentence(value: string) {
  const normalized = cleanAdviceText(value).replace(/[。！？]+$/u, '').trim()
  return normalized ? `${normalized}。` : ''
}

function conciseText(value: string, max = 220) {
  const normalized = cleanAdviceText(value)
  if (normalized.length <= max) return normalized
  const boundary = normalized.slice(0, max).search(/[。！？]/u)
  return boundary >= 0 ? normalized.slice(0, boundary + 1) : `${normalized.slice(0, max)}……`
}

export function composeInvestmentConclusion(summary: string, strategy: string) {
  const normalizedSummary = cleanAdviceText(summary).replace(/[。！？]+$/u, '').trim()
  const normalizedStrategy = cleanAdviceText(strategy).replace(/[。！？]+$/u, '').trim()
  if (!normalizedSummary) return normalizedStrategy
  if (!normalizedStrategy) return normalizedSummary
  if (normalizedStrategy === normalizedSummary || normalizedStrategy.includes(normalizedSummary)) return `投资策略：${sentence(normalizedStrategy)}`
  return `核心判断：${sentence(normalizedSummary)}\n\n投资策略：${sentence(normalizedStrategy)}`
}

export function mergeQualityIntoRiskWarning(riskWarning: string, quality: DataQuality) {
  const gateStatus = quality.gates.canAddRisk ? '已通过，可在其他条件满足时评估新增风险' : '未通过，当前不允许新增风险'
  const qualityGate = `数据可执行性：${quality.diagnostics?.executableGate || '需复核'}（有效行情 ${quality.diagnostics?.validMarketSamples ?? '暂无'}/${quality.diagnostics?.totalMarketSamples ?? '暂无'}，企业综合覆盖 ${(quality.coverage * 100).toFixed(0)}%），${gateStatus}`
  return Array.from(new Set([
    qualityGate,
    ...quality.issues,
    ...quality.warnings,
    ...riskWarning.split(/；|\n/).map((item) => item.trim()).filter(Boolean),
  ])).join('；')
}

export function mergeNewsInsightIntoAdvice(candidate: Partial<StructuredAdvice>, news: NormalizedNews) {
  const summary = cleanAdviceText(summarizeNewsForAdvice(news.analysis).replace(/^资讯面\s*/u, '').trim())
  if (!summary) return candidate

  const reference = `资讯参考：${sentence(summary)}`
  const recommendations = (candidate.recommendations || []).map((item) => {
    if (!['etf', 'index', 'sector'].includes(item.targetType)) return item
    const replacedReason = cleanAdviceText(item.reason).replace(/资讯面(?:暂无聚合结论|暂无分析|缺少聚合结论)[。！？]?/gu, `资讯面${sentence(summary)}`)
    if (replacedReason !== item.reason || /资讯面|资讯参考|资讯判断/u.test(replacedReason)) {
      return { ...item, reason: replacedReason }
    }
    return { ...item, reason: `${sentence(replacedReason)} ${reference}` }
  })

  return {
    ...candidate,
    recommendations,
    strategy: candidate.strategy && /资讯/u.test(candidate.strategy) || candidate.summary && /资讯/u.test(candidate.summary)
      ? cleanAdviceText(candidate.strategy || '')
      : cleanAdviceText(`${candidate.strategy || ''}${candidate.strategy ? ' ' : ''}${reference}`),
  }
}

export function buildStructureSummary(company: NormalizedCompany, news: NormalizedNews): StructureSummary {
  const segments = company.segmentAnalysis
    .filter((item) => textValue(item.segment))
    .map((item) => ({
      ...item,
      segment: textValue(item.segment),
      averageChange: numberValue(item.average_change ?? item.averageChange),
      quoteCoveragePct: numberValue(item.quote_coverage_pct ?? item.quoteCoveragePct),
    }))
  const taggedNewsCount = news.items.filter((item) => item.segmentCodes.length > 0).length
  const positiveSegments = segments.filter((item) => (numberValue(item.averageChange) ?? 0) > 0).sort((a, b) => (numberValue(b.averageChange) ?? 0) - (numberValue(a.averageChange) ?? 0)).slice(0, 5)
  const negativeSegments = segments.filter((item) => (numberValue(item.averageChange) ?? 0) < 0).sort((a, b) => (numberValue(a.averageChange) ?? 0) - (numberValue(b.averageChange) ?? 0)).slice(0, 5)
  const coverage = segments.length ? segments.reduce((sum, item) => sum + (numberValue(item.quoteCoveragePct) ?? 0), 0) / segments.length / 100 : 0
  const companyRows = [...company.topCompanies, ...company.summaries]
  const impactChains = news.items
    .filter((item) => item.segmentCodes.length > 0)
    .slice(0, 20)
    .map((item) => {
      const segmentCodes = new Set(item.segmentCodes.map((code) => String(code).toLowerCase()))
      const matchedCompanies = companyRows
        .filter((row) => Array.isArray(row.node_refs) && (row.node_refs as unknown[]).some((ref) => {
          const node = ref as Record<string, unknown>
          return [node.segment_code, node.segment_id, node.segment_name].some((value) => value && segmentCodes.has(String(value).toLowerCase()))
        }))
        .map((row) => textValue(row.name))
        .filter(Boolean)
      const direction: 'positive' | 'negative' | 'mixed' = (item.sentiment ?? 0) > 0.1 ? 'positive' : (item.sentiment ?? 0) < -0.1 ? 'negative' : 'mixed'
      return {
        newsId: item.id,
        title: item.title,
        direction,
        impact: item.impact,
        segments: item.segmentCodes,
        companies: Array.from(new Set(matchedCompanies)).slice(0, 8),
        evidence: `${item.publishedAt || '日期未知'}；情绪 ${item.sentiment ?? '暂无'}；影响度 ${item.impact ?? '暂无'}`,
      }
    })
  return { segmentCount: segments.length, taggedNewsCount, positiveSegments, negativeSegments, segmentCoverage: Math.round(coverage * 100) / 100, impactChains }
}

export function assessReportQuality(
  market: NormalizedMarket,
  news: NormalizedNews,
  company: NormalizedCompany,
  portfolio: NormalizedPortfolio,
  moduleStatus?: Partial<Record<AnalysisModuleName, ModuleHealth>>,
  industryName = '',
): DataQuality {
  const status = getModuleStatus(moduleStatus)
  const quoteCoverage = numberValue(company.coverage.quote_coverage_pct ?? company.coverage.quoteCoveragePct)
  const financialCoverage = numberValue(company.coverage.financial_coverage_pct ?? company.coverage.financialCoveragePct)
  const announcementCoverage = numberValue(company.coverage.announcement_coverage_pct ?? company.coverage.announcementCoveragePct)
  const companyCoverage = [quoteCoverage, financialCoverage, announcementCoverage].filter((value): value is number => value != null)
  const coverage = companyCoverage.length ? companyCoverage.reduce((sum, value) => sum + value, 0) / companyCoverage.length / 100 : 0
  const totalEtfs = market.etfs.length
  const valid = validEtfs(market)
  const suspiciousCount = market.etfs.filter(suspiciousMarketRow).length
  const abnormalSamples = market.etfs.filter(suspiciousMarketRow).map((row) => {
    const reasons = suspiciousMarketReasons(row)
    const hasIdentity = Boolean(textValue(row.code || row.symbol))
    const hasReturn = numberValue(row.price_change_pct) != null
    return {
      name: textValue(row.name || row.code || row.symbol, '未命名标的'),
      symbol: textValue(row.code || row.symbol, '无代码'),
      reasons,
      source: row.data_quality_source === '数据源' || row.is_fallback || (hasIdentity && hasReturn && reasons.some((reason) => /超过校验阈值|回退值|复权|单位切换|序列拼接/u.test(reason)))
        ? '数据源' as const
        : '链路' as const,
    }
  })
  const marketScore = status.market?.status === 'failed' ? 0 : totalEtfs ? Math.round((valid.length / totalEtfs) * 70 + (market.indices.length > 0 ? 30 : 0)) : 0
  const newsScore = status.news?.status === 'failed' ? 0 : news.items.length ? Math.round(Math.min(1, news.items.length / 20) * 70 + (news.items.some((item) => item.segmentCodes.length > 0) ? 30 : 0)) : 0
  // 企业接口按影响力只返回最多 8 个重点样本，财报/公告/行情覆盖率不是全量覆盖率，不能作为执行门禁。
  // 仅使用接口是否失败以及重点企业样本是否成功返回来评分。
  const companyScore = status.company?.status === 'failed' ? 0 : company.analyzed > 0 ? 100 : company.total > 0 ? 30 : 30
  const portfolioComplete = portfolioHasCompleteAllocation(portfolio)
  const portfolioScore = status.portfolio?.status === 'failed' ? 0 : portfolio.holdings.length ? (portfolioComplete ? 80 : 35) : 20
  const consistencyScore = Object.values(status).some((item) => item.status === 'failed') ? 0 : market.analyzedAt && news.items.length && company.analyzed > 0 ? 80 : 45

  const issues: string[] = []
  const warnings: string[] = []
  if (!market.etfs.length && !market.indices.length) issues.push('未获取到可用市场标的')
  if (!news.items.length) warnings.push('近期资讯为空，资讯结论不可形成')
  if (news.items.length > 0 && !news.analysis) warnings.push('资讯样本已获取，但缺少聚合分析文本，市场情绪结论仅按结构化字段降级生成')
  const sectorFlow = market.sectorFlow
  const hasSectorFlow = Array.isArray(sectorFlow.topInflowSectors) || Array.isArray(sectorFlow.topOutflowSectors)
  if (market.etfs.length > 0 && status.market?.status !== 'failed' && !hasSectorFlow) warnings.push('板块资金流向未返回，市场情绪结论缺少资金验证')
  if (suspiciousCount > 0) warnings.push(`${suspiciousCount} 个行情标的存在极端收益/波动/回撤，已隔离为异常样本，暂不参与投资动作排序`)
  if (valid.length < Math.max(3, Math.floor(Math.max(totalEtfs, 1) * 0.5))) warnings.push('有效区间收益样本不足，市场强弱判断降级')
  if (!portfolio.holdings.length) warnings.push('未读取到持仓，无法形成组合调整建议')
  else if (!portfolioComplete) warnings.push(`持仓金额或权重数据不完整，无法计算精确调仓金额`)
  const marketSymbols = new Set([...market.etfs, ...market.indices].map((row) => textValue(row.code || row.symbol)).filter(Boolean))
  const mappedHoldings = portfolio.holdings.filter((holding) => (holding.ticker && marketSymbols.has(holding.ticker)) || holdingMatchesIndustry(holding, industryName))
  if (portfolio.holdings.length > 0 && mappedHoldings.length === 0) warnings.push('当前持仓未与本次产业 ETF/指数完成代码或知识图谱产业领域映射，无法输出持仓级调仓动作')
  for (const [name, module] of Object.entries(status)) {
    if (module?.status === 'failed') issues.push(`${name} 模块采集失败${module.error ? `：${module.error}` : ''}`)
    else if (module?.status === 'degraded') warnings.push(`${name} 模块处于降级状态${module.error ? `：${module.error}` : ''}`)
  }

  const integrity = totalEtfs ? valid.length / totalEtfs : 0
  const freshness = market.analyzedAt ? 1 : 0.5
  const moduleScores = {
    market: marketScore,
    news: newsScore,
    company: Math.min(100, companyScore),
    portfolio: portfolioScore,
    consistency: consistencyScore,
  }
  const score = Math.round(moduleScores.market * 0.3 + moduleScores.news * 0.1 + moduleScores.company * 0.2 + moduleScores.portfolio * 0.2 + moduleScores.consistency * 0.2)
  const level = score >= 80 && issues.length === 0 && warnings.length === 0 ? 'high' : score >= 60 ? 'medium' : score > 0 ? 'low' : 'unknown'
  const requiresDataReview = issues.length > 0 || warnings.length > 0 || !portfolioComplete
  const nextActions = Array.from(new Set([
    ...abnormalSamples.filter((item) => item.source === '数据源').map((item) => `复核 ${item.symbol} 的行情历史序列、复权方式与单位`),
    ...abnormalSamples.filter((item) => item.source === '链路').map((item) => `补齐 ${item.symbol} 的代码或涨跌字段映射`),
    ...(!portfolioComplete ? ['补齐持仓当前价格、金额或权重后再计算调仓金额'] : []),
  ]))
  return {
    level,
    score,
    coverage: Math.round(coverage * 100) / 100,
    freshness,
    integrity,
    moduleScores,
    moduleStatus: status,
    gates: {
      canAddRisk: level === 'high' && issues.length === 0 && warnings.length === 0 && portfolioComplete && !Object.values(status).some((item) => item.status !== 'success'),
      canCalculateAllocation: portfolioComplete && status.portfolio?.status !== 'failed',
      requiresDataReview,
    },
    abnormalSamples,
    diagnostics: {
      validMarketSamples: valid.length,
      totalMarketSamples: totalEtfs,
      executableGate: level === 'high' && issues.length === 0 && warnings.length === 0 ? '通过' : '阻断',
      nextActions,
    },
    issues,
    warnings,
  }
}

export function buildEvidence(
  market: NormalizedMarket,
  news: NormalizedNews,
  company: NormalizedCompany,
  quality: DataQuality,
): Evidence[] {
  const evidence: Evidence[] = []
  const rows = validEtfs(market)
  // 利空/利好应优先反映最新交易日，而不是把 90 天区间涨跌误当成“当天”信号。
  const dailyChanges = rows.map((row) => numberValue(row.daily_change_pct ?? row.latest_change_pct)).filter((value): value is number => value != null)
  const periodChanges = rows.map((row) => numberValue(row.price_change_pct)).filter((value): value is number => value != null)
  const changes = dailyChanges.length ? dailyChanges : periodChanges
  const medianChange = median(changes)
  const breadth = changes.length ? changes.filter((value) => value > 0).length / changes.length : 0
  if (changes.length) {
    evidence.push({
      id: 'market-breadth', type: 'market', title: dailyChanges.length ? '当日 ETF 市场广度' : '有效 ETF 市场广度',
      value: `${rows.length}/${market.etfs.length} 个样本有效，${dailyChanges.length ? '当日' : '区间'}中位数 ${percent(medianChange)}，上涨占比 ${(breadth * 100).toFixed(0)}%`,
      direction: breadth >= 0.6 ? 'positive' : breadth <= 0.4 ? 'negative' : 'mixed',
      confidence: clamp(changes.length / Math.max(market.etfs.length, 1)), source: market.source, observedAt: market.analyzedAt,
    })
    evidence.push({
      id: 'market-risk', type: 'market', title: '市场风险门禁',
      value: `${market.etfs.length - rows.length} 个异常样本未参与动作排序；整体数据完整性 ${(quality.integrity * 100).toFixed(0)}%`,
      direction: quality.integrity < 0.8 ? 'negative' : 'neutral', confidence: quality.integrity, source: market.source, observedAt: market.analyzedAt,
    })
  }

  const sectorFlow = market.sectorFlow
  const inflowSectors = Array.isArray(sectorFlow.topInflowSectors) ? sectorFlow.topInflowSectors : []
  const outflowSectors = Array.isArray(sectorFlow.topOutflowSectors) ? sectorFlow.topOutflowSectors : []
  if (inflowSectors.length || outflowSectors.length) {
    const inflow = inflowSectors.slice(0, 3).map((item) => {
      const row = item as Record<string, unknown>
      const flow = numberValue(row.netFlow)
      return `${textValue(row.sector || row.name, '未命名板块')} ${flow == null ? '暂无' : `${flow.toFixed(2)}亿元`}`
    }).join('、')
    const outflow = outflowSectors.slice(0, 3).map((item) => {
      const row = item as Record<string, unknown>
      const flow = numberValue(row.netFlow)
      return `${textValue(row.sector || row.name, '未命名板块')} ${flow == null ? '暂无' : `${flow.toFixed(2)}亿元`}`
    }).join('、')
    evidence.push({
      id: 'sector-flow', type: 'market', title: '板块资金流向',
      value: `净流入：${inflow || '暂无'}；净流出：${outflow || '暂无'}`,
      direction: inflowSectors.length >= outflowSectors.length ? 'positive' : 'mixed', confidence: 0.8, source: textValue(sectorFlow.source, market.source),
    })
  }

  const strongest = [...rows].sort((a, b) => {
    const aChange = numberValue(a.daily_change_pct ?? a.latest_change_pct ?? a.price_change_pct) ?? -Infinity
    const bChange = numberValue(b.daily_change_pct ?? b.latest_change_pct ?? b.price_change_pct) ?? -Infinity
    return bChange - aChange
  })[0]
  if (strongest) evidence.push({
    id: 'market-leader', type: 'market', title: '有效样本中的相对强势标的',
    value: `${textValue(strongest.name || strongest.code, '未命名标的')} 最新交易日 ${percent(numberValue(strongest.daily_change_pct ?? strongest.latest_change_pct ?? strongest.price_change_pct))}；区间 ${percent(numberValue(strongest.price_change_pct))}`,
    direction: (numberValue(strongest.daily_change_pct ?? strongest.latest_change_pct ?? strongest.price_change_pct) ?? 0) > 0 ? 'positive' : 'mixed', confidence: 0.7, source: market.source, observedAt: market.analyzedAt,
  })

  const impactNews = [...news.items].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))[0]
  if (impactNews) evidence.push({
    id: 'news-high-impact', type: 'news', title: '高影响资讯', value: impactNews.title,
    direction: (impactNews.sentiment ?? 0) > 0.1 ? 'positive' : (impactNews.sentiment ?? 0) < -0.1 ? 'negative' : 'mixed',
    confidence: clamp((impactNews.impact ?? 1) / 5), source: impactNews.source, observedAt: impactNews.publishedAt,
  })

  const topCompany = company.topCompanies[0]
  if (topCompany) evidence.push({
    id: 'company-leader', type: 'company', title: '重点企业样本',
    value: `${textValue(topCompany.name, '未命名企业')}，评分 ${textValue(topCompany.overall_score ?? topCompany.overallScore, '暂无')}`,
    direction: 'mixed', confidence: clamp(numberValue(topCompany.score_confidence ?? topCompany.scoreConfidence) ?? 0.5),
    source: company.source, observedAt: textValue((topCompany.tracking_metrics as Record<string, unknown> | undefined)?.latest_quote_date),
  })
  const structure = buildStructureSummary(company, news)
  const leadingSegment = structure.positiveSegments[0] || structure.negativeSegments[0]
  if (leadingSegment) evidence.push({
    id: 'structure-map', type: 'graph', title: '产业链结构信号',
    value: `${textValue(leadingSegment.segment, '未命名环节')} 平均涨跌 ${percent(numberValue(leadingSegment.averageChange))}，已映射 ${structure.taggedNewsCount} 条资讯`,
    direction: (numberValue(leadingSegment.averageChange) ?? 0) > 0 ? 'positive' : 'negative',
    confidence: clamp(structure.segmentCoverage), source: company.source,
  })
  evidence.push({
    id: 'quality-gate', type: 'quality', title: '数据可执行性门禁', value: `有效行情 ${quality.diagnostics?.validMarketSamples ?? '暂无'}/${quality.diagnostics?.totalMarketSamples ?? '暂无'}，企业综合覆盖 ${(quality.coverage * 100).toFixed(0)}%，状态 ${quality.diagnostics?.executableGate || '需复核'}`,
    direction: quality.issues.length ? 'negative' : quality.warnings.length ? 'mixed' : 'positive', confidence: quality.score / 100,
  })
  return evidence
}

function candidateScore(row: Record<string, unknown>) {
  const period = numberValue(row.price_change_pct) ?? -100
  const daily = numberValue(row.daily_change_pct ?? row.latest_change_pct)
  const volatility = numberValue(row.volatility) ?? 100
  const drawdown = numberValue(row.max_drawdown) ?? 100
  const trend = textValue(row.trend).toLowerCase()
  const trendScore = trend.includes('strong_up') ? 30 : trend.includes('up') ? 20 : trend.includes('sideways') ? 5 : -20
  const dailyScore = daily == null ? -8 : Math.max(-20, Math.min(20, daily * 4))
  const periodScore = Math.max(-8, Math.min(8, period / 4))
  return trendScore + dailyScore + periodScore - Math.min(20, volatility / 10) - Math.min(20, drawdown / 10)
}

function actionForCandidate(row: Record<string, unknown>, quality: DataQuality, riskTolerance: string): ActionType {
  if (!quality.gates.canAddRisk) return 'watch'
  const trend = textValue(row.trend).toLowerCase()
  const daily = numberValue(row.daily_change_pct ?? row.latest_change_pct)
  const period = numberValue(row.price_change_pct) ?? 0
  if (daily != null && daily < -1.5) return 'watch'
  if (trend.includes('strong_up') && (daily ?? period) > 0) return riskTolerance === 'conservative' ? 'watch' : 'add'
  if (trend.includes('up') && (daily ?? period) > 0) return riskTolerance === 'aggressive' ? 'add' : 'hold'
  return 'watch'
}

function structureSignalText(company: NormalizedCompany, news: NormalizedNews) {
  const structure = buildStructureSummary(company, news)
  const leading = structure.positiveSegments[0] || structure.negativeSegments[0]
  if (!leading) return `产业链已映射${structure.taggedNewsCount}条资讯，暂无明确环节强弱信号`
  const change = numberValue(leading.averageChange)
  return `${textValue(leading.segment, '重点环节')}平均涨跌${percent(change)}，产业链覆盖${(structure.segmentCoverage * 100).toFixed(0)}%`
}

function buildInterpretiveSignals(
  market: NormalizedMarket,
  news: NormalizedNews,
  company: NormalizedCompany,
  portfolio: NormalizedPortfolio,
  quality: DataQuality,
  industryName: string,
) {
  const positive: string[] = []
  const negative: string[] = []
  const validRows = validEtfs(market)
  const dailyChanges = validRows.map((row) => numberValue(row.daily_change_pct ?? row.latest_change_pct)).filter((value): value is number => value != null)
  const periodChanges = validRows.map((row) => numberValue(row.price_change_pct)).filter((value): value is number => value != null)
  const primaryChanges = dailyChanges.length ? dailyChanges : periodChanges
  const breadth = primaryChanges.length ? primaryChanges.filter((value) => value > 0).length / primaryChanges.length : 0
  const medianChange = primaryChanges.length ? median(primaryChanges) : null
  const periodMedian = periodChanges.length ? median(periodChanges) : null

  if (primaryChanges.length > 0) {
    positive.push(`${dailyChanges.length ? '最新交易日' : '有效区间'}市场广度偏强：${(breadth * 100).toFixed(0)}%样本上涨，说明短线风险偏好改善，但还不足以单独证明趋势反转。`)
    if (medianChange != null && medianChange > 0 && periodMedian != null && periodMedian < 0) {
      negative.push(`短线反弹与区间表现存在背离：最新交易日中位数${percent(medianChange)}，但分析区间中位数${percent(periodMedian)}，中期趋势仍需验证。`)
    }
  } else {
    negative.push('市场行情没有形成有效样本，无法判断产业相对强弱，也不支持把资讯直接转化为仓位动作。')
  }

  const newsSummary = summarizeNewsForAdvice(news.analysis)
  const positiveNews = news.items.filter((item) => (item.sentiment ?? 0) > 0.1).length
  const negativeNews = news.items.filter((item) => (item.sentiment ?? 0) < -0.1).length
  if (newsSummary && news.items.length > 0) {
    positive.push(`资讯分析显示${newsSummary.replace(/[。！？]+$/u, '')}；它提供了产业催化线索，但需要价格和企业数据确认兑现。`)
  } else if (news.items.length > 0) {
    positive.push(`本次资讯样本已映射到产业链，${positiveNews}条偏积极、${negativeNews}条偏谨慎；当前只能形成事件线索，不能替代基本面结论。`)
  } else {
    negative.push('没有可用资讯样本，无法完成事件催化与风险情绪的交叉验证。')
  }
  if (negativeNews > positiveNews && news.items.length > 0) {
    negative.push(`资讯情绪偏谨慎：偏谨慎样本${negativeNews}条多于偏积极样本${positiveNews}条，短期催化的持续性需要观察。`)
  }

  const leader = company.topCompanies[0]
  if (leader) {
    const financial = (leader.financial_metrics || leader.financialMetrics || {}) as Record<string, unknown>
    const revenueGrowth = numberValue(financial.revenue_growth ?? financial.revenueGrowth)
    const profitGrowth = numberValue(financial.profit_growth ?? financial.profitGrowth)
    if ((revenueGrowth != null && revenueGrowth > 0) || (profitGrowth != null && profitGrowth > 0)) {
      positive.push(`企业层面已有${textValue(leader.name, '重点企业')}的增长信号，说明产业需求并非只有情绪驱动；但企业代表性和持续性仍需结合现金流与后续财报确认。`)
    }
    if (financial.operating_cash_flow == null && financial.operatingCashFlow == null) {
      negative.push(`企业层面缺少${textValue(leader.name, '重点企业')}经营现金流证据，当前无法完成“收入增长是否转化为经营质量改善”的判断。`)
    }
  } else {
    negative.push(`企业模块没有形成可核对样本，无法确认${industryName || '本产业'}的业绩兑现与企业分化。`)
  }

  if (portfolio.holdings.length === 0) {
    negative.push('当前没有可读取持仓，结论只能停留在产业观察，无法转化为组合级调仓建议。')
  } else if (!portfolioHasCompleteAllocation(portfolio)) {
    negative.push('持仓金额或权重字段不完整，方向判断可以参考，但无法可靠计算调仓幅度和金额。')
  }
  if (quality.issues.length > 0) negative.push(`数据质量限制仍存在：${quality.issues[0]}`)

  return {
    positiveSignals: Array.from(new Set(positive)).slice(0, 5),
    negativeSignals: Array.from(new Set(negative)).slice(0, 5),
  }
}

export function buildRuleBasedAdvice(
  industryName: string,
  market: NormalizedMarket,
  news: NormalizedNews,
  company: NormalizedCompany,
  portfolio: NormalizedPortfolio,
  quality: DataQuality,
  riskTolerance: string,
  investmentHorizon: string,
): StructuredAdvice {
  const evidence = buildEvidence(market, news, company, quality)
  const recommendations: DecisionItem[] = []
  const holdingsByTicker = new Map(portfolio.holdings.map((holding) => [holding.ticker, holding]))
  const marketSymbols = new Set([...market.etfs, ...market.indices].map((row) => textValue(row.code || row.symbol)).filter(Boolean))
  const mappedHoldingCount = portfolio.holdings.filter((holding) => (holding.ticker && marketSymbols.has(holding.ticker)) || holdingMatchesIndustry(holding, industryName)).length
  const newsReferenceWithoutPrefix = summarizeNewsForAdvice(news.analysis).trim()

  // 市场 ETF 只用于判断产业和市场环境，不进入执行动作列表；执行对象固定为当前实际持仓。
  const taggedHoldings = portfolio.holdings.filter((holding) => holdingMatchesIndustry(holding, industryName))
  for (const holding of taggedHoldings) {
    recommendations.push(buildHoldingRecommendation(holding, market, news, company, portfolio, quality, investmentHorizon, recommendations.length + 1, newsReferenceWithoutPrefix, industryName))
  }

  const hasAdd = recommendations.some((item) => item.action === 'add' || item.action === 'buy')
  const hasNegative = evidence.some((item) => item.direction === 'negative')
  const decision = hasAdd ? 'increase' : quality.gates.requiresDataReview || hasNegative ? 'wait' : 'maintain'
  const mainReason = [...quality.issues, ...quality.warnings].slice(0, 2).join('；')
  const interpretiveSignals = buildInterpretiveSignals(market, news, company, portfolio, quality, industryName)
  const negativeSignals = interpretiveSignals.negativeSignals.length > 0 ? interpretiveSignals.negativeSignals : ['当前没有足够的利空证据，仍需等待下一轮数据验证。']
  const positiveSignals = interpretiveSignals.positiveSignals.length > 0 ? interpretiveSignals.positiveSignals : ['当前没有足够的利好证据，暂不把零散数据解释为趋势改善。']
  const dataIssues = [...quality.issues, ...quality.warnings]
  const action = hasAdd ? '仅对通过门禁的标的分批增加小仓位' : quality.gates.requiresDataReview ? '今日不新增风险，先完成数据复核' : '维持现有仓位，等待更强共振'
  const waitFor = recommendations.flatMap((item) => item.trigger || []).filter((item, index, values) => values.indexOf(item) === index).slice(0, 5)
  // 规则兜底也必须把各上游模块的有效信号带入总览，不能只输出质量门禁状态。
  const validRows = validEtfs(market)
  const dailyChanges = validRows.map((row) => numberValue(row.daily_change_pct ?? row.latest_change_pct)).filter((value): value is number => value != null)
  const validChanges = validRows.map((row) => numberValue(row.price_change_pct)).filter((value): value is number => value != null)
  const primaryChanges = dailyChanges.length ? dailyChanges : validChanges
  const marketMedian = median(primaryChanges)
  const marketBreadth = primaryChanges.length ? primaryChanges.filter((value) => value > 0).length / primaryChanges.length : undefined
  const marketContext = primaryChanges.length
    ? `有效市场样本 ${primaryChanges.length}/${market.etfs.length} 个，${dailyChanges.length ? '最新交易日' : '区间'}中位数${percent(marketMedian)}，上涨占比${(marketBreadth! * 100).toFixed(0)}%${dailyChanges.length && validChanges.length ? `；区间中位数${percent(median(validChanges))}` : ''}`
    : '市场缺少可用区间收益样本'
  const companyLeader = company.topCompanies[0]
  const companyContext = companyLeader
    ? `重点企业${textValue(companyLeader.name, '样本')}近期综合评分${textValue(companyLeader.overall_score ?? companyLeader.overallScore, '暂无')}`
    : `企业分析覆盖${company.analyzed}/${company.total}家`
  const companyEvidence = company.topCompanies.slice(0, 3).map((item) => {
    const financial = (item.financial_metrics || item.financialMetrics || {}) as Record<string, unknown>
    const announcements = (item.latest_announcement_samples || item.latestAnnouncementSamples || item.announcement_samples || item.announcementSamples || []) as unknown[]
    const event = announcements[0] as Record<string, unknown> | undefined
    const growth = `营收/利润 ${textValue(financial.revenue_growth ?? financial.revenueGrowth, '暂无')}%/${textValue(financial.profit_growth ?? financial.profitGrowth, '暂无')}%（${textValue(financial.growth_basis ?? financial.growthBasis, '无法确认')}）`
    const cashFlow = financial.operating_cash_flow ?? financial.operatingCashFlow
    const eventText = event?.title ? `；公告事件 ${textValue(event.event_type ?? event.eventType, '例行公告')}：${textValue(event.title)}` : '；公告事件样本暂无'
    return `${textValue(item.name, '未命名企业')}：${growth}；经营现金流${cashFlow == null ? '缺失' : '已提供'}${eventText}`
  }).join('；') || '企业财报与公告实际明细暂无'
  const companyEvidenceContext = `企业实际证据：${companyEvidence}`
  const structureContext = structureSignalText(company, news)
  const newsContext = newsReferenceWithoutPrefix ? conciseText(newsReferenceWithoutPrefix, 180) : '资讯暂无聚合结论'
  const strategy = hasAdd
    ? `只对通过市场、产业和组合质量门禁的标的分批增加小仓位，先执行首批配置，等待触发条件确认后再评估第二批。${newsReferenceWithoutPrefix ? `资讯参考：${sentence(newsReferenceWithoutPrefix)}` : ''}`
    : `今日以持有、观察和数据复核为主，不把单一强势标的或单条资讯直接转换为新增仓位。${newsReferenceWithoutPrefix ? `资讯参考：${sentence(newsReferenceWithoutPrefix)}` : ''}`
  const summary = hasAdd
    ? `今日可对 ${recommendations.filter((item) => item.action === 'add').map((item) => item.target).join('、')} 进行小比例试探；${marketContext}；${companyContext}；${structureContext}。`
    : `综合判断：${quality.gates.requiresDataReview ? '暂不新增风险，先完成数据复核' : '维持现有仓位并等待更强共振'}。${marketContext}；${companyContext}；${structureContext}；${companyEvidenceContext}；资讯判断：${newsContext.replace(/[。！？]+$/u, '')}。${mainReason ? `主要限制：${mainReason}。` : ''}`
  const riskWarning = mergeQualityIntoRiskWarning('本报告用于研究辅助，不替代投资者对价格、流动性和交易成本的独立判断。', quality)
  return {
    industry: industryName, decision,
    decisionBrief: {
      headline: hasAdd ? '信号通过质量门禁，可小比例试探' : quality.gates.requiresDataReview ? '数据或市场门禁未通过，今日不新增风险' : '信号不足，维持现有仓位',
      negativeSignals,
      positiveSignals,
      dataIssues,
      action,
      waitFor,
    },
    strategy,
    summary,
    investmentConclusion: composeInvestmentConclusion(summary, strategy),
    riskWarning,
    recommendations, evidence, limitations: [
      `企业数据采用影响力最高的重点企业样本（最多 8 家）；行情、财报和公告覆盖率仅作为样本完整度参考，不作为数据门禁。`,
      ...quality.abnormalSamples?.map((item) => `${item.name}（${item.symbol}）异常归因：${item.source}；${item.reasons.join('；')}`) || [],
      `资讯样本：${news.items.length} 条，事件需结合价格反应与产业链映射验证`,
      `持仓产业映射：${mappedHoldingCount}/${portfolio.holdings.length} 个持仓标的完成代码或知识图谱领域映射`,
      portfolio.valuationMode === 'imported_nav' ? '组合金额采用个人账号导入的单位净值与份额，可用于金额级调仓；实时价格和盈亏可能滞后' : portfolio.valuationMode === 'estimated' ? '组合市值数据不完整，不能用于精确调仓金额' : '组合当前价格和权重已完成同步',
    ], generatedBy: 'rules', validation: { valid: true, warnings: quality.warnings },
  }
}

function buildHoldingRecommendation(
  holding: NormalizedPortfolio['holdings'][number],
  market: NormalizedMarket,
  news: NormalizedNews,
  company: NormalizedCompany,
  portfolio: NormalizedPortfolio,
  quality: DataQuality,
  investmentHorizon: string,
  priority: number,
  newsReference: string,
  industryName: string,
): DecisionItem {
  const marketRow = [...market.etfs, ...market.indices].find((row) => textValue(row.code || row.symbol) === textValue(holding.ticker))
  const daily = numberValue(holding.dailyChangePct ?? holding.daily_change_pct ?? marketRow?.daily_change_pct ?? marketRow?.latest_change_pct)
  const period = numberValue(holding.periodChangePct ?? holding.period_change_pct ?? holding.profitLossPct ?? marketRow?.price_change_pct)
  const trend = textValue(holding.trendSignal ?? holding.trend ?? marketRow?.trend, 'unknown').toLowerCase()
  const mapped = holdingMatchesIndustry(holding, industryName)
  const hasPriceSignal = daily != null || period != null || trend !== 'unknown'
  const action: ActionType = !hasPriceSignal || !mapped
    ? 'watch'
    : trend.includes('strong_down') || (daily != null && daily <= -2)
      ? 'watch'
      : 'hold'
  const priceText = daily == null ? '最新交易日涨跌缺失' : `最新交易日涨跌 ${percent(daily)}`
  const periodText = period == null ? '区间涨跌缺失' : `区间涨跌 ${percent(period)}`
  const trendText = trendLabel(holding.trendSignal ?? holding.trend ?? marketRow?.trend)
  const marketText = `市场 ETF 仅作为产业环境参考，当前有效样本 ${quality.diagnostics?.validMarketSamples ?? 0}/${quality.diagnostics?.totalMarketSamples ?? 0}`
  const companyText = company.topCompanies[0] ? `企业侧重点关注 ${textValue(company.topCompanies[0].name, '重点企业')} 的基本面兑现` : '企业侧暂无足够样本'
  const companySymbols = new Set(company.topCompanies.map((item) => textValue(item.symbol ?? item.ticker)).filter(Boolean))
  const exposureRows = (holding.underlyingHoldings || []).filter((item) => {
    const code = textValue(item.stock_code)
    return code && companySymbols.has(code)
  })
  const exposureText = exposureRows.length
    ? `基金底层企业与企业分析样本重合${exposureRows.length}家，合计权重${exposureRows.reduce((sum, item) => sum + (numberValue(item.weight) || 0), 0).toFixed(2)}%`
    : '基金底层企业占比数据不足，暂无法与企业分析样本做权重交叉验证'
  const newsText = newsReference ? `资讯侧：${conciseText(newsReference.replace(/^资讯面\s*/u, '资讯面'), 120)}` : '资讯侧暂无明确催化结论'
  const reason = !mapped
    ? `${priceText}，${periodText}，趋势${trendText}；该持仓尚未完成与当前分析产业的可靠映射，因此只做独立观察，不把产业信号直接套用到本基金。${marketText}；${newsText}。`
    : `${priceText}，${periodText}，趋势${trendText}；${marketText}；${companyText}；${exposureText}；${newsText}。${action === 'watch' ? '当前价格与趋势信号偏弱，优先控制回撤并等待重新站稳。' : '当前不建议追涨，以持仓跟踪和条件触发为主。'}`
  const currentWeight = holding.weight
  const targetWeight = currentWeight
  const deltaWeight = undefined
  const amount = deltaWeight != null && quality.gates.canCalculateAllocation ? portfolio.totalValue * deltaWeight / 100 : null
  return {
    action, target: textValue(holding.name, holding.ticker || '未命名持仓'), symbol: holding.ticker, targetType: 'holding', priority,
    reason, evidenceIds: ['market-breadth', 'market-leader', 'structure-map', 'quality-gate'],
    currentWeight, targetWeight, deltaWeight, allocation: targetWeight, amount,
    targetPrice: null,
    trigger: action === 'watch' ? ['日线重新站回短期均线', '当日跌幅收窄且产业相对强度修复'] : ['趋势保持有效', '基金与产业走势未出现明显背离'],
    invalidation: ['趋势继续转弱', '产业市场广度跌破 40%', '行情或持仓数据失去可用性'],
    horizon: investmentHorizon as DecisionItem['horizon'], confidence: Math.round((quality.score / 100) * 100) / 100,
  }
}

/** 确保总览动作覆盖全部当前持仓，并排除 ETF/指数等非持仓标的。 */
export function ensureDailyActionCoverage(
  advice: StructuredAdvice,
  market: NormalizedMarket,
  portfolio: NormalizedPortfolio,
  industryName: string,
  quality: DataQuality,
  investmentHorizon: string,
) {
  const existingBySymbol = new Map(advice.recommendations.filter((item) => item.targetType === 'holding' && item.symbol).map((item) => [item.symbol!, item]))
  const holdingRecommendations: DecisionItem[] = []
  const newsReference = summarizeNewsForAdvice('')
  for (const holding of portfolio.holdings.filter((item) => holdingMatchesIndustry(item, industryName))) {
    const symbol = textValue(holding.ticker)
    if (!symbol) continue
    holdingRecommendations.push(existingBySymbol.get(symbol) || buildHoldingRecommendation(holding, market, { items: [], analysis: newsReference }, { total: 0, analyzed: 0, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} }, portfolio, quality, investmentHorizon, holdingRecommendations.length + 1, '', industryName))
  }
  advice.recommendations = holdingRecommendations
  return advice
}

export function validateAdvice(candidate: Partial<StructuredAdvice>, fallback: StructuredAdvice, data: { quality: DataQuality; market: NormalizedMarket; portfolio: NormalizedPortfolio; evidence?: Evidence[] }) {
  const warnings: string[] = []
  const recommendationWarnings = new Set<string>()
  const invalidRecommendationIndexes = new Set<number>()
  const validMarketSymbols = getValidMarketSymbols(data.market)
  const knownIndexSymbols = new Set(data.market.indices.filter((row) => !suspiciousMarketRow(row)).map((row) => textValue(row.code || row.symbol)).filter(Boolean))
  const knownHoldingSymbols = new Set(data.portfolio.holdings.map((row) => textValue(row.ticker || row.symbol)).filter(Boolean))
  const knownEvidenceIds = new Set((data.evidence || fallback.evidence || []).map((item) => item.id))
  const recommendations = Array.isArray(candidate.recommendations) ? candidate.recommendations : []
  for (const [index, item] of recommendations.entries()) {
    const itemWarnings: string[] = []
    if (['etf', 'index', 'holding'].includes(item.targetType) && !item.symbol) itemWarnings.push(`AI 建议 ${item.target} 缺少标准代码`)
    if (item.targetType === 'etf' && item.symbol && !validMarketSymbols.has(item.symbol)) itemWarnings.push(`AI 建议引用了不可用于动作排序的 ETF：${item.symbol}`)
    if (item.targetType === 'index' && item.symbol && !knownIndexSymbols.has(item.symbol)) itemWarnings.push(`AI 建议引用了输入中不存在或异常的指数：${item.symbol}`)
    if (item.targetType === 'holding' && item.symbol && !knownHoldingSymbols.has(item.symbol)) itemWarnings.push(`AI 建议引用了输入中不存在的持仓：${item.symbol}`)
    if ((item.action === 'buy' || item.action === 'add') && !data.quality.gates.canAddRisk) itemWarnings.push('数据质量门禁未通过，禁止 AI 输出新增风险动作')
    if (item.targetPrice != null) itemWarnings.push('当前链路没有可靠目标价计算依据，目标价建议被拒绝')
    if (!positionAction(item.action) && (item.currentWeight != null || item.targetWeight != null || item.deltaWeight != null || item.amount != null)) itemWarnings.push(`非调仓动作 ${item.symbol || item.target} 不应包含仓位变化或金额`)
    if (item.currentWeight != null && item.targetWeight != null && Math.abs((item.targetWeight - item.currentWeight) - (item.deltaWeight ?? 0)) > 0.01) itemWarnings.push(`建议 ${item.symbol || item.target} 的仓位变化不一致`)
    if (item.amount != null && (!data.quality.gates.canCalculateAllocation || !positionAction(item.action) || item.deltaWeight == null || Math.abs(item.deltaWeight) < 0.0001)) itemWarnings.push(`建议 ${item.symbol || item.target} 的调仓金额缺少有效仓位变化依据`)
    if (!item.evidenceIds?.length) itemWarnings.push(`建议 ${item.symbol || item.target} 缺少证据引用`)
    else if (item.evidenceIds.some((id) => !knownEvidenceIds.has(id))) itemWarnings.push(`建议 ${item.symbol || item.target} 引用了不存在的证据`)
    if (item.confidence != null && (item.confidence < 0 || item.confidence > 1)) itemWarnings.push(`建议 ${item.symbol || item.target} 的置信度不在 0-1 范围`)
    if (!item.trigger?.length || !item.invalidation?.length) itemWarnings.push(`建议 ${item.symbol || item.target} 缺少执行或失效条件`)
    if (itemWarnings.length > 0) invalidRecommendationIndexes.add(index)
    itemWarnings.forEach((warning) => { warnings.push(warning); recommendationWarnings.add(warning) })
  }
  if (!candidate.summary || !candidate.strategy) warnings.push('AI 缺少结构化摘要或策略')
  const possiblyTruncated = [candidate.summary, candidate.strategy].filter((value): value is string => Boolean(value)).some((value) => /(?:兑|及|与|和|但|或|为|在|的|需|将|其|并|且)$/u.test(value.trim()))
  if (possiblyTruncated) warnings.push('AI 摘要或策略疑似在句末截断，已拒绝写入报告')
  const narrativeWarnings = warnings.filter((warning) => !recommendationWarnings.has(warning))
  const sanitizedRecommendations = recommendations.filter((_, index) => !invalidRecommendationIndexes.has(index))
  const narrativeValid = narrativeWarnings.length === 0 && Boolean(candidate.summary && candidate.strategy)
  const usableAdvice = narrativeValid
    ? { ...candidate, recommendations: sanitizedRecommendations } as StructuredAdvice
    : fallback
  return { valid: warnings.length === 0, narrativeValid, warnings, advice: usableAdvice }
}

export function parseJsonObject(value: string): Record<string, unknown> | null {
  const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    const start = text.indexOf('{')
    if (start < 0) return null
    let depth = 0
    let quoted = false
    let escaped = false
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') quoted = true
      else if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, index + 1))
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
          } catch {
            return null
          }
        }
      }
    }
    return null
  }
}
