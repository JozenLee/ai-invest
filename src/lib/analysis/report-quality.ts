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
  evidenceConfidenceScore: number
  decisionConfidenceScore: number
  executionReadinessScore: number
  dataReadinessScore?: number
  executionAudit?: { products: number; verifiedProducts: number; tradableProducts: number; portfolioActions: number; executablePortfolioActions: number; basis: string }
  validationStatus: 'validated' | 'paper-only' | 'insufficient-history'
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

type DataQualityLike = { status?: string; perEtf?:Array<{status?:string}>;dataAnomalies?:unknown[] } | null | undefined
type PreflightLike = { status?: string; queued?: number; completed?: number; partial?: number; failed?: number; warnings?: string[] } | null | undefined
type ValidationLike = { status?: string; issues?: string[] } | null | undefined
type InputCoverageLike = { passed?: boolean; coveragePct?: number; issues?: string[] } | null | undefined
type StrategyValidationLike = { validation?:string;trades?:number;observations?:number } | null | undefined

const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)))
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const ratio = (known: number, total: number) => total > 0 ? known / total : 0

function conditionCoverage(evaluation: Evaluation | undefined, keys: string[], accepted: Condition['status'][] = ['met', 'unmet'], excluded:(condition:Condition)=>boolean=()=>false) {
  const decisions = evaluation?.decisions || []
  const conditions = decisions.flatMap(decision => decision.conditions.filter(condition => keys.includes(condition.key)))
  const ignored=conditions.filter(excluded).length
  const total = Math.max(0,decisions.length * keys.length-ignored)
  const known = conditions.filter(condition => !excluded(condition)&&accepted.includes(condition.status)).length
  return { known, total, score: round(ratio(known, total) * 100) }
}

