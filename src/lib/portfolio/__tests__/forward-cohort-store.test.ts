import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { otcForwardFixture } from '@/lib/analysis/__tests__/forward-otc.fixture'
import { capturePortfolioForwardCohort, portfolioForwardCohortFingerprint, evaluateStoredPortfolioForwardCohort, evaluatePortfolioForwardCohorts, listPortfolioForwardCohorts, linkPortfolioForwardCohortReport, readForwardNavObservations, FORWARD_COHORT_DATASET, FORWARD_EVALUATION_DATASET, type CapturePortfolioForwardInput, type ForwardCohortDb } from '../forward-cohort-store'
import type { Alternative } from '../alternatives'
import type { Evaluation } from '@/lib/research/contracts'
import type { ProductRawPayload } from '../product-research'

vi.mock('@/lib/db/prisma', () => ({ default: { rawPayload: {} } }))

function memory() {
  const records: ProductRawPayload[] = []
  const matches = (row: ProductRawPayload, where: Record<string, unknown> = {}) => Object.entries(where).every(([key, criterion]) => {
    const value = row[key as keyof ProductRawPayload]
    if (typeof criterion !== 'object' || criterion === null) return value === criterion
    const filter = criterion as { in?: unknown[]; lte?: Date; startsWith?: string }
    if (filter.in) return filter.in.includes(value)
    if (filter.lte) return new Date(value as string).getTime() <= filter.lte.getTime()
    if (filter.startsWith) return String(value).startsWith(filter.startsWith)
    return true
  })
  const findMany = vi.fn(async (args: { where?: Record<string, unknown>; orderBy?: { fetchedAt: string } } = {}) => records.filter(r => matches(r, args.where)).sort((a, b) => (new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime()) * (args.orderBy?.fetchedAt === 'desc' ? -1 : 1)))
  const rawPayload = {
    findMany,
    findFirst: vi.fn(async (args: Parameters<typeof findMany>[0]) => (await findMany(args))[0] || null),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => records.find(r => r.id === where.id) || null),
    create: vi.fn(async ({ data }: { data: Omit<ProductRawPayload, 'fetchedAt'> }) => {
      if (records.some(r => r.id === data.id)) throw Object.assign(new Error('unique'), { code: 'P2002' })
      const row = { ...data, fetchedAt: new Date() }; records.push(row); return row
    }),
  }
  return { records, rawPayload, db: { rawPayload } as unknown as ForwardCohortDb }
}
function raw(ticker: string, fetchedAt: string, nav: unknown[], id = `${ticker}:${fetchedAt}`): ProductRawPayload {
  const payload = JSON.stringify({ data: { nav } })
  return { id, targetCode: ticker, datasetKey: 'fund_research', provider: 'real-test-provider', fetchedAt, payload, contentHash: createHash('sha256').update(payload).digest('hex') }
}
function inputFixture(): CapturePortfolioForwardInput {
  const frozen = otcForwardFixture().sealed.cohort
  const alternative = (id: string, source: Alternative['source'], units: number): Alternative => ({ id, source, title: id, horizonDays: 20,
    targetWeights: frozen.initialPositions.map(p => ({ ticker: p.ticker, weightPct: p.ticker === '017470' ? 25 - units / 2 : 25 })),
    trades: units ? [{ ticker: '017470', currentWeightPct: 25, targetWeightPct: 25 - units / 2, changeWeightPct: -units / 2, amount: units * 10, estimatedUnits: units, estimatedFee: units * .1, executionGaps: [], settlementDays: 2 }] : [],
    grossCashWeightPct: 25 + units / 2, netCashWeightPct: null, immediatelyAvailableCashWeightPct: 25, totalFee: null, turnoverPct: units / 2,
    feeBreakEvenPct: null, hardViolations: [], researchIssues: [], executionGaps: [], stress: [], risk: { commonObservations: 0, coveragePct: 0, annualizedVolatilityPct: null, basis: 'test' },
    proposal: source === 'research' ? { id, title: id, objective: 'risk-reduction', horizonDays: 20, targets: [{ ticker: '017470', targetWeightPct: 20 }], thesisIds: ['thesis'], evidenceIds: ['evidence'], whyNow: 'test', whyNotHold: 'test', sizingRationale: 'test', invalidation: 'test', nextReview: 'test', opportunityCost: 'test' } : undefined,
  })
  return { runId: 'run-1', evaluation: { snapshotId: 'snapshot-1', asOf: '2026-09-08T10:00:00Z' } as Evaluation,
    portfolio: { id: 'account-1', holdingsDate: '2026-09-08', balanceDate: '2026-09-08', cashBalance: 500, totalAssets: 2000,
      holdings: frozen.initialPositions.map(p => ({ ...p, quantity: p.units, name: p.ticker, weightPct: 25, marketValue: 500, unitNav: 10, navDate: '2026-09-08', navHistory: [{ date: '2026-09-08', nav: 99 }] })) },
    alternatives: { version: 1, asOf: '2026-09-08T10:30:00Z', selectedId: 'ai-proposal', requestedId: 'ai-proposal', selectionReason: '研究方案有依据', alternatives: [alternative('hold', 'hold', 0), alternative('rules', 'rules', 20), alternative('ai-proposal', 'research', 10)], reviewIssues: [], evidenceBoundary: 'test', status: 'research-selected' },
    calendar: frozen.otc!.calendar,
    execution: { holdingLots: frozen.otc!.holdingLots, ordersByAlternativeId: { rules: frozen.plans[1].otcOrders!, 'ai-proposal': frozen.plans[2].otcOrders! }, expiresAtByAlternativeId: { rules: frozen.plans[1].expiresAt, 'ai-proposal': frozen.plans[2].expiresAt } },
  }
}
function seedBaseline(db: ReturnType<typeof memory>) {
  for (const ticker of ['017470', '024975', '026633']) db.records.push(raw(ticker, '2026-09-08T10:05:00Z', [{ nav_date: '2026-09-08', unit_nav: 10, publishedAt: '2026-09-08T10:00:00Z', corporateActions: 'verified-none' }]))
}
const options = (db: ForwardCohortDb) => ({ db, now: () => new Date('2026-09-08T11:00:00Z') })
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T00:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('append-only portfolio cohort integration', () => {
  it('captures the same whole account, then evaluates later real-source NAV and appends a receipt', async () => {
    const db = memory(); seedBaseline(db)
    const input = inputFixture(), before = JSON.stringify(input)
    const capture = await capturePortfolioForwardCohort(input, options(db.db))
    expect(capture.status).toBe('ready'); expect(capture.recordedAt).toBe('2026-09-08T11:00:00.000Z')
    expect(capture.sealed?.cohort.initialPositions).toHaveLength(3)
    expect(JSON.stringify(input)).toBe(before)
    const storedBefore = db.records.find(r => r.datasetKey === FORWARD_COHORT_DATASET)!.payload
    const fixture = otcForwardFixture()
    for (const ticker of ['017470', '024975', '026633']) db.records.push(raw(ticker, '2026-09-11T10:05:00Z', fixture.navObservations!.filter(n => n.ticker === ticker)))
    const result = await evaluateStoredPortfolioForwardCohort(capture, '2026-09-11T11:00:00Z', db.db)
    expect(result.evaluation.status).toBe('paper-observed')
    expect(result.evaluation.results.map(r => r.metrics?.finalEquity)).toEqual([1850, 1887.8, 1868.9])
    expect(db.records.find(r => r.datasetKey === FORWARD_COHORT_DATASET)!.payload).toBe(storedBefore)
    expect(db.records.filter(r => r.datasetKey === FORWARD_EVALUATION_DATASET)).toHaveLength(1)
  })
  it('returns the original capture on retries; a report link is a separate append', async () => {
    const db = memory(); seedBaseline(db); const input = inputFixture()
    const first = await capturePortfolioForwardCohort(input, options(db.db))
    input.portfolio.cashBalance = 999
    expect(await capturePortfolioForwardCohort(input, options(db.db))).toEqual(first)
    await linkPortfolioForwardCohortReport({ runId: input.runId, reportId: 'report-1' }, db.db)
    expect(await listPortfolioForwardCohorts({ reportId: 'report-1' }, db.db)).toEqual([first])
    expect(db.records.filter(r => r.datasetKey === FORWARD_COHORT_DATASET)).toHaveLength(2)
  })
  it('reuses identical content despite later capture/review timestamps and reordered JSON/allocation lists', async () => {
    const db = memory(); seedBaseline(db); const input = inputFixture()
    input.aiReview = { status: 'passed', reason: 'review', evidenceIds: ['b', 'a'], reviewedAt: '2026-09-08T10:30:00Z' }
    const first = await capturePortfolioForwardCohort(input, options(db.db))
    const retry = structuredClone(input)
    retry.alternatives!.asOf = '2026-09-08T11:30:00Z'
    retry.aiReview!.reviewedAt = '2026-09-08T11:35:00Z'
    retry.aiReview!.evidenceIds.reverse()
    retry.alternatives!.alternatives.reverse()
    for (const alternative of retry.alternatives!.alternatives) {
      alternative.targetWeights.reverse()
      alternative.proposal?.targets.reverse()
    }
    retry.alternatives = Object.fromEntries(Object.entries(retry.alternatives!).reverse()) as typeof retry.alternatives
    expect(portfolioForwardCohortFingerprint(retry)).toBe(first.planFingerprint)
    const repeated = await capturePortfolioForwardCohort(retry, { db: db.db, now: () => new Date('2026-09-08T12:00:00Z') })
    expect(repeated).toEqual(first)
    expect(repeated.recordedAt).toBe('2026-09-08T11:00:00.000Z')
    expect(db.records.filter(r => r.datasetKey === FORWARD_COHORT_DATASET)).toHaveLength(1)
  })
  it.each(['snapshot', 'selectedId', 'targetWeights', 'proposal-targets', 'status', 'reason', 'trade', 'ai-review-status'])(
    'appends a distinct cohort when %s changes in the same run', async change => {
      const db = memory(); seedBaseline(db); const input = inputFixture()
      const first = await capturePortfolioForwardCohort(input, options(db.db))
      const firstPayload = db.records.find(r => r.id === first.id)!.payload
      const repaired = structuredClone(input)
      if (change === 'snapshot') repaired.evaluation.snapshotId = 'snapshot-2'
      if (change === 'selectedId') repaired.alternatives!.selectedId = 'hold'
      if (change === 'targetWeights') repaired.alternatives!.alternatives[2].targetWeights[0].weightPct = 19
      if (change === 'proposal-targets') repaired.alternatives!.alternatives[2].proposal!.targets[0].targetWeightPct = 19
      if (change === 'status') repaired.alternatives!.status = 'hold-pending-evidence'
      if (change === 'reason') repaired.alternatives!.selectionReason = '修复后的研究理由'
      if (change === 'trade') repaired.alternatives!.alternatives[2].trades[0].estimatedUnits = 11
      if (change === 'ai-review-status') repaired.aiReview = { status: 'failed', reason: '未通过复核', evidenceIds: [], reviewedAt: '2026-09-08T11:10:00Z' }
      const next = await capturePortfolioForwardCohort(repaired, { db: db.db, now: () => new Date('2026-09-08T11:30:00Z') })
      expect(next.id).not.toBe(first.id)
      expect(next.runId).toBe(first.runId)
      expect(next.recordedAt).toBe('2026-09-08T11:30:00.000Z')
      expect(db.records.find(r => r.id === first.id)!.payload).toBe(firstPayload)
      expect(db.records.filter(r => r.datasetKey === FORWARD_COHORT_DATASET)).toHaveLength(2)
    },
  )
  it('keeps the unavailable cohort but shows the repaired cohort first through the same report link', async () => {
    const db = memory(); seedBaseline(db); const bad = inputFixture()
    bad.alternatives!.selectedId = 'hold'; bad.alternatives!.requestedId = null; bad.alternatives!.status = 'hold-pending-evidence'
    bad.alternatives!.selectionReason = '模型校验失败'
    const first = await capturePortfolioForwardCohort(bad, options(db.db))
    await linkPortfolioForwardCohortReport({ runId: bad.runId, reportId: 'report-repaired' }, db.db)
    const before = db.records.map(row => ({ id: row.id, payload: row.payload }))
    const repaired = await capturePortfolioForwardCohort(inputFixture(), { db: db.db, now: () => new Date('2026-09-08T11:30:00Z') })
    expect(first.arms[2].status).toBe('unavailable')
    expect(repaired.arms[2].status).toBe('planned')
    expect(await listPortfolioForwardCohorts({ reportId: 'report-repaired' }, db.db)).toEqual([repaired, first])
    for (const row of before) expect(db.records.find(r => r.id === row.id)!.payload).toBe(row.payload)
  })
  it('reuses matching legacy run-only captures but appends repairs without rewriting them', async () => {
    const db = memory(); seedBaseline(db); const input = inputFixture()
    const first = await capturePortfolioForwardCohort(input, options(db.db))
    const legacyId = `pfc:${createHash('sha256').update(JSON.stringify(input.runId)).digest('hex')}`
    const legacy = { ...first, id: legacyId, planFingerprint: undefined }
    const stored = db.records.find(r => r.id === first.id)!
    stored.id = legacyId; stored.payload = JSON.stringify(legacy)
    stored.contentHash = createHash('sha256').update(stored.payload).digest('hex')
    expect((await capturePortfolioForwardCohort(input, options(db.db))).id).toBe(legacyId)
    input.alternatives!.selectionReason = '修复后的不同理由'
    const repaired = await capturePortfolioForwardCohort(input, options(db.db))
    expect(repaired.id).not.toBe(legacyId)
    expect(db.records.filter(r => r.datasetKey === FORWARD_COHORT_DATASET)).toHaveLength(2)
    expect(stored.payload).toBe(JSON.stringify(legacy))
  })
  it('concurrent identical captures preserve the winning record and its timestamp', async () => {
    const db = memory(); seedBaseline(db); const input = inputFixture()
    const [first, second] = await Promise.all([
      capturePortfolioForwardCohort(input, options(db.db)),
      capturePortfolioForwardCohort(input, { db: db.db, now: () => new Date('2026-09-08T11:30:00Z') }),
    ])
    expect(second).toEqual(first)
    expect(db.records.filter(r => r.datasetKey === FORWARD_COHORT_DATASET)).toHaveLength(1)
  })
  it.each(['unknown-quantity', 'cash-mismatch', 'fees-unknown', 'schedule-unknown', 'expiry-unknown', 'partial-account', 'changed-orders'])(
    'stores %s as unverified rather than inventing an executable path', async failure => {
      const db = memory(); seedBaseline(db); const input = inputFixture()
      if (failure === 'unknown-quantity') input.portfolio.holdings![0].quantity = null
      if (failure === 'cash-mismatch') input.portfolio.totalAssets = 9999
      if (failure === 'fees-unknown') input.execution!.ordersByAlternativeId.rules[0].fee.status = 'unverified'
      if (failure === 'schedule-unknown') input.execution = undefined
      if (failure === 'expiry-unknown') input.execution!.expiresAtByAlternativeId = {}
      if (failure === 'partial-account') input.alternatives!.alternatives[1].targetWeights.pop()
      if (failure === 'changed-orders') { const order = input.execution!.ordersByAlternativeId.rules[0]; if (order.side === 'redeem') order.units = 19 }
      const capture = await capturePortfolioForwardCohort(input, options(db.db))
      expect(capture.status).toBe('unverified'); expect(capture.sealed).toBeNull(); expect(capture.gaps.length).toBeGreaterThan(0)
      const result = await evaluateStoredPortfolioForwardCohort(capture, '2026-09-11T11:00:00Z', db.db)
      expect(result.evaluation.results.every(r => r.metrics === null)).toBe(true)
    },
  )
  it.each(['unknown-dates', 'adjusted-only'])('accepts the synchronized account snapshot when public %s metadata is absent', async caseName => {
    const db = memory(); seedBaseline(db); const input = inputFixture()
    if (caseName === 'unknown-dates') { input.portfolio.holdingsDate = null; input.portfolio.balanceDate = null }
    if (caseName === 'adjusted-only') db.records[0] = raw('017470', '2026-09-08T10:05:00Z', [{ nav_date: '2026-09-08', adj_nav: 10 }])
    const capture = await capturePortfolioForwardCohort(input, options(db.db))
    expect(capture.status).toBe('ready')
    expect(capture.gaps).toEqual([])
  })
  it('does not treat an absent AI plan as a researched no-trade decision', async () => {
    const db = memory(); seedBaseline(db); const input = inputFixture()
    input.alternatives!.selectedId = 'hold'; input.alternatives!.requestedId = null; input.alternatives!.status = 'hold-pending-evidence'; input.alternatives!.selectionReason = '模型失败所以暂不交易'
    const capture = await capturePortfolioForwardCohort(input, options(db.db))
    expect(capture.status).toBe('unverified')
    expect(capture.arms[2]).toMatchObject({ status: 'unavailable', reason: '模型失败所以暂不交易', original: null })
    expect(capture.originalStatus).toBe('hold-pending-evidence')
  })
  it('accepts explicit researched hold only with the additional review evidence', async () => {
    const db = memory(); seedBaseline(db); const input = inputFixture()
    input.alternatives!.selectedId = 'hold'; input.alternatives!.requestedId = 'hold'; input.alternatives!.status = 'hold-pending-evidence'
    input.aiReview = { status: 'passed', reason: '核验后不交易', evidenceIds: ['review-evidence'], reviewedAt: '2026-09-08T10:30:00Z' }
    const capture = await capturePortfolioForwardCohort(input, options(db.db))
    expect(capture.status).toBe('ready'); expect(capture.arms[2].status).toBe('researched-hold')
  })
  it('requires an explicit selector and never scans all private accounts', async () => {
    const db = memory()
    expect(await listPortfolioForwardCohorts({}, db.db)).toEqual([])
    expect(db.rawPayload.findMany).not.toHaveBeenCalled()
    await expect(evaluatePortfolioForwardCohorts({}, db.db)).rejects.toThrow('必须限定当前报告')
  })
  it('detects payload corruption instead of silently editing the frozen record', async () => {
    const db = memory(); seedBaseline(db); await capturePortfolioForwardCohort(inputFixture(), options(db.db))
    db.records.find(r => r.datasetKey === FORWARD_COHORT_DATASET)!.payload = '{}'
    await expect(listPortfolioForwardCohorts({ runId: 'run-1' }, db.db)).rejects.toThrow('完整性')
  })
})

