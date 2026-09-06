import { describe, expect, it } from 'vitest'
import { buildPortfolioDecisionSupport, resolveHoldingMapping, type RiskBudget } from '../decision-support'
import type { Decision, Evaluation } from '@/lib/research/contracts'

const decision = (ticker: string, state: Decision['state']): Decision => ({
  ticker, name: '芯片指数基金华夏', indexCode: '980017.SZ', state, unheldAction: '观望', heldAction: '观望', reason: '规则状态', trigger: '连续三日确认', invalidation: '跌破均线', horizon: '20日', evidence: [], conditions: [], gaps: [], evidenceIds: [], expiresAt: '2026-09-07', researchOnly: true,
  metrics: { date: '2026-09-04', ma20: 1, ma60: 1, return20Pct: -2, relative20Pct: -1, volatilityPct: 20, premiumPct: 0, amount20: 1e8, flowSum: -1, flowNetPct: -2, flowDays: 5, adjusted: true, trackingErrorPct: 1, disclosedWeightPct: 80 },
})
const evaluation = (state: Decision['state'] = 'risk-off') => ({ version: 1, snapshotId: 's', asOf: '2026-09-05T09:00:00.000Z', profile: { version: 1, industryId: 'ai', name: '人工智能算力硬件', benchmark: '000300.SH', horizonDays: 20, sectors: [], segments: [], leaders: [], rules: { minHistory: 60, maxPremiumPct: 1, minDailyAmount: 2e7, maxSpreadBps: 20, maxVolatilityPct: 50, flowDays: 5, entryConfirmDays: 3 } }, expectedSession: '2026-09-04', calendarVerified: true, validation: 'experimental-not-backtest-validated', decisions: [decision('159995', state)], indexBreadth: { mappedIndices: 1, usableIndices: 1, aboveMA20: 0, coverage: 1 }, modules: {}, events: [], changes: [], previousSnapshotId: null, evidence: [] }) as Evaluation
const policy: RiskBudget = { riskProfile: 'moderate', investHorizon: 'medium', minCashRatio: .1, maxIndustryRatio: .2, maxFundRatio: .15, maxSingleAdjustmentRatio: .05, stagedAdjustment: true }

describe('portfolio decision support', () => {
  it('prefers explicit feeder mapping over name inference', () => {
    const mapping = resolveHoldingMapping({ ticker: '017470', name: '嘉实芯片ETF联接C', targetEtfCode: '159995', targetIndexCode: '980017.SZ', weightPct: 10, marketValue: 10000 }, evaluation())
    expect(mapping).toMatchObject({ method: 'manual', decisionTicker: '159995', verified: true })
  })

  it('keeps broad sector-name matches as proxies instead of inventing an ETF identity', () => {
    const mapping = resolveHoldingMapping({ ticker: '017470', name: '嘉实上证科创板芯片ETF发起联接C', industry: '人工智能算力硬件', weightPct: 10, marketValue: 10000 }, evaluation())
    expect(mapping).toMatchObject({ method: 'domain-proxy', targetEtfCode: null, decisionTicker: null, fundType: 'feeder' })
  })

  it('turns a risk-off domain above the policy band into a confidence-rated reduction recommendation', () => {
    const support = buildPortfolioDecisionSupport({ evaluation: evaluation(), totalAssets: 100000, cashWeightPct: 3, policy, dataQualityAvailable: true, validationApproved: false, portfolioAsOf: new Date().toISOString(), holdings: [
      { ticker: '017470', name: '嘉实芯片ETF联接C', industry: 'AI算力硬件', targetEtfCode: '159995', targetIndexCode: '980017.SZ', mappingConfidence: 1, redemptionFeePct: .5, costNav: 1, unitNav: 2, weightPct: 19, marketValue: 19000 },
    ] })
    expect(support.targetIndustryRangePct).toEqual([0, 15])
    expect(support.proposedIndustryWeightPct).toBe(15)
    expect(support.proposedCashWeightPct).toBe(7)
    expect(support.actions[0]).toMatchObject({ action: '减仓', amount: 4000, executable: false })
    expect(support.gates.find(item => item.key === 'validation')).toBeUndefined()
    expect(support.readiness).toBe('limited-advice')
    expect(support.adjustmentPlan).toMatchObject({ completed: false, remainingCashGapPct: 3 })
    expect(support.adjustmentPlan.steps.some(item=>item.label==='组合级现金底仓修复')).toBe(true)
  })

  it('only marks actions executable after every portfolio and strategy gate passes', () => {
    const support = buildPortfolioDecisionSupport({ evaluation: evaluation(), totalAssets: 100000, cashWeightPct: 10, policy, dataQualityAvailable: true, validationApproved: true, portfolioAsOf: new Date().toISOString(), holdings: [
      { ticker: '017470', name: '嘉实芯片ETF联接C', targetEtfCode: '159995', targetIndexCode: '980017.SZ', mappingConfidence: 1, redemptionFeePct: 0, costNav: 1, unitNav: 2, weightPct: 19, marketValue: 19000 },
    ] })
    expect(support.readiness).toBe('advice-ready')
    expect(support.actions[0].action).toBe('减仓')
    expect(support.adjustmentPlan.completed).toBe(true)
  })
})