export function buildReportQuality(input: {
  evaluation?: Evaluation
  dataQuality?: DataQualityLike
  preflight?: PreflightLike
  decisionTiming?: DecisionTimingAssessment | null
  analysisStatuses?: Record<string,{status?:string}|null|undefined>
  outputValidations?: Record<string,ValidationLike>
  inputCoverage?: Record<string,InputCoverageLike>
  strategyValidation?: StrategyValidationLike
  investmentAdvice?: unknown
  portfolioDecisionSupport?: unknown
}): ReportQualityAssessment {
  const { evaluation, dataQuality, preflight, analysisStatuses, decisionTiming,outputValidations,inputCoverage,strategyValidation } = input
  const market = conditionCoverage(evaluation, ['calendar', 'session', 'history', 'continuity', 'adjustment', 'index'])
  const fundamentals = conditionCoverage(evaluation, ['holdings', 'fundamentals', 'profit-growth', 'cash-quality'])
  const product = conditionCoverage(evaluation, ['premium', 'liquidity', 'spread', 'volatility'],['met','unmet'],condition=>decisionTiming?.phase==='trading'&&condition.key==='premium'&&condition.availability==='pending-publication')
  const products = evaluation?.products || []
  const indexCodes = [...new Set(products.map(item => item.indexCode).filter(Boolean))]
  const valuationSession=decisionTiming?.closeDataSession||evaluation?.expectedSession
  const currentValuation = new Set(products.filter(item => valuationSession && item.valuationDate === valuationSession && (finite(item.pe) || finite(item.pb))).map(item => item.indexCode).filter(Boolean)).size
  const valuationScore = round(ratio(currentValuation, indexCodes.length) * 100)
  const evidence = evaluation?.evidence || []
  const datedEvidence = evidence.filter(item => item.dataDate || item.publishedAt).length
  const uniqueEvidence = new Set(evidence.map(item=>item.hash).filter(Boolean)).size
  const decisionEvents = selectDecisionEvents(evaluation,Number.MAX_SAFE_INTEGER)
  const linkedEvents = decisionEvents.filter(item => item.evidenceIds.length > 0 && item.sources.length > 0).length
  const gradeWeight={A:1,B:.85,C:.65,D:.25} as const
  const graded=decisionEvents.map(item=>gradeWeight[item.evidenceGrade||'C'])
  const gradeScore=graded.length?graded.reduce((sum,value)=>sum+value,0)/graded.length:1
  const independent=decisionEvents.filter(item=>item.sourceTier==='primary'||item.sourceTier==='corroborated'||(item.independentSourceCount||0)>=2).length
  const fallbackModules=Object.entries(analysisStatuses||{}).filter(([,value])=>value?.status==='fallback').map(([key])=>key)
  const repairedModules=Object.entries(outputValidations||{}).filter(([,value])=>value?.status==='limited'||(value?.issues?.length||0)>0).map(([key])=>key)
  const underCoveredModules=Object.entries(inputCoverage||{}).filter(([,value])=>value?.passed===false||(typeof value?.coveragePct==='number'&&value.coveragePct<100)).map(([key])=>key)
  const narrativeFactor=fallbackModules.includes('event')?.75:1
  const eventTraceability=decisionEvents.length?ratio(linkedEvents,decisionEvents.length):1
  const eventIndependence=decisionEvents.length?ratio(independent,decisionEvents.length):1
  const evidenceScore = round((ratio(datedEvidence, evidence.length) * .25 + ratio(uniqueEvidence,evidence.length) * .2 + eventTraceability * .15 + gradeScore * .25 + eventIndependence * .15) * 100 * narrativeFactor)
  const syncIntentionallySkipped=preflight?.status==='warning'&&(preflight.queued||0)===0&&preflight.warnings?.some(message=>message.includes('未触发外部同步'))
  const dimensions: QualityDimension[] = [
    { key: 'market', label: '行情完整性', score: market.score, weight: 28, detail: `${market.known}/${market.total}项关键行情条件可核验` },
    { key: 'fundamentals', label: '基本面覆盖', score: fundamentals.score, weight: 22, detail: `${fundamentals.known}/${fundamentals.total}项持仓与财务条件可核验` },
    { key: 'valuation', label: '当期估值有效性', score: valuationScore, weight: 16, detail: `${currentValuation}/${indexCodes.length}个跟踪指数有可核验当期估值` },
    { key: 'product', label: '产品可交易数据', score: product.score, weight: 17, detail: `${product.known}/${product.total}项当期产品交易条件可核验` },
    { key: 'evidence', label: '证据质量与可追溯性', score: evidenceScore, weight: 17, detail: `${datedEvidence}/${evidence.length}条有业务日期，${uniqueEvidence}/${evidence.length}条内容唯一，${independent}/${decisionEvents.length}个决策事件为一手或多源` },
  ]
  const weightedScore = round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / 100)
  const allProductsLimited=!!dataQuality?.perEtf?.length&&dataQuality.perEtf.every(item=>item.status!=='available')
  const syncWarning=!!preflight?.status&&preflight.status!=='fresh'&&!syncIntentionallySkipped
  const qualityCap = allProductsLimited ? 79 : repairedModules.length || underCoveredModules.length || syncWarning || dataQuality?.status !== 'available' || (preflight?.failed || 0) > 0 ? 84 : 100
  const overallScore = Math.min(weightedScore, qualityCap)
  const blockers = [
    !evaluation && '缺少冻结研究评估',
    decisionTiming?.executionReady===false && '报告数据已过期或时效未通过，操作需要重新复核',
    ...(evaluation?.omittedConditions || []).map(item => `${item.label}：底层数据缺失，仍计入质量覆盖率`),
    dataQuality?.status !== 'available' && '研究数据门禁未完全通过',
    preflight?.status && preflight.status !== 'fresh' && !syncIntentionallySkipped && `分析前同步未完全成功${preflight.failed ? `（失败${preflight.failed}项）` : ''}`,
    product.score < 80 && 'ETF产品交易数据覆盖不足',
    allProductsLimited && '全部ETF均存在产品级数据缺口，不能标记为可执行建议',
    ...(dataQuality?.dataAnomalies?.length?['存在未解决的数据异常']:[]),
    ...repairedModules.map(module=>`${module}输出经过引用、日期或结构修复，需降低决策置信度`),
    ...underCoveredModules.map(module=>`${module}实际进入模型的证据覆盖不足，需降低决策置信度`),
    ...fallbackModules.map(module=>`${module==='event'?'事件':module}智能分析已降级，质量评分已扣减`),
  ].filter(Boolean) as string[]
  const hardLimited=decisionTiming?.executionReady===false||allProductsLimited||repairedModules.length>0||underCoveredModules.length>0||syncWarning||!!dataQuality?.dataAnomalies?.length||!!evaluation?.omittedConditions?.length
  const usability = !evaluation || market.score < 50 ? 'insufficient' : dataQuality?.status === 'available' && product.score >= 70 && !(preflight?.failed || 0) && preflight?.status !== 'blocked'&&!hardLimited ? 'advice-grade' : 'limited-advice'
  const evidenceConfidenceScore=round(Math.min(weightedScore,dataQuality?.status==='available'?95:dataQuality?.status==='limited'?79:45))
  const validationStatus=evaluation?.validation==='walk-forward-validated'?'validated':['paper-only','candidate-walk-forward'].includes(strategyValidation?.validation||'')?'paper-only':'insufficient-history'
  const validationCap=validationStatus==='validated'?95:validationStatus==='paper-only'?75:70
  const decisionConfidenceScore=round(Math.min(evidenceConfidenceScore,validationCap,allProductsLimited?65:95,repairedModules.length?70:95))
  const dataReadinessScore=round(product.score*.45+market.score*.2+fundamentals.score*.15+valuationScore*.1+evidenceScore*.1)
  const executionReadinessScore=decisionTiming?.executionReady===false?0:round(dataReadinessScore*(allProductsLimited?.55:1)*(syncWarning?.85:1))
  const confidenceScore=decisionConfidenceScore
  const grade = overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 55 ? 'C' : 'D'
  const result: ReportQualityAssessment = { version: 1, overallScore, confidenceScore,evidenceConfidenceScore,decisionConfidenceScore,executionReadinessScore,dataReadinessScore,validationStatus, grade, usability, dimensions, blockers, generatedAt: new Date().toISOString() }
  return input.investmentAdvice !== undefined ? applyExecutionQuality(result,input.investmentAdvice,input.portfolioDecisionSupport,decisionTiming) : result
}