describe('NAV evidence adapter', () => {
  it('retains publication uncertainty and does not substitute accumulated/adjusted NAV for unit NAV', () => {
    const value = readForwardNavObservations([raw('017470', '2026-09-10T10:00:00Z', [{ nav_date: '20260909', unit_nav: 1.1, adj_nav: 99, accum_nav: 88, corporateActions: 'verified-none' }])], '2026-09-10T11:00:00Z')
    expect(value.observations[0]).toMatchObject({ nav: 1.1, publishedAt: null, publicationTimeBasis: 'observed-upper-bound' })
  })
  it('rejects future collection, simulated source, inconsistent revisions and action notes', () => {
    const early = raw('017470', '2026-09-10T10:00:00Z', [{ nav_date: '2026-09-09', unit_nav: 1.1, corporateActions: 'verified-none' }])
    const later = raw('017470', '2026-09-11T10:00:00Z', [{ nav_date: '2026-09-09', unit_nav: 1.2, distribution_note: '每份分红0.1元' }])
    expect(readForwardNavObservations([early, later], '2026-09-10T11:00:00Z').observations).toHaveLength(1)
    expect(readForwardNavObservations([early, later], '2026-09-11T11:00:00Z').observations[0].quality).toBe('unverified')
    expect(readForwardNavObservations([{ ...early, provider: 'mock' }], '2026-09-11T11:00:00Z').observations).toEqual([])
  })
  it('validates empty distribution notes against declared daily return rather than presuming no action', () => {
    const value = readForwardNavObservations([raw('017470', '2026-09-11T10:00:00Z', [
      { nav_date: '2026-09-09', unit_nav: 1 }, { nav_date: '2026-09-10', unit_nav: 1.1, distribution_note: '', reported_return_pct: 10 },
    ])], '2026-09-11T11:00:00Z')
    expect(value.observations.map(n => n.corporateActions)).toEqual(['unverified', 'verified-none'])
  })
})
