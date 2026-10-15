import { describe, expect, it } from 'vitest'
import { comparePortfolioAlternatives, parseAllocationResearch, portfolioCovarianceRisk, type AllocationResearch, type PlanningHolding } from '../alternatives'
import type { RiskBudget } from '../decision-support'

const policy: RiskBudget = { riskProfile: 'moderate', investHorizon: 'medium', minCashRatio: .1, maxFundRatio: .5, maxIndustryRatio: .4, maxSingleAdjustmentRatio: .1, stagedAdjustment: true }
const holdings: PlanningHolding[] = [
  { ticker: 'A', name: '芯片联接', industry: '芯片', weightPct: 30, marketValue: 30000, unitNav: 2, navDate: '2026-09-10', researchReady: true, redemptionFeePct: .5, buyFeePct: 0, settlementDays: 3 },
  { ticker: 'B', name: '其他资产', weightPct: 50, marketValue: 50000, unitNav: 1, navDate: '2026-09-10', researchReady: true, redemptionFeePct: 0, buyFeePct: 0, settlementDays: 2 },
]
const research = (): AllocationResearch => ({ version: 1, preferredId: 'reduce', selectionReason: '短期风险改善值得支付费用，保留长期核心暴露', evidenceBoundary: '压力损益不是概率预测', proposals: [{ id: 'reduce', title: '部分降低风险', horizonDays: 20, objective: 'risk-reduction', targets: [{ ticker: 'A', targetWeightPct: 25 }], thesisIds: ['thesis'], evidenceIds: ['evidence'], whyNow: '订单假设出现反证', whyNotHold: '降低熊市情景损失', sizingRationale: '在风险降低和上涨参与之间保留核心暴露', invalidation: '订单恢复', nextReview: '下次订单披露', opportunityCost: '反弹时少参与收益' }], scenarios: [{ id: 'bear', label: '订单恶化', horizonDays: 20, basis: '基于订单证据构造条件压力区间', evidenceIds: ['evidence'], returns: [{ ticker: 'A', lowerPct: -20, upperPct: -10 }] }, { id: 'bull', label: '订单恢复', horizonDays: 20, basis: '假设修复，不声称预测', evidenceIds: ['evidence'], returns: [{ ticker: 'A', lowerPct: 10, upperPct: 20 }] }] })
const input = () => ({ asOf: '2026-09-11T00:00:00Z', holdings, totalAssets: 100000, cashWeightPct: 20, policy, industryTickers: ['A'], research: research(), researchQualityPassed: true, thesisProducts: { thesis: ['A'] } })