/** Readiness measures contracts and account gates, never data availability or
 * the chance that an investment will succeed. Also used on legacy read paths. */
export function applyExecutionQuality(quality: ReportQualityAssessment, advice: unknown, portfolio: unknown, timing?: {executionReady?: boolean} | null): ReportQualityAssessment {
  const parse = (value: unknown): Record<string,unknown> => {
    try { return (typeof value === 'string' ? JSON.parse(value) : value) as Record<string,unknown> || {} } catch { return {} }
  }
  const record = parse(advice), support = parse(portfolio)
  const products = (Array.isArray(record.productDecisions) ? record.productDecisions : []) as Array<{heldAction?:string;unheldAction?:string;executionContract?:{status?:string;asOf?:string;validUntil?:string;blockers?:string[];triggerRules?:Array<{status:string;requiredStatus?:string}>}}>
  const now=Date.now()
  const verified = products.filter(row=>{
    const contract=row.executionContract
    return contract?.status==='verified'&&Date.parse(contract.asOf||'')<=now&&Date.parse(contract.validUntil||'')>now&&!(contract.blockers?.length)&&Array.isArray(contract.triggerRules)&&contract.triggerRules.every(rule=>rule.status===(rule.requiredStatus||'met'))
  })
  const tradable = verified.filter(row=>row.heldAction==='减仓'||row.heldAction==='加仓'||row.unheldAction==='建仓')
  const actions = (Array.isArray(support.actions)?support.actions:[]) as Array<{executable?:boolean}>
  const executable = actions.filter(row=>row.executable===true)
  const ready = timing?.executionReady===true
  const score = ready ? Math.round(100 * Math.min(ratio(verified.length,products.length),actions.length?ratio(executable.length,actions.length):1)) : 0
  const blockers = [...quality.blockers]
  if(!products.length)blockers.push('尚未核验逐产品执行合同')
  else if(verified.length<products.length)blockers.push(`${products.length-verified.length}/${products.length}只产品执行合同尚未通过`)
  if(actions.length && executable.length<actions.length)blockers.push(`${actions.length-executable.length}/${actions.length}项组合方案尚不可执行`)
  const scores=Object.fromEntries(quality.dimensions.map(dimension=>[dimension.key,dimension.score]))
  const dataReadinessScore=round((scores.product||0)*.45+(scores.market||0)*.2+(scores.fundamentals||0)*.15+(scores.valuation||0)*.1+(scores.evidence||0)*.1)
  return {...quality,dataReadinessScore,executionReadinessScore:score,
    usability:quality.usability==='insufficient'?'insufficient':score===100?quality.usability:'limited-advice',blockers:[...new Set(blockers)],
    executionAudit:{products:products.length,verifiedProducts:verified.length,tradableProducts:ready?tradable.length:0,portfolioActions:actions.length,executablePortfolioActions:ready?executable.length:0,basis:'已核验产品合同与真实组合可执行项的覆盖率；持有/观望不代表买卖许可，也不代表收益概率'}}
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
