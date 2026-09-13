import { sealForwardCohort, type ForwardCohort, type ForwardEvaluationInput, type ForwardNavObservation, type ForwardOtcOrder } from '../forward-evaluation'

// Complete OTC integration example. Every price, fee, quantity and schedule here is SYNTHETIC TEST DATA.
export function otcForwardFixture(): ForwardEvaluationInput {
  const verified = { status: 'verified' as const, sourceId: 'test-rule', verifiedAt: '2026-09-08T08:00:00Z' }
  const nav = (ticker: string, day: string, value: number): ForwardNavObservation => ({ ticker, valuationDate: `2026-09-${day}`, nav: value, publishedAt: `2026-09-${day}T10:00:00Z`, observedAt: `2026-09-${day}T10:05:00Z`, sourceId: 'test-nav', quality: 'verified', corporateActions: 'verified-none' })
  const sell: ForwardOtcOrder = {
    id: 'sell-017470', ticker: '017470', side: 'redeem', units: 20, lotId: 'lot-017470',
    acceptedAt: '2026-09-09T06:00:00Z', valuationDate: '2026-09-09',
    confirmation: { date: '2026-09-10', at: '2026-09-10T01:00:00Z', basis: 'conditional-on-acceptance' },
    settlementDate: '2026-09-11', settlementAt: '2026-09-11T01:00:00Z',
    rules: { ...verified, acceptanceOpensAt: '2026-09-09T01:00:00Z', acceptanceCutoffAt: '2026-09-09T07:00:00Z', fullAcceptance: 'conditional', detail: 'Synthetic full-acceptance/confirmation/settlement rule' },
    fee: { ...verified, method: 'redemption-proceeds', rateBps: 100, fixedFee: 0, moneyDecimals: 2, unitDecimals: 2, rounding: 'half-up', subscriptionRemainder: 'fund-assets', applicability: 'Synthetic channel/share-class/lot fee tier' },
  }
  const cohort: ForwardCohort = {
    id: 'otc-example', recordedAt: '2026-09-08T11:00:00Z', currency: 'CNY', executionModel: 'otc-nav',
    firstExecutionSession: '2026-09-09', initialCash: 500,
    initialPositions: ['017470', '024975', '026633'].map(ticker => ({ ticker, units: 50 })), costs: [],
    otc: {
      baselineValuationDate: '2026-09-08', initialNavs: ['017470', '024975', '026633'].map(t => nav(t, '08', 10)),
      holdingLots: ['017470', '024975', '026633'].map(ticker => ({ ...verified, ticker, lotId: `lot-${ticker}`, units: 50, acquiredOn: '2026-08-01' })),
      calendar: { ...verified, sessions: ['09', '10', '11', '14'].map(day => ({ date: `2026-09-${day}`, valuationAt: `2026-09-${day}T07:00:00Z` })) },
    },
    plans: (['no-trade', 'rules', 'ai'] as const).map(arm => ({ arm, planId: arm, snapshotId: 'snapshot-1',
      decidedAt: '2026-09-08T10:30:00Z', informationCutoff: '2026-09-08T10:00:00Z', expiresAt: '2026-09-15T07:00:00Z',
      orders: [], otcOrders: arm === 'no-trade' ? [] : [{ ...sell, units: arm === 'rules' ? 20 : 10 }],
    })),
  }
  return { sealed: sealForwardCohort(cohort), asOf: '2026-09-11T11:00:00Z', observations: [], expectedSessions: ['2026-09-09', '2026-09-10', '2026-09-11'],
    navObservations: ['017470', '024975', '026633'].flatMap(t => [nav(t, '09', 11), nav(t, '10', 10), nav(t, '11', 9)]) }
}
