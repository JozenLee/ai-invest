import { describe, expect, it } from 'vitest'
import { evaluateForwardCohort, sealForwardCohort, type ForwardCohort, type ForwardObservation } from '../forward-evaluation'

function fixture() {
  const cohort: ForwardCohort = {
    costs: [{ ticker: 'ETF', buyFeeBps: 100, sellFeeBps: 100, slippageBps: 0, fixedFee: 0 }],
    id: 'cohort-1', firstExecutionSession: '2026-09-09', recordedAt: '2026-09-08T08:00:00Z', currency: 'CNY', initialCash: 500, initialPositions: [{ ticker: 'ETF', units: 50 }],
    plans: (['no-trade', 'rules', 'ai'] as const).map(arm => ({ arm, planId: arm, snapshotId: 'frozen-1', decidedAt: '2026-09-08T07:00:00Z', informationCutoff: '2026-09-08T06:00:00Z', expiresAt: '2026-09-10T08:00:00Z', orders: arm === 'no-trade' ? [] : [{ ticker: 'ETF', units: arm === 'rules' ? -50 : 40 }] })),
  }
  const observations: ForwardObservation[] = [10, 12, 9].map((close, i) => ({ session: `2026-09-${String(9 + i).padStart(2, '0')}`, openAt: `2026-09-${String(9 + i).padStart(2, '0')}T01:30:00Z`, closeAt: `2026-09-${String(9 + i).padStart(2, '0')}T07:00:00Z`, prices: [{ ticker: 'ETF', open: 10, close, sourceId: 'quotes', quality: 'verified', corporateActions: 'verified-none', instrumentType: 'exchange-traded' }] }))
  return { sealed: sealForwardCohort(cohort), asOf: '2026-09-11T08:00:00Z', expectedSessions: observations.map(o => o.session), observations }
}

