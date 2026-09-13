import type { PortfolioHoldingInput, RiskBudget } from './decision-support'

export type PlanningHolding = PortfolioHoldingInput & {
  researchReady?: boolean
  researchEvidenceIds?: string[]
  buyFeePct?: number | null
  navHistory?: Array<{ date: string; nav: number }>
  navDate?: string | null
  executionGaps?: string[]
  executionGapsBySide?: { buy: string[]; sell: string[] }
  settlementDays?: number | null
}
export type PortfolioProposal = {
  id: string
  title: string
  horizonDays: number
  objective: 'return' | 'risk-reduction' | 'cash-repair' | 'wait'
  targets: Array<{ ticker: string; targetWeightPct: number }>
  thesisIds: string[]
  evidenceIds: string[]
  whyNow: string
  whyNotHold: string
  sizingRationale: string
  invalidation: string
  nextReview: string
  opportunityCost: string
}
export type StressScenario = {
  id: string
  label: string
  horizonDays: number
  basis: string
  evidenceIds: string[]
  // Conditional assumptions, never probabilities or forecasts disguised as facts.
  returns: Array<{ ticker: string; lowerPct: number; upperPct: number }>
}
export type AllocationResearch = {
  version: 1
  fundTheses?: Array<{ id: string; ticker: string; hypothesis: string; evidenceIds: string[]; counterEvidence: string; invalidation: string; horizonDays: number }>
  proposals: PortfolioProposal[]
  scenarios: StressScenario[]
  preferredId: string
  selectionReason: string
  evidenceBoundary: string
}
export type AlternativeTrade = {
  ticker: string; currentWeightPct: number; targetWeightPct: number; changeWeightPct: number
  amount: number; estimatedUnits: number | null; estimatedFee: number | null
  executionGaps: string[]; settlementDays: number | null
}
export type Alternative = {
  id: string; title: string; source: 'hold' | 'rules' | 'research' | 'constraint'
  horizonDays: number | null; proposal?: PortfolioProposal
  trades: AlternativeTrade[]; targetWeights: Array<{ ticker: string; weightPct: number }>
  grossCashWeightPct: number; netCashWeightPct: number | null; immediatelyAvailableCashWeightPct: number
  totalFee: number | null; turnoverPct: number; feeBreakEvenPct: number | null
  hardViolations: string[]; researchIssues: string[]; executionGaps: string[]
  stress: Array<{ id: string; label: string; coveredWeightPct: number; accountReturnRangePct: [number, number] | null; improvementVsHoldPct: [number, number] | null; grossImprovementVsHoldPct?: [number, number] | null; maximumCostRateForImprovementPct?: number | null; basis: string }>
  risk: { commonObservations: number; coveragePct: number; annualizedVolatilityPct: number | null; coveredCommonObservations?: number; coveredAnnualizedVolatilityPct?: number | null; missingTickers?: string[]; basis: string }
}
export type PortfolioAlternatives = {
  version: 1; asOf: string; selectedId: string; selectionReason: string; requestedId: string | null
  alternatives: Alternative[]; reviewIssues: string[]; evidenceBoundary: string
  status: 'research-selected' | 'hold-pending-evidence' | 'constraint-review-required'
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const round = (value: number) => Math.round(value * 100) / 100
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export function parseAllocationResearch(value: unknown, allowedTickers: string[], evidenceIds: string[], thesisIds: string[], underlyingResearchTickers: string[] = []): AllocationResearch {
  const parsed = typeof value === 'string' ? JSON.parse(value.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('组合研究输出字段类型错误：必须为对象')
  const data = parsed as AllocationResearch
  const fail = (message: string): never => { throw new Error('组合研究输出校验失败：' + message) }
  if (data.version !== 1) fail('version必须为数字1')
  if (!Array.isArray(data.proposals) || data.proposals.length > 3) fail('proposals必须是最多3项的数组')
  if (!Array.isArray(data.scenarios) || data.scenarios.length > 8) fail('scenarios必须是最多8项的数组；可按基金及期限拆分压力情景')
  if (!nonempty(data.selectionReason) || !nonempty(data.evidenceBoundary)) fail('缺少方案取舍与证据边界')
  const privateIds = new Set(thesisIds)
  if (data.fundTheses !== undefined && (!Array.isArray(data.fundTheses) || data.fundTheses.length > 12)) fail('基金假设必须是最多12项的数组')
  for (const thesis of data.fundTheses || []) {
    if (!thesis || !nonempty(thesis.id) || privateIds.has(thesis.id) || ![...allowedTickers,...underlyingResearchTickers].includes(thesis.ticker) || !nonempty(thesis.hypothesis) || !nonempty(thesis.counterEvidence) || !nonempty(thesis.invalidation) || !finite(thesis.horizonDays) || thesis.horizonDays < 1 || thesis.horizonDays > 756 || !strings(thesis.evidenceIds) || !thesis.evidenceIds.length || thesis.evidenceIds.some(id => !evidenceIds.includes(id))) fail('基金假设必须针对账户基金或已核验底层ETF，引用冻结证据并给出期限和反证')
    privateIds.add(thesis.id)
  }
  const ids = new Set(['hold', 'rules', 'constraint'])
  for (const proposal of data.proposals) {
    if (!proposal || !nonempty(proposal.id) || ids.has(proposal.id)) fail('方案编号重复或使用保留编号')
    ids.add(proposal.id)
    if (!['return', 'risk-reduction', 'cash-repair', 'wait'].includes(proposal.objective)) fail('未知的投资目标')
    if (!finite(proposal.horizonDays) || !Number.isInteger(proposal.horizonDays) || proposal.horizonDays < 1 || proposal.horizonDays > 756) fail('投资期限无效')
    for (const field of ['title', 'whyNow', 'whyNotHold', 'sizingRationale', 'invalidation', 'nextReview', 'opportunityCost'] as const) if (!nonempty(proposal[field])) fail('方案缺少' + field)
    // Cash-repair evidence is the frozen account and the user's policy, verified below;
    // it need not cite an unrelated public-market document to prove a cash shortfall.
    if (!strings(proposal.evidenceIds) || !proposal.evidenceIds.length && proposal.objective !== 'cash-repair' || proposal.evidenceIds.some(id => !evidenceIds.includes(id))) fail('投资方案必须引用冻结证据；现金修复仅依据冻结账户约束核验')
    if (!strings(proposal.thesisIds) || proposal.thesisIds.some(id => !privateIds.has(id))) fail('引用了不存在的投资假设')
    if (!Array.isArray(proposal.targets)) fail('目标仓位必须为数组')
    const tickers = new Set<string>()
    for (const target of proposal.targets) {
      if (!target || !allowedTickers.includes(target.ticker) || tickers.has(target.ticker) || !finite(target.targetWeightPct) || target.targetWeightPct < 0 || target.targetWeightPct > 100) fail('目标基金或权重无效')
      tickers.add(target.ticker)
    }
  }
  const scenarioIds = new Set<string>()
  for (const scenario of data.scenarios) {
    if (!scenario || !nonempty(scenario.id) || scenarioIds.has(scenario.id) || !nonempty(scenario.label) || !nonempty(scenario.basis)) fail('压力情景缺少身份或假设说明')
    scenarioIds.add(scenario.id)
    if (!finite(scenario.horizonDays) || scenario.horizonDays < 1 || scenario.horizonDays > 756) fail('情景期限无效')
    if (!strings(scenario.evidenceIds) || !scenario.evidenceIds.length || scenario.evidenceIds.some(id => !evidenceIds.includes(id))) fail('压力假设必须绑定事实依据')
    if (!Array.isArray(scenario.returns)) fail('压力收益区间无效')
    const tickers = new Set<string>()
    for (const item of scenario.returns) {
      if (!item || !allowedTickers.includes(item.ticker) || tickers.has(item.ticker) || !finite(item.lowerPct) || !finite(item.upperPct) || item.lowerPct < -100 || item.upperPct > 500 || item.lowerPct > item.upperPct) fail('压力收益区间或基金无效')
      tickers.add(item.ticker)
    }
  }
  if (data.preferredId !== 'hold' && !data.proposals.some(item => item.id === data.preferredId)) fail('只能选择不交易或已提交的研究方案')
  return data
}

/** Uses the same dated returns for every asset, including zero returns. Missing assets never become zero-risk cash. */
export function portfolioCovarianceRisk(holdings: PlanningHolding[], weights: Array<{ ticker: string; weightPct: number }>, asOf: string): Alternative['risk'] {
  const active = weights.filter(item => item.weightPct > 0)
  const series = active.map(item => {
    const rows = [...(holdings.find(holding => holding.ticker === item.ticker)?.navHistory || [])].filter(row => row.date <= asOf.slice(0, 10) && finite(row.nav) && row.nav > 0).sort((a, b) => a.date.localeCompare(b.date))
    const unique = [...new Map(rows.map(row => [row.date, row])).values()]
    return { ...item, returns: new Map(unique.slice(1).map((row, index) => [unique[index].date + '/' + row.date, row.nav / unique[index].nav - 1])) }
  })
  const total = active.reduce((sum, item) => sum + item.weightPct, 0)
  const eligible = series.filter(item => item.returns.size >= 60)
  const covered = eligible.reduce((sum, item) => sum + item.weightPct, 0)
  const dates = series.length ? [...series[0].returns.keys()].filter(date => series.every(item => item.returns.has(date))).slice(-252) : []
  const values = dates.map(date => series.reduce((sum, item) => sum + item.weightPct / 100 * item.returns.get(date)!, 0))
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0
  const coveredDates = eligible.length ? [...eligible[0].returns.keys()].filter(date => eligible.every(item => item.returns.has(date))).slice(-252) : []
  const coveredValues = coveredDates.map(date => eligible.reduce((sum, item) => sum + item.weightPct / covered * item.returns.get(date)!, 0))
  const coveredMean = coveredValues.length ? coveredValues.reduce((sum, value) => sum + value, 0) / coveredValues.length : 0
  const coveredVariance = coveredValues.length > 1 ? coveredValues.reduce((sum, value) => sum + (value - coveredMean) ** 2, 0) / (coveredValues.length - 1) : 0
  return { commonObservations: dates.length, coveragePct: total ? round(covered / total * 100) : 100, annualizedVolatilityPct: !total ? 0 : dates.length >= 60 ? round(Math.sqrt(variance * 252) * 100) : null,
    coveredCommonObservations: coveredDates.length, coveredAnnualizedVolatilityPct: coveredDates.length >= 60 && covered > 0 ? round(Math.sqrt(coveredVariance * 252) * 100) : null,
    missingTickers: series.filter(item => item.returns.size < 60).map(item => item.ticker),
    basis: '全账户指标要求所有持仓至少60个共同收益区间；同时计算已覆盖子组合，并按其内部权重归一化。未覆盖资产明确列出，不按零风险处理。历史风险不预测未来。' }
}

export function comparePortfolioAlternatives(input: {
  asOf: string; holdings: PlanningHolding[]; totalAssets: number; cashWeightPct: number; policy: RiskBudget
  industryTickers: string[]; research?: AllocationResearch | null; rulesTargets?: Array<{ ticker: string; targetWeightPct: number }>
  researchQualityPassed: boolean; thesisProducts?: Record<string, string[]>
}): PortfolioAlternatives {
  const { holdings, policy, totalAssets, cashWeightPct, research } = input
  const current = holdings.map(item => ({ ticker: item.ticker, weightPct: finite(item.marketValue) && totalAssets > 0 ? item.marketValue / totalAssets * 100 : item.weightPct ?? 0 }))
  const initialIndustry = current.filter(item => input.industryTickers.includes(item.ticker)).reduce((sum, item) => sum + item.weightPct, 0)
  const accountIssues: string[] = []
  if (!finite(totalAssets) || totalAssets <= 0 || !finite(cashWeightPct) || cashWeightPct < 0 || cashWeightPct > 100 || current.some(item => !finite(item.weightPct) || item.weightPct < 0) || Math.abs(current.reduce((sum, item) => sum + item.weightPct, 0) + cashWeightPct - 100) > .15 || new Set(current.map(item => item.ticker)).size !== current.length) accountIssues.push('账户权重、现金与总资产不守恒，需重新同步')
  if (holdings.some(holding => !finite(holding.marketValue) || holding.marketValue < 0 || holding.quantity != null && holding.unitNav != null && (!finite(holding.quantity) || holding.quantity < 0 || !finite(holding.unitNav) || holding.unitNav <= 0 || Math.abs(holding.quantity * holding.unitNav - holding.marketValue) > Math.max(.05, holding.marketValue * 1e-6)))) accountIssues.push('持仓金额与份额、参考净值不一致，不能据此估算赎回收入')
  const plans: Array<{ id: string; title: string; source: Alternative['source']; targets: PortfolioProposal['targets']; proposal?: PortfolioProposal }> = [
    { id: 'hold', title: '保持当前组合', source: 'hold', targets: [] },
    { id: 'rules', title: '原技术规则对照（不自动采用）', source: 'rules', targets: input.rulesTargets || [] },
    ...(research?.proposals || []).map(proposal => ({ id: proposal.id, title: proposal.title, source: 'research' as const, targets: proposal.targets, proposal })),
  ]
  const alternatives: Alternative[] = plans.map(plan => {
    const targets = new Map(plan.targets.map(target => [target.ticker, target.targetWeightPct]))
    const weights = current.map(item => ({ ticker: item.ticker, weightPct: targets.get(item.ticker) ?? item.weightPct }))
    const hardViolations = [...accountIssues]
    if (plan.targets.some(target => !current.some(item => item.ticker === target.ticker))) hardViolations.push('方案含账户研究范围外产品')
    if (weights.some(item => !finite(item.weightPct) || item.weightPct < 0)) hardViolations.push('目标权重无效')
    const trades: AlternativeTrade[] = weights.flatMap(item => {
      const before = current.find(row => row.ticker === item.ticker)!.weightPct
      const rawChange = item.weightPct - before
      if (Math.abs(rawChange) < 1e-8) return []
      const holding = holdings.find(row => row.ticker === item.ticker)!
      // Calculate money from full precision; a displayed percentage must never increase a liquidation.
      const rawAmount = Math.abs(rawChange) / 100 * totalAssets
      const amount = rawChange < 0 && finite(holding.marketValue) ? Math.min(round(rawAmount), Math.floor(holding.marketValue * 100 + 1e-7) / 100) : round(rawAmount)
      if (amount <= 0) { item.weightPct = before; return [] }
      const change = Math.sign(rawChange) * amount / totalAssets * 100
      item.weightPct = before + change
      const feePct = change < 0 ? holding.redemptionFeePct : holding.buyFeePct
      const fee = finite(feePct) && feePct >= 0 && feePct <= 100 ? round(amount * feePct / 100) : null
      const gaps = [...(holding.executionGapsBySide?.[change < 0 ? 'sell' : 'buy'] || holding.executionGaps || [])]
      if (!holding.researchReady) gaps.push('该基金的自身持仓或正式跟踪关系尚未核验')
      if (fee === null) gaps.push(change < 0 ? '实际持有批次及适用赎回费用待核验' : '实际申购或交易费用待核验')
      if (!holding.navDate) gaps.push('持仓净值业务日期待核验')
      if (change < 0 && holding.settlementDays == null) gaps.push('赎回到账时间待核验')
      const referenceUnits = finite(holding.unitNav) && holding.unitNav > 0 ? Math.floor(amount / holding.unitNav * 100 + 1e-7) / 100 : null
      return [{ ticker: item.ticker, currentWeightPct: before, targetWeightPct: item.weightPct, changeWeightPct: change, amount, estimatedUnits: referenceUnits === null ? null : change < 0 && finite(holding.quantity) ? Math.min(referenceUnits, holding.quantity) : referenceUnits, estimatedFee: fee, executionGaps: [...new Set(gaps)], settlementDays: holding.settlementDays ?? null }]
    })
    const buys = trades.filter(trade => trade.changeWeightPct > 0).reduce((sum, trade) => sum + trade.changeWeightPct, 0)
    const sells = -trades.filter(trade => trade.changeWeightPct < 0).reduce((sum, trade) => sum + trade.changeWeightPct, 0)
    const totalFee = trades.every(trade => trade.estimatedFee !== null) ? round(trades.reduce((sum, trade) => sum + trade.estimatedFee!, 0)) : null
    const feeWeight = totalFee === null ? null : totalFee / totalAssets * 100
    const grossCash = cashWeightPct + sells - buys
    const netCash = feeWeight === null ? null : grossCash - feeWeight
    // Redemption fees are deducted from unsettled proceeds, not from today's cash balance.
    const immediateBuyFees = trades.filter(trade => trade.changeWeightPct > 0).reduce((sum, trade) => sum + (trade.estimatedFee ?? 0), 0) / totalAssets * 100
    const immediateCash = cashWeightPct - buys - immediateBuyFees
    const industry = weights.filter(item => input.industryTickers.includes(item.ticker)).reduce((sum, item) => sum + item.weightPct, 0)
    if (grossCash < -.01 || (netCash !== null && netCash < -.01)) hardViolations.push('资金不足，费用后现金为负')
    if (buys > Math.max(0, cashWeightPct - policy.minCashRatio * 100) + .01) hardViolations.push('买入需要等待赎回到账并重新核验现金，当前不得同步执行')
    if (buys > 0 && immediateCash < policy.minCashRatio * 100 - .01) hardViolations.push('买入及当即支付的费用将突破现金底线')
    if (Math.max(buys, sells) > policy.maxSingleAdjustmentRatio * 100 + .01) hardViolations.push('超出用户单次调整上限')
    if (industry > policy.maxIndustryRatio * 100 + .01 && industry >= initialIndustry - .01) hardViolations.push('未改善已超限的产业仓位')
    if (weights.some(item => item.weightPct > policy.maxFundRatio * 100 + .01 && item.weightPct >= current.find(row => row.ticker === item.ticker)!.weightPct - .01)) hardViolations.push('未改善已超限的单基金仓位')
    if ((netCash ?? grossCash) < policy.minCashRatio * 100 - .01 && (netCash ?? grossCash) <= cashWeightPct + .01) hardViolations.push('现金低于用户底线且方案未改善')
    const researchIssues: string[] = []
    if (plan.source === 'research' && trades.length) {
      if (!input.researchQualityPassed) researchIssues.push('上游事实或模型研究未通过校验')
      if (!plan.proposal!.thesisIds.length && !['cash-repair'].includes(plan.proposal!.objective)) researchIssues.push('缺少可追溯投资假设')
      if (plan.proposal!.objective === 'wait') researchIssues.push('等待方案不能包含交易；需改为有投资依据的调整方案')
      if (plan.proposal!.objective === 'cash-repair') {
        if (cashWeightPct >= policy.minCashRatio * 100 - .01) researchIssues.push('没有低于用户现金底线，不得以现金修复豁免投资研究')
        if (buys > 0) researchIssues.push('现金修复方案不得借该标签新增买入')
        if (netCash === null || netCash <= cashWeightPct + .001) researchIssues.push('现金修复尚未证明费用后现金净改善')
      }
      for (const trade of trades) {
        const holding = holdings.find(item => item.ticker === trade.ticker)!
        if (!holding.researchReady) researchIssues.push(`${trade.ticker}尚未建立产品级研究依据`)
        if (input.thesisProducts && !['cash-repair'].includes(plan.proposal!.objective) && !plan.proposal!.thesisIds.some(id => input.thesisProducts![id]?.some(ticker => ticker === trade.ticker || ticker === holding.targetEtfCode))) researchIssues.push(`${trade.ticker}不在所引假设的核验暴露中`)
      }
    }
    const stress = (research?.scenarios || []).map(scenario => {
      const covered = weights.filter(item => item.weightPct > 0 && scenario.returns.some(row => row.ticker === item.ticker)).reduce((sum, item) => sum + item.weightPct, 0)
      const full = weights.every(item => item.weightPct === 0 || scenario.returns.some(row => row.ticker === item.ticker))
      const changedCovered = trades.every(trade => scenario.returns.some(row => row.ticker === trade.ticker))
      const accountRange: [number, number] | null = full && feeWeight !== null ? [0, 1].map(index => round(weights.reduce((sum, item) => {
        const row = scenario.returns.find(row => row.ticker === item.ticker)
        return sum + item.weightPct / 100 * (row ? index ? row.upperPct : row.lowerPct : 0)
      }, 0) - feeWeight)) as [number, number] : null
      const grossImprovement: [number, number] | null = changedCovered ? [0, 1].map(index => trades.reduce((sum, trade) => {
        const row = scenario.returns.find(row => row.ticker === trade.ticker)!
        return sum + trade.changeWeightPct / 100 * (trade.changeWeightPct > 0 ? index ? row.upperPct : row.lowerPct : index ? row.lowerPct : row.upperPct)
      }, 0)) as [number, number] : null
      const improvement: [number, number] | null = grossImprovement && feeWeight !== null ? grossImprovement.map(value => round(value - feeWeight)) as [number, number] : null
      const maximumCostRate = grossImprovement && grossImprovement[0] > 0 && buys + sells > 0 ? round(grossImprovement[0] / (buys + sells) * 100) : null
      return { id: scenario.id, label: scenario.label, coveredWeightPct: round(covered), accountReturnRangePct: accountRange, improvementVsHoldPct: improvement, grossImprovementVsHoldPct: grossImprovement ? grossImprovement.map(round) as [number,number] : null, maximumCostRateForImprovementPct: maximumCostRate, basis: `${scenario.horizonDays}个交易日条件压力假设，不是收益预测或概率；${scenario.basis}；未变化持仓在方案差值中抵消，现金回报假设为零。费用临界值按双边交易总额计算，仅表示本情景的改善不被费用吞噬，并非真实费率或收益保证。` }
    })
    const sameHorizonStress = stress.filter(item => research?.scenarios.some(scenario => scenario.id === item.id && scenario.horizonDays === plan.proposal?.horizonDays))
    if (plan.source === 'research' && trades.length && plan.proposal!.objective === 'return' && !sameHorizonStress.some(item => item.improvementVsHoldPct && item.improvementVsHoldPct[0] > 0)) researchIssues.push('没有同期限已计费用情景显示相对持有的稳健改善，不能用其他期限或毛收益支撑调整')
    if (plan.source === 'research' && trades.length && plan.proposal!.objective === 'risk-reduction' && totalFee !== null && !sameHorizonStress.some(item => item.improvementVsHoldPct && item.improvementVsHoldPct[0] > 0)) researchIssues.push('同期限压力中的风险改善不足以覆盖已知费用')
    if (plan.source === 'research' && trades.length && ['return','risk-reduction'].includes(plan.proposal!.objective)) {
      const differences = (research?.scenarios || []).filter(scenario => scenario.horizonDays === plan.proposal!.horizonDays && trades.every(trade => scenario.returns.some(row => row.ticker === trade.ticker))).map(scenario => {
        const endpoints = [0, 1].map(index => trades.reduce((sum, trade) => {
          const range = scenario.returns.find(row => row.ticker === trade.ticker)!
          return sum + trade.changeWeightPct / 100 * (trade.changeWeightPct > 0 ? index ? range.upperPct : range.lowerPct : index ? range.lowerPct : range.upperPct)
        }, 0))
        return endpoints as [number, number]
      })
      if (!differences.some(range => range[0] > 0)) researchIssues.push('条件压力比较未显示调整相对持有的改善，不接受仅有风险标签的方案')
      if (!differences.some(range => range[1] < 0)) researchIssues.push('缺少对调整不利的情景，无法检验机会成本与方案稳健性')
    }
    if (plan.source === 'research' && trades.length && !['cash-repair', 'wait'].includes(plan.proposal!.objective) && !(research?.scenarios || []).some(item => item.horizonDays === plan.proposal!.horizonDays && trades.every(trade => item.returns.some(row => row.ticker === trade.ticker)))) researchIssues.push('缺少与方案期限一致、覆盖调整产品的压力比较')
    return { id: plan.id, title: plan.title, source: plan.source, horizonDays: plan.proposal?.horizonDays ?? null, proposal: plan.proposal, trades, targetWeights: weights, grossCashWeightPct: round(grossCash), netCashWeightPct: netCash === null ? null : round(netCash), immediatelyAvailableCashWeightPct: round(immediateCash), totalFee, turnoverPct: round(buys + sells), feeBreakEvenPct: feeWeight === null || !trades.length ? null : round(feeWeight / Math.max(buys, sells) * 100), hardViolations, researchIssues: [...new Set(researchIssues)], executionGaps: [...new Set(trades.flatMap(trade => trade.executionGaps))], stress, risk: portfolioCovarianceRisk(holdings, weights, input.asOf) }
  })
  const requested = alternatives.find(item => item.id === research?.preferredId)
  const selected = requested?.source === 'research' && !requested.hardViolations.length && !requested.researchIssues.length ? requested : alternatives[0]
  const reviewIssues = requested && requested.id !== selected.id ? [...requested.hardViolations, ...requested.researchIssues] : []
  const holdReason = alternatives[0].hardViolations.length
    ? `当前组合仍有账户硬约束待处理：${alternatives[0].hardViolations.join('；')}`
    : '当前账户硬约束已满足；本轮没有通过核验且优于不交易的主动调整方案，建议维持当前组合，并在关键证据变化后复核。'
  return { version: 1, asOf: input.asOf, selectedId: selected.id, requestedId: research?.preferredId ?? null, selectionReason: research && selected.id === research.preferredId ? research.selectionReason : reviewIssues.length ? '研究方案尚未满足以下条件，暂不形成交易建议：' + reviewIssues.join('；') : holdReason, alternatives, reviewIssues, evidenceBoundary: research?.evidenceBoundary || '没有新增模型配置判断；技术规则仅作对照，不自动分配资金。', status: selected.id !== 'hold' ? 'research-selected' : alternatives[0].hardViolations.length ? 'constraint-review-required' : 'hold-pending-evidence' }
}
