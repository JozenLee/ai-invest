export type ConclusionOpportunity = {
  title: string
  status: string
  evidence: string
  actionImplication: string
}

export type HistoricalOpportunityCheck = {
  sourceDate: string
  previousOpportunity: string
  currentEvidence: string
  status: string
  implication: string
}

export type ExecutiveInvestmentConclusion = {
  conclusion: string
  allocationStance: string
  keyDrivers: string[]
  opportunities: ConclusionOpportunity[]
  mainRisks: string[]
  watchPoints: string[]
  actionPlan: {
    priority: string
    unheld: string
    held: string
  }
  historyComparison: HistoricalOpportunityCheck[]
}

export type AIProductDecision = {
  ticker: string
  unheldAction: '建仓' | '观望'
  heldAction: '加仓' | '持有' | '减仓' | '观望'
  suggestedAdjustmentPct: number
  adjustmentUnit?: 'portfolio-percentage-points'
  confidencePct: number
  reason: string
  trigger: string
  invalidation: string
  quantitativeOverride: string | null
  quantitativeOverrideSource?: 'ai' | 'deterministic-disclosure'
  evidenceIds: string[]
  forecast?: {target:'outperform-benchmark';horizonTradingDays:number;probability:number}
  triggerConditionKeys?: string[]
  triggerConditionStates?: Record<string, 'met' | 'unmet'>
  manualReviewConditions?: string[]
  decisionSource: 'ai' | 'domain-aggregation'
  reviewProvenance?: { sourceAsOf: string; reviewedAsOf: string; sourceReportId: string; status: 'revalidated' | 'requires-new-analysis'; reasons: string[] }
  executionContract?: {
    asOf: string
    validUntil: string
    reviewPolicy: string
    status?: 'verified' | 'manual-review' | 'blocked'
    blockers?: string[]
    manualReviewConditions?: string[]
    modelTrigger?: string
    triggerRules: Array<{key:string;subject:string;label:string;status:string;requiredStatus?:'met'|'unmet';currentValue:number|string|null;operator:string;threshold:number|string}>
  }
}

type Row = Record<string, unknown>

function record(value: unknown): Row {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Row
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Row : {}
  } catch {
    return {}
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function textList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean).slice(0, limit)
    : []
}

const unheldActions = new Set<AIProductDecision['unheldAction']>(['建仓', '观望'])
const heldActions = new Set<AIProductDecision['heldAction']>(['加仓', '持有', '减仓', '观望'])

/** Investment direction is produced by AI. This normalizer only validates the
 * product universe and bounds numeric suggestions before portfolio constraints
 * are applied locally. */
