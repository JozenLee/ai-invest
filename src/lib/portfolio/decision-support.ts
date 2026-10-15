import { indexRuleSummary, productGroups } from '@/lib/analysis/report-insights'
import { normalizeAIProductDecisions, type AIProductDecision } from '@/lib/analysis/investment-conclusion'
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
  industryCode?: string | null
  industryMatchSource?: string | null
  industryMatchConfidence?: number | null
  weightPct: number | null
  marketValue: number
  quantity?: number | null
  unitNav?: number | null
  fundType?: string | null
  targetEtfCode?: string | null
  targetIndexCode?: string | null
  mappingSource?: string | null
  mappingConfidence?: number | null
  mappingEvidence?: string | null
  firstObservedAt?: string | null
  purchaseDate?: string | null
  costNav?: number | null
  redemptionFeePct?: number | null
  redemptionFeeSource?: string | null
  researchReady?: boolean
  researchEvidenceIds?: string[]
  navHistory?: Array<{date:string;nav:number}>
  navDate?: string | null
  executionGaps?: string[]
  reportIndustryExposurePct?: number | null
  reportIndustryEvidenceIds?: string[]
}

export type HoldingMapping = {
  ticker: string
  fundType: string
  targetEtfCode: string | null
  targetIndexCode: string | null
  decisionTicker: string | null
  method: 'manual' | 'official-document' | 'provider-cross-check' | 'official-domain' | 'research-fund' | 'direct-etf' | 'name-inference' | 'domain-proxy' | 'unmapped'
  confidence: number
  verified: boolean
  domainVerified?: boolean
  scope?: 'product' | 'fund' | 'domain' | 'unmapped'
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
  aiDecision?: AIProductDecision | null
  constraintNotes?: string[]
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
  domainMappingCoveragePct?: number
  productMappingCoveragePct?: number
  costCoveragePct: number
  confidencePct: number
  riskDiagnostics?: {
    concentrationHhi: number
    effectiveFundCount: number
    volatilityCoveragePct: number
    unverifiedExposurePct: number
    contributions: Array<{ticker:string;weightPct:number;volatilityPct:number;riskSharePct:number}>
    basis: string
  }
  adjustmentPlan: {
    completed: boolean
    remainingCashGapPct: number
    remainingIndustryReductionPct: number
    steps: Array<{ stage: number; label: string; detail: string; executable: boolean }>
  }
  actions: PortfolioAction[]
  actionLedger?: { asOf:string; conflicts:Array<{ticker:string;industries:string[];detail:string}>; sourceRunIds:string[]; basis:string }
  gates: Array<{ key: string; label: string; met: boolean; detail: string }>
  policy: RiskBudget
  disclaimer: string
}

