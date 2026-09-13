import { createHash } from 'node:crypto'
import prisma from '@/lib/db/prisma'
import { evaluateForwardCohort, sealForwardCohort, type ForwardArm, type ForwardEvaluation, type ForwardNavObservation, type ForwardOtcContext, type ForwardOtcOrder, type SealedForwardCohort } from '@/lib/analysis/forward-evaluation'
import type { CalendarDay, Evaluation } from '@/lib/research/contracts'
import type { Alternative, PlanningHolding, PortfolioAlternatives } from './alternatives'
import type { ProductRawPayload } from './product-research'

export const FORWARD_COHORT_DATASET = 'portfolio_forward_cohort'
export const FORWARD_EVALUATION_DATASET = 'portfolio_forward_evaluation'
export type ForwardCohortDb = Pick<typeof prisma, 'rawPayload'>
type Row = Record<string, unknown>
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const array = (v: unknown): Row[] => Array.isArray(v) ? v.map(object) : []
const text = (v: unknown) => typeof v === 'string' ? v : ''
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
const iso = (v: Date | string) => v instanceof Date ? v.toISOString() : v
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const day = (v: unknown) => {
  const s = text(v).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s ? s : null
}
const time = (v: unknown) => typeof v === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN
const parse = (payload: string): Row => { try { return object(JSON.parse(payload)) } catch { return {} } }
const fundCode = (v: string) => v.replace(/\.OF$/i, '')

/** Reads only stored evidence known by asOf. No accumulated-NAV substitution or
 * invented publication time. Unknown publication is an explicit observed upper
 * bound. Split/distribution evidence must be supplied or daily-return reconciled. */
export function readForwardNavObservations(raws: readonly ProductRawPayload[], asOf: string) {
  const gaps: string[] = [], grouped = new Map<string, ForwardNavObservation[]>()
  for (const raw of raws) {
    if (!['fund_nav', 'fund_research'].includes(raw.datasetKey) || time(iso(raw.fetchedAt)) > time(asOf) || !Number.isFinite(time(iso(raw.fetchedAt)))) continue
    const root = parse(raw.payload), data = root.data ?? root, bundle = object(data)
    if (root.success === false || /mock|simulat|模拟/i.test(`${raw.provider || ''} ${text(root.source)}`)) { gaps.push(`${raw.id}不是可用真实来源`); continue }
    const rows = raw.datasetKey === 'fund_nav' ? array(Array.isArray(data) ? data : bundle.nav) : array(bundle.nav)
    const ordered = rows.map(row => ({ row, date: day(row.valuationDate || row.nav_date || row.date), nav: number(row.unit_nav ?? row.nav) }))
      .filter((item): item is typeof item & { date: string; nav: number } => !!item.date && item.nav !== null && item.nav > 0).sort((a, b) => a.date.localeCompare(b.date))
    ordered.forEach((item, index) => {
      const { row, date: valuationDate, nav } = item, ticker = fundCode(raw.targetCode)
      if (row.ts_code && fundCode(text(row.ts_code)) !== ticker) { gaps.push(`${raw.id}基金代码冲突`); return }
      const source = text(row.source) || raw.provider || text(root.source)
      if (!source || /mock|simulat|模拟/i.test(source)) { gaps.push(`${raw.id}净值来源缺失或为模拟`); return }
      const published = row.publishedAt || row.published_at || row.ann_date || row.publish_date
      const publishedAt = Number.isFinite(time(published)) ? text(published) : null
      const observedAt = iso(raw.fetchedAt)
      // The DB's receipt time is the earliest provable time available to this application.
      if ((row.observedAt && (!Number.isFinite(time(row.observedAt)) || time(row.observedAt) > time(observedAt))) || (publishedAt && time(publishedAt) > time(observedAt)) ||
        (day(published) && day(published)! > observedAt.slice(0, 10)) || valuationDate > observedAt.slice(0, 10)) { gaps.push(`${raw.id}/${valuationDate}来源时间冲突`); return }
      let corporateActions: ForwardNavObservation['corporateActions'] = 'unverified'
      const explicit = row.corporateActions || row.corporate_actions
      const distribution = text(row.distribution_note || row.distributionNote)
      if (explicit === 'present' || distribution.trim()) corporateActions = 'present'
      else if (explicit === 'verified-none') corporateActions = 'verified-none'
      else {
        const previous = ordered[index - 1], reported = number(row.reported_return_pct)
        // An explicit empty action field plus agreement with the provider's daily
        // return supports unchanged raw units; adjusted/accumulated NAV alone does not.
        if (Object.hasOwn(row, 'distribution_note') && !distribution && previous && previous.date < valuationDate && reported !== null &&
          Math.abs((nav / previous.nav - 1) * 100 - reported) <= .015) corporateActions = 'verified-none'
      }
      const observation: ForwardNavObservation = { ticker, valuationDate, nav, publishedAt, observedAt, sourceId: `${raw.id}:nav:${valuationDate}:${source}`,
        publicationTimeBasis: publishedAt ? 'exact' : 'observed-upper-bound', quality: row.quality === 'simulated' ? 'simulated' : row.quality === 'unverified' ? 'unverified' : 'verified', corporateActions }
      const key = `${ticker}:${valuationDate}`, values = grouped.get(key) || []; values.push(observation); grouped.set(key, values)
    })
  }
  const observations = [...grouped].map(([key, values]) => {
    const ordered = values.sort((a, b) => time(a.observedAt) - time(b.observedAt))
    if (values.some(v => Math.abs(v.nav - values[0].nav) > 1e-10) || values.some(v => v.corporateActions === 'present')) {
      gaps.push(`${key}净值修订冲突或分红拆并份额尚未适配`)
      return { ...ordered[0], quality: 'unverified' as const, corporateActions: values.some(v => v.corporateActions === 'present') ? 'present' as const : ordered[0].corporateActions }
    }
    return ordered.find(v => v.corporateActions === 'verified-none' && v.quality === 'verified') || ordered[0]
  })
  return { observations, gaps }
}

