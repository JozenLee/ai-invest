export type ConclusionOpportunity = {
  title: string
  status: string
  evidence: string
  actionImplication: string
}

export type HistoricalOpportunityCheck = {
  sourceDate: string
  previousOpportunity: string
  currentEvidence: string
  status: string
  implication: string
}

export type ExecutiveInvestmentConclusion = {
  conclusion: string
  allocationStance: string
  keyDrivers: string[]
  opportunities: ConclusionOpportunity[]
  mainRisks: string[]
  watchPoints: string[]
  actionPlan: {
    priority: string
    unheld: string
    held: string
  }
  historyComparison: HistoricalOpportunityCheck[]
}

type Row = Record<string, unknown>

function record(value: unknown): Row {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Row
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Row : {}
  } catch {
    return {}
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function textList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean).slice(0, limit)
    : []
}

function opportunities(value: unknown): ConclusionOpportunity[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return [{ title: text(item), status: '待观察', evidence: '', actionImplication: '' }]
    const row = record(item)
    const title = text(row.title ?? row.opportunity)
    if (!title) return []
    return [{
      title,
      status: text(row.status) || '待观察',
      evidence: text(row.evidence),
      actionImplication: text(row.actionImplication ?? row.implication),
    }]
  }).slice(0, 3)
}

function historyChecks(value: unknown): HistoricalOpportunityCheck[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    const previousOpportunity = text(row.previousOpportunity ?? row.opportunity)
    if (!previousOpportunity) return []
    return [{
      sourceDate: text(row.sourceDate ?? row.date),
      previousOpportunity,
      currentEvidence: text(row.currentEvidence ?? row.evidence),
      status: text(row.status) || '未兑现',
      implication: text(row.implication ?? row.actionImplication),
    }]
  }).slice(0, 3)
}

/** Normalizes both the new conclusion contract and archived legacy reports. */
export function normalizeExecutiveConclusion(value: unknown, fallback = ''): ExecutiveInvestmentConclusion {
  const advice = record(value)
  const executive = record(advice.executiveSummary ?? value)
  const actionPlan = record(executive.actionPlan)
  return {
    conclusion: text(executive.conclusion) || text(advice.thesis) || text(fallback),
    allocationStance: text(executive.allocationStance),
    keyDrivers: textList(executive.keyDrivers, 3),
    opportunities: opportunities(executive.opportunities),
    mainRisks: textList(executive.mainRisks ?? advice.risks, 3),
    watchPoints: textList(executive.watchPoints ?? executive.reviewTriggers ?? advice.watchlist, 4),
    actionPlan: {
      priority: text(actionPlan.priority),
      unheld: text(actionPlan.unheld),
      held: text(actionPlan.held),
    },
    historyComparison: historyChecks(executive.historyComparison),
  }
}
