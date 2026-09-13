import type { ForwardArm, ForwardEvaluation, ForwardEvaluationInput, ForwardMetrics } from './forward-evaluation'

type Verification = { status: 'verified' | 'unverified'; sourceId: string; verifiedAt: string }
export type ForwardNavObservation = {
  ticker: string; valuationDate: string; nav: number
  publishedAt: string | null; observedAt: string; sourceId: string
  publicationTimeBasis?: 'exact' | 'observed-upper-bound'
  quality: 'verified' | 'unverified' | 'simulated'
  corporateActions: 'verified-none' | 'unverified' | 'present'
}
export type ForwardOtcContext = {
  baselineValuationDate: string
  initialNavs: ForwardNavObservation[]
  holdingLots: Array<Verification & { lotId: string; ticker: string; units: number; acquiredOn: string }>
  // Supplied by a verified fund calendar adapter, including future conditional dates.
  calendar: Verification & { sessions: Array<{ date: string; valuationAt: string }> }
}
export type ForwardOtcFee = Verification & {
  method: 'external-subscription' | 'redemption-proceeds'
  rateBps: number; fixedFee: number
  moneyDecimals: number; unitDecimals: number
  rounding: 'half-up' | 'floor'
  subscriptionRemainder: 'fund-assets' | 'refund'
  // Applicability includes the sales channel, amount/holding-period tier, and share class.
  applicability: string
}
type OtcOrderBase = {
  id: string; ticker: string
  // All timestamps below are conditional scenario assumptions, NOT actual broker receipts.
  acceptedAt: string; valuationDate: string
  confirmation: { date: string; at: string; basis: 'conditional-on-acceptance' }
  settlementDate: string; settlementAt: string
  rules: Verification & {
    acceptanceOpensAt: string; acceptanceCutoffAt: string
    fullAcceptance: 'conditional'; detail: string
  }
  fee: ForwardOtcFee
}
export type ForwardOtcOrder = OtcOrderBase & (
  { side: 'subscribe'; cashAmount: number } |
  { side: 'redeem'; units: number; lotId: string }
)
export type ForwardOtcOrderState = {
  orderId: string; ticker: string; side: 'subscribe' | 'redeem'
  acceptedAt: string; valuationDate: string; confirmationAt: string; settlementDate: string
  state: 'scheduled' | 'awaiting-nav' | 'awaiting-confirmation' | 'awaiting-settlement' | 'settled-conditional'
  navKnownAt: string | null; pricedUnits: number | null; fee: number | null; netCash: number | null
}
export type ForwardOtcTrace = {
  mode: 'conditional-paper'
  paths: Array<{
    arm: ForwardArm; orders: ForwardOtcOrderState[]
    liquidity: null | { at: string; availableCash: number; pendingSubscriptionCash: number; redemptionReceivable: number; pendingConfirmationUnits: Record<string, number> }
  }>
}