export type ForwardPortfolioInput = {
  id?: string; portfolioId?: string; excluded?: boolean; reason?: string
  holdings?: readonly PlanningHolding[]; cashBalance?: number | null; totalAssets?: number | null
  holdingsDate?: string | null; balanceDate?: string | null; holdingsEmailDate?: string | null; balanceEmailDate?: string | null
  asOf?: string | null; capturedAt?: string
}
export type CapturePortfolioForwardInput = {
  runId: string; reportId?: string; evaluation: Evaluation
  portfolio: ForwardPortfolioInput; alternatives: PortfolioAlternatives | null
  calendar: readonly CalendarDay[] | ForwardOtcContext['calendar']
  // Optional normalized evidence adapter. Missing fields NEVER fall back to generic
  // T+1/T+2, scalar fee estimates, purchaseDate, or a assumed 15:00 acceptance.
  execution?: { holdingLots: ForwardOtcContext['holdingLots']; ordersByAlternativeId: Record<string, ForwardOtcOrder[]>; expiresAtByAlternativeId?: Record<string, string> }
  aiReview?: { status: 'passed' | 'failed' | 'missing'; reason: string; evidenceIds: string[]; reviewedAt: string }
}
export type CapturedForwardCohort = {
  version: 1; kind: 'cohort'; id: string; runId: string; reportId: string | null; portfolioId: string | null
  planFingerprint?: string
  recordedAt: string; status: 'ready' | 'unverified'; gaps: string[]
  arms: Array<{ arm: ForwardArm; alternativeId: string | null; status: 'planned' | 'researched-hold' | 'unavailable'; reason: string; original: Alternative | null }>
  originalStatus: PortfolioAlternatives['status'] | null; originalReason: string
  sealed: SealedForwardCohort | null
  // Local/private audit only. Preserves the full account and original non-trading reasons.
  original: CapturePortfolioForwardInput
}
export type StoredForwardEvaluation = { version: 1; kind: 'evaluation'; cohortId: string; runId: string; reportId: string | null; evaluatedAt: string; captureStatus: CapturedForwardCohort['status']; evaluation: ForwardEvaluation }

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)]))
  return value
}

/** Content identity, independent of capture/review wall-clock timestamps and JSON
 * object insertion order. A repaired selection/status/reason is a new cohort.
 * Allocation lists are sets by ID/ticker; ordered scenario ranges remain ordered. */