export function normalizeAIProductDecisions(value: unknown, expectedTickers: string[], strict = false): AIProductDecision[] {
  const expected = new Set(expectedTickers)
  const rows = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const decisions = rows.flatMap(item => {
    const row = record(item)
    const ticker = text(row.ticker)
    if (!ticker || !expected.has(ticker) || seen.has(ticker)) return []
    const unheldAction = text(row.unheldAction) as AIProductDecision['unheldAction']
    const heldAction = text(row.heldAction) as AIProductDecision['heldAction']
    if (!unheldActions.has(unheldAction) || !heldActions.has(heldAction)) return []
    const rawAdjustment = Number(row.suggestedAdjustmentPct)
    const rawConfidence = Number(row.confidencePct)
    // Downstream portfolio constraints store the action separately and consume
    // this field as an unsigned magnitude. Models still commonly express a
    // reduction as a negative delta, so accept that unambiguous representation
    // and canonicalize it instead of dropping an otherwise valid decision.
    const adjustmentMagnitude = heldAction === '减仓' ? Math.abs(rawAdjustment) : rawAdjustment
    const suggestedAdjustmentPct = Number.isFinite(adjustmentMagnitude) ? Math.min(100, Math.max(0, adjustmentMagnitude)) : 0
    const confidencePct = Number.isFinite(rawConfidence) ? Math.min(100, Math.max(0, rawConfidence)) : 0
    const reason = text(row.reason), trigger = text(row.trigger), invalidation = text(row.invalidation),quantitativeOverride=text(row.quantitativeOverride)||null
    const directional = unheldAction === '建仓' || heldAction === '加仓' || heldAction === '减仓'
    if (!reason || !trigger || !invalidation || (directional && suggestedAdjustmentPct <= 0) || (heldAction !== '减仓' && rawAdjustment < 0)) return []
    const forecast=record(row.forecast)
    const validForecast=forecast.target==='outperform-benchmark'&&Number.isInteger(forecast.horizonTradingDays)&&Number(forecast.horizonTradingDays)>0&&typeof forecast.probability==='number'&&Number.isFinite(forecast.probability)&&forecast.probability>=0&&forecast.probability<=1
    seen.add(ticker)
    return [{
      ticker, unheldAction, heldAction, suggestedAdjustmentPct, confidencePct,
      ...(validForecast?{forecast:{target:'outperform-benchmark' as const,horizonTradingDays:Number(forecast.horizonTradingDays),probability:Number(forecast.probability)}}:{}),
      reason, trigger, invalidation,quantitativeOverride,
      adjustmentUnit: row.adjustmentUnit === 'portfolio-percentage-points' ? 'portfolio-percentage-points' as const : undefined,
      evidenceIds: Array.isArray(row.evidenceIds) ? row.evidenceIds.map(text).filter(Boolean).slice(0, 16) : [],
      triggerConditionKeys: Array.isArray(row.triggerConditionKeys) ? [...new Set(row.triggerConditionKeys.map(text).filter(Boolean))] : undefined,
      triggerConditionStates: Object.fromEntries(Object.entries(record(row.triggerConditionStates)).filter(([,state])=>state==='met'||state==='unmet')) as Record<string,'met'|'unmet'>,
      manualReviewConditions: Array.isArray(row.manualReviewConditions) ? row.manualReviewConditions.map(text).filter(Boolean) : undefined,
      executionContract: row.executionContract as AIProductDecision['executionContract'],
      quantitativeOverrideSource: row.quantitativeOverrideSource as AIProductDecision['quantitativeOverrideSource'],
      reviewProvenance: row.reviewProvenance as AIProductDecision['reviewProvenance'],
      decisionSource: row.decisionSource === 'domain-aggregation' ? 'domain-aggregation' as const : 'ai' as const,
    }]
  })
  if (strict) {
    const missing = expectedTickers.filter(ticker => !seen.has(ticker))
    const unknown = rows.map(item => text(record(item).ticker)).filter(ticker => ticker && !expected.has(ticker))
    if (missing.length || unknown.length || decisions.length !== rows.length) {
      throw new Error(`AI逐产品决策范围不完整：缺少${missing.join('、') || '无'}；越界或重复${unknown.join('、') || (decisions.length !== rows.length ? '存在' : '无')}`)
    }
  }
  return decisions
}

export function discloseQuantitativeOverrides(decisions:AIProductDecision[],states:Array<{ticker:string;state:string}>){
  const stateByTicker=new Map(states.map(item=>[item.ticker,item.state]))
  const disclosed:string[]=[]
  const resolved=decisions.map(item=>{
    // Abstention does not endorse the existing exposure. It is kept under
    // manual review below, rather than forced to invent a bullish override.
    const conflict=stateByTicker.get(item.ticker)==='risk-off'&&(item.heldAction==='持有'||item.heldAction==='加仓'||item.unheldAction==='建仓')
    if(!conflict)return {...item,quantitativeOverrideSource:item.quantitativeOverride?'ai' as const:undefined}
    if(item.quantitativeOverride)return {...item,quantitativeOverrideSource:'ai' as const}
    disclosed.push(item.ticker)
    return {...item,quantitativeOverride:`量化状态为风险收缩，但AI仍选择${item.heldAction}；模型依据：${item.reason}；撤销覆盖：${item.invalidation}`,quantitativeOverrideSource:'deterministic-disclosure' as const}
  })
  return {decisions:resolved,disclosed}
}

