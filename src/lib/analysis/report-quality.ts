import type { Condition, Evaluation } from '@/lib/research/contracts'
import type { DecisionTimingAssessment } from './decision-timing'

export type QualityDimension = {
  key: 'market' | 'fundamentals' | 'valuation' | 'product' | 'evidence' | 'replay'
  label: string
  score: number
  weight: number
  detail: string
}

export type ReportQualityAssessment = {
  version: 1
  overallScore: number
  confidenceScore: number
  grade: 'A' | 'B' | 'C' | 'D'
  usability: 'advice-grade' | 'limited-advice' | 'insufficient'
  dimensions: QualityDimension[]
  blockers: string[]
  generatedAt: string
}

export type ReviewConditionChange = {
  key: string
  label: string
  before: Condition['value'] | undefined
  after: Condition['value'] | undefined
  beforeStatus: Condition['status'] | 'missing'
  afterStatus: Condition['status'] | 'missing'
}

export type ReportReviewDelta = {
  version: 1
  status: 'changed' | 'unchanged' | 'no-baseline'
  parentRunId: string | null
  baselineReportId: string | null
  changedDecisions: Array<{
    ticker: string
    name: string
    beforeState: string
    afterState: string
    conditions: ReviewConditionChange[]
  }>
  unchangedDecisionCount: number
  summary: string
}

type ValidationLike = {
  tradeApproved?: boolean
  sessionCount?: number
  spanDays?: number
  totalTrades?: number
  meanExcessReturnPct?: number | null
  maxDrawdownPct?: number | null
}

type DataQualityLike = { status?: string } | null | undefined
type PreflightLike = { status?: string; failed?: number; warnings?: string[] } | null | undefined

const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)))
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const ratio = (known: number, total: number) => total > 0 ? known / total : 0

function conditionCoverage(evaluation: Evaluation | undefined, keys: string[], accepted: Condition['status'][] = ['met', 'unmet']) {
  const decisions = evaluation?.decisions || []
  const total = decisions.length * keys.length
  const known = decisions.reduce((sum, decision) => sum + keys.filter(key => {
    const condition = decision.conditions.find(item => item.key === key)
    return !!condition && accepted.includes(condition.status)
  }).length, 0)
  return { known, total, score: round(ratio(known, total) * 100) }
}

export function buildReportQuality(input: {
  evaluation?: Evaluation
  dataQuality?: DataQualityLike
  preflight?: PreflightLike
  validation?: ValidationLike | null
  decisionTiming?: DecisionTimingAssessment | null
}): ReportQualityAssessment {
  const { evaluation, dataQuality, preflight, validation, decisionTiming } = input
  const market = conditionCoverage(evaluation, ['calendar', 'session', 'history', 'continuity', 'adjustment', 'index'])
  const fundamentals = conditionCoverage(evaluation, ['holdings', 'fundamentals', 'profit-growth', 'cash-quality'])
  const product = conditionCoverage(evaluation, ['premium', 'liquidity', 'spread', 'volatility'])
  const products = evaluation?.products || []
  const indexCodes = [...new Set(products.map(item => item.indexCode).filter(Boolean))]
  const currentValuation = new Set(products.filter(item => finite(item.pe) || finite(item.pb)).map(item => item.indexCode).filter(Boolean)).size
  const historicalValuation = new Set(products.filter(item => (item.valuationSampleCount || 0) >= 500 && (finite(item.pePercentile5y) || finite(item.pbPercentile5y))).map(item => item.indexCode).filter(Boolean)).size
  const valuationScore = round((ratio(currentValuation, indexCodes.length) * 0.4 + ratio(historicalValuation, indexCodes.length) * 0.6) * 100)
  const evidence = evaluation?.evidence || []
  const datedEvidence = evidence.filter(item => item.dataDate || item.publishedAt).length
  const decisionEvents = (evaluation?.events || []).filter(item => item.status === 'evidence' && item.category !== 'administrative')
  const linkedEvents = decisionEvents.filter(item => item.evidenceIds.length > 0 && item.sources.length > 0).length
  const evidenceScore = round((ratio(datedEvidence, evidence.length) * 0.55 + ratio(linkedEvents, decisionEvents.length) * 0.45) * 100)
  const validationScore = round(
    Math.min(1, (validation?.sessionCount || 0) / 480) * 35
    + Math.min(1, (validation?.spanDays || 0) / 730) * 20
    + Math.min(1, (validation?.totalTrades || 0) / 30) * 15
    + (finite(validation?.meanExcessReturnPct) && validation.meanExcessReturnPct > 0 ? 15 : 0)
    + (finite(validation?.maxDrawdownPct) && validation.maxDrawdownPct <= 25 ? 15 : 0)
  )
  const dimensions: QualityDimension[] = [
    { key: 'market', label: '行情完整性', score: market.score, weight: 25, detail: `${market.known}/${market.total}项关键行情条件可核验` },
    { key: 'fundamentals', label: '基本面覆盖', score: fundamentals.score, weight: 20, detail: `${fundamentals.known}/${fundamentals.total}项持仓与财务条件可核验` },
    { key: 'valuation', label: '估值有效性', score: valuationScore, weight: 15, detail: `${currentValuation}/${indexCodes.length}个指数有当期估值，${historicalValuation}/${indexCodes.length}个有五年分位` },
    { key: 'product', label: '产品可交易数据', score: product.score, weight: 15, detail: `${product.known}/${product.total}项折溢价、流动性、价差与波动条件可核验` },
    { key: 'evidence', label: '证据可追溯性', score: evidenceScore, weight: 15, detail: `${datedEvidence}/${evidence.length}条证据有业务日期，${linkedEvents}/${decisionEvents.length}个决策事件可追溯` },
    { key: 'replay', label: '历史复盘积累', score: validationScore, weight: 10, detail: `${validation?.sessionCount || 0}个独立交易日，${validation?.totalTrades || 0}笔成本后模拟交易；仅作复盘参考，不作为建议门槛` },
  ]
  const overallScore = round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / 100)
  const blockers = [
    !evaluation && '缺少冻结研究评估',
    dataQuality?.status !== 'available' && '研究数据门禁未完全通过',
    preflight?.status && preflight.status !== 'fresh' && `分析前同步未完全成功${preflight.failed ? `（失败${preflight.failed}项）` : ''}`,
    historicalValuation < indexCodes.length && '历史估值分位覆盖不足',
    product.score < 80 && 'ETF产品交易数据覆盖不足',
    decisionTiming && !decisionTiming.executionReady && `报告仅供参考：${decisionTiming.reasons[0] || '未通过盘中执行时效'}`,
  ].filter(Boolean) as string[]
  const usability = !evaluation || market.score < 50 ? 'insufficient' : dataQuality?.status === 'available' && product.score >= 70 && decisionTiming?.executionReady !== false ? 'advice-grade' : 'limited-advice'
  const confidenceScore = round(Math.min(overallScore, dataQuality?.status === 'available' ? 95 : dataQuality?.status === 'limited' ? 79 : 45))
  const grade = overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 55 ? 'C' : 'D'
  return { version: 1, overallScore, confidenceScore, grade, usability, dimensions, blockers, generatedAt: new Date().toISOString() }
}

