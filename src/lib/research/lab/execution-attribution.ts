import type { DailyPlan, ExecutionFeedback } from './daily-plan'

export type ExecutionMark = { price: number; asOf: string }
/** Same-product, user-recorded fills only. This is incremental economics of
 * each action versus not trading, not a fabricated whole-account NAV. */
export function executionAttribution(plans: DailyPlan[], feedback: ExecutionFeedback[], marks: Record<string, ExecutionMark>, asOf: string) {
  const latest = new Map<string, ExecutionFeedback>()
  for (const entry of [...feedback].sort((a,b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (Date.parse(entry.recordedAt) <= Date.parse(asOf)) latest.set(`${entry.planId}:${entry.actionId}`, entry)
  }
  const rows = [...latest.values()].filter(entry => entry.status === 'filled').map(entry => {
    const plan = plans.find(plan => plan.id === entry.planId), action = plan?.actions.find(action => action.id === entry.actionId)
    const mark = marks[entry.ticker]
    const errors: string[] = []
    if (!action || action.ticker !== entry.ticker || action.side === 'none') errors.push('缺少匹配的原始交易清单')
    if (![entry.quantity,entry.price].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0) || typeof entry.fee !== 'number' || !Number.isFinite(entry.fee) || entry.fee < 0) errors.push('成交份额、价格或费用无效')
    if (!Number.isFinite(Date.parse(entry.occurredAt)) || Date.parse(entry.occurredAt) > Date.parse(asOf) || !plan || Date.parse(entry.occurredAt) < Date.parse(plan.asOf)) errors.push('成交时点无效')
    const validFill = !errors.length
    if (!mark || !Number.isFinite(mark.price) || mark.price <= 0 || !(Date.parse(mark.asOf) > Date.parse(entry.occurredAt)) || Date.parse(mark.asOf) > Date.parse(asOf)) errors.push('缺少成交后的同产品价格或净值，等待核验')
    const q = entry.quantity || 0, price = entry.price || 0, fee = entry.fee || 0
    const sign = action?.side === 'sell' ? -1 : 1
    const reference = action?.referencePrice
    const shortfall = validFill && typeof reference === 'number' && Number.isFinite(reference) && reference > 0 ? q * (price-reference) * sign + fee : null
    const gross = errors.length ? null : q * (mark.price-price) * sign
    return { feedbackId: entry.id, planId: entry.planId, ticker: entry.ticker, side: action?.side || null, occurredAt: entry.occurredAt,
      decisionVersionId: plan?.decisionVersionId || null, policyVersionId: plan?.policyVersionId || null,
      status: errors.length ? 'pending' as const : 'valued' as const, reasons: errors,
      actualAmount: validFill ? q*price : null, fee: validFill ? fee : null,
      amountDeviation: validFill && action?.amount != null ? q*price-action.amount : null,
      executionShortfall: shortfall, grossContribution: gross, netContribution: gross === null ? null : gross-fee,
      avoidedLoss: action?.side === 'sell' && gross !== null ? Math.max(0,gross) : null,
      missedUpside: action?.side === 'sell' && gross !== null ? Math.max(0,-gross) : null,
      mark: errors.length ? null : mark, wasBlocked: action?.status === 'blocked',
    }
  })
  const valued = rows.filter(row => row.status === 'valued')
  const attributed = rows.filter(row => row.executionShortfall !== null)
  return { asOf, fills: rows.length, valued: valued.length, pending: rows.length-valued.length,
    netContribution: valued.length ? valued.reduce((sum,row) => sum+row.netContribution!,0) : null,
    executionShortfall: attributed.length ? attributed.reduce((sum,row) => sum+row.executionShortfall!,0) : null,
    rows, basis: '按实际成交数量与费用，逐笔比较交易和不交易至当前同产品估值时点的贡献；正执行损耗表示成交价与费用劣于计划参考。不同期限、重复暴露不作独立样本，不等于账户净收益或策略胜率。未录入原始成本、现金流和完整成交前，不生成账户收益率。',
  }
}
