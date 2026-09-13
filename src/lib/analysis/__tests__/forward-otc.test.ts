import { describe, expect, it } from 'vitest'
import { evaluateForwardCohort, sealForwardCohort, type ForwardEvaluationInput, type ForwardOtcOrder } from '../forward-evaluation'

import { otcForwardFixture } from './forward-otc.fixture'

const reseal = (input: ForwardEvaluationInput) => { input.sealed = sealForwardCohort(input.sealed.cohort); return input }

describe('OTC conditional NAV paths', () => {
  it('prices all three actual OTC share-class codes and preserves full-account comparison', () => {
    const input = otcForwardFixture(), original = JSON.stringify(input), out = evaluateForwardCohort(input)
    expect(out.status).toBe('paper-observed'); expect(out.validation).toBe('not-validated')
    expect(out.results.map(r => r.metrics?.initialEquity)).toEqual([2000, 2000, 2000])
    expect(out.results.map(r => r.metrics?.finalEquity)).toEqual([1850, 1887.8, 1868.9])
    expect(out.results[1].metrics?.totalCosts).toBeCloseTo(2.2)
    expect(out.otc?.paths[1].orders[0]).toMatchObject({ state: 'settled-conditional', pricedUnits: 20, netCash: 217.8, fee: 2.2 })
    expect(out.comparisons).toHaveLength(3)
    expect(JSON.stringify(input)).toBe(original)
  })
  it('records redemption as a receivable, not immediately available cash', () => {
    const input = otcForwardFixture(); input.asOf = '2026-09-09T11:00:00Z'; input.expectedSessions = ['2026-09-09']
    const out = evaluateForwardCohort(input)
    expect(out.status).toBe('paper-observed')
    expect(out.otc?.paths[1].liquidity).toMatchObject({ availableCash: 500, redemptionReceivable: 217.8 })
    expect(out.otc?.paths[1].orders[0].state).toBe('awaiting-confirmation')
    expect(out.results[1].metrics?.finalEquity).toBeCloseTo(2147.8)
  })
  it('returns null until publication AND collection, never using later NAV in earlier evaluation', () => {
    const input = otcForwardFixture(); input.asOf = '2026-09-09T10:02:00Z'; input.expectedSessions = ['2026-09-09']
    const out = evaluateForwardCohort(input)
    expect(out.status).toBe('insufficient'); expect(out.results.every(r => r.metrics === null)).toBe(true)
    expect(out.otc?.paths[1].orders[0]).toMatchObject({ state: 'awaiting-nav', pricedUnits: null })
  })
  it('can use an explicitly labeled observed upper bound without inventing publication time', () => {
    const input = otcForwardFixture()
    input.navObservations = input.navObservations!.map(n => ({ ...n, publishedAt: null, publicationTimeBasis: 'observed-upper-bound' }))
    expect(evaluateForwardCohort(input).status).toBe('paper-observed')
    input.navObservations[0].publicationTimeBasis = undefined
    expect(evaluateForwardCohort(input).status).toBe('insufficient')
  })
  it.each(['fee-missing', 'confirmation-missing', 'settlement-missing', 'after-cutoff', 'after-expiry', 'future-rules', 'lot-unknown', 'lot-reused', 'distribution', 'missing-calendar-day', 'duplicate-nav', 'baseline-future', 'same-day-acceptance'])(
    'leaves %s unverified', failure => {
      const input = otcForwardFixture(), cohort = input.sealed.cohort, order = cohort.plans[1].otcOrders![0]
      if (failure === 'fee-missing') order.fee.status = 'unverified'
      if (failure === 'confirmation-missing') order.confirmation.at = ''
      if (failure === 'settlement-missing') order.settlementDate = ''
      if (failure === 'after-cutoff') order.acceptedAt = order.rules.acceptanceCutoffAt
      if (failure === 'after-expiry') cohort.plans[1].expiresAt = order.acceptedAt
      if (failure === 'future-rules') order.rules.verifiedAt = '2026-09-10T08:00:00Z'
      if (failure === 'lot-unknown' && order.side === 'redeem') order.lotId = 'missing'
      if (failure === 'lot-reused') cohort.plans[1].otcOrders!.push({ ...order, id: 'again', side: 'redeem', units: 40, lotId: 'lot-017470' })
      if (failure === 'distribution') input.navObservations![0].corporateActions = 'present'
      if (failure === 'missing-calendar-day') input.expectedSessions.splice(1, 1)
      if (failure === 'duplicate-nav') input.navObservations!.push({ ...input.navObservations![0] })
      if (failure === 'baseline-future') cohort.otc!.initialNavs[0].observedAt = '2026-09-09T11:00:00Z'
      if (failure === 'same-day-acceptance') order.acceptedAt = cohort.recordedAt
      const out = evaluateForwardCohort(reseal(input))
      expect(out.status).toBe('insufficient'); expect(out.comparisons).toBeNull(); expect(out.results.every(r => r.metrics === null)).toBe(true)
    },
  )
  it('subscribes by frozen cash amount and keeps unconfirmed shares separate', () => {
    const input = otcForwardFixture(), old = input.sealed.cohort.plans[2].otcOrders![0]
    input.sealed.cohort.plans[2].otcOrders = [{ ...old, id: 'buy', side: 'subscribe', cashAmount: 101,
      fee: { ...old.fee, method: 'external-subscription' } }]
    input.expectedSessions = ['2026-09-09']; input.asOf = '2026-09-09T11:00:00Z'
    const out = evaluateForwardCohort(reseal(input))
    expect(out.status).toBe('paper-observed')
    expect(out.otc?.paths[2].orders[0]).toMatchObject({ fee: 1, pricedUnits: 9.09, netCash: -101, state: 'awaiting-confirmation' })
    expect(out.otc?.paths[2].liquidity).toMatchObject({ availableCash: 399, pendingConfirmationUnits: { '017470': 9.09 } })
  })
  it('allows staged reuse only after settlement and information availability', () => {
    const input = otcForwardFixture(), old = input.sealed.cohort.plans[1].otcOrders![0]
    const buy: ForwardOtcOrder = { ...old, id: 'buy-later', side: 'subscribe', cashAmount: 600, ticker: '024975',
      acceptedAt: '2026-09-11T06:00:00Z', valuationDate: '2026-09-11', confirmation: { date: '2026-09-14', at: '2026-09-14T01:00:00Z', basis: 'conditional-on-acceptance' },
      settlementDate: '2026-09-14', settlementAt: '2026-09-14T01:00:00Z', rules: { ...old.rules, acceptanceOpensAt: '2026-09-11T01:00:00Z', acceptanceCutoffAt: '2026-09-11T07:00:00Z' },
      fee: { ...old.fee, method: 'external-subscription', rateBps: 0 } }
    input.sealed.cohort.plans[1].otcOrders!.push(buy)
    expect(evaluateForwardCohort(reseal(input)).status).toBe('paper-observed')
    buy.acceptedAt = '2026-09-10T06:00:00Z'; buy.valuationDate = '2026-09-10'; buy.rules.acceptanceOpensAt = '2026-09-10T01:00:00Z'; buy.rules.acceptanceCutoffAt = '2026-09-10T07:00:00Z'
    // seal copies its argument, so explicitly update the frozen working object for this second scenario.
    input.sealed.cohort.plans[1].otcOrders![1] = buy
    const out = evaluateForwardCohort(reseal(input))
    expect(out.status).toBe('insufficient'); expect(out.reasons.join('')).toContain('赎回款未到账')
  })
})