describe('research portfolio alternatives', () => {
  it('computes fees and conditional improvement using the unchanged portfolio as the baseline', () => {
    const result = comparePortfolioAlternatives(input())
    const plan = result.alternatives.find(item => item.id === 'reduce')!
    expect(result.selectedId).toBe('reduce')
    expect(plan.trades[0]).toMatchObject({ amount: 5000, estimatedFee: 25, estimatedUnits: 2500 })
    expect(plan.netCashWeightPct).toBe(24.98)
    expect(plan.immediatelyAvailableCashWeightPct).toBe(20)
    expect(plan.stress[0].improvementVsHoldPct).toEqual([.48, .98])
    expect(plan.stress[1].improvementVsHoldPct).toEqual([-1.02, -.52])
    // Other holdings are unknown, so whole-account scenario returns are not fabricated.
    expect(plan.stress[0].accountReturnRangePct).toBeNull()
    expect(plan.feeBreakEvenPct).toBe(.5)
  })
  it('never automatically chooses technical-rule reductions when research is absent', () => {
    const result = comparePortfolioAlternatives({ ...input(), research: null, rulesTargets: [{ ticker: 'A', targetWeightPct: 20 }] })
    expect(result.selectedId).toBe('hold')
    expect(result.alternatives.find(item => item.id === 'rules')?.trades[0].amount).toBe(10000)
  })
  it('preserves a conditional risk plan but never invents unknown fees or settled cash', () => {
    const result = comparePortfolioAlternatives({ ...input(), holdings: holdings.map(item => ({ ...item, redemptionFeePct: null })) })
    const plan = result.alternatives.find(item => item.id === 'reduce')!
    expect(plan.trades[0].amount).toBe(5000)
    expect(plan.totalFee).toBeNull()
    expect(plan.netCashWeightPct).toBeNull()
    expect(plan.stress[0].improvementVsHoldPct).toBeNull()
    expect(plan.executionGaps.join('')).toContain('费用')
  })
  it('rejects extra risk bought with unsettled redemptions and enforces the cash reserve', () => {
    const request = research()
    request.proposals[0].targets = [{ ticker: 'A', targetWeightPct: 20 }, { ticker: 'B', targetWeightPct: 60 }]
    const result = comparePortfolioAlternatives({ ...input(), research: request, cashWeightPct: 10, holdings: [holdings[0], { ...holdings[1], weightPct: 60, marketValue: 60000 }] })
    expect(result.selectedId).toBe('hold')
    expect(result.reviewIssues.length).toBeGreaterThan(0)
  })
  it('rejects recommendations that violate adjustment limits, instead of silently clipping sizes', () => {
    const request = research()
    request.proposals[0].targets[0].targetWeightPct = 10
    const result = comparePortfolioAlternatives({ ...input(), research: request })
    expect(result.selectedId).toBe('hold')
    expect(result.reviewIssues.join('')).toContain('单次调整上限')
  })
  it('requires the adjusted product to have its own verified thesis exposure', () => {
    const result = comparePortfolioAlternatives({ ...input(), thesisProducts: { thesis: ['UNRELATED'] } })
    expect(result.selectedId).toBe('hold')
    expect(result.reviewIssues.join('')).toContain('核验暴露')
  })
  it('does not label a cash-deficient no-trade portfolio safe', () => {
    const result = comparePortfolioAlternatives({ ...input(), research: null, cashWeightPct: 5, holdings: [{ ...holdings[0], weightPct: 45 }, holdings[1]] })
    expect(result.status).toBe('constraint-review-required')
  })

  it('accepts the explicit one percent cash floor when current cash is above it', () => {
    const result = comparePortfolioAlternatives({ ...input(), research: null, cashWeightPct: 3.42, policy: { ...policy, minCashRatio: .01, maxFundRatio: .8 }, holdings: [holdings[0], { ...holdings[1], weightPct: 66.58, marketValue: 66580 }] })
    expect(result.status).toBe('hold-pending-evidence')
    expect(result.alternatives[0].hardViolations).toEqual([])
    expect(result.selectionReason).toContain('建议维持当前组合')
  })
  it('requires a matching scenario horizon and source-valid proposal identities', () => {
    const request = research()
    request.proposals[0].horizonDays = 252
    expect(comparePortfolioAlternatives({ ...input(), research: request }).selectedId).toBe('hold')
    request.proposals[0].evidenceIds = ['invented']
    expect(() => parseAllocationResearch(request, ['A', 'B'], ['evidence'], ['thesis'])).toThrow('冻结证据')
  })
  it('rejects duplicate targets and unbounded stress assumptions', () => {
    const request = research()
    request.proposals[0].targets.push({ ticker: 'A', targetWeightPct: 20 })
    expect(() => parseAllocationResearch(request, ['A', 'B'], ['evidence'], ['thesis'])).toThrow('权重无效')
    request.proposals[0].targets.pop()
    request.scenarios[0].returns[0].lowerPct = -101
    expect(() => parseAllocationResearch(request, ['A', 'B'], ['evidence'], ['thesis'])).toThrow('区间')
  })
  it('calculates covariance on common intervals and refuses to treat missing holdings as zero risk', () => {
    const dates = Array.from({ length: 75 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10))
    const nav = dates.map((date, i) => ({ date, nav: 1 + (i % 2) * .02 }))
    const known = holdings.map(item => ({ ...item, navHistory: nav }))
    const weights = holdings.map(item => ({ ticker: item.ticker, weightPct: item.weightPct! }))
    expect(portfolioCovarianceRisk(known, weights, '2026-09-11').annualizedVolatilityPct).toBeGreaterThan(20)
    expect(portfolioCovarianceRisk([known[0], holdings[1]], weights, '2026-09-11').annualizedVolatilityPct).toBeNull()
    const future = [...nav, { date: '2027-01-01', nav: 10 }]
    expect(portfolioCovarianceRisk(known.map(item => ({ ...item, navHistory: future })), weights, '2026-09-11')).toEqual(portfolioCovarianceRisk(known, weights, '2026-09-11'))
  })
  it('cannot bypass investment research by labeling a cash-rich purchase cash repair or wait', () => {
    for (const objective of ['cash-repair', 'wait'] as const) {
      const request = research()
      request.proposals[0] = { ...request.proposals[0], objective, targets: [{ ticker: 'A', targetWeightPct: 30 }], thesisIds: [] }
      request.scenarios = []
      const result = comparePortfolioAlternatives({ ...input(), holdings: [{ ...holdings[0], weightPct: 20, marketValue: 20000 }], cashWeightPct: 80, policy: { ...policy, minCashRatio: 0 }, research: request })
      expect(result.selectedId).toBe('hold')
      expect(result.reviewIssues.join('')).toMatch(/现金修复|等待方案/)
    }
  })
  it('cannot use a profitable long-horizon case to hide a short-horizon after-fee loss', () => {
    const request = research()
    request.proposals[0] = { ...request.proposals[0], objective: 'return', targets: [{ ticker: 'A', targetWeightPct: 19 }] }
    request.scenarios[0].returns = [{ ticker: 'A', lowerPct: -.1, upperPct: -.1 }]
    request.scenarios[1].returns = [{ ticker: 'A', lowerPct: 1, upperPct: 1 }]
    request.scenarios.push({ ...request.scenarios[0], id: 'long', horizonDays: 120, returns: [{ ticker: 'A', lowerPct: -20, upperPct: -20 }] })
    const result = comparePortfolioAlternatives({ ...input(), holdings: [{ ...holdings[0], weightPct: 20, marketValue: 20000, redemptionFeePct: 1 }], cashWeightPct: 80, research: request })
    expect(result.selectedId).toBe('hold')
    expect(result.reviewIssues.join('')).toContain('同期限已计费用')
  })
  it('uses actual market value for liquidation and never sells extra shares due to display rounding', () => {
    const request = research()
    request.proposals[0].targets[0].targetWeightPct = 0
    const result = comparePortfolioAlternatives({ ...input(), holdings: [{ ...holdings[0], marketValue: 1236, weightPct: 1.24, quantity: 1236, unitNav: 1, redemptionFeePct: 0 }], cashWeightPct: 98.764, research: request })
    expect(result.selectedId).toBe('reduce')
    const trade = result.alternatives.find(item => item.id === 'reduce')!.trades[0]
    expect(trade.amount).toBe(1236)
    expect(trade.estimatedUnits).toBe(1236)
    expect(trade.changeWeightPct).toBe(-1.236)
  })
  it('deducts redemption fees on arrival without inventing a negative current cash balance', () => {
    const request = research()
    request.proposals[0] = { ...request.proposals[0], objective: 'cash-repair', targets: [{ ticker: 'A', targetWeightPct: 90 }], thesisIds: [] }
    const result = comparePortfolioAlternatives({ ...input(), holdings: [{ ...holdings[0], weightPct: 100, marketValue: 100000, quantity: 50000, unitNav: 2, redemptionFeePct: 1 }], cashWeightPct: 0, research: request })
    const plan = result.alternatives.find(item => item.id === 'reduce')!
    expect(plan.immediatelyAvailableCashWeightPct).toBe(0)
    expect(plan.netCashWeightPct).toBe(9.9)
  })
  it('rejects a source position whose market value cannot be reconciled to shares and NAV', () => {
    const request = research()
    request.proposals[0].targets[0].targetWeightPct = 90
    const result = comparePortfolioAlternatives({ ...input(), holdings: [{ ...holdings[0], weightPct: 100, marketValue: 100000, quantity: 5000, unitNav: 1 }], cashWeightPct: 0, research: request })
    expect(result.selectedId).toBe('hold')
    expect(result.reviewIssues.join('')).toContain('持仓金额与份额')
  })
})