export function attachExecutionContracts(decisions:AIProductDecision[],evaluation:{evidence?:Array<{id:string}>;asOf:string;profile:{benchmark:string;sectors:string[]};decisions:Array<{ticker:string;indexCode:string|null;expiresAt:string;conditions:Array<{key:string;label:string;value:number|string|null;operator:string;threshold:number|string;status:string}>}>}){
  const byTicker=new Map(evaluation.decisions.map(item=>[item.ticker,item]))
  return decisions.map(item=>{
    const decision=byTicker.get(item.ticker)
    const subject=(key:string)=>key==='market'?evaluation.profile.benchmark:key==='flow'?evaluation.profile.sectors.join('、')||'领域资金':key==='premium'||key==='liquidity'||key==='spread'?item.ticker:decision?.indexCode||item.ticker
    const keys = item.triggerConditionKeys || []
    const trades = item.heldAction === '减仓' || item.heldAction === '加仓' || item.unheldAction === '建仓'
    const allowedKeys = ['market','trend','relative','flow','premium','liquidity','spread']
    const blockers = [
      !decision && '产品不在冻结研究范围内',
      trades && (decision?.conditions||[]).some(condition=>['calendar','session','history','continuity','adjustment','index','premium','liquidity','spread'].includes(condition.key)&&condition.status!=='met') && '产品行情、复权或交易条件未通过',
      !item.evidenceIds.length && '产品观点未绑定冻结证据',
      item.evidenceIds.some(id => !evaluation.evidence?.some(source => source.id === id)) && '产品引用未通过本轮证据核验',
      keys.some(key => !allowedKeys.includes(key) || !decision?.conditions.some(condition => condition.key === key)) && '存在不可监测的触发指标',
      item.quantitativeOverrideSource === 'deterministic-disclosure' && 'AI未说明与量化风险信号冲突的实质依据',
      ...decisionSemanticIssues(item),
    ].filter(Boolean) as string[]
    const manualReviewConditions = [...(item.manualReviewConditions || [])]
    if(item.heldAction==='观望'&&item.unheldAction==='观望'&&!manualReviewConditions.length)manualReviewConditions.push('模型尚未形成持仓方向，需补齐判断依据后重新分析')
    if (trades && !keys.length) manualReviewConditions.push('原始触发条件尚未结构化：' + item.trigger)
    const triggerRules=(decision?.conditions||[]).filter(condition=>trades && keys.includes(condition.key) && allowedKeys.includes(condition.key)).map(condition=>({key:condition.key,subject:subject(condition.key),label:condition.label,status:condition.status,requiredStatus:item.triggerConditionStates?.[condition.key]||'met' as const,currentValue:condition.value,operator:condition.operator,threshold:condition.threshold}))
    if(triggerRules.some(rule=>rule.status!==rule.requiredStatus))blockers.push('模型选择的触发条件尚未满足')
    const trigger = triggerRules.map(rule=>`${rule.subject} ${rule.label} ${rule.operator} ${rule.threshold}（须${rule.requiredStatus==='unmet'?'不满足':'满足'}）`).join('；且 ')
    return {...item,trigger:trigger ? `${trigger}${manualReviewConditions.length?'；另需人工复核：'+manualReviewConditions.join('；'):''}` : item.trigger,
      executionContract:{asOf:evaluation.asOf,validUntil:decision?.expiresAt||evaluation.asOf,reviewPolicy:'有效期到期、材料性事件或持仓更新时重新复核，不自动延续动作',
        status:blockers.length?'blocked' as const:manualReviewConditions.length?'manual-review' as const:'verified' as const,
        blockers,manualReviewConditions,modelTrigger:item.trigger,triggerRules}}

  })
}

