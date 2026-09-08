import { indexRuleSummary, productGroups } from '@/lib/analysis/report-insights'
import type { Evaluation } from '@/lib/research/contracts'
import type { DecisionTimingAssessment } from '@/lib/analysis/decision-timing'

export type RiskBudget = {
  riskProfile: 'conservative' | 'moderate' | 'aggressive'
  investHorizon: 'short' | 'medium' | 'long'
  minCashRatio: number
  maxIndustryRatio: number
  maxFundRatio: number
  maxSingleAdjustmentRatio: number
  stagedAdjustment: boolean
}

export type PortfolioHoldingInput = {
  ticker: string
  name: string
  category?: string | null
  industry?: string | null
  weightPct: number | null
  marketValue: number
  quantity?: number | null
  unitNav?: number | null
  fundType?: string | null
  targetEtfCode?: string | null
  targetIndexCode?: string | null
  mappingSource?: string | null
  mappingConfidence?: number | null
  purchaseDate?: string | null
  costNav?: number | null
  redemptionFeePct?: number | null
}

export type HoldingMapping = {
  ticker: string
  fundType: string
  targetEtfCode: string | null
  targetIndexCode: string | null
  decisionTicker: string | null
  method: 'manual' | 'direct-etf' | 'name-inference' | 'domain-proxy' | 'unmapped'
  confidence: number
  verified: boolean
}

export type PortfolioAction = {
  ticker: string
  name: string
  action: '观望' | '持有' | '减仓' | '加仓' | '补充数据'
  currentWeightPct: number
  targetWeightPct: number | null
  changeWeightPct: number | null
  amount: number | null
  estimatedUnits: number | null
  estimatedFee: number | null
  batches: number
  executable: boolean
  reason: string
  trigger: string
  invalidation: string
  mapping: HoldingMapping
  gaps: string[]
}

export type PortfolioDecisionSupport = {
  version: 1
  allocationVersion?: number
  asOf: string | null
  industry: string
  readiness: 'blocked' | 'limited-advice' | 'advice-ready'
  signal: 'risk-off' | 'watch' | 'eligible' | 'blocked'
  summary: string
  researchConclusion?: {
    rating: string
    conclusion: string
    allocationStance: string
    appliedToAllocation: string
  }
  allocationBasis?: string
  totalAssets: number
  cashWeightPct: number
  cashTargetFloorPct: number
  currentIndustryWeightPct: number
  targetIndustryRangePct: [number, number]
  proposedIndustryWeightPct: number
  proposedCashWeightPct: number
  mappingCoveragePct: number
  verifiedMappingCoveragePct: number
  costCoveragePct: number
  confidencePct: number
  adjustmentPlan: {
    completed: boolean
    remainingCashGapPct: number
    remainingIndustryReductionPct: number
    steps: Array<{ stage: number; label: string; detail: string; executable: boolean }>
  }
  actions: PortfolioAction[]
  gates: Array<{ key: string; label: string; met: boolean; detail: string }>
  policy: RiskBudget
  disclaimer: string
}