const timestamp = (value: string) => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN
const date = (value: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const localDate = (value: string) => Number.isFinite(timestamp(value)) ? new Date(timestamp(value) + 8 * 3600_000).toISOString().slice(0, 10) : ''
const finite = (value: number) => Number.isFinite(value) && value >= 0
const positive = (value: number) => Number.isFinite(value) && value > 0
const verified = (value: Verification | undefined, cutoff: string) => value?.status === 'verified' && !!value.sourceId?.trim() && Number.isFinite(timestamp(value.verifiedAt)) && timestamp(value.verifiedAt) <= timestamp(cutoff)
const knownAt = (nav: ForwardNavObservation) => Math.max(timestamp(nav.publishedAt || nav.observedAt), timestamp(nav.observedAt))
function round(value: number, decimals: number, mode: 'half-up' | 'floor') {
  const scale = 10 ** decimals
  return (mode === 'floor' ? Math.floor(value * scale + 1e-9) : Math.round((value + Number.EPSILON) * scale)) / scale
}

function priceOrder(order: ForwardOtcOrder, nav: number) {
  const fee = order.fee
  const money = (value: number) => round(value, fee.moneyDecimals, fee.rounding)
  if (order.side === 'redeem') {
    const gross = money(order.units * nav)
    const charged = money(gross * fee.rateBps / 10000 + fee.fixedFee)
    return { units: order.units, fee: charged, netCash: money(gross - charged), refund: 0, notional: gross }
  }
  const net = money(fee.fixedFee ? order.cashAmount - fee.fixedFee : order.cashAmount / (1 + fee.rateBps / 10000))
  const charged = money(order.cashAmount - net)
  const units = round(net / nav, fee.unitDecimals, fee.rounding)
  const refund = fee.subscriptionRemainder === 'refund' ? money(net - units * nav) : 0
  return { units, fee: charged, netCash: -order.cashAmount, refund, notional: order.cashAmount }
}

/** Conditional OTC adapter. Rules/fees/budgets are frozen before acceptance;
 * subsequent published NAV only prices that immutable path. No actual order or
 * confirmation is synthesized. Published/observed timestamps gate information.
 * Receivables cannot fund subscriptions before both settlement AND NAV knowledge.
 * NAV already includes ongoing fund expenses; only verified transaction fees are charged. */
export function evaluateOtcForwardCohort(input: ForwardEvaluationInput, result: ForwardEvaluation): ForwardEvaluation {
  const { cohort } = input.sealed, context = cohort.otc, reasons = result.reasons
  result.basis = '场外条件纸面路径：按冻结受理/估值/确认/到账规则和已核验费用，待净值发布并采集后定价；不代表真实受理、确认或成交。共同基线为冻结时已知净值，含此后净值变动。在途申购及赎回应收计入权益，到账前不可再投资；净值已含日常基金费用，不重复扣除。'
  result.otc = { mode: 'conditional-paper', paths: cohort.plans.map(plan => ({ arm: plan.arm, orders: [], liquidity: null })) }
  if (!context) { reasons.push('缺少场外基线净值、份额批次或基金日历'); return result }
  if (cohort.costs.length || cohort.plans.some(p => p.orders.length)) reasons.push('场外路径必须使用逐笔核验费用及otcOrders，不能混用场内订单/费用')
  if (!date(context.baselineValuationDate) || context.baselineValuationDate >= cohort.firstExecutionSession) reasons.push('场外共同基线必须早于预设执行交易日')
  if (!verified(context.calendar, cohort.recordedAt) || !context.calendar.sessions.length) reasons.push('基金开放日历未在冻结前核验')
  const calendar = context.calendar.sessions
  calendar.forEach((row, i) => {
    if (!date(row.date) || localDate(row.valuationAt) !== row.date || (i > 0 && row.date <= calendar[i - 1].date)) reasons.push('基金估值日历无效或重复')
  })
  const sessions = input.expectedSessions
  const start = calendar.findIndex(row => row.date === cohort.firstExecutionSession)
  if (!sessions.length || start < 0 || sessions.some((session, i) => session !== calendar[start + i]?.date)) reasons.push('场外观察窗口必须从冻结起点连续覆盖基金估值日')
  const marks = sessions.map(session => calendar.find(row => row.date === session))
  if (marks.some(row => !row || timestamp(row.valuationAt) > timestamp(input.asOf))) reasons.push('场外观察包含尚未完成的估值日')
  const allOrders = cohort.plans.flatMap(p => p.otcOrders || [])
  const tickers = [...new Set([...cohort.initialPositions.filter(p => p.units > 0).map(p => p.ticker), ...allOrders.map(o => o.ticker)])]
  const navs = input.navObservations || []
  const usableNav = (nav: ForwardNavObservation, cutoff: string, valuationAt?: string) => nav.quality === 'verified' && !!nav.sourceId?.trim() &&
    nav.corporateActions === 'verified-none' && positive(nav.nav) && date(nav.valuationDate) &&
    (nav.publishedAt !== null ? Number.isFinite(timestamp(nav.publishedAt)) : nav.publicationTimeBasis === 'observed-upper-bound') && Number.isFinite(timestamp(nav.observedAt)) &&
    timestamp(nav.observedAt) >= timestamp(nav.publishedAt || nav.observedAt) && knownAt(nav) <= timestamp(cutoff) &&
    localDate(nav.publishedAt || nav.observedAt) >= nav.valuationDate && (!valuationAt || timestamp(nav.publishedAt || nav.observedAt) >= timestamp(valuationAt))
  const lookup = (ticker: string, valuationDate: string) => navs.filter(nav => nav.ticker === ticker && nav.valuationDate === valuationDate)
  const initial = new Map<string, number>()
  for (const ticker of tickers) {
    // Newly subscribed products need no initial mark when the initial position is zero.
    if (!(cohort.initialPositions.find(p => p.ticker === ticker)?.units)) continue
    const candidates = context.initialNavs.filter(nav => nav.ticker === ticker && nav.valuationDate === context.baselineValuationDate)
    if (candidates.length !== 1 || !usableNav(candidates[0], cohort.recordedAt)) reasons.push(`${ticker}缺少冻结时已知的共同基线净值`)
    else initial.set(ticker, candidates[0].nav)
  }
  for (const mark of marks) {
    if (!mark) continue
    for (const ticker of tickers) {
      const candidates = lookup(ticker, mark.date)
      if (candidates.length !== 1 || !usableNav(candidates[0], input.asOf, mark.valuationAt)) reasons.push(`${ticker}/${mark.date}净值缺失、重复、未发布/未采集或需处理分红拆并份额`)
    }
  }
  const lots = new Map(context.holdingLots.map(lot => [lot.lotId, lot]))
  if (lots.size !== context.holdingLots.length) reasons.push('持仓批次重复')
  for (const lot of context.holdingLots) {
    if (!lot.lotId || !lot.ticker || !positive(lot.units) || !date(lot.acquiredOn) || lot.acquiredOn > context.baselineValuationDate || !verified(lot, cohort.recordedAt)) reasons.push('持仓批次及持有期未在冻结前核验')
  }
  for (const ticker of new Set(context.holdingLots.map(lot => lot.ticker))) {
    if (context.holdingLots.filter(lot => lot.ticker === ticker).reduce((sum, lot) => sum + lot.units, 0) > (cohort.initialPositions.find(p => p.ticker === ticker)?.units || 0) + 1e-8) reasons.push(`${ticker}批次份额超过初始持仓`)
  }
  for (const plan of cohort.plans) {
    const orders = plan.otcOrders || []
    if (plan.arm === 'no-trade' && orders.length) reasons.push('不交易对照不能包含场外申赎')
    if (new Set(orders.map(o => o.id)).size !== orders.length) reasons.push(`${plan.arm}场外订单ID重复`)
    for (const order of orders) {
      const mark = calendar.find(row => row.date === order.valuationDate)
      if (!order.id || !order.ticker || !mark || order.valuationDate < cohort.firstExecutionSession || !Number.isFinite(timestamp(order.acceptedAt)) ||
        timestamp(order.acceptedAt) <= timestamp(cohort.recordedAt) || timestamp(order.acceptedAt) >= timestamp(plan.expiresAt)) reasons.push(`${order.id}条件受理时间/估值日无效或方案过期`)
      if (!verified(order.rules, cohort.recordedAt) || order.rules?.fullAcceptance !== 'conditional' || !order.rules?.detail?.trim() ||
        !Number.isFinite(timestamp(order.rules.acceptanceOpensAt)) || !Number.isFinite(timestamp(order.rules.acceptanceCutoffAt)) ||
        timestamp(order.acceptedAt) < timestamp(order.rules.acceptanceOpensAt) || timestamp(order.acceptedAt) >= timestamp(order.rules.acceptanceCutoffAt) ||
        (mark && timestamp(order.rules.acceptanceCutoffAt) > timestamp(mark.valuationAt))) reasons.push(`${order.id}受理截止与估值日映射未核验`)
      if (!order.confirmation || order.confirmation.basis !== 'conditional-on-acceptance' || !date(order.confirmation.date) || localDate(order.confirmation.at) !== order.confirmation.date ||
        !date(order.settlementDate) || localDate(order.settlementAt) !== order.settlementDate ||
        (mark && timestamp(order.confirmation.at) <= timestamp(mark.valuationAt)) || timestamp(order.settlementAt) < timestamp(order.confirmation.at)) reasons.push(`${order.id}缺少有效的条件确认或到账时间`)
      const fee = order.fee
      if (!verified(fee, cohort.recordedAt) || !fee?.applicability?.trim() || !finite(fee.rateBps) || fee.rateBps >= 10000 || !finite(fee.fixedFee) ||
        ![fee.moneyDecimals, fee.unitDecimals].every(d => Number.isInteger(d) && d >= 0 && d <= 6) || !['half-up', 'floor'].includes(fee.rounding) ||
        !['fund-assets', 'refund'].includes(fee.subscriptionRemainder) || (fee.subscriptionRemainder === 'refund' && fee.rounding !== 'floor') ||
        fee.method !== (order.side === 'subscribe' ? 'external-subscription' : 'redemption-proceeds') ||
        (order.side === 'subscribe' && fee.fixedFee > 0 && fee.rateBps > 0)) reasons.push(`${order.id}费用、适用档位或舍入规则未核验/不受支持`)
      if (order.side === 'subscribe') {
        if (!positive(order.cashAmount)) reasons.push(`${order.id}申购必须冻结金额`)
      } else if (order.side === 'redeem') {
        const lot = lots.get(order.lotId)
        if (!positive(order.units) || !lot || lot.ticker !== order.ticker || order.units > lot.units + 1e-8) reasons.push(`${order.id}赎回份额与已核验持仓批次不符`)
      } else reasons.push('不支持的场外方向')
      const candidates = lookup(order.ticker, order.valuationDate)
      const nav = candidates.length === 1 && usableNav(candidates[0], input.asOf, mark?.valuationAt) ? candidates[0] : null
      const navKnown = nav ? knownAt(nav) : null
      const valuationComplete = !!mark && timestamp(mark.valuationAt) <= timestamp(input.asOf)
      if (valuationComplete && !nav) reasons.push(`${order.id}等待该估值日净值发布并采集后再回放`)
      const canPrice = nav && valuationComplete && fee && verified(fee, cohort.recordedAt)
      const priced = canPrice ? priceOrder(order, nav.nav) : null
      if (priced && (!Object.values(priced).every(finite) && !(priced.netCash < 0 && order.side === 'subscribe' && [priced.units, priced.fee, priced.refund, priced.notional].every(finite)))) reasons.push(`${order.id}费用超过金额或定价无效`)
      const state: ForwardOtcOrderState['state'] = timestamp(input.asOf) < timestamp(order.acceptedAt) ? 'scheduled' : !nav || !valuationComplete ? 'awaiting-nav'
        : timestamp(input.asOf) < Math.max(timestamp(order.confirmation?.at), navKnown!) ? 'awaiting-confirmation'
          : timestamp(input.asOf) < Math.max(timestamp(order.settlementAt), navKnown!) ? 'awaiting-settlement' : 'settled-conditional'
      result.otc.paths.find(p => p.arm === plan.arm)!.orders.push({ orderId: order.id, ticker: order.ticker, side: order.side,
        acceptedAt: order.acceptedAt, valuationDate: order.valuationDate, confirmationAt: order.confirmation?.at, settlementDate: order.settlementDate,
        state, navKnownAt: nav ? new Date(navKnown!).toISOString() : null, pricedUnits: priced?.units ?? null, fee: priced?.fee ?? null, netCash: priced?.netCash ?? null })
    }
  }
  if (reasons.length) return result
  const initialEquity = cohort.initialCash + cohort.initialPositions.reduce((sum, p) => sum + (p.units ? p.units * initial.get(p.ticker)! : 0), 0)
  if (!positive(initialEquity)) { reasons.push('共同基线权益无效'); return result }
  for (const plan of cohort.plans) {
    let cash = cohort.initialCash, pendingSubscriptionCash = 0, redemptionReceivable = 0, fees = 0, turnover = 0
    const positions = new Map(cohort.initialPositions.map(p => [p.ticker, p.units]))
    const lotBalances = new Map(context.holdingLots.map(lot => [lot.lotId, lot.units]))
    const pendingUnits: Record<string, number> = {}
    const events: Array<{ at: number; priority: number; apply: () => void }> = []
    for (const order of plan.otcOrders || []) {
      const mark = calendar.find(row => row.date === order.valuationDate)!
      events.push({ at: timestamp(order.acceptedAt), priority: 3, apply: () => {
        if (order.side === 'subscribe') {
          if (cash + 1e-8 < order.cashAmount) reasons.push(`${plan.arm}/${order.id}受理时可用现金不足；赎回款未到账不得提前申购`)
          cash -= order.cashAmount; pendingSubscriptionCash += order.cashAmount
        } else {
          const remaining = lotBalances.get(order.lotId)! - order.units
          if (remaining < -1e-8) reasons.push(`${plan.arm}/${order.id}同一持仓批次重复/超额赎回`)
          lotBalances.set(order.lotId, remaining)
        }
      } })
      // Future valuation days deliberately have no invented NAV or priced event.
      if (timestamp(mark.valuationAt) > timestamp(input.asOf)) continue
      const nav = lookup(order.ticker, order.valuationDate)[0], priced = priceOrder(order, nav.nav)
      events.push({ at: timestamp(mark.valuationAt), priority: 0, apply: () => {
        fees += priced.fee; turnover += priced.notional
        if (order.side === 'subscribe') {
          pendingSubscriptionCash -= order.cashAmount
          positions.set(order.ticker, (positions.get(order.ticker) || 0) + priced.units)
          pendingUnits[order.ticker] = (pendingUnits[order.ticker] || 0) + priced.units
          redemptionReceivable += priced.refund
        } else {
          positions.set(order.ticker, positions.get(order.ticker)! - order.units)
          redemptionReceivable += priced.netCash
        }
      } })
      events.push({ at: Math.max(timestamp(order.confirmation.at), knownAt(nav)), priority: 1, apply: () => {
        if (order.side === 'subscribe') pendingUnits[order.ticker] -= priced.units
      } })
      events.push({ at: Math.max(timestamp(order.settlementAt), knownAt(nav)), priority: 2, apply: () => {
        const incoming = order.side === 'redeem' ? priced.netCash : priced.refund
        redemptionReceivable -= incoming; cash += incoming
      } })
    }
    events.sort((a, b) => a.at - b.at || a.priority - b.priority)
    let cursor = 0
    const curve = marks.map(mark => {
      while (cursor < events.length && events[cursor].at <= timestamp(mark!.valuationAt)) events[cursor++].apply()
      const value = [...positions].reduce((sum, [ticker, units]) => sum + (units ? units * lookup(ticker, mark!.date)[0].nav : 0), 0)
      return { session: mark!.date, equity: cash + pendingSubscriptionCash + redemptionReceivable + value }
    })
    const metrics = metricsFromCurve(initialEquity, curve, fees, turnover)
    if (!Object.values(metrics).filter(v => typeof v === 'number').every(Number.isFinite)) reasons.push('场外资金计算溢出')
    result.results.find(row => row.arm === plan.arm)!.metrics = metrics
    result.otc.paths.find(row => row.arm === plan.arm)!.liquidity = {
      at: marks.at(-1)!.valuationAt, availableCash: cash, pendingSubscriptionCash, redemptionReceivable, pendingConfirmationUnits: { ...pendingUnits },
    }
  }
  if (reasons.length) {
    result.results.forEach(row => { row.metrics = null }); result.otc.paths.forEach(row => { row.liquidity = null }); return result
  }
  const metrics = (arm: ForwardArm) => result.results.find(row => row.arm === arm)!.metrics!
  result.status = 'paper-observed'
  result.comparisons = ([['rules', 'no-trade'], ['ai', 'no-trade'], ['ai', 'rules']] as const).map(([arm, against]) => ({ arm, against,
    netReturnDifferencePp: metrics(arm).netReturnPct - metrics(against).netReturnPct,
    drawdownDifferencePp: metrics(arm).maxDrawdownPct - metrics(against).maxDrawdownPct }))
  reasons.push('仅评估全额受理、按核验规则确认/到账这一条件路径；未验证真实成交或策略有效性')
  return result
}

function metricsFromCurve(initialEquity: number, curve: ForwardMetrics['curve'], totalCosts: number, notional: number): ForwardMetrics {
  let peak = initialEquity, maxDrawdownPct = 0
  for (const row of curve) { peak = Math.max(peak, row.equity); maxDrawdownPct = Math.max(maxDrawdownPct, (peak - row.equity) / peak * 100) }
  const returns = curve.slice(1).map((row, i) => curve[i].equity > 0 ? row.equity / curve[i].equity - 1 : NaN)
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const dailyVolatilityPct = returns.length >= 2 && returns.every(Number.isFinite) ? Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1)) * 100 : null
  const finalEquity = curve.at(-1)!.equity
  return { initialEquity, finalEquity, netReturnPct: (finalEquity / initialEquity - 1) * 100, totalCosts, turnoverPct: notional / initialEquity * 100, maxDrawdownPct, dailyVolatilityPct, curve }
}