function changedValue(before: Condition['value'] | undefined, after: Condition['value'] | undefined) {
  if (finite(before) && finite(after)) return Math.abs(before - after) > 1e-9
  return before !== after
}

export function buildReportReviewDelta(input: {
  current?: Evaluation
  previous?: Evaluation
  parentRunId?: string | null
  baselineReportId?: string | null
}): ReportReviewDelta {
  if (!input.current || !input.previous) return {
    version: 1, status: 'no-baseline', parentRunId: input.parentRunId || null, baselineReportId: input.baselineReportId || null,
    changedDecisions: [], unchangedDecisionCount: input.current?.decisions.length || 0, summary: '未找到可比较的母报告冻结评估。',
  }
  const changedDecisions: ReportReviewDelta['changedDecisions'] = []
  for (const current of input.current.decisions) {
    const previous = input.previous!.decisions.find(item => item.ticker === current.ticker)
    if (!previous) {
      changedDecisions.push({ ticker: current.ticker, name: current.name, beforeState: 'new', afterState: current.state, conditions: [] })
      continue
    }
    const keys = new Set([...previous.conditions.map(item => item.key), ...current.conditions.map(item => item.key)])
    const conditions: ReviewConditionChange[] = []
    for (const key of keys) {
      const before = previous.conditions.find(item => item.key === key)
      const after = current.conditions.find(item => item.key === key)
      if ((before?.status || 'missing') === (after?.status || 'missing') && !changedValue(before?.value, after?.value)) continue
      conditions.push({ key, label: after?.label || before?.label || key, before: before?.value, after: after?.value, beforeStatus: before?.status || 'missing', afterStatus: after?.status || 'missing' })
    }
    if (previous.state !== current.state || conditions.length) changedDecisions.push({ ticker: current.ticker, name: current.name, beforeState: previous.state, afterState: current.state, conditions })
  }
  const unchangedDecisionCount = Math.max(0, input.current.decisions.length - changedDecisions.length)
  return {
    version: 1,
    status: changedDecisions.length ? 'changed' : 'unchanged',
    parentRunId: input.parentRunId || null,
    baselineReportId: input.baselineReportId || null,
    changedDecisions,
    unchangedDecisionCount,
    summary: changedDecisions.length ? `${changedDecisions.length}只产品出现状态或条件数值变化，${unchangedDecisionCount}只无变化。` : `本次复核未发现实质变化，${unchangedDecisionCount}只产品状态与关键条件保持一致。`,
  }
}