export function applyDecisionTimingGate(support: PortfolioDecisionSupport | null | undefined, timing: DecisionTimingAssessment) {
  if (!support) return support
  const checkedAt=Date.parse(timing.checkedAt || timing.generatedAt || timing.asOf)
  const age = checkedAt - Date.parse(support.asOf || '')
  const portfolioFresh = Number.isFinite(age) && age >= 0 && age <= 72 * 3600_000
  const gates = [...support.gates.filter(gate => !['decision-timing','portfolio-freshness'].includes(gate.key)),
    {key:'portfolio-freshness',label:'持仓时效',met:portfolioFresh,detail:portfolioFresh?'持仓业务日期在72小时内':'持仓业务日期缺失、晚于研究时点或超过72小时；需更新持仓后计算金额'},
    {key:'decision-timing',label:'行情数据时效',met:timing.executionReady,detail:timing.executionReady?`${timing.label}；有效至${timing.validUntil || '待核验'}`:timing.reasons.join('；')},
  ]
  const actions = support.actions.map(action => {
    const contract = action.aiDecision?.executionContract
    const blockers = [
      !portfolioFresh && '持仓时效未通过，需更新后重新计算',
      !action.mapping.verified && '产品映射未核验',
      (action.changeWeightPct||0)<0 && action.estimatedFee===null && '交易费用未核验',
      !timing.executionReady && '本轮仅供研究参考，不用于执行',
      contract?.status !== 'verified' && '触发条件或决策证据需人工复核',
      contract && !(Date.parse(contract.asOf)<=checkedAt&&Date.parse(contract.validUntil)>checkedAt) && '产品执行合同已过期或时点无效，需重新复核',
      ...(contract?.blockers || []),
      ...(contract?.manualReviewConditions || []),
    ].filter(Boolean) as string[]
    const executable = action.executable && blockers.length === 0
    // Keep the model direction visible, but do not present stale allocations as orders.
    return {...action,executable,gaps:[...new Set([...action.gaps,...blockers])],
      ...(!executable?{amount:null,estimatedUnits:null,estimatedFee:null,targetWeightPct:null,changeWeightPct:null}:{})}
  })
  const delta=actions.reduce((sum,action)=>sum+(action.changeWeightPct||0),0)
  const ready = actions.length > 0 && actions.every(action=>action.executable)
  return {...support,actions,gates,
    readiness:support.readiness==='blocked'?'blocked' as const:ready?'advice-ready' as const:'limited-advice' as const,
    proposedIndustryWeightPct:support.currentIndustryWeightPct+delta,proposedCashWeightPct:support.cashWeightPct-delta,
    summary:ready?support.summary:`投资观点保留，操作尚待复核：${[...new Set([...gates.filter(gate=>!gate.met).map(gate=>gate.label),...actions.filter(action=>!action.executable).flatMap(action=>action.gaps)])].join('；')}`,
    adjustmentPlan:{...support.adjustmentPlan,completed:ready&&support.adjustmentPlan.completed,steps:support.adjustmentPlan.steps.map(step=>({...step,executable:ready&&step.executable}))}}
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
    method: holding.mappingSource === 'official-document' ? 'official-document' : holding.mappingSource==='provider-cross-check'?'provider-cross-check':'manual', confidence: clamp01(holding.mappingConfidence ?? 1), verified: (holding.mappingConfidence ?? 1) >= .8,domainVerified:true,scope:'product',
  }
  const direct = decisions.find(item => item.ticker === holding.ticker)
  if (direct) return { ticker: holding.ticker, fundType: 'etf', targetEtfCode: direct.ticker, targetIndexCode: direct.indexCode, decisionTicker: direct.ticker, method: 'direct-etf', confidence: 1, verified: true,domainVerified:true,scope:'product' }
  if (holding.researchReady && (holding.industry === evaluation.profile.name || (holding.reportIndustryExposurePct || 0) > 0)) {
    return {ticker:holding.ticker,fundType:inferFundType(holding.name,holding.fundType),targetEtfCode:null,targetIndexCode:null,decisionTicker:null,method:'research-fund',confidence:clamp01(holding.industryMatchConfidence ?? .85),verified:true,domainVerified:true,scope:'fund'}
  }
  if (holding.mappingSource === 'official-document' && holding.fundType === 'active' && holding.industry === evaluation.profile.name && (holding.industryMatchConfidence || 0) >= .75) {
    return { ticker:holding.ticker,fundType:'active',targetEtfCode:null,targetIndexCode:null,decisionTicker:null,method:'official-domain',confidence:clamp01(Math.min(holding.mappingConfidence??1,holding.industryMatchConfidence??0)),verified:true,domainVerified:true,scope:'domain' }
  }
  const own = normalized(holding.name), ownFamily = family(holding.name)
  const ranked = decisions.map(decision => {
    const candidate = normalized(decision.name)
    const sharedFamily = ownFamily && ownFamily === family(decision.name)
    const overlap = [...new Set(Array.from(own))].filter(char => candidate.includes(char)).length / Math.max(own.length, candidate.length, 1)
    return { decision, score: Math.max(sharedFamily ? .6 : 0, overlap) }
  }).sort((a, b) => b.score - a.score)
  if (ranked[0]?.score >= .8) return { ticker: holding.ticker, fundType: inferFundType(holding.name, holding.fundType), targetEtfCode: ranked[0].decision.ticker, targetIndexCode: ranked[0].decision.indexCode, decisionTicker: ranked[0].decision.ticker, method: 'name-inference', confidence: round(ranked[0].score, 4), verified: false,domainVerified:holding.industry===evaluation.profile.name,scope:'product' }
  if (holding.industry === evaluation.profile.name || ownFamily) {
    const confidence=clamp01(holding.industryMatchConfidence??(holding.industry===evaluation.profile.name ? .8 : .45))
    return { ticker: holding.ticker, fundType: inferFundType(holding.name, holding.fundType), targetEtfCode: null, targetIndexCode: null, decisionTicker: null, method: 'domain-proxy', confidence, verified: false,domainVerified:holding.industry===evaluation.profile.name&&confidence>=.75,scope:'domain' }
  }
  return { ticker: holding.ticker, fundType: inferFundType(holding.name, holding.fundType), targetEtfCode: null, targetIndexCode: null, decisionTicker: null, method: 'unmapped', confidence: 0, verified: false,domainVerified:false,scope:'unmapped' }
}

function aggregateFundDecision(holding:PortfolioHoldingInput,decisions:AIProductDecision[]):AIProductDecision|null{
  if(!holding.researchReady||!decisions.length)return null
  const scored=decisions.map(item=>({item,score:item.heldAction==='加仓'?1:item.heldAction==='减仓'?-1:0,weight:Math.max(1,item.confidencePct)}))
  const total=scored.reduce((sum,row)=>sum+row.score*row.weight,0),weight=scored.reduce((sum,row)=>sum+row.weight,0)
  const normalized=weight?total/weight:0
  const heldAction:AIProductDecision['heldAction']=normalized>.2?'加仓':normalized<-.2?'减仓':scored.some(row=>row.item.heldAction==='持有')?'持有':'观望'
  const directional=scored.filter(row=>row.item.heldAction===heldAction)
  const suggestedAdjustmentPct=directional.length?round(directional.reduce((sum,row)=>sum+row.item.suggestedAdjustmentPct,0)/directional.length):0
  const confidencePct=round(Math.min(90,scored.reduce((sum,row)=>sum+row.item.confidencePct,0)/scored.length*Math.min(1,Math.abs(normalized)+.35)))
  return {ticker:holding.ticker,unheldAction:heldAction==='加仓'?'建仓':'观望',heldAction,suggestedAdjustmentPct,confidencePct,reason:`该基金没有唯一底层ETF；依据基金自身净值与披露持仓研究，并汇总本领域${decisions.length}只产品的AI方向。`,trigger:`本领域AI方向维持${heldAction}，且基金披露与净值研究继续通过门禁`,invalidation:'基金最新披露、净值风险或本领域AI方向发生变化',quantitativeOverride:null,evidenceIds:[...new Set([...(holding.researchEvidenceIds||[]),...(holding.reportIndustryEvidenceIds||[]),...decisions.flatMap(item=>item.evidenceIds)])].slice(0,16),decisionSource:'domain-aggregation'}
}

