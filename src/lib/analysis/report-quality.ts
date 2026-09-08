import { decisionEvents as selectDecisionEvents } from './report-insights'
import type { Condition, Evaluation } from '@/lib/research/contracts'
import type { DecisionTimingAssessment } from './decision-timing'

export type QualityDimension = {
  key: 'market' | 'fundamentals' | 'valuation' | 'product' | 'evidence'
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

type DataQualityLike = { status?: string } | null | undefined
type PreflightLike = { status?: string; queued?: number; completed?: number; partial?: number; failed?: number; warnings?: string[] } | null | undefined

const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)))
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const ratio = (known: number, total: number) => total > 0 ? known / total : 0

function conditionCoverage(evaluation: Evaluation | undefined, keys: string[], accepted: Condition['status'][] = ['met', 'unmet']) {
  const decisions = evaluation?.decisions || []
  const conditions = decisions.flatMap(decision => decision.conditions.filter(condition => keys.includes(condition.key)))
  const total = decisions.length * keys.length
  const known = conditions.filter(condition => accepted.includes(condition.status)).length
  return { known, total, score: round(ratio(known, total) * 100) }
}

export function buildReportQuality(input: {
  evaluation?: Evaluation
  dataQuality?: DataQualityLike
  preflight?: PreflightLike
  decisionTiming?: DecisionTimingAssessment | null
}): ReportQualityAssessment {
  const { evaluation, dataQuality, preflight, decisionTiming } = input
  const market = conditionCoverage(evaluation, ['calendar', 'session', 'history', 'continuity', 'adjustment', 'index'])
  const fundamentals = conditionCoverage(evaluation, ['holdings', 'fundamentals', 'profit-growth', 'cash-quality'])
  const product = conditionCoverage(evaluation, ['premium', 'liquidity', 'spread', 'volatility'])
  if (decisionTiming?.phase === 'trading') {
    product.known += decisionTiming.quoteCoverage.fresh
    product.total += decisionTiming.quoteCoverage.total
    product.score = round(ratio(product.known, product.total) * 100)
  }
  const products = evaluation?.products || []
  const indexCodes = [...new Set(products.map(item => item.indexCode).filter(Boolean))]
  const currentValuation = new Set(products.filter(item => evaluation?.expectedSession && item.valuationDate === evaluation.expectedSession && (finite(item.pe) || finite(item.pb))).map(item => item.indexCode).filter(Boolean)).size
  const valuationScore = round(ratio(currentValuation, indexCodes.length) * 100)
  const evidence = evaluation?.evidence || []
  const datedEvidence = evidence.filter(item => item.dataDate || item.publishedAt).length
  const decisionEvents = selectDecisionEvents(evaluation,Number.MAX_SAFE_INTEGER)
  const linkedEvents = decisionEvents.filter(item => item.evidenceIds.length > 0 && item.sources.length > 0).length
  const evidenceScore = round((ratio(datedEvidence, evidence.length) * 0.55 + ratio(linkedEvents, decisionEvents.length) * 0.45) * 100)
  const syncIntentionallySkipped=preflight?.status==='warning'&&(preflight.queued||0)===0&&preflight.warnings?.some(message=>message.includes('未触发外部同步'))
  const dimensions: QualityDimension[] = [
    { key: 'market', label: '行情完整性', score: market.score, weight: 28, detail: `${market.known}/${market.total}项关键行情条件可核验` },
    { key: 'fundamentals', label: '基本面覆盖', score: fundamentals.score, weight: 22, detail: `${fundamentals.known}/${fundamentals.total}项持仓与财务条件可核验` },
    { key: 'valuation', label: '当期估值有效性', score: valuationScore, weight: 16, detail: `${currentValuation}/${indexCodes.length}个跟踪指数有可核验当期估值` },
    { key: 'product', label: '产品可交易数据', score: product.score, weight: 17, detail: `${product.known}/${product.total}项当期产品交易条件可核验` },
    { key: 'evidence', label: '证据可追溯性', score: evidenceScore, weight: 17, detail: `${datedEvidence}/${evidence.length}条证据有业务日期，${linkedEvents}/${decisionEvents.length}个决策事件可追溯` },
  ]
  const weightedScore = round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / 100)
  const timingFailed = decisionTiming?.phase === 'trading' && !decisionTiming.executionReady
  const qualityCap = timingFailed ? 69 : dataQuality?.status !== 'available' || (preflight?.failed || 0) > 0 ? 84 : 100
  const overallScore = Math.min(weightedScore, qualityCap)
  const blockers = [
    !evaluation && '缺少冻结研究评估',
    timingFailed && '交易时段时效未通过，综合质量评分上限为69分',
    ...(evaluation?.omittedConditions || []).map(item => `${item.label}：底层数据缺失，仍计入质量覆盖率`),
    dataQuality?.status !== 'available' && '研究数据门禁未完全通过',
    preflight?.status && preflight.status !== 'fresh' && !syncIntentionallySkipped && `分析前同步未完全成功${preflight.failed ? `（失败${preflight.failed}项）` : ''}`,
    product.score < 80 && 'ETF产品交易数据覆盖不足',
    decisionTiming && !decisionTiming.executionReady && `报告仅供参考：${decisionTiming.reasons[0] || '当前为非交易时间'}`,
  ].filter(Boolean) as string[]
  const usability = !evaluation || market.score < 50 ? 'insufficient' : dataQuality?.status === 'available' && product.score >= 70 && !(preflight?.failed || 0) && preflight?.status !== 'blocked' && decisionTiming?.executionReady !== false ? 'advice-grade' : 'limited-advice'
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
