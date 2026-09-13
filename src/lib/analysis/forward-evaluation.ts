import { createHash } from 'node:crypto'
import { evaluateOtcForwardCohort, type ForwardOtcContext, type ForwardOtcOrder, type ForwardNavObservation, type ForwardOtcTrace } from './forward-otc'
export type { ForwardOtcContext, ForwardOtcOrder, ForwardNavObservation, ForwardOtcTrace } from './forward-otc'

export type ForwardArm = 'no-trade' | 'rules' | 'ai'
export type ForwardOrder = { ticker: string; units: number } // signed units; never an executable order
export type ForwardPlan = {
  arm: ForwardArm; planId: string; snapshotId: string
  decidedAt: string; informationCutoff: string; expiresAt: string
  orders: ForwardOrder[]
  otcOrders?: ForwardOtcOrder[]
}
export type ForwardCohort = {
  id: string; recordedAt: string; currency: string
  firstExecutionSession: string // freeze the next session using the verified calendar, not hindsight
  initialCash: number; initialPositions: Array<{ ticker: string; units: number }>
  plans: ForwardPlan[]
  costs: ForwardCost[]
  executionModel?: 'exchange-open' | 'otc-nav'
  otc?: ForwardOtcContext
}
export type SealedForwardCohort = { cohort: ForwardCohort; digest: string }
const digest = (cohort: ForwardCohort) => createHash('sha256').update(JSON.stringify(cohort)).digest('hex')

/** Persist the entire returned envelope when the plans are created, BEFORE the
 * observation window. The digest detects later edits; it is not a trusted clock
 * or proof of historical persistence. Store integration owns append-only storage. */
export function sealForwardCohort(cohort: ForwardCohort): SealedForwardCohort {
  const copy = structuredClone(cohort)
  return { cohort: copy, digest: digest(copy) }
}

export type ForwardObservation = {
  session: string; openAt: string; closeAt: string
  prices: Array<{
    ticker: string; open: number; close: number; sourceId: string
    quality: 'verified' | 'unverified' | 'simulated'
    instrumentType: 'exchange-traded' | 'nav-fund'
    // Raw units are not safely comparable across splits/distributions without an adapter.
    corporateActions: 'verified-none' | 'unverified' | 'present'
  }>
}
export type ForwardCost = {
  ticker: string; buyFeeBps: number; sellFeeBps: number; slippageBps: number; fixedFee: number
}
export type ForwardMetrics = {
  initialEquity: number; finalEquity: number; netReturnPct: number; totalCosts: number
  turnoverPct: number; maxDrawdownPct: number; dailyVolatilityPct: number | null
  curve: Array<{ session: string; equity: number }>
}
export type ForwardEvaluation = {
  status: 'paper-observed' | 'insufficient'; validation: 'not-validated'; reasons: string[]
  basis: string; cohortId: string; digest: string
  observationDigest: string; asOf: string; expectedSessions: string[]
  results: Array<{ arm: ForwardArm; metrics: ForwardMetrics | null }>
  comparisons: Array<{ arm: 'rules' | 'ai'; against: ForwardArm; netReturnDifferencePp: number; drawdownDifferencePp: number }> | null
  otc?: ForwardOtcTrace
}
const arms: ForwardArm[] = ['no-trade', 'rules', 'ai']
const time = (value: string) => /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0
const positive = (value: number) => Number.isFinite(value) && value > 0

/** One frozen cohort, three buy-and-hold PAPER alternatives, same initial account
 * marked at the first subsequent open, same complete window and cost schedule.
 * No fills, cash interest, external flows, fund NAV execution or corporate actions
 * are invented. Unsupported mechanics return null metrics and require an adapter.
 * Costs remain assumptions even when quotes are verified; results never validate alpha. */