export function buildPortfolioDecisionSupportLegacy(input: {
  evaluation: Evaluation
  holdings: PortfolioHoldingInput[]
  totalAssets: number
  cashWeightPct: number
  policy: RiskBudget
  dataQualityAvailable: boolean
  portfolioAsOf?: string | null
  portfolioSyncedAt?: string | null
  investmentAdvice?: unknown
}): PortfolioDecisionSupport {
  const { evaluation, holdings, policy } = input
  const mappings = holdings.map(holding => resolveHoldingMapping(holding, evaluation))
  const rows = holdings.map((holding, index) => ({ holding, mapping: mappings[index] }))
  const relevant = rows.filter(row => row.mapping.method !== 'unmapped' && (row.holding.industry === evaluation.profile.name || row.mapping.decisionTicker || family(row.holding.name)))
  const currentIndustryWeightPct = relevant.reduce((sum, row) => sum + (row.holding.weightPct || 0), 0)
  const mappedWeight = relevant.filter(row=>row.mapping.domainVerified||row.mapping.verified).reduce((sum, row) => sum + (row.holding.weightPct || 0), 0)
  const verifiedWeight = relevant.filter(row => row.mapping.verified&&row.mapping.scope==='product').reduce((sum, row) => sum + (row.holding.weightPct || 0), 0)
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
  const mappedSignals=relevant.filter(row=>row.mapping.verified).map(row=>({weight:row.holding.weightPct||0,state:evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)?.state||signal}))
  const normalizedWeights=relevant.map(row=>currentIndustryWeightPct>0?(row.holding.weightPct||0)/currentIndustryWeightPct:0)
  const concentrationHhi=normalizedWeights.reduce((sum,value)=>sum+value*value,0)
  const riskRows=relevant.flatMap(row=>{
    const volatility=evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)?.metrics.volatilityPct
    return row.mapping.verified&&typeof volatility==='number'&&Number.isFinite(volatility)?[{ticker:row.holding.ticker,weightPct:row.holding.weightPct||0,volatilityPct:volatility,riskUnits:(row.holding.weightPct||0)*volatility}]:[]
  })
  const riskTotal=riskRows.reduce((sum,row)=>sum+row.riskUnits,0)
  const volatilityCovered=riskRows.reduce((sum,row)=>sum+row.weightPct,0)
  const riskDiagnostics={concentrationHhi:round(concentrationHhi),effectiveFundCount:concentrationHhi>0?round(1/concentrationHhi):0,volatilityCoveragePct:currentIndustryWeightPct>0?round(volatilityCovered/currentIndustryWeightPct*100):100,unverifiedExposurePct:currentIndustryWeightPct>0?round(Math.max(0,currentIndustryWeightPct-verifiedWeight)/currentIndustryWeightPct*100):0,contributions:riskRows.map(row=>({ticker:row.ticker,weightPct:round(row.weightPct),volatilityPct:round(row.volatilityPct),riskSharePct:riskTotal>0?round(row.riskUnits/riskTotal*100):0})).sort((a,b)=>b.riskSharePct-a.riskSharePct),basis:'按持仓权重×单基金年化波动率估算独立风险份额；未纳入相关系数，不能替代协方差边际风险贡献。'}
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
  const domainMappingCoveragePct = currentIndustryWeightPct > 0 ? round(mappedWeight / currentIndustryWeightPct * 100) : 100
  const productMappingCoveragePct = currentIndustryWeightPct > 0 ? round(verifiedWeight / currentIndustryWeightPct * 100) : 100
  const mappingCoveragePct=domainMappingCoveragePct,verifiedMappingCoveragePct=productMappingCoveragePct
  const costCoveragePct = currentIndustryWeightPct > 0 ? round(feeKnownWeight / currentIndustryWeightPct * 100) : 100
  const projectedFundCapMet = relevant.every(row => {
    const current = row.holding.weightPct || 0
    return current + (deltas.get(row.holding.ticker)||0) <= maxFundPct + .01
  })
  const gates = [
    { key: 'quality', label: '研究数据门禁', met: input.dataQualityAvailable, detail: input.dataQualityAvailable ? '核心研究数据可用' : '仍有产品或基本面缺口' },
    { key: 'domain-mapping', label: '产业领域归属', met: domainMappingCoveragePct >= 95, detail: `高置信度领域映射覆盖 ${domainMappingCoveragePct.toFixed(1)}%；可用于领域仓位汇总` },
    { key: 'mapping', label: '逐基金产品穿透', met: productMappingCoveragePct >= 95, detail: `正式底层ETF/指数映射覆盖 ${productMappingCoveragePct.toFixed(1)}%；仅该层用于逐基金金额` },
    { key: 'cost', label: '调整成本覆盖', met: desiredDelta >= 0 || costCoveragePct >= 95, detail: desiredDelta >= 0 ? '本轮不涉及赎回费' : `赎回费覆盖 ${costCoveragePct.toFixed(1)}%` },
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
    const gaps = [!row.mapping.verified && (row.mapping.domainVerified?'产业领域已确认；正式底层ETF/指数未纳入本轮产品池':'产业领域与底层产品均待核验'), reducing && !feeKnown && '赎回费率或持有期缺失', !row.holding.costNav && '持仓成本净值缺失（不影响按当前市值计算风险收缩）'].filter(Boolean) as string[]
    const action: PortfolioAction['action'] = !resolved?'补充数据':reducing ? '减仓' : adding ? '加仓' : increaseVetoed ? '观望' : signal === 'risk-off' ? '观望' : '持有'
    return {
      ticker: row.holding.ticker, name: row.holding.name, action, currentWeightPct: round(current), targetWeightPct: resolved?round(current + delta):null, changeWeightPct: resolved?delta:null,
      amount: amount || null, estimatedUnits: amount && row.holding.unitNav ? round(amount / row.holding.unitNav, 2) : null,
      estimatedFee: reducing && feeKnown ? round(amount * row.holding.redemptionFeePct! / 100) : null,
      batches: policy.stagedAdjustment && amount > 0 ? Math.min(3, Math.max(2, Math.ceil(Math.abs(delta) / 2))) : 1,
      executable:executable&&resolved, reason: !resolved?(row.mapping.domainVerified?'产业领域归属已核验，可计入领域风险预算；但该基金的产品身份或赎回成本未完成核验，因此不输出逐基金调整金额。':'产业领域或底层产品映射不足，仅保留组合级预算，不输出逐基金调整金额。'):reducing ? `领域仓位${currentIndustryWeightPct.toFixed(1)}%超过预算${upper.toFixed(1)}%；按已核验暴露、单基金上限、风险信号及赎回成本优先分配。${row.mapping.method==='official-domain'?'该主动基金以官方投资范围和高置信领域归属作为风控依据。':evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)?.reason||''}` : adding ? `领域进入满足条件状态且当前仓位低于目标下沿 ${lower.toFixed(1)}%` : increaseVetoed ? `规则层面出现新增仓位空间，但综合投资结论评级为${rating}，本轮不新增风险暴露。` : '当前仓位位于风险预算区间内',
      trigger: evaluation.decisions.find(item => item.ticker === row.mapping.decisionTicker)?.trigger || '以领域规则状态和组合风险预算的下一次盘后复核为准',
      invalidation: evaluation.decisions.find(item => item.ticker === row.mapping.decisionTicker)?.invalidation || '持仓映射、费用或市场数据失效时重新计算建议', mapping: row.mapping, gaps,
    }
  })
  const confidencePct = round(Math.min(95, domainMappingCoveragePct*.2+productMappingCoveragePct*.25+costCoveragePct*.15+(input.dataQualityAvailable?25:10)+15))
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
    version: 1, allocationVersion:2, allocationBasis:`${completeMapping?'已按正式产品穿透映射聚合信号':domainMappingCoveragePct>=95?'产业领域归属已核验；因场外联接或主动基金未落入本轮场内ETF决策池，领域信号暂按唯一指数汇总':'产业领域归属覆盖不足，暂按唯一指数信号估算领域预算'}；风险收缩暴露${(riskFraction*100).toFixed(1)}%，预算系数${signalFactor.toFixed(3)}。待分配${remaining.toFixed(2)}个百分点；只有正式产品映射和成本完整时才输出逐基金金额。`, asOf: input.portfolioAsOf || null, industry: evaluation.profile.name, readiness, signal,
    researchConclusion: researchAvailable ? { rating, conclusion: String(executive.conclusion || advice.thesis || ''), allocationStance: String(executive.allocationStance || modelRecommendation.reason || ''), appliedToAllocation: ruleRequestedDelta > 0 && !researchAllowsIncrease ? '综合结论未达到积极评级，本轮已取消规则层面的新增风险建议；减仓和硬约束不受模型否决。' : '综合结论已作为新增风险门禁；仓位上限、现金底仓、费用和减仓仍由确定性规则计算。' } : undefined,
    summary: readiness === 'advice-ready' ? `已生成可执行的分批投资建议，置信度 ${confidencePct.toFixed(1)}%。` : readiness === 'blocked' ? '核心持仓或市场数据不足，建议观望并补齐数据。' : `已生成投资建议，置信度 ${confidencePct.toFixed(1)}%；${gates.filter(gate => !gate.met).map(gate => gate.label).join('、')}缺失已计入置信度。`,
    totalAssets: round(input.totalAssets), cashWeightPct: round(input.cashWeightPct), cashTargetFloorPct: round(minCashPct), currentIndustryWeightPct: round(currentIndustryWeightPct),
    targetIndustryRangePct: [lower, upper], proposedIndustryWeightPct, proposedCashWeightPct, mappingCoveragePct, verifiedMappingCoveragePct,domainMappingCoveragePct,productMappingCoveragePct,costCoveragePct,confidencePct,riskDiagnostics, adjustmentPlan,
    actions, gates, policy, disclaimer: `这是基于本轮冻结证据、当前持仓和风险预算生成的投资建议，并附数据置信度；系统不会自动执行交易。`,
  }
}