export function portfolioForwardCohortFingerprint(input: Pick<CapturePortfolioForwardInput, 'runId' | 'evaluation' | 'alternatives' | 'aiReview'>): string {
  const alternatives = input.alternatives ? {
    ...Object.fromEntries(Object.entries(input.alternatives).filter(([key]) => key !== 'asOf')),
    alternatives: input.alternatives.alternatives.map(alternative => ({
      ...alternative,
      targetWeights: [...alternative.targetWeights].sort((a, b) => a.ticker.localeCompare(b.ticker)),
      trades: [...alternative.trades].sort((a, b) => a.ticker.localeCompare(b.ticker)),
      proposal: alternative.proposal ? { ...alternative.proposal, targets: [...alternative.proposal.targets].sort((a, b) => a.ticker.localeCompare(b.ticker)) } : undefined,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  } : null
  return hash(canonical({ version: 2, runId: input.runId, snapshotId: input.evaluation.snapshotId, alternatives,
    aiReview: input.aiReview ? { status: input.aiReview.status, reason: input.aiReview.reason, evidenceIds: [...input.aiReview.evidenceIds].sort() } : null }))
}

async function appendOnce(id: string, datasetKey: string, targetCode: string, value: unknown, db: ForwardCohortDb) {
  const data = { id, datasetKey, targetCode, provider: 'local-forward-paper-v1', payload: JSON.stringify(value), contentHash: hash(value) }
  try { return await db.rawPayload.create({ data }) } catch (error) {
    if (object(error).code !== 'P2002') throw error
    const prior = await db.rawPayload.findUnique({ where: { id } })
    if (!prior || prior.contentHash !== data.contentHash) throw new Error('前向记录ID冲突；禁止覆盖已冻结内容')
    return prior
  }
}

export async function linkPortfolioForwardCohortReport(input: { runId: string; reportId: string }, db: ForwardCohortDb = prisma) {
  if (!input.runId || !input.reportId) throw new Error('缺少runId/reportId')
  return appendOnce(`pfc-link:${hash(input)}`, FORWARD_COHORT_DATASET, `report:${input.reportId}`, { version: 1, kind: 'report-link', ...input }, db)
}

/** Call when the three alternatives exist, including after a same-run repair.
 * Identical content retries return the first capture; changed plans append a new one.
 * later report linking is a separate append, never a change to the frozen plan.
 * A failed/incomplete research arm stays unavailable, not an empty successful AI trade list. */
export async function capturePortfolioForwardCohort(input: CapturePortfolioForwardInput, options: { db?: ForwardCohortDb; now?: () => Date } = {}): Promise<CapturedForwardCohort> {
  if (!input.runId?.trim()) throw new Error('缺少前向评估runId')
  const db = options.db || prisma, planFingerprint = portfolioForwardCohortFingerprint(input), id = `pfc:${planFingerprint}`
  const existing = await db.rawPayload.findUnique({ where: { id } })
  if (existing) {
    if (input.reportId) await linkPortfolioForwardCohortReport({ runId: input.runId, reportId: input.reportId }, db)
    return verifiedRecord<CapturedForwardCohort>(existing)
  }
  // Preserve an identical pre-fingerprint capture without changing its stored ID.
  // A repaired alternative must never fall back to that run-only legacy record.
  const legacyRow = await db.rawPayload.findUnique({ where: { id: `pfc:${hash(input.runId)}` } })
  if (legacyRow) {
    const legacy = verifiedRecord<CapturedForwardCohort>(legacyRow)
    if (legacy.original && portfolioForwardCohortFingerprint(legacy.original) === planFingerprint) {
      if (input.reportId) await linkPortfolioForwardCohortReport({ runId: input.runId, reportId: input.reportId }, db)
      return legacy
    }
  }
  const recordedAt = (options.now || (() => new Date()))().toISOString(), holdings = [...(input.portfolio.holdings || [])], gaps: string[] = []
  const accountObservedAt = Number.isFinite(time(input.portfolio.asOf)) ? input.portfolio.asOf! : recordedAt
  const accountSnapshotDate = new Date(time(accountObservedAt) + 8 * 3600_000).toISOString().slice(0, 10)
  // The synchronized balance, units and reference NAV are the current account
  // facts. Provider business-date metadata is not required to accept the account.
  const holdingsDate = accountSnapshotDate
  const balanceDate = accountSnapshotDate
  if (input.portfolio.excluded) gaps.push(input.portfolio.reason || '账户未冻结')
  if (!Number.isFinite(time(input.evaluation.asOf)) || time(input.evaluation.asOf) > time(recordedAt)) gaps.push('研究快照时间无效或晚于捕获时间')
  if (!holdings.length || new Set(holdings.map(h => h.ticker)).size !== holdings.length || holdings.some(h => !h.ticker || number(h.quantity) === null || h.quantity! < 0 || number(h.unitNav) === null || h.unitNav! <= 0)) gaps.push('账户快照缺少有效基金代码、份额或参考净值')
  if (number(input.portfolio.cashBalance) === null || input.portfolio.cashBalance! < 0) gaps.push('缺少核验现金余额，不能由权重补造现金')
  const alternatives = input.alternatives
  if (!alternatives || !Number.isFinite(time(alternatives.asOf)) || time(alternatives.asOf) > time(recordedAt)) gaps.push('三方案比较缺失或时间无效')
  const choices = alternatives?.alternatives || []
  const hold = choices.find(a => a.source === 'hold'), rules = choices.find(a => a.source === 'rules')
  const chosen = choices.find(a => a.id === alternatives?.selectedId)
  const reviewedHold = chosen?.source === 'hold' && alternatives?.requestedId === 'hold' && input.aiReview?.status === 'passed' &&
    input.aiReview.evidenceIds.length > 0 && input.aiReview.reason.trim() && Number.isFinite(time(input.aiReview.reviewedAt)) && time(input.aiReview.reviewedAt) <= time(recordedAt)
  const ai = chosen?.source === 'research' && alternatives?.status === 'research-selected' && !chosen.researchIssues.length && chosen.proposal?.evidenceIds.length && chosen.proposal.whyNotHold.trim() ? chosen : reviewedHold ? chosen : undefined
  const arms: CapturedForwardCohort['arms'] = ([['no-trade', hold], ['rules', rules], ['ai', ai]] as const).map(([arm, alternative]) => ({
    arm, alternativeId: alternative?.id || null, status: !alternative ? 'unavailable' : alternative.trades.length ? 'planned' : arm === 'ai' ? 'researched-hold' : 'planned',
    reason: arm === 'ai' ? reviewedHold ? input.aiReview!.reason : alternatives?.selectionReason || '没有已核验AI研究方案' : alternative?.title || '缺少对照方案', original: alternative || null,
  }))
  for (const arm of arms) {
    if (arm.status === 'unavailable') gaps.push(`${arm.arm}方案未研究完成：${arm.reason}`)
    if (arm.original && (arm.original.targetWeights.length !== holdings.length || holdings.some(h => !arm.original!.targetWeights.some(w => w.ticker === h.ticker)))) gaps.push(`${arm.arm}方案未覆盖同一全账户持仓`)
  }
  const raw = holdings.length ? await db.rawPayload.findMany({ where: { datasetKey: { in: ['fund_nav', 'fund_research', 'fund_execution'] }, targetCode: { in: holdings.flatMap(h => [h.ticker, `${h.ticker}.OF`]) }, fetchedAt: { lte: new Date(recordedAt) } }, orderBy: { fetchedAt: 'asc' } }) : []
  const baseline: ForwardNavObservation[] = holdings.map(holding => ({ ticker: holding.ticker, valuationDate: holdingsDate, nav: holding.unitNav!, publishedAt: accountObservedAt, observedAt: accountObservedAt, sourceId: `portfolio-account:${input.portfolio.portfolioId || input.portfolio.id || 'default'}:${holding.ticker}:${accountObservedAt}`, publicationTimeBasis: 'exact', quality: 'verified', corporateActions: 'verified-none' }))
  for (const holding of holdings) {
    if (number(holding.marketValue) === null || Math.abs(holding.marketValue - (holding.quantity || 0) * (holding.unitNav || 0)) > .02) gaps.push(`${holding.ticker}份额、净值和市值不守恒`)
  }
  const initialEquity = (input.portfolio.cashBalance || 0) + holdings.reduce((sum, h) => sum + (h.quantity || 0) * (h.unitNav || 0), 0)
  if (number(input.portfolio.totalAssets) === null || initialEquity <= 0 || Math.abs(initialEquity - input.portfolio.totalAssets!) > .02) gaps.push('全账户总资产与现金/份额净值不守恒')
  // Exact schedules may be supplied by the caller or a run-bound normalized fund_execution packet.
  const materials = raw.filter(r => r.datasetKey === 'fund_execution' && !/mock|simulat|模拟/i.test(r.provider || '') && parse(r.payload).success !== false).map(r => object(object(parse(r.payload).data).forward || parse(r.payload).forward))
    .filter(m => m.runId === input.runId)
  const execution = input.execution || { holdingLots: materials.flatMap(m => Array.isArray(m.holdingLots) ? m.holdingLots : []) as ForwardOtcContext['holdingLots'], ordersByAlternativeId: {} as Record<string, ForwardOtcOrder[]>, expiresAtByAlternativeId: {} as Record<string, string> }
  if (!input.execution) for (const material of materials) for (const [key, value] of Object.entries(object(material.ordersByAlternativeId))) {
    if (Array.isArray(value)) execution.ordersByAlternativeId[key] = [...(execution.ordersByAlternativeId[key] || []), ...value] as ForwardOtcOrder[]
  }
  if (!input.execution) for (const material of materials) for (const [key, value] of Object.entries(object(material.expiresAtByAlternativeId))) {
    if (typeof value === 'string') execution.expiresAtByAlternativeId![key] = value
  }
  const normalizedCalendar = !Array.isArray(input.calendar) && 'sessions' in input.calendar ? input.calendar as ForwardOtcContext['calendar']
    : materials.length === 1 ? materials[0].calendar as ForwardOtcContext['calendar'] | undefined : undefined
  if (!normalizedCalendar || normalizedCalendar.status !== 'verified' || !normalizedCalendar.sourceId || !Number.isFinite(time(normalizedCalendar.verifiedAt)) || time(normalizedCalendar.verifiedAt) > time(recordedAt) || !Array.isArray(normalizedCalendar.sessions)) gaps.push('缺少冻结前核验的基金开放日历及估值时点；交易所日期数组不能代替')
  const plans = arms.map(arm => {
    const alternative = arm.original, orders = alternative ? execution.ordersByAlternativeId[alternative.id] || [] : []
    if (alternative && alternative.trades.length && !orders.length) gaps.push(`${arm.arm}缺少逐笔受理/估值/确认/到账/费用条件，不能使用估算份额假定成交`)
    for (const order of orders) {
      const trade = alternative?.trades.find(t => t.ticker === order.ticker && (t.changeWeightPct > 0 ? 'subscribe' : 'redeem') === order.side)
      if (!trade) gaps.push(`${arm.arm}/${order.id}条件订单未对应原方案`)
      if (!order.fee || order.fee.status !== 'verified' || !order.fee.sourceId || !order.fee.applicability || !Number.isFinite(time(order.fee.verifiedAt)) || time(order.fee.verifiedAt) > time(recordedAt)) gaps.push(`${arm.arm}/${order.id}费用适用性未核验`)
      if (!order.rules || order.rules.status !== 'verified' || !order.rules.sourceId || !Number.isFinite(time(order.rules.verifiedAt)) || time(order.rules.verifiedAt) > time(recordedAt) || !order.confirmation?.at || !order.settlementAt || !Number.isFinite(time(order.acceptedAt)) || time(order.acceptedAt) <= time(recordedAt)) gaps.push(`${arm.arm}/${order.id}受理/确认/到账规则未核验或已过期`)
      if (order.side === 'redeem' && !execution.holdingLots.some(lot => lot.lotId === order.lotId && lot.ticker === order.ticker && lot.status === 'verified')) gaps.push(`${arm.arm}/${order.id}赎回批次及持有期未知`)
    }
    for (const trade of alternative?.trades || []) {
      const matching = orders.filter(o => o.ticker === trade.ticker && (trade.changeWeightPct > 0 ? o.side === 'subscribe' : o.side === 'redeem'))
      const quantity = matching.reduce((sum, o) => sum + (o.side === 'subscribe' ? o.cashAmount : o.units), 0)
      const expected = trade.changeWeightPct > 0 ? trade.amount : trade.estimatedUnits
      if (expected === null || !Number.isFinite(quantity) || Math.abs(quantity - expected) > .000001) gaps.push(`${arm.arm}/${trade.ticker}条件金额/份额未精确对应冻结方案`)
    }
    const expiresAt = alternative ? execution.expiresAtByAlternativeId?.[alternative.id] : undefined
    if (orders.length && (!expiresAt || !Number.isFinite(time(expiresAt)) || orders.some(o => time(o.acceptedAt) >= time(expiresAt)))) gaps.push(`${arm.arm}缺少核验的方案有效期，不能事后延长至假定成交时间`)
    return { arm: arm.arm, planId: `${input.runId}:${arm.arm}`, snapshotId: input.evaluation.snapshotId, decidedAt: alternatives?.asOf || input.evaluation.asOf,
      informationCutoff: input.evaluation.asOf, expiresAt: expiresAt || recordedAt, orders: [], otcOrders: orders }
  })
  const first = (Array.isArray(normalizedCalendar?.sessions) ? normalizedCalendar.sessions : []).find(s => time(s.valuationAt) > time(recordedAt))
  if (!first) gaps.push('缺少冻结后的基金估值交易日')
  const sealed = gaps.length ? null : sealForwardCohort({ id, recordedAt, currency: 'CNY', executionModel: 'otc-nav', firstExecutionSession: first!.date,
    initialCash: input.portfolio.cashBalance!, initialPositions: holdings.map(h => ({ ticker: h.ticker, units: h.quantity! })), costs: [], plans,
    otc: { baselineValuationDate: holdingsDate!, initialNavs: baseline, holdingLots: execution.holdingLots, calendar: normalizedCalendar! } })
  const record: CapturedForwardCohort = { version: 1, kind: 'cohort', id, planFingerprint, runId: input.runId, reportId: input.reportId || null,
    portfolioId: input.portfolio.portfolioId || input.portfolio.id || null, recordedAt, status: gaps.length ? 'unverified' : 'ready', gaps: [...new Set(gaps)], arms,
    originalStatus: alternatives?.status || null, originalReason: alternatives?.selectionReason || input.portfolio.reason || '研究方案缺失', sealed, original: structuredClone(input) }
  let persisted = record
  try { await appendOnce(id, FORWARD_COHORT_DATASET, input.runId, record, db) }
  catch (error) {
    // Concurrent identical captures can have different recordedAt values. The
    // winner remains immutable; do not turn a successful first capture into failure.
    const winner = await db.rawPayload.findUnique({ where: { id } })
    if (!winner) throw error
    const prior = verifiedRecord<CapturedForwardCohort>(winner)
    if (prior.kind !== 'cohort' || portfolioForwardCohortFingerprint(prior.original) !== planFingerprint) throw error
    persisted = prior
  }
  if (input.reportId) await linkPortfolioForwardCohortReport({ runId: input.runId, reportId: input.reportId }, db)
  return persisted
}

function verifiedRecord<T>(row: { payload: string; contentHash: string }): T {
  const value = JSON.parse(row.payload)
  if (hash(value) !== row.contentHash) throw new Error('前向归档完整性校验失败')
  return value as T
}
export type ForwardSelector = { cohortId?: string; runId?: string; reportId?: string }
export async function listPortfolioForwardCohorts(selector: ForwardSelector = {}, db: ForwardCohortDb = prisma): Promise<CapturedForwardCohort[]> {
  if (!selector.cohortId && !selector.runId && !selector.reportId) return []
  let runId = selector.runId
  if (selector.reportId) {
    const link = await db.rawPayload.findFirst({ where: { datasetKey: FORWARD_COHORT_DATASET, targetCode: `report:${selector.reportId}` }, orderBy: { fetchedAt: 'desc' } })
    if (!link) return []
    const found = verifiedRecord<{ runId: string }>(link)
    if (runId && runId !== found.runId) return []
    runId = found.runId
  }
  const rows = await db.rawPayload.findMany({ where: { datasetKey: FORWARD_COHORT_DATASET, id: selector.cohortId || { startsWith: 'pfc:' }, ...(runId ? { targetCode: runId } : {}) }, orderBy: { fetchedAt: 'desc' } })
  return rows.map(row => verifiedRecord<CapturedForwardCohort>(row)).filter(row => row.kind === 'cohort')
    .sort((a, b) => time(b.recordedAt) - time(a.recordedAt))
}
export async function latestPortfolioForwardEvaluation(cohortId: string, db: ForwardCohortDb = prisma): Promise<StoredForwardEvaluation | null> {
  const row = await db.rawPayload.findFirst({ where: { datasetKey: FORWARD_EVALUATION_DATASET, targetCode: cohortId }, orderBy: { fetchedAt: 'desc' } })
  return row ? verifiedRecord<StoredForwardEvaluation>(row) : null
}

function unverifiedEvaluation(cohort: CapturedForwardCohort, asOf: string): ForwardEvaluation {
  return { status: 'insufficient', validation: 'not-validated', reasons: [...cohort.gaps], basis: '冻结时缺少账户或研究/执行条件；不事后补造AI方案、份额或费用。新证据须用于新轮次。',
    cohortId: cohort.id, digest: cohort.sealed?.digest || hash(cohort), observationDigest: hash([]), asOf, expectedSessions: [],
    results: (['no-trade', 'rules', 'ai'] as const).map(arm => ({ arm, metrics: null })), comparisons: null }
}
export async function evaluateStoredPortfolioForwardCohort(cohort: CapturedForwardCohort, asOf = new Date().toISOString(), db: ForwardCohortDb = prisma): Promise<StoredForwardEvaluation> {
  if (!Number.isFinite(time(asOf)) || time(asOf) < time(cohort.recordedAt) || time(asOf) > Date.now()) throw new Error('评估时间必须介于冻结时间与当前时间之间')
  let evaluation = unverifiedEvaluation(cohort, asOf)
  if (cohort.status === 'ready' && cohort.sealed?.cohort.otc) {
    const frozen = cohort.sealed.cohort, tickers = frozen.initialPositions.map(p => p.ticker)
    const raw = await db.rawPayload.findMany({ where: { datasetKey: { in: ['fund_nav', 'fund_research'] }, targetCode: { in: tickers.flatMap(t => [t, `${t}.OF`]) }, fetchedAt: { lte: new Date(asOf) } }, orderBy: { fetchedAt: 'asc' } })
    const navs = readForwardNavObservations(raw, asOf)
    const expectedSessions = frozen.otc!.calendar.sessions.filter(s => s.date >= frozen.firstExecutionSession && time(s.valuationAt) <= time(asOf)).map(s => s.date)
    evaluation = evaluateForwardCohort({ sealed: cohort.sealed, asOf, expectedSessions, observations: [], navObservations: navs.observations })
  }
  const value: StoredForwardEvaluation = { version: 1, kind: 'evaluation', cohortId: cohort.id, runId: cohort.runId, reportId: cohort.reportId, evaluatedAt: asOf, captureStatus: cohort.status, evaluation }
  await appendOnce(`pfe:${hash(value)}`, FORWARD_EVALUATION_DATASET, cohort.id, value, db)
  return value
}

/** Scheduler/API entry. Least recently evaluated ready cohorts go first so newer
 * reports cannot starve older forward windows. Permanently incomplete captures
 * receive one null-result receipt; frozen missing facts cannot be retrofitted. */
export async function evaluatePortfolioForwardCohorts(input: ForwardSelector & { limit?: number; asOf?: string } = {}, db: ForwardCohortDb = prisma) {
  if (!input.cohortId && !input.runId && !input.reportId) throw new Error('必须限定当前报告reportId、runId或cohortId，不扫描私有账户')
  const limit = input.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('评估批量必须为1–100')
  const cohorts = await listPortfolioForwardCohorts(input, db)
  const queue = await Promise.all(cohorts.map(async cohort => ({ cohort, latest: await latestPortfolioForwardEvaluation(cohort.id, db) })))
  const selected = queue.filter(row => input.runId || input.reportId || input.cohortId || row.cohort.status === 'ready' || !row.latest)
    .sort((a, b) => (a.latest ? time(a.latest.evaluatedAt) : 0) - (b.latest ? time(b.latest.evaluatedAt) : 0)).slice(0, limit)
  const results: StoredForwardEvaluation[] = [], errors: Array<{ cohortId: string; reason: string }> = []
  for (const row of selected) {
    try { results.push(await evaluateStoredPortfolioForwardCohort(row.cohort, input.asOf, db)) }
    catch (error) { errors.push({ cohortId: row.cohort.id, reason: error instanceof Error ? error.message : '评估失败' }) }
  }
  return { checked: selected.length, remaining: Math.max(0, queue.length - selected.length), results, errors }
}