describe('frozen three-arm forward paper comparison', () => {
  it('compares equal initial capital with explicit costs, actual holding risk and no-trade cash', () => {
    const input = fixture(), original = JSON.stringify(input)
    const out = evaluateForwardCohort(input)
    expect(out.status).toBe('paper-observed')
    expect(out.validation).toBe('not-validated')
    const [hold, rules, ai] = out.results.map(r => r.metrics!)
    expect(hold).toMatchObject({ initialEquity: 1000, finalEquity: 950, totalCosts: 0, turnoverPct: 0 })
    expect(hold.netReturnPct).toBeCloseTo(-5)
    expect(hold.maxDrawdownPct).toBeCloseTo(150 / 1100 * 100)
    expect(rules).toMatchObject({ initialEquity: 1000, finalEquity: 995, totalCosts: 5, maxDrawdownPct: 0.5, turnoverPct: 50 })
    expect(ai).toMatchObject({ initialEquity: 1000, finalEquity: 906, totalCosts: 4, turnoverPct: 40 })
    expect(ai.netReturnPct).toBeCloseTo(-9.4)
    expect(out.comparisons).toHaveLength(3)
    expect(out.comparisons?.find(c => c.arm === 'ai' && c.against === 'rules')?.netReturnDifferencePp).toBeCloseTo(-8.9)
    expect(JSON.stringify(input)).toBe(original)
  })
  it('charges commissions on slipped notional and fixed fees, including for sales', () => {
    const input = fixture(); input.sealed.cohort.costs[0].slippageBps = 100; input.sealed.cohort.costs[0].fixedFee = 2
    input.sealed = sealForwardCohort(input.sealed.cohort)
    const out = evaluateForwardCohort(input)
    expect(out.results[1].metrics?.totalCosts).toBeCloseTo(5 + 4.95 + 2)
    expect(out.results[2].metrics?.totalCosts).toBeCloseTo(4 + 4.04 + 2)
  })
  it('seals a copy and rejects later mutation of frozen plans', () => {
    const input = fixture(); const original = input.sealed.cohort
    const sealed = sealForwardCohort(original)
    original.initialCash = 999
    expect(sealed.cohort.initialCash).toBe(500)
    expect(evaluateForwardCohort(input).reasons).toContain('冻结方案被修改，摘要不一致')
  })
  it.each(['missing-arm', 'future-signal', 'future-information', 'expired', 'oversell', 'unfunded', 'duplicate-order', 'different-snapshot', 'baseline-trade'])(
    'rejects %s without fabricated returns', failure => {
      const input = fixture(), cohort = input.sealed.cohort
      if (failure === 'missing-arm') cohort.plans.pop()
      if (failure === 'future-signal') cohort.plans[2].decidedAt = '2026-09-09T08:00:00Z'
      if (failure === 'future-information') cohort.plans[2].informationCutoff = '2026-09-09T08:00:00Z'
      if (failure === 'expired') cohort.plans[2].expiresAt = input.observations[0].openAt
      if (failure === 'oversell') cohort.plans[1].orders[0].units = -51
      if (failure === 'unfunded') cohort.plans[2].orders[0].units = 50
      if (failure === 'duplicate-order') cohort.plans[2].orders.push({ ...cohort.plans[2].orders[0] })
      if (failure === 'different-snapshot') cohort.plans[2].snapshotId = 'later'
      if (failure === 'baseline-trade') cohort.plans[0].orders = [{ ticker: 'ETF', units: -1 }]
      input.sealed = sealForwardCohort(cohort)
      const out = evaluateForwardCohort(input)
      expect(out.status).toBe('insufficient'); expect(out.comparisons).toBeNull()
      expect(out.results.every(r => r.metrics === null)).toBe(true)
    },
  )
  it.each(['missing-price', 'missing-day', 'duplicate-day', 'future-close', 'same-open', 'simulated', 'corporate-action', 'nav-fund', 'missing-fees', 'nan', 'negative-fees', 'shifted-start', 'wrong-session-time'])(
    'leaves %s explicitly unverified', failure => {
      const input = fixture()
      if (failure === 'missing-price') input.observations[1].prices = []
      if (failure === 'missing-day') input.observations.splice(1, 1)
      if (failure === 'duplicate-day') input.observations[1] = structuredClone(input.observations[0])
      if (failure === 'future-close') input.asOf = '2026-09-11T05:00:00Z'
      if (failure === 'same-open') input.observations[0].openAt = input.sealed.cohort.recordedAt
      if (failure === 'simulated') input.observations[1].prices[0].quality = 'simulated'
      if (failure === 'corporate-action') input.observations[1].prices[0].corporateActions = 'present'
      if (failure === 'nav-fund') input.observations[1].prices[0].instrumentType = 'nav-fund'
      if (failure === 'missing-fees') input.sealed.cohort.costs = []
      if (failure === 'nan') input.observations[1].prices[0].close = NaN
      if (failure === 'shifted-start') { input.observations.shift(); input.expectedSessions.shift() }
      if (failure === 'wrong-session-time') input.observations[0].openAt = '2026-09-08T10:00:00Z'
      if (failure === 'negative-fees') input.sealed.cohort.costs[0].buyFeeBps = -1
      input.sealed = sealForwardCohort(input.sealed.cohort)
      const out = evaluateForwardCohort(input)
      expect(out.status).toBe('insufficient'); expect(out.validation).toBe('not-validated')
      expect(out.results.every(r => r.metrics === null)).toBe(true)
      expect(out.reasons.length).toBeGreaterThan(0)
    },
  )
  it('reports short history without inventing zero volatility or validation', () => {
    const input = fixture(); input.observations = input.observations.slice(0, 1); input.expectedSessions = input.expectedSessions.slice(0, 1)
    const out = evaluateForwardCohort(input)
    expect(out.status).toBe('paper-observed')
    expect(out.results.every(r => r.metrics?.dailyVolatilityPct === null)).toBe(true)
    expect(out.validation).toBe('not-validated')
  })
  it('makes identical plans identical after fees and permits explicitly zero fees', () => {
    const input = fixture()
    input.sealed.cohort.plans[2].orders = structuredClone(input.sealed.cohort.plans[1].orders)
    input.sealed = sealForwardCohort(input.sealed.cohort)
    input.sealed.cohort.costs[0].buyFeeBps = 0; input.sealed.cohort.costs[0].sellFeeBps = 0
    input.sealed = sealForwardCohort(input.sealed.cohort)
    const out = evaluateForwardCohort(input)
    expect(out.results[1].metrics).toEqual(out.results[2].metrics)
    expect(out.results[1].metrics?.netReturnPct).toBe(0)
  })
})