/**
 * Applies local portfolio constraints to AI-generated product decisions.
 * Backtest sample counts and quantitative states are evidence only: neither can
 * replace the model's investment direction. Hard portfolio limits may force a
 * reduction, while every increase remains inside the user's configured range.
 */
export function buildPortfolioDecisionSupport(input: {
  evaluation: Evaluation
  holdings: PortfolioHoldingInput[]
  totalAssets: number
  cashWeightPct: number
  policy: RiskBudget
  dataQualityAvailable: boolean
  portfolioAsOf?: string | null
  portfolioSyncedAt?: string | null
  investmentAdvice?: unknown
}): PortfolioDecisionSupport {
  const {evaluation,holdings,policy}=input
  const mappings=holdings.map(holding=>resolveHoldingMapping(holding,evaluation))
  const rows=holdings.map((holding,index)=>({holding,mapping:mappings[index]}))
  const relevant=rows.filter(row=>row.mapping.method!=='unmapped'&&(row.holding.industry===evaluation.profile.name||row.mapping.decisionTicker||family(row.holding.name)))
  const currentIndustryWeightPct=relevant.reduce((sum,row)=>sum+(row.holding.weightPct||0),0)
  const mappedWeight=relevant.filter(row=>row.mapping.domainVerified||row.mapping.verified).reduce((sum,row)=>sum+(row.holding.weightPct||0),0)
  const verifiedWeight=relevant.filter(row=>row.mapping.verified&&['product','fund'].includes(row.mapping.scope||'')).reduce((sum,row)=>sum+(row.holding.weightPct||0),0)
  const feeKnownWeight=relevant.filter(row=>typeof row.holding.redemptionFeePct==='number').reduce((sum,row)=>sum+(row.holding.weightPct||0),0)
  const advice=(()=>{try{const value=typeof input.investmentAdvice==='string'?JSON.parse(input.investmentAdvice):input.investmentAdvice;return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}catch{return {}}})()
  const executive=advice.executiveSummary&&typeof advice.executiveSummary==='object'&&!Array.isArray(advice.executiveSummary)?advice.executiveSummary as Record<string,unknown>:{}
  const modelRecommendation=advice.recommendation&&typeof advice.recommendation==='object'&&!Array.isArray(advice.recommendation)?advice.recommendation as Record<string,unknown>:{}
  const rating=String(advice.rating||'未评级')
  const expectedTickers=evaluation.decisions.map(item=>item.ticker)
  const aiDecisions=normalizeAIProductDecisions(advice.productDecisions,expectedTickers)
  const aiByTicker=new Map(aiDecisions.map(item=>[item.ticker,item]))
  const aiComplete=expectedTickers.length>0&&aiDecisions.length===expectedTickers.length
  const researchAvailable=aiComplete&&Boolean(advice.rating||executive.conclusion)
  const heldDirections=aiDecisions.map(item=>item.heldAction)
  const signal:PortfolioDecisionSupport['signal']=!aiComplete?'blocked':heldDirections.some(action=>action==='减仓')&&!heldDirections.some(action=>action==='加仓')?'risk-off':heldDirections.some(action=>action==='加仓')||aiDecisions.some(item=>item.unheldAction==='建仓')?'eligible':'watch'
  const maxIndustryPct=policy.maxIndustryRatio*100,maxFundPct=policy.maxFundRatio*100,minCashPct=policy.minCashRatio*100,maxDailyAdjustmentPct=policy.maxSingleAdjustmentRatio*100
  const aiHoldingWeight=relevant.filter(row=>(row.mapping.decisionTicker&&aiByTicker.has(row.mapping.decisionTicker))||(row.mapping.scope==='fund'&&row.holding.researchReady&&aiComplete)).reduce((sum,row)=>sum+(row.holding.weightPct||0),0)
  const aiHoldingCoveragePct=currentIndustryWeightPct>0?round(aiHoldingWeight/currentIndustryWeightPct*100):100
  const normalizedWeights=relevant.map(row=>currentIndustryWeightPct>0?(row.holding.weightPct||0)/currentIndustryWeightPct:0)
  const concentrationHhi=normalizedWeights.reduce((sum,value)=>sum+value*value,0)
  const riskRows=relevant.flatMap(row=>{
    const volatility=evaluation.decisions.find(item=>item.ticker===row.mapping.decisionTicker)?.metrics.volatilityPct
    return row.mapping.verified&&typeof volatility==='number'&&Number.isFinite(volatility)?[{ticker:row.holding.ticker,weightPct:row.holding.weightPct||0,volatilityPct:volatility,riskUnits:(row.holding.weightPct||0)*volatility}]:[]
  })
  const riskTotal=riskRows.reduce((sum,row)=>sum+row.riskUnits,0),volatilityCovered=riskRows.reduce((sum,row)=>sum+row.weightPct,0)
  const riskDiagnostics={concentrationHhi:round(concentrationHhi),effectiveFundCount:concentrationHhi>0?round(1/concentrationHhi):0,volatilityCoveragePct:currentIndustryWeightPct>0?round(volatilityCovered/currentIndustryWeightPct*100):100,unverifiedExposurePct:currentIndustryWeightPct>0?round(Math.max(0,currentIndustryWeightPct-verifiedWeight)/currentIndustryWeightPct*100):0,contributions:riskRows.map(row=>({ticker:row.ticker,weightPct:round(row.weightPct),volatilityPct:round(row.volatilityPct),riskSharePct:riskTotal>0?round(row.riskUnits/riskTotal*100):0})).sort((a,b)=>b.riskSharePct-a.riskSharePct),basis:'按持仓权重×单基金年化波动率估算独立风险份额；未纳入相关系数，不能替代协方差边际风险贡献。'}
  const comparisons=productGroups(evaluation)
  const requests=new Map<string,{delta:number;ai:AIProductDecision|null;notes:string[]}>()
  for(const row of relevant){
    const current=row.holding.weightPct||0,ai=row.mapping.decisionTicker?aiByTicker.get(row.mapping.decisionTicker)||null:row.mapping.scope==='fund'?aggregateFundDecision(row.holding,aiDecisions):null
    const notes:string[]=[],rawSuggested=ai?.suggestedAdjustmentPct||0,suggested=ai?.heldAction==='减仓'?Math.min(current,rawSuggested):Math.min(maxFundPct,rawSuggested)
    let delta=ai?.heldAction==='减仓'?-suggested:ai?.heldAction==='加仓'?Math.min(suggested,Math.max(0,maxFundPct-current)):0
    const fundExcess=Math.max(0,current-maxFundPct)
    if(fundExcess>0){delta=Math.min(delta,-fundExcess);notes.push(`当前仓位超过单基金上限，至少需降低${fundExcess.toFixed(1)}个百分点`)}
    if(!ai)notes.push('未找到与当前持仓正式对应的AI逐产品决策')
    requests.set(row.holding.ticker,{delta,ai,notes})
  }
  const industryExcess=Math.max(0,currentIndustryWeightPct-maxIndustryPct)
  const requestedReduction=()=>[...requests.values()].reduce((sum,item)=>sum+Math.max(0,-item.delta),0)
  if(requestedReduction()<industryExcess){
    let needed=industryExcess-requestedReduction()
    const candidates=[...relevant].sort((a,b)=>Number(requests.get(b.holding.ticker)?.ai?.heldAction==='减仓')-Number(requests.get(a.holding.ticker)?.ai?.heldAction==='减仓')||(b.holding.weightPct||0)-(a.holding.weightPct||0))
    for(const row of candidates){
      if(needed<=0)break
      const request=requests.get(row.holding.ticker)!,current=row.holding.weightPct||0,capacity=Math.max(0,current-Math.max(0,-request.delta)),extra=Math.min(capacity,needed)
      if(extra>0){request.delta-=extra;request.notes.push(`产业仓位超过上限，程序追加${extra.toFixed(1)}个百分点风险约束减仓`);needed-=extra}
    }
  }
  const deltas=new Map<string,number>()
  let dailyCapacity=maxDailyAdjustmentPct
  const ordered=[...relevant].sort((a,b)=>{
    const ra=requests.get(a.holding.ticker)!,rb=requests.get(b.holding.ticker)!,signA=ra.delta<0?0:ra.delta>0?1:2,signB=rb.delta<0?0:rb.delta>0?1:2
    return signA-signB+(rb.ai?.confidencePct||0)-(ra.ai?.confidencePct||0)||(a.holding.redemptionFeePct??Infinity)-(b.holding.redemptionFeePct??Infinity)
  })
  for(const row of ordered){
    const request=requests.get(row.holding.ticker)!
    if(!row.mapping.verified){request.notes.push('产品映射未核验，程序不计算逐基金金额');continue}
    if(Math.abs(request.delta)<=.005||dailyCapacity<=0)continue
    if(request.delta<0&&typeof row.holding.redemptionFeePct!=='number'){request.notes.push('赎回费率或持有期缺失，减仓金额被阻断');continue}
    if(request.delta>0){
      const group=comparisons.find(item=>item.indexCode===row.mapping.targetIndexCode),frozen=evaluation.productComparisons?.find(item=>item.indexCode===row.mapping.targetIndexCode)
      const candidate=frozen?frozen.candidate:group?.comparisonCandidate,comparisonStatus=frozen?.status||group?.status
      if(comparisonStatus!=='single-product'&&candidate!==row.mapping.decisionTicker){request.notes.push('不在同指数产品比较候选范围内，AI加仓建议被阻断');continue}
    }
    const already=[...deltas.values()].reduce((sum,value)=>sum+value,0)
    const industryRoom=request.delta>0?Math.max(0,maxIndustryPct-(currentIndustryWeightPct+already)):Infinity
    const cashRoom=request.delta>0?Math.max(0,input.cashWeightPct-minCashPct-already):Infinity
    const applied=Math.min(Math.abs(request.delta),dailyCapacity,industryRoom,cashRoom)
    if(applied<=.005){request.notes.push('现金底仓或产业上限没有可用调整空间');continue}
    deltas.set(row.holding.ticker,request.delta<0?-applied:applied);dailyCapacity-=applied
    if(applied+0.005<Math.abs(request.delta))request.notes.push(`受每日最大调整比例约束，本轮仅执行${applied.toFixed(1)}个百分点`)
  }
  const appliedDelta=[...deltas.values()].reduce((sum,value)=>sum+value,0)
  const proposedIndustryWeightPct=round(currentIndustryWeightPct+appliedDelta),proposedCashWeightPct=round(input.cashWeightPct-appliedDelta)
  const domainMappingCoveragePct=currentIndustryWeightPct>0?round(mappedWeight/currentIndustryWeightPct*100):100
  const productMappingCoveragePct=currentIndustryWeightPct>0?round(verifiedWeight/currentIndustryWeightPct*100):100
  const mappingCoveragePct=domainMappingCoveragePct,verifiedMappingCoveragePct=productMappingCoveragePct
  const costCoveragePct=currentIndustryWeightPct>0?round(feeKnownWeight/currentIndustryWeightPct*100):100
  const projectedFundCapMet=relevant.every(row=>{const current=row.holding.weightPct||0,projected=current+(deltas.get(row.holding.ticker)||0);return current>maxFundPct?projected<=current+.01:projected<=maxFundPct+.01})
  const requestedReductionExists=[...requests.values()].some(item=>item.delta<-.005)
  const gates=[
    {key:'ai-decision',label:'AI逐产品投资决策',met:aiComplete,detail:aiComplete?`AI已覆盖全部${expectedTickers.length}只研究产品，模型评级${rating}`:`AI决策仅覆盖${aiDecisions.length}/${expectedTickers.length}只产品，不生成替代规则观点`},
    {key:'ai-holding-coverage',label:'AI决策持仓覆盖',met:aiHoldingCoveragePct>=95,detail:`当前领域持仓中 ${aiHoldingCoveragePct.toFixed(1)}% 已正式映射到本轮AI产品决策；范围外产品不补写动作`},
    {key:'quality',label:'研究数据门禁',met:input.dataQualityAvailable,detail:input.dataQualityAvailable?'核心研究数据可用':'仍有产品或基本面缺口'},
    {key:'domain-mapping',label:'产业领域归属',met:domainMappingCoveragePct>=95,detail:`高置信度领域映射覆盖 ${domainMappingCoveragePct.toFixed(1)}%；可用于领域仓位汇总`},
    {key:'mapping',label:'逐基金产品穿透',met:productMappingCoveragePct>=95,detail:`正式底层ETF/指数映射覆盖 ${productMappingCoveragePct.toFixed(1)}%；仅该层用于逐基金金额`},
    {key:'cost',label:'调整成本覆盖',met:!requestedReductionExists||costCoveragePct>=95,detail:!requestedReductionExists?'AI本轮不建议减仓':`赎回费覆盖 ${costCoveragePct.toFixed(1)}%；缺失产品不计算减仓金额`},
    {key:'cash-floor',label:'现金底仓',met:proposedCashWeightPct>=minCashPct,detail:`调整后 ${proposedCashWeightPct.toFixed(1)}%，底线 ${minCashPct.toFixed(1)}%`},
    {key:'fund-cap',label:'单基金仓位上限',met:projectedFundCapMet,detail:`单只基金不新增超过 ${maxFundPct.toFixed(1)}%；已有超限仅允许降低`},
    {key:'daily-adjustment',label:'每日最大调整比例',met:true,detail:`组合当日加减仓绝对值合计不超过 ${maxDailyAdjustmentPct.toFixed(1)}%`},
  ]
  const coreExecutable=aiComplete&&input.dataQualityAvailable&&proposedCashWeightPct>=minCashPct
  const actions:PortfolioAction[]=relevant.map(row=>{
    const current=row.holding.weightPct||0,request=requests.get(row.holding.ticker)!,aiDecision=request.ai,delta=round(deltas.get(row.holding.ticker)||0)
    const resolved=row.mapping.verified&&(delta>=0||typeof row.holding.redemptionFeePct==='number')&&!!aiDecision
    const amount=round(Math.abs(delta)/100*input.totalAssets),feeKnown=typeof row.holding.redemptionFeePct==='number',reducing=delta<-.005,adding=delta>.005
    const gaps=[!row.mapping.verified&&(row.mapping.domainVerified?'产业领域已确认；正式底层ETF/指数未纳入本轮产品池':'产业领域与底层产品均待核验'),reducing&&!feeKnown&&'赎回费率或持有期缺失',!row.holding.costNav&&'持仓成本净值缺失',...request.notes].filter(Boolean) as string[]
    const action:PortfolioAction['action']=!resolved?'补充数据':reducing?'减仓':adding?'加仓':aiDecision?.heldAction==='观望'?'观望':'持有'
    return {ticker:row.holding.ticker,name:row.holding.name,action,currentWeightPct:round(current),targetWeightPct:resolved?round(current+delta):null,changeWeightPct:resolved?delta:null,amount:amount||null,estimatedUnits:amount&&row.holding.unitNav?round(amount/row.holding.unitNav,2):null,estimatedFee:reducing&&feeKnown?round(amount*row.holding.redemptionFeePct!/100):null,batches:policy.stagedAdjustment&&amount>0?Math.min(3,Math.max(2,Math.ceil(Math.abs(delta)/2))):1,executable:coreExecutable&&resolved,reason:aiDecision?`${aiDecision.reason}${request.notes.length?`；程序约束：${request.notes.join('；')}`:''}`:`${row.mapping.domainVerified?'产业领域归属已核验；':'产业领域归属待核验；'}AI未对该持仓对应产品形成有效决策，程序不会使用量化规则补写投资观点。`,trigger:aiDecision?.trigger||'等待AI逐产品决策完成',invalidation:aiDecision?.invalidation||'AI决策、持仓映射或市场数据更新后重新计算',mapping:row.mapping,gaps,aiDecision,constraintNotes:request.notes}
  })
  const actionable=actions.filter(action=>action.executable&&Math.abs(action.changeWeightPct||0)>.005)
  const readiness:PortfolioDecisionSupport['readiness']=!aiComplete||!relevant.length?'blocked':actionable.length||actions.every(action=>['持有','观望'].includes(action.action))&&coreExecutable?'advice-ready':'limited-advice'
  const averageAiConfidence=aiDecisions.length?aiDecisions.reduce((sum,item)=>sum+item.confidencePct,0)/aiDecisions.length:0
  const confidencePct=round(Math.min(95,averageAiConfidence*.35+domainMappingCoveragePct*.15+productMappingCoveragePct*.2+costCoveragePct*.1+(input.dataQualityAvailable?10:0)+10))
  const remainingCashGapPct=round(Math.max(0,minCashPct-proposedCashWeightPct)),remainingIndustryReductionPct=round(Math.max(0,proposedIndustryWeightPct-maxIndustryPct))
  const adjustmentPlan={completed:remainingCashGapPct<=.01&&remainingIndustryReductionPct<=.01,remainingCashGapPct,remainingIndustryReductionPct,steps:[{stage:1,label:'AI决策与每日调整约束',detail:`按AI逐产品方向并应用每日${maxDailyAdjustmentPct.toFixed(1)}%调整上限，将领域仓位由 ${currentIndustryWeightPct.toFixed(1)}% 调整至 ${proposedIndustryWeightPct.toFixed(1)}%，现金比例预计变为 ${proposedCashWeightPct.toFixed(1)}%。`,executable:coreExecutable},...(remainingCashGapPct>.01?[{stage:2,label:'组合级现金底仓修复',detail:`仍缺少 ${remainingCashGapPct.toFixed(1)}% 现金。需结合其他持仓统一评估，不能默认继续卖出本领域资产。`,executable:false}]:[]),...(remainingIndustryReductionPct>.01?[{stage:3,label:'下一交易日重新研判',detail:`领域仓位仍高于风险预算上限 ${remainingIndustryReductionPct.toFixed(1)}个百分点；下一交易日需基于新证据重新调用AI，不自动延续本次动作。`,executable:false}]:[])]}
  return {version:1,allocationVersion:3,allocationBasis:`投资方向来自AI逐产品决策；程序仅应用产品映射、数据质量、现金底仓、产业上限${maxIndustryPct.toFixed(1)}%、单基金上限${maxFundPct.toFixed(1)}%、费用与每日最大调整${maxDailyAdjustmentPct.toFixed(1)}%。滚动回测样本数量不参与本轮动作门禁。`,asOf:input.portfolioAsOf||null,industry:evaluation.profile.name,readiness,signal,researchConclusion:researchAvailable?{rating,conclusion:String(executive.conclusion||advice.thesis||''),allocationStance:String(executive.allocationStance||modelRecommendation.reason||''),appliedToAllocation:'AI逐产品决策决定投资方向和建议幅度；程序只裁剪超出用户风险预算与可执行范围的部分，不用量化状态或回测样本数覆盖AI观点。'}:undefined,summary:readiness==='advice-ready'?`AI投资决策已通过本地风险约束，综合置信度 ${confidencePct.toFixed(1)}%。`:readiness==='blocked'?'AI逐产品投资决策不完整或核心数据不足，不生成规则替代动作。':`AI投资决策已生成；${gates.filter(gate=>!gate.met).map(gate=>gate.label).join('、')}限制了可执行范围。`,totalAssets:round(input.totalAssets),cashWeightPct:round(input.cashWeightPct),cashTargetFloorPct:round(minCashPct),currentIndustryWeightPct:round(currentIndustryWeightPct),targetIndustryRangePct:[0,round(maxIndustryPct)],proposedIndustryWeightPct,proposedCashWeightPct,mappingCoveragePct,verifiedMappingCoveragePct,domainMappingCoveragePct,productMappingCoveragePct,costCoveragePct,confidencePct,riskDiagnostics,adjustmentPlan,actions,gates,policy,disclaimer:'投资方向由AI基于本轮冻结证据生成，金额由当前持仓和风险预算约束后计算；系统不会自动执行交易。'}
}
