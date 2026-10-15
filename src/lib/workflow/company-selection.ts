type CompanyCandidate = {
  code?: string
  stockCode?: string
  pool?: string
  source?: string
  segment?: string
  representativenessScore?: number
}

export type CompanySelectionConfig = {
  methodId?: string
  maxCompanies?: number
}

function codeOf(company: CompanyCandidate) {
  return String(company.code || company.stockCode || '').trim()
}

function isHoldingCompany(company: CompanyCandidate) {
  return ['holding', 'both', 'subscription-holdings'].includes(String(company.pool || company.source || ''))
}

function isGraphCompany(company: CompanyCandidate) {
  const pool = String(company.pool || company.source || '')
  return pool === 'both' || (isHoldingCompany(company) && company.segment !== 'ETF持仓补充样本（图谱外）')
}

/** Apply the configured research universe before freezing downstream projections.
 * This keeps the immutable snapshot, company evidence and prompt aggregates on
 * exactly the same company set. */
export function selectResearchCompanies<T extends CompanyCandidate>(companies: T[], config: CompanySelectionConfig = {}) {
  const maxCompanies = Math.min(100, Math.max(5, Number(config.maxCompanies) || 30))
  const methodId = config.methodId || 'etf-holdings-selection'
  const candidates = companies.filter(company => methodId === 'graph-intersection-selection' ? isGraphCompany(company) : isHoldingCompany(company))
  const selected = [...candidates].sort((left, right) => {
    const score = (right.representativenessScore || 0) - (left.representativenessScore || 0)
    return score || codeOf(left).localeCompare(codeOf(right))
  }).slice(0, maxCompanies)
  return { selected, methodId, maxCompanies, candidateCount: candidates.length }
}