export function applyDecisionTimingGate(support: PortfolioDecisionSupport | null | undefined, timing: DecisionTimingAssessment) {
  if (!support) return support
  if(support.allocationVersion!==2){
    const actions=support.actions.map(action=>!action.mapping.verified||(action.changeWeightPct||0)<0&&action.estimatedFee===null?{...action,action:'补充数据' as const,targetWeightPct:null,changeWeightPct:null,amount:null,estimatedUnits:null,estimatedFee:null,executable:false,reason:'历史方案缺少已核验底层映射或赎回成本，仅保留领域预算，不展示逐基金金额'}:action)
    const delta=actions.reduce((sum,action)=>sum+(action.changeWeightPct||0),0)
    support={...support,actions,proposedIndustryWeightPct:support.currentIndustryWeightPct+delta,proposedCashWeightPct:support.cashWeightPct-delta,allocationBasis:'归档兼容：未核验映射或成本的历史逐基金金额已隐藏，待新分析重新计算。',adjustmentPlan:{completed:false,remainingCashGapPct:Math.max(0,support.cashTargetFloorPct-support.cashWeightPct+delta),remainingIndustryReductionPct:Math.max(0,support.currentIndustryWeightPct+delta-support.targetIndustryRangePct[1]),steps:[{stage:1,label:'补齐映射与费用',detail:'领域预算保留，未核验基金不分配金额；完成核验后重新计算。',executable:false}]}}
  }
  const timingGate = { key: 'decision-timing', label: '报告时效', met: timing.executionReady, detail: timing.executionReady ? `交易时段行情与公告检查已同步，有效至 ${timing.validUntil}` : timing.reasons.join('；') || '当前为非交易时间' }
  const gates = [...support.gates.filter(gate => gate.key !== timingGate.key), timingGate]
  if (timing.executionReady) return { ...support, gates }
  return {
    ...support,
    readiness: support.readiness === 'blocked' ? 'blocked' as const : 'limited-advice' as const,
    summary: `当前报告仅供投资参考，不应直接下单。${support.summary}`,
    actions: support.actions.map(action => ({ ...action, executable: false, gaps: [...new Set([...action.gaps, '报告当前不具备交易时段实时数据'])] })),
    adjustmentPlan: { ...support.adjustmentPlan, steps: support.adjustmentPlan.steps.map(step => ({ ...step, executable: false })) },
    gates,
    disclaimer: `${support.disclaimer} 当前报告仅供投资参考。`,
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const normalized = (value: string) => value.toLowerCase().replace(/联接|发起式|基金|指数|etf|增强|人民币|[abc类型]/gi, '').replace(/[\s（）()·-]/g, '')
const family = (value: string) => {
  if (/半导体材料|半导体设备/.test(value)) return '半导体设备'
  if (/芯片|半导体|集成电路/.test(value)) return '芯片半导体'
  if (/云计算|算力|数据中心/.test(value)) return '云计算算力'
  if (/通信|5g|光模块/.test(value.toLowerCase())) return '通信'
  return null
}

export function inferFundType(name: string, explicit?: string | null) {
  if (explicit) return explicit
  if (/ETF.*联接/i.test(name)) return 'feeder'
  if (/ETF/i.test(name)) return 'etf'
  if (/指数增强/.test(name)) return 'index-enhanced'
  if (/指数/.test(name)) return 'index'
  if (/QDII/i.test(name)) return 'qdii'
  if (/混合/.test(name)) return 'active'
  return 'other'
}

export function resolveHoldingMapping(holding: PortfolioHoldingInput, evaluation: Evaluation): HoldingMapping {
  const decisions = evaluation.decisions
  const explicitDecision = decisions.find(item => item.ticker === holding.targetEtfCode || item.indexCode === holding.targetIndexCode)
  if (holding.targetEtfCode || holding.targetIndexCode) return {
    ticker: holding.ticker, fundType: inferFundType(holding.name, holding.fundType), targetEtfCode: holding.targetEtfCode || explicitDecision?.ticker || null,
    targetIndexCode: holding.targetIndexCode || explicitDecision?.indexCode || null, decisionTicker: explicitDecision?.ticker || null,
    method: 'manual', confidence: clamp01(holding.mappingConfidence ?? 1), verified: (holding.mappingConfidence ?? 1) >= .8,
  }
  const direct = decisions.find(item => item.ticker === holding.ticker)
  if (direct) return { ticker: holding.ticker, fundType: 'etf', targetEtfCode: direct.ticker, targetIndexCode: direct.indexCode, decisionTicker: direct.ticker, method: 'direct-etf', confidence: 1, verified: true }
  const own = normalized(holding.name), ownFamily = family(holding.name)
  const ranked = decisions.map(decision => {
    const candidate = normalized(decision.name)
    const sharedFamily = ownFamily && ownFamily === family(decision.name)
    const overlap = [...new Set(Array.from(own))].filter(char => candidate.includes(char)).length / Math.max(own.length, candidate.length, 1)
    return { decision, score: Math.max(sharedFamily ? .6 : 0, overlap) }
  }).sort((a, b) => b.score - a.score)
  if (ranked[0]?.score >= .8) return { ticker: holding.ticker, fundType: inferFundType(holding.name, holding.fundType), targetEtfCode: ranked[0].decision.ticker, targetIndexCode: ranked[0].decision.indexCode, decisionTicker: ranked[0].decision.ticker, method: 'name-inference', confidence: round(ranked[0].score, 4), verified: false }
  if (holding.industry === evaluation.profile.name || ownFamily) return { ticker: holding.ticker, fundType: inferFundType(holding.name, holding.fundType), targetEtfCode: null, targetIndexCode: null, decisionTicker: null, method: 'domain-proxy', confidence: holding.industry === evaluation.profile.name ? .6 : .45, verified: false }
  return { ticker: holding.ticker, fundType: inferFundType(holding.name, holding.fundType), targetEtfCode: null, targetIndexCode: null, decisionTicker: null, method: 'unmapped', confidence: 0, verified: false }
}

export function buildPortfolioDecisionSupport(input: {
  evaluation: Evaluation
  holdings: PortfolioHoldingInput[]
  totalAssets: number
  cashWeightPct: number
  policy: RiskBudget
  dataQualityAvailable: boolean
  portfolioAsOf?: string | null
  investmentAdvice?: unknown
}): PortfolioDecisionSupport {
  const { evaluation, holdings, policy } = input
  const mappings = holdings.map(holding => resolveHoldingMapping(holding, evaluation))
  const rows = holdings.map((holding, index) => ({ holding, mapping: mappings[index] }))
  const relevant = rows.filter(row => row.mapping.method !== 'unmapped' && (row.holding.industry === evaluation.profile.name || row.mapping.decisionTicker || family(row.holding.name)))
  const currentIndustryWeightPct = relevant.reduce((sum, row) => sum + (row.holding.weightPct || 0), 0)
  const mappedWeight = relevant.reduce((sum, row) => sum + (row.holding.weightPct || 0), 0)
  const verifiedWeight = relevant.filter(row => row.mapping.verified).reduce((sum, row) => sum + (row.holding.weightPct || 0), 0)
  const feeKnownWeight = relevant.filter(row => typeof row.holding.redemptionFeePct === 'number').reduce((sum, row) => sum + (row.holding.weightPct || 0), 0)
  const ruleSummary = indexRuleSummary(evaluation)
  const signal = ruleSummary.signal
  const advice = (() => { try { const value = typeof input.investmentAdvice === 'string' ? JSON.parse(input.investmentAdvice) : input.investmentAdvice; return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} } catch { return {} } })()
  const executive = advice.executiveSummary && typeof advice.executiveSummary === 'object' && !Array.isArray(advice.executiveSummary) ? advice.executiveSummary as Record<string, unknown> : {}
  const modelRecommendation = advice.recommendation && typeof advice.recommendation === 'object' && !Array.isArray(advice.recommendation) ? advice.recommendation as Record<string, unknown> : {}
  const rating = String(advice.rating || '未评级')
  const researchAvailable = Boolean(advice.rating || executive.conclusion)
  const maxIndustryPct = policy.maxIndustryRatio * 100
  const maxFundPct = policy.maxFundRatio * 100
  const minCashPct = policy.minCashRatio * 100
  const mappedSignals=relevant.filter(row=>row.mapping.verified).map(row=>({weight:row.holding.weightPct||0,state:evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)?.state}))
  const completeMapping=verifiedWeight>=currentIndustryWeightPct&&currentIndustryWeightPct>0
  const riskFraction=completeMapping?mappedSignals.reduce((n,row)=>n+(row.state==='risk-off'?row.weight:0),0)/currentIndustryWeightPct:ruleSummary.total?ruleSummary.riskOff/ruleSummary.total:0
  const signalFactor = 1-.25*riskFraction-(signal==='watch'||signal==='blocked'?.1:0)
  const upper = round(maxIndustryPct * signalFactor)
  const lower = signal === 'eligible' ? round(upper * .6) : 0
  const fundCapReduction = relevant.reduce((sum, row) => sum + Math.max(0, (row.holding.weightPct || 0) - maxFundPct), 0)
  const rawTargetBySignal = currentIndustryWeightPct > upper ? upper : signal === 'eligible' && currentIndustryWeightPct < lower ? lower : currentIndustryWeightPct
  // A fund-cap breach must force a reduction, but a zero breach must not cap
  // the whole domain at its current weight (which previously made additions
  // mathematically unreachable).
  const capAdjustedCurrent = currentIndustryWeightPct - fundCapReduction
  const rawTarget = fundCapReduction > 0 ? Math.min(rawTargetBySignal, capAdjustedCurrent) : rawTargetBySignal
  const ruleRequestedDelta = rawTarget - currentIndustryWeightPct
  // The model may conservatively veto new exposure, but it cannot veto a
  // deterministic risk reduction or relax portfolio limits.
  const researchAllowsIncrease = !researchAvailable || rating === '积极'
  const increaseVetoed = ruleRequestedDelta > 0 && !researchAllowsIncrease
  const requestedDelta = ruleRequestedDelta > 0 && !researchAllowsIncrease ? 0 : ruleRequestedDelta
  const maxChangePct = policy.maxSingleAdjustmentRatio * 100
  const cashAvailablePct = Math.max(0, input.cashWeightPct - minCashPct)
  const desiredDelta = requestedDelta > 0 ? Math.min(requestedDelta, maxChangePct, cashAvailablePct) : Math.max(requestedDelta, -maxChangePct)
  const comparisons=productGroups(evaluation)
  const deltas=new Map<string,number>()
  let remaining=Math.abs(desiredDelta)
  // Only verified exposure can receive fund-level amounts. Prioritize cap
  // breaches, weak signals and lower costs instead of selling every fund pro rata.
  const ranked=rows.filter(row=>relevant.includes(row)&&row.mapping.verified).sort((a,b)=>{
    const priority=(row:typeof a)=>((row.holding.weightPct||0)>maxFundPct?100:0)+(evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)?.state==='risk-off'?10:0)
    return priority(b)-priority(a)||(a.holding.redemptionFeePct??Infinity)-(b.holding.redemptionFeePct??Infinity)||a.holding.ticker.localeCompare(b.holding.ticker)
  })
  for(const row of ranked){
    if(remaining<=0)break
    const current=row.holding.weightPct||0,decision=evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)
    const group=comparisons.find(item=>item.indexCode===row.mapping.targetIndexCode)
    const frozen=evaluation.productComparisons?.find(item=>item.indexCode===row.mapping.targetIndexCode)
    const candidate=frozen?frozen.candidate:group?.comparisonCandidate
    const comparisonStatus=frozen?.status||group?.status
    if(desiredDelta<0&&typeof row.holding.redemptionFeePct!=='number')continue
    if(desiredDelta>0&&(decision?.state!=='eligible'||comparisonStatus!=='single-product'&&candidate!==row.mapping.decisionTicker))continue
    const capacity=desiredDelta<0?current:Math.max(0,maxFundPct-current)
    const delta=Math.min(capacity,remaining);remaining-=delta
    deltas.set(row.holding.ticker,desiredDelta<0?-delta:delta)
  }
  const appliedDelta=[...deltas.values()].reduce((sum,value)=>sum+value,0)
  const proposedIndustryWeightPct = round(currentIndustryWeightPct + appliedDelta)
  const proposedCashWeightPct = round(input.cashWeightPct - appliedDelta)
  const mappingCoveragePct = currentIndustryWeightPct > 0 ? round(mappedWeight / currentIndustryWeightPct * 100) : 100
  const verifiedMappingCoveragePct = currentIndustryWeightPct > 0 ? round(verifiedWeight / currentIndustryWeightPct * 100) : 100
  const costCoveragePct = currentIndustryWeightPct > 0 ? round(feeKnownWeight / currentIndustryWeightPct * 100) : 100
  const portfolioFresh = !!input.portfolioAsOf && Date.now() - Date.parse(input.portfolioAsOf) <= 36 * 3600_000
  const projectedFundCapMet = relevant.every(row => {
    const current = row.holding.weightPct || 0
    return current + (deltas.get(row.holding.ticker)||0) <= maxFundPct + .01
  })
  const gates = [
    { key: 'quality', label: '研究数据门禁', met: input.dataQualityAvailable, detail: input.dataQualityAvailable ? '核心研究数据可用' : '仍有产品或基本面缺口' },
    { key: 'mapping', label: '持仓穿透映射', met: verifiedMappingCoveragePct >= 95, detail: `已核验映射覆盖 ${verifiedMappingCoveragePct.toFixed(1)}%` },
    { key: 'cost', label: '调整成本覆盖', met: desiredDelta >= 0 || costCoveragePct >= 95, detail: desiredDelta >= 0 ? '本轮不涉及赎回费' : `赎回费覆盖 ${costCoveragePct.toFixed(1)}%` },
    { key: 'portfolio-freshness', label: '持仓时效', met: portfolioFresh, detail: input.portfolioAsOf ? `持仓同步 ${input.portfolioAsOf}` : '缺少持仓同步时间' },
    { key: 'cash-floor', label: '现金底仓', met: proposedCashWeightPct >= minCashPct, detail: `调整后 ${proposedCashWeightPct.toFixed(1)}%，底线 ${minCashPct.toFixed(1)}%` },
    { key: 'fund-cap', label: '单基金仓位上限', met: projectedFundCapMet, detail: `单只基金不高于 ${maxFundPct.toFixed(1)}%` },
    { key: 'research-conclusion', label: '综合投资结论', met: ruleRequestedDelta <= 0 || researchAllowsIncrease, detail: ruleRequestedDelta <= 0 ? `本轮不新增风险，模型评级${rating}不阻止风控调整` : researchAllowsIncrease ? `模型评级${rating}，允许在规则与产品门禁内评估加仓` : `模型评级${rating}，本轮不新增风险暴露` },
  ]
  const executable = gates.every(gate => gate.met)
  const readiness: PortfolioDecisionSupport['readiness'] = signal === 'blocked' || !relevant.length ? 'blocked' : executable ? 'advice-ready' : 'limited-advice'
  const actions: PortfolioAction[] = relevant.map(row => {
    const current = row.holding.weightPct || 0
    const resolved=row.mapping.verified&&(desiredDelta>=0||typeof row.holding.redemptionFeePct==='number')
    const delta = round(deltas.get(row.holding.ticker)||0)
    const amount = round(Math.abs(delta) / 100 * input.totalAssets)
    const feeKnown = typeof row.holding.redemptionFeePct === 'number'
    const reducing = delta < -.005, adding = delta > .005
    const gaps = [!row.mapping.verified && '底层ETF/指数映射待核验', reducing && !feeKnown && '赎回费率或持有期缺失', !row.holding.costNav && '持仓成本净值缺失'].filter(Boolean) as string[]
    const action: PortfolioAction['action'] = !resolved?'补充数据':reducing ? '减仓' : adding ? '加仓' : increaseVetoed ? '观望' : signal === 'risk-off' ? '观望' : '持有'
    return {
      ticker: row.holding.ticker, name: row.holding.name, action, currentWeightPct: round(current), targetWeightPct: resolved?round(current + delta):null, changeWeightPct: resolved?delta:null,
      amount: amount || null, estimatedUnits: amount && row.holding.unitNav ? round(amount / row.holding.unitNav, 2) : null,
      estimatedFee: reducing && feeKnown ? round(amount * row.holding.redemptionFeePct! / 100) : null,
      batches: policy.stagedAdjustment && amount > 0 ? Math.min(3, Math.max(2, Math.ceil(Math.abs(delta) / 2))) : 1,
      executable:executable&&resolved, reason: !resolved?'仅提供领域预算；底层映射或赎回成本未核验，不分配本基金调整金额':reducing ? `领域仓位${currentIndustryWeightPct.toFixed(1)}%超过预算${upper.toFixed(1)}%；按已核验暴露、单基金上限、风险信号及赎回成本优先分配。${evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)?.reason||''}` : adding ? `领域进入满足条件状态且当前仓位低于目标下沿 ${lower.toFixed(1)}%` : increaseVetoed ? `规则层面出现新增仓位空间，但综合投资结论评级为${rating}，本轮不新增风险暴露。` : '当前仓位位于风险预算区间内',
      trigger: evaluation.decisions.find(item => item.ticker === row.mapping.decisionTicker)?.trigger || '以领域规则状态和组合风险预算的下一次盘后复核为准',
      invalidation: evaluation.decisions.find(item => item.ticker === row.mapping.decisionTicker)?.invalidation || '持仓映射、费用或市场数据失效时重新计算建议', mapping: row.mapping, gaps,
    }
  })
  const confidencePct = round(Math.min(95, verifiedMappingCoveragePct * .4 + costCoveragePct * .2 + (input.dataQualityAvailable ? 25 : 10) + (portfolioFresh ? 15 : 5)))
  const remainingCashGapPct = round(Math.max(0, minCashPct - proposedCashWeightPct))
  const remainingIndustryReductionPct = round(Math.max(0, proposedIndustryWeightPct - upper))
  const adjustmentPlan = {
    completed: remainingCashGapPct <= .01 && remainingIndustryReductionPct <= .01,
    remainingCashGapPct,
    remainingIndustryReductionPct,
    steps: [
      {
        stage: 1,
        label: '本领域风险预算复核',
        detail: `按单次调整上限，将领域仓位由 ${currentIndustryWeightPct.toFixed(1)}% 复核至 ${proposedIndustryWeightPct.toFixed(1)}%，现金比例预计变为 ${proposedCashWeightPct.toFixed(1)}%。`,
        executable,
      },
      ...(remainingCashGapPct > .01 ? [{
        stage: 2,
        label: '组合级现金底仓修复',
        detail: `仍缺少 ${remainingCashGapPct.toFixed(1)}% 现金。需结合其他持仓、赎回成本和相关性统一评估，不能默认继续卖出本领域资产。`,
        executable: false,
      }] : []),
      ...(remainingIndustryReductionPct > .01 ? [{
        stage: 3,
        label: '下一交易日继续复核',
        detail: `领域仓位仍高于风险预算上限 ${remainingIndustryReductionPct.toFixed(1)}个百分点；仅在新快照维持风险收缩时继续评估。`,
        executable: false,
      }] : []),
    ],
  }
  return {
    version: 1, allocationVersion:2, allocationBasis:`${completeMapping?'按已核验持仓权重聚合信号':'穿透不足，暂按唯一指数信号估算领域预算'}；风险收缩暴露${(riskFraction*100).toFixed(1)}%，预算系数${signalFactor.toFixed(3)}。待分配${remaining.toFixed(2)}个百分点；未核验映射或成本不输出逐基金金额。`, asOf: input.portfolioAsOf || null, industry: evaluation.profile.name, readiness, signal,
    researchConclusion: researchAvailable ? { rating, conclusion: String(executive.conclusion || advice.thesis || ''), allocationStance: String(executive.allocationStance || modelRecommendation.reason || ''), appliedToAllocation: ruleRequestedDelta > 0 && !researchAllowsIncrease ? '综合结论未达到积极评级，本轮已取消规则层面的新增风险建议；减仓和硬约束不受模型否决。' : '综合结论已作为新增风险门禁；仓位上限、现金底仓、费用和减仓仍由确定性规则计算。' } : undefined,
    summary: readiness === 'advice-ready' ? `已生成可执行的分批投资建议，置信度 ${confidencePct.toFixed(1)}%。` : readiness === 'blocked' ? '核心持仓或市场数据不足，建议观望并补齐数据。' : `已生成投资建议，置信度 ${confidencePct.toFixed(1)}%；${gates.filter(gate => !gate.met).map(gate => gate.label).join('、')}缺失已计入置信度。`,
    totalAssets: round(input.totalAssets), cashWeightPct: round(input.cashWeightPct), cashTargetFloorPct: round(minCashPct), currentIndustryWeightPct: round(currentIndustryWeightPct),
    targetIndustryRangePct: [lower, upper], proposedIndustryWeightPct, proposedCashWeightPct, mappingCoveragePct, verifiedMappingCoveragePct, costCoveragePct, confidencePct, adjustmentPlan,
    actions, gates, policy, disclaimer: `这是基于本轮冻结证据、当前持仓和风险预算生成的投资建议，并附数据置信度；系统不会自动执行交易。`,
  }
}
