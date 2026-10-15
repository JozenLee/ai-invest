import { normalizeAIProductDecisions } from '@/lib/analysis/investment-conclusion'
import type { ReanalysisAudit } from './auto-reanalysis'

const object = (value: unknown): Record<string, unknown> => {
  try { return (typeof value === 'string' ? JSON.parse(value) : value) as Record<string,unknown> || {} } catch { return {} }
}

/** Operational coverage, never a target to maximize trading frequency. */
export function researchLoopMetrics(advice: unknown, asOf: string, reanalysis?: ReanalysisAudit | null) {
  const value = object(advice)
  const raw = Array.isArray(value.productDecisions) ? value.productDecisions : []
  const products = normalizeAIProductDecisions(raw, raw.map(row => String(object(row).ticker || '')))
  const directional = products.filter(row => row.heldAction === '减仓' || row.heldAction === '加仓' || row.unheldAction === '建仓')
  const valid = directional.filter(row => {
    const c = row.executionContract
    return row.suggestedAdjustmentPct > 0 && c?.status === 'verified' && !c.blockers?.length && !c.manualReviewConditions?.length && Date.parse(c.asOf) <= Date.parse(asOf) && Date.parse(c.validUntil) > Date.parse(asOf) && Array.isArray(c.triggerRules) && c.triggerRules.length > 0 && c.triggerRules.every(rule => rule.status === (rule.requiredStatus || 'met'))
  })
  const counts = new Map<string, number>()
  for (const row of products) {
    const c = row.executionContract
    const reasons = [...(c?.blockers || []), ...(c?.manualReviewConditions || [])]
    if (c && !(Date.parse(c.validUntil) > Date.parse(asOf))) reasons.push('执行合同已过期')
    for (const reason of new Set(reasons)) counts.set(reason, (counts.get(reason) || 0) + 1)
  }
  const stale = products.filter(row => row.reviewProvenance?.status === 'requires-new-analysis')
  const ages = products.map(row => (Date.parse(asOf) - Date.parse(row.reviewProvenance?.sourceAsOf || row.executionContract?.asOf || asOf)) / 86400_000).filter(Number.isFinite)
  return {
    asOf, products: raw.length, invalidProducts: raw.length - products.length, proposedActions: directional.length,
    executableActions: valid.length, executableActionRatePct: raw.length ? valid.length / raw.length * 100 : null,
    increase: valid.filter(row => row.heldAction !== '减仓').length, reduce: valid.filter(row => row.heldAction === '减仓').length,
    requiresNewAnalysis: stale.length, oldestOpinionDays: ages.length ? Math.max(0, ...ages) : null,
    reanalysis: reanalysis || null, blockers: [...counts].map(([reason,count]) => ({ reason,count })).sort((a,b) => b.count-a.count),
    basis: '有效非零动作占全部产品的比例；区分无交易观点与执行受阻，不以提高交易频率为目标。过期和人工待核验均不计入有效动作。',
  }
}
export type ResearchLoopMetrics = ReturnType<typeof researchLoopMetrics>
