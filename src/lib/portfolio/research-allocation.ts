import { comparePortfolioAlternatives, type AllocationResearch, type PlanningHolding } from './alternatives'
import { buildPortfolioDecisionSupport, resolveHoldingMapping, type PortfolioDecisionSupport, type RiskBudget } from './decision-support'
import type { Evaluation } from '@/lib/research/contracts'
import type { RiskBudgetSource } from './risk-budget'

/** Version 3 changes the investment decision boundary. Version 2 remains a named comparison baseline. */
export function buildResearchPortfolioDecisionSupport(input: {
  evaluation: Evaluation; holdings: PlanningHolding[]; totalAssets: number; cashWeightPct: number
  policy: RiskBudget; dataQualityAvailable: boolean; portfolioAsOf?: string | null
  policySource?: RiskBudgetSource
  investmentAdvice?: unknown; allocationResearch?: AllocationResearch | null; thesisProducts?: Record<string, string[]>
}): PortfolioDecisionSupport {
  const rules = buildPortfolioDecisionSupport(input)
  const industryTickers = input.holdings.filter(holding => holding.industry === input.evaluation.profile.name || input.evaluation.decisions.some(decision => decision.ticker === holding.ticker || decision.ticker === holding.targetEtfCode)).map(holding => holding.ticker)
  const alternatives = comparePortfolioAlternatives({
    asOf: input.evaluation.asOf, holdings: input.holdings, totalAssets: input.totalAssets, cashWeightPct: input.cashWeightPct,
    policy: input.policy, industryTickers, research: input.allocationResearch, researchQualityPassed: input.dataQualityAvailable,
    rulesTargets: rules.actions.flatMap(action => action.targetWeightPct === null ? [] : [{ ticker: action.ticker, targetWeightPct: action.targetWeightPct }]),
    thesisProducts: input.thesisProducts,
  })
  const selected = alternatives.alternatives.find(item => item.id === alternatives.selectedId)!
  const selectedHasTrades = selected.trades.length > 0
  const currentIndustry = input.holdings.filter(holding => industryTickers.includes(holding.ticker)).reduce((sum, holding) => sum + (holding.weightPct || 0), 0)
  const proposedIndustry = selected.targetWeights.filter(item => industryTickers.includes(item.ticker)).reduce((sum, item) => sum + item.weightPct, 0)
  const cash = selected.netCashWeightPct ?? input.cashWeightPct
  const picked = alternatives.status === 'research-selected'
  const holdAdvice = alternatives.status === 'hold-pending-evidence' && !selected.hardViolations.length
  const gates = [
    { key: 'research-selection', label: '组合建议结论', met: picked || holdAdvice, detail: alternatives.selectionReason },
    { key: 'hard-constraints', label: '账户硬约束', met: !selected.hardViolations.length, detail: selected.hardViolations.join('；') || '仓位、现金与单次调整上限已校验' },
    { key: 'product-execution', label: '产品交易资料', met: !selectedHasTrades || !selected.executionGaps.length, detail: !selectedHasTrades ? '当前方案无交易，不需要产品执行资料' : selected.executionGaps.join('；') || '调整产品交易资料已核验' },
    { key: 'cost', label: '费用与到账后现金', met: !selectedHasTrades || selected.totalFee !== null, detail: !selectedHasTrades ? '当前方案无交易，交易费用为零' : selected.totalFee === null ? '费用未知，不把赎回金额当作已到账现金' : '已扣除本次已知费用，到账前不得提前使用赎回款' },
  ]
  // A research comparison never certifies an order. Live product-specific verification follows separately.
  const actions = input.holdings.filter(holding => industryTickers.includes(holding.ticker) || selected.trades.some(trade => trade.ticker === holding.ticker)).map(holding => {
    const trade = selected.trades.find(item => item.ticker === holding.ticker)
    const original = resolveHoldingMapping(holding, input.evaluation)
    const mapping = { ...original, verified: Boolean(holding.researchReady) }
    return {
      ticker: holding.ticker, name: holding.name, action: (trade ? trade.changeWeightPct < 0 ? '减仓' : '加仓' : holding.researchReady ? '持有' : '补充数据') as '减仓' | '加仓' | '持有' | '补充数据',
      currentWeightPct: holding.weightPct || 0, targetWeightPct: trade?.targetWeightPct ?? holding.weightPct, changeWeightPct: trade?.changeWeightPct ?? 0,
      amount: trade?.amount ?? null, estimatedUnits: trade?.estimatedUnits ?? null, estimatedFee: trade?.estimatedFee ?? null,
      batches: 1, executable: false,
      reason: trade ? `${selected.proposal?.whyNotHold}；仓位依据：${selected.proposal?.sizingRationale}；机会成本：${selected.proposal?.opportunityCost}` : alternatives.selectionReason,
      trigger: selected.proposal?.whyNow || '先核验研究假设及方案相对不交易的改善',
      invalidation: selected.proposal?.invalidation || '关键证据变化或账户约束改变后重新评估',
      mapping, gaps: trade ? [...new Set([...trade.executionGaps, '研究方案需按基金交易机制重新核验申请窗口、费用与可用资金'])] : [],
    }
  })
  const covered = input.holdings.filter(holding => industryTickers.includes(holding.ticker) && holding.researchReady).reduce((sum, holding) => sum + (holding.weightPct || 0), 0)
  const coverage = currentIndustry ? Math.round(covered / currentIndustry * 100) : 100
  const remainingCash = Math.max(0, input.policy.minCashRatio * 100 - cash)
  const remainingIndustry = Math.max(0, proposedIndustry - input.policy.maxIndustryRatio * 100)
  return {
    ...rules, allocationVersion: 3, asOf: input.portfolioAsOf || null,
    readiness: alternatives.status === 'constraint-review-required' ? 'blocked' : holdAdvice ? 'advice-ready' : 'limited-advice',
    signal: picked || holdAdvice ? 'watch' : rules.signal,
    summary: alternatives.selectionReason,
    allocationBasis: 'AI根据投资假设提出备选组合；程序计算全账户现金、费用、压力损益与协方差，再比较不交易与原规则。技术信号不再自动折算目标仓位。',
    researchConclusion: rules.researchConclusion ? { ...rules.researchConclusion, appliedToAllocation: alternatives.selectionReason } : undefined,
    confidencePct: coverage, confidenceMeaning: '产品研究覆盖率，不是投资胜率或收益置信度',
    unknownSignalPct: undefined, targetIndustryRangePct: [0, input.policy.maxIndustryRatio * 100],
    currentIndustryWeightPct: currentIndustry, proposedIndustryWeightPct: proposedIndustry,
    proposedCashWeightPct: cash, verifiedMappingCoveragePct: coverage, productMappingCoveragePct: coverage,
    riskDiagnostics: undefined, alternatives, actions, gates, policySource: input.policySource,
    adjustmentPlan: { completed: remainingCash <= .01 && remainingIndustry <= .01 && !selected.hardViolations.length, remainingCashGapPct: remainingCash, remainingIndustryReductionPct: remainingIndustry, steps: [
      { stage: 1, label: picked ? '核验选定方案' : holdAdvice ? '维持当前组合' : '补齐决定方案的证据', detail: alternatives.selectionReason, executable: holdAdvice },
      ...(selectedHasTrades ? [{ stage: 2, label: '按产品机制确认交易', detail: '场内ETF复核实时盘口；场外基金复核申请截止、净值日期、适用费率及到账安排。研究期限独立于订单有效期。', executable: false }] : []),
      { stage: selectedHasTrades ? 3 : 2, label: '追踪决策价值', detail: selected.proposal?.nextReview || '新披露或下一次账户同步后复核，与保持组合和原规则同期对比。', executable: false },
    ] },
    disclaimer: '金额是待执行校验的研究方案。场外份额按参考净值估算，实际申赎价格未知；系统不自动交易。',
  }
}