/** The trading action and a future opportunity must never share an ambiguous
 * trigger. Existing prose is retained for audit, not silently reinterpreted. */
export function decisionSemanticIssues(item: Pick<AIProductDecision,'heldAction'|'unheldAction'|'triggerConditionKeys'|'triggerConditionStates'|'trigger'|'manualReviewConditions'>) {
  if (!['减仓','加仓'].includes(item.heldAction) && item.unheldAction !== '建仓') return []
  const keys = item.triggerConditionKeys || []
  const riskKeys = keys.filter(key => ['market','trend','relative','flow'].includes(key))
  const issues: string[] = []
  const manual = !!item.manualReviewConditions?.length
  if (item.heldAction === '减仓' && item.unheldAction === '建仓') issues.push('同一执行合同不能同时承载建仓和减仓，请将未来建仓条件放入观察项')
  if (item.heldAction === '减仓' && !manual && (!riskKeys.length || riskKeys.every(key => (item.triggerConditionStates?.[key] || 'met') === 'met'))) issues.push('减仓触发混用了风险转强条件，须明确风险退出或人工反弹减仓计划')
  if (item.heldAction !== '减仓' && riskKeys.some(key => item.triggerConditionStates?.[key] === 'unmet') && !manual) issues.push('逆势增加暴露需明确人工复核条件，不能由风险转弱自动触发')
  if (keys.some(key => ['premium','liquidity','spread'].includes(key) && item.triggerConditionStates?.[key] === 'unmet')) issues.push('产品交易条件不达标不能作为买卖许可')
  if (keys.includes('flow') && /连续.{0,4}[日天].{0,8}(?:净流入|流出)|(?:半导体|通信设备|IT服务)板块.{0,8}净流/u.test(item.trigger)) issues.push('资金触发文本与领域多日净占比指标不等价，须按目录明确主体和统计窗口')
  return issues
}

function opportunities(value: unknown): ConclusionOpportunity[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return [{ title: text(item), status: '待观察', evidence: '', actionImplication: '' }]
    const row = record(item)
    const title = text(row.title ?? row.opportunity)
    if (!title) return []
    return [{
      title,
      status: text(row.status) || '待观察',
      evidence: text(row.evidence),
      actionImplication: text(row.actionImplication ?? row.implication),
    }]
  }).slice(0, 3)
}

function historyChecks(value: unknown): HistoricalOpportunityCheck[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    const previousOpportunity = text(row.previousOpportunity ?? row.opportunity)
    if (!previousOpportunity) return []
    return [{
      sourceDate: text(row.sourceDate ?? row.date),
      previousOpportunity,
      currentEvidence: text(row.currentEvidence ?? row.evidence),
      status: text(row.status) || '未兑现',
      implication: text(row.implication ?? row.actionImplication),
    }]
  }).slice(0, 3)
}

/** Normalizes both the new conclusion contract and archived legacy reports. */
export function normalizeExecutiveConclusion(value: unknown, fallback = ''): ExecutiveInvestmentConclusion {
  const advice = record(value)
  const executive = record(advice.executiveSummary ?? value)
  const actionPlan = record(executive.actionPlan)
  return {
    conclusion: text(executive.conclusion) || text(advice.thesis) || text(fallback),
    allocationStance: text(executive.allocationStance),
    keyDrivers: textList(executive.keyDrivers, 3),
    opportunities: opportunities(executive.opportunities),
    mainRisks: textList(executive.mainRisks ?? advice.risks, 3),
    watchPoints: textList(executive.watchPoints ?? executive.reviewTriggers ?? advice.watchlist, 4),
    actionPlan: {
      priority: text(actionPlan.priority),
      unheld: text(actionPlan.unheld),
      held: text(actionPlan.held),
    },
    historyComparison: historyChecks(executive.historyComparison),
  }
}