export type ForwardEvaluationInput = {
  sealed: SealedForwardCohort; asOf: string
  expectedSessions: string[]; observations: ForwardObservation[]
  navObservations?: ForwardNavObservation[]
}
export function evaluateForwardCohort(input: ForwardEvaluationInput): ForwardEvaluation {
  const { cohort } = input.sealed
  const reasons: string[] = []
  const result: ForwardEvaluation = {
    status: 'insufficient', validation: 'not-validated', reasons,
    basis: '冻结方案后的共同开盘至完整收盘，原始价格、相同初始持仓与现金、逐笔扣费用及滑点的纸面对照；不含冻结至开盘跳空收益，不模拟真实成交，不证明投资有效性。现金不计息、无外部资金流；费率为显式假设。',
    cohortId: cohort.id, digest: input.sealed.digest,
    observationDigest: createHash('sha256').update(JSON.stringify({ asOf: input.asOf, sessions: input.expectedSessions, observations: input.observations, navObservations: input.navObservations })).digest('hex'),
    asOf: input.asOf, expectedSessions: [...input.expectedSessions],
    results: arms.map(arm => ({ arm, metrics: null })), comparisons: null,
  }
  if (digest(cohort) !== input.sealed.digest) reasons.push('冻结方案被修改，摘要不一致')
  if (!cohort.id || !cohort.currency || !Number.isFinite(time(cohort.recordedAt)) || !Number.isFinite(time(input.asOf)) || time(cohort.recordedAt) > time(input.asOf)) reasons.push('冻结时间、币种或评估时间无效')
  if (!nonnegative(cohort.initialCash) || cohort.initialPositions.some(p => !p.ticker || !nonnegative(p.units)) || new Set(cohort.initialPositions.map(p => p.ticker)).size !== cohort.initialPositions.length) reasons.push('初始账户无效或持仓重复')
  if (cohort.plans.length !== 3 || arms.some(arm => cohort.plans.filter(p => p.arm === arm).length !== 1)) reasons.push('必须同时冻结不交易、规则、AI三个方案')
  if (new Set(cohort.plans.map(p => p.planId)).size !== cohort.plans.length || new Set(cohort.plans.map(p => p.snapshotId)).size !== 1) reasons.push('方案ID重复或未使用共同冻结快照')
  for (const plan of cohort.plans) {
    if (!plan.planId || !plan.snapshotId || ![plan.decidedAt, plan.informationCutoff, plan.expiresAt].every(t => Number.isFinite(time(t))) ||
      time(plan.informationCutoff) > time(plan.decidedAt) || time(plan.decidedAt) > time(cohort.recordedAt)) reasons.push(`${plan.arm}方案存在无效时间或前视信息`)
    if (plan.arm === 'no-trade' && plan.orders.length) reasons.push('不交易对照不能包含交易')
    if (plan.orders.some(o => !o.ticker || !Number.isFinite(o.units) || o.units === 0) || new Set(plan.orders.map(o => o.ticker)).size !== plan.orders.length) reasons.push(`${plan.arm}订单无效或重复；须先净额化`)
  }
  if (cohort.executionModel === 'otc-nav') return evaluateOtcForwardCohort(input, result)
  if (cohort.otc || cohort.plans.some(p => p.otcOrders?.length)) reasons.push('场外数据必须显式选择otc-nav执行模型')
  const sessions = input.expectedSessions
  if (sessions[0] !== cohort.firstExecutionSession) reasons.push('观察起点与预先冻结的执行交易日不一致')
  if (!sessions.length || sessions.some((s, i) => !/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s || (i > 0 && s <= sessions[i - 1]))) reasons.push('必须提供有序、无重复的完整交易日窗口')
  const observations = sessions.map(session => input.observations.find(o => o.session === session))
  if (observations.some(o => !o) || input.observations.length !== sessions.length || new Set(input.observations.map(o => o.session)).size !== sessions.length) reasons.push('行情窗口缺失、重复或与声明交易日不一致')
  const tickers = [...new Set([...cohort.initialPositions.filter(p => p.units > 0).map(p => p.ticker), ...cohort.plans.flatMap(p => p.orders.map(o => o.ticker))])]
  observations.forEach((observation, index) => {
    if (!observation) return
    const previous = observations[index - 1]
    if (!Number.isFinite(time(observation.openAt)) || !Number.isFinite(time(observation.closeAt)) || time(observation.openAt) <= time(cohort.recordedAt) ||
      time(observation.closeAt) <= time(observation.openAt) || time(observation.closeAt) > time(input.asOf) ||
      (previous && time(observation.openAt) <= time(previous.closeAt))) reasons.push(`${observation.session}不是冻结后的完整有序观察`)
    // This adapter is explicitly for exchange sessions in Asia/Shanghai.
    for (const at of [observation.openAt, observation.closeAt]) {
      if (Number.isFinite(time(at)) && new Date(time(at) + 8 * 3600_000).toISOString().slice(0, 10) !== observation.session) reasons.push(`${observation.session}交易时间与交易日不一致`)
    }
    for (const ticker of tickers) {
      const quotes = observation.prices.filter(p => p.ticker === ticker), quote = quotes[0]
      if (quotes.length !== 1 || !quote || !positive(quote.open) || !positive(quote.close) || !quote.sourceId || quote.quality !== 'verified' || quote.instrumentType !== 'exchange-traded' || quote.corporateActions !== 'verified-none') reasons.push(`${observation.session}/${ticker}缺少核验场内行情或需处理净值申赎/分红拆并股`)
    }
  })
  const first = observations[0]
  for (const plan of cohort.plans) {
    if (plan.orders.length && first && time(first.openAt) >= time(plan.expiresAt)) reasons.push(`${plan.arm}在观察开盘前已过期`)
    for (const order of plan.orders) {
      const fees = cohort.costs.filter(c => c.ticker === order.ticker), fee = fees[0]
      if (fees.length !== 1 || !fee || ![fee.buyFeeBps, fee.sellFeeBps, fee.slippageBps, fee.fixedFee].every(nonnegative) ||
        [fee.buyFeeBps, fee.sellFeeBps, fee.slippageBps].some(v => v >= 10000)) reasons.push(`${order.ticker}费用缺失或无效；不能默认零成本`)
    }
  }
  if (reasons.length || !first) return result
  const complete = observations as ForwardObservation[]
  const opens = new Map(first.prices.map(p => [p.ticker, p.open]))
  const initialEquity = cohort.initialCash + cohort.initialPositions.reduce((sum, p) => sum + (p.units ? p.units * opens.get(p.ticker)! : 0), 0)
  if (!positive(initialEquity)) { reasons.push('初始权益无效'); return result }
  for (const arm of arms) {
    const plan = cohort.plans.find(p => p.arm === arm)!
    const positions = new Map(cohort.initialPositions.map(p => [p.ticker, p.units]))
    let cash = cohort.initialCash, totalCosts = 0, traded = 0
    // Sell first to fund buys; short positions/borrowing/partial fills are not silently synthesized.
    for (const order of [...plan.orders].sort((a, b) => a.units - b.units)) {
      const fee = cohort.costs.find(c => c.ticker === order.ticker)!
      const units = (positions.get(order.ticker) || 0) + order.units
      const notional = Math.abs(order.units) * opens.get(order.ticker)!
      const slippedNotional = notional * (1 + (order.units > 0 ? 1 : -1) * fee.slippageBps / 10000)
      const cost = notional * fee.slippageBps / 10000 + slippedNotional * (order.units > 0 ? fee.buyFeeBps : fee.sellFeeBps) / 10000 + fee.fixedFee
      cash -= order.units * opens.get(order.ticker)! + cost
      if (units < -1e-8 || cash < -1e-8) reasons.push(`${arm}/${order.ticker}超出持仓或现金；不能假定成交`)
      positions.set(order.ticker, Math.max(0, units)); totalCosts += cost; traded += notional
    }
    let peak = initialEquity, maxDrawdownPct = 0
    const curve = complete.map(observation => {
      const closes = new Map(observation.prices.map(p => [p.ticker, p.close]))
      const equity = cash + [...positions].reduce((sum, [ticker, units]) => sum + (units ? units * closes.get(ticker)! : 0), 0)
      peak = Math.max(peak, equity); maxDrawdownPct = Math.max(maxDrawdownPct, (peak - equity) / peak * 100)
      return { session: observation.session, equity }
    })
    const returns = curve.slice(1).map((row, i) => curve[i].equity > 0 ? row.equity / curve[i].equity - 1 : NaN)
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const volatility = returns.length >= 2 && returns.every(Number.isFinite) ? Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1)) * 100 : null
    const finalEquity = curve.at(-1)!.equity
    result.results.find(r => r.arm === arm)!.metrics = { initialEquity, finalEquity, netReturnPct: (finalEquity / initialEquity - 1) * 100,
      totalCosts, turnoverPct: traded / initialEquity * 100, maxDrawdownPct, dailyVolatilityPct: volatility, curve }
  }
  if (reasons.length || result.results.some(r => !Object.values(r.metrics!).filter(v => typeof v === 'number').every(Number.isFinite))) {
    if (!reasons.length) reasons.push('资金或收益计算溢出')
    result.results.forEach(r => { r.metrics = null }); return result
  }
  result.status = 'paper-observed'
  const metrics = (arm: ForwardArm) => result.results.find(r => r.arm === arm)!.metrics!
  result.comparisons = ([['rules', 'no-trade'], ['ai', 'no-trade'], ['ai', 'rules']] as const).map(([arm, against]) => ({ arm, against,
    netReturnDifferencePp: metrics(arm).netReturnPct - metrics(against).netReturnPct,
    drawdownDifferencePp: metrics(arm).maxDrawdownPct - metrics(against).maxDrawdownPct }))
  reasons.push('仅为单个冻结方案的前向纸面观察，不能据此验证策略有效性；需要持续样本和跨市场状态对照')
  if (complete.length < 3) reasons.push('收盘样本不足三个，日收益波动率未验证')
  return result
}
