import { securityCode } from '@/lib/research/normalization'

type Row = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : ''
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
const unique = (values: string[]) => [...new Set(values)].sort()

// Versioned, deliberately narrow aliases. No embedding/similarity threshold or model name key.
const segments: Array<[string, RegExp]> = [
  ['pcb', /pcb|印制电路板|印刷电路板/], ['liquid-cooling', /液冷|liquid[ -]?cooling/],
  ['memory', /存储|memory/], ['optical-interconnect', /光模块|光互联/],
]
const drivers: Array<[string, RegExp]> = [
  ['orders', /订单|接单|在手合同|orders?/], ['capacity', /扩产|产能|capacity/],
  ['pricing', /涨价|降价|售价|pricing/], ['earnings', /盈利|利润|业绩|earnings/],
  ['cash-collection', /回款|现金回收|cash.collection/],
]
function dimension(explicit: unknown, fallback: string, aliases: Array<[string, RegExp]>) {
  const input = text(explicit) || fallback
  const matches = aliases.filter(([, pattern]) => pattern.test(input)).map(([key]) => key)
  if (matches.length === 1) return { value: matches[0], basis: text(explicit) ? 'explicit-alias' : 'text-alias' }
  if (!matches.length && text(explicit)) return { value: text(explicit), basis: 'explicit-exact' }
  return { value: null, basis: matches.length ? 'ambiguous' : 'missing' }
}

export type OpportunityIdentity = {
  version: 1
  key: string
  companies: string[]
  unresolvedCompanies: string[]
  segment: string | null
  driver: string | null
  confidence: 'complete' | 'unresolved'
  basis: { companies: 'canonical-exact-set'; segment: string; driver: string }
}

/** Accepts catalysts or legacy ledger rows. Structured industrySegment/driver are
 * preferred; opportunityKey is only text evidence, never an authoritative ID. */
export function identifyOpportunity(input: Row): OpportunityIdentity {
  // Older model outputs used decorated labels such as `科华数据(002335)` or
  // `002335科华数据`. Re-normalize both the resolved and unresolved buckets so
  // those historical rows can converge on the same auditable security set.
  const names = [...strings(input.affectedCompanies ?? input.companies), ...strings(input.unresolvedCompanies)].map(securityCode)
  const companies = unique(names.filter(name => /^\d{6}$|^\d+\.hk$/.test(name)))
  const unresolvedCompanies = unique(names.filter(name => !companies.includes(name)).map(text).filter(Boolean))
  const narrative = text(input.event || input.title || input.hypothesis)
  const segment = dimension(input.industrySegment, `${text(input.opportunityKey)} ${narrative}`, segments)
  const driver = dimension(input.driver, narrative, drivers)
  const complete = companies.length > 0 && !unresolvedCompanies.length && !!segment.value && !!driver.value
  const parts = [companies, unresolvedCompanies, segment.value, driver.value, complete ? null : narrative]
  return {
    version: 1, key: `opp:v1:${encodeURIComponent(JSON.stringify(parts))}`, companies, unresolvedCompanies,
    segment: segment.value, driver: driver.value, confidence: complete ? 'complete' : 'unresolved',
    basis: { companies: 'canonical-exact-set', segment: segment.basis, driver: driver.basis },
  }
}

/** Revalidate optional persisted metadata; malformed/model-supplied keys cannot
 * override the canonical fields. Legacy rows are derived from their own content. */
export function restoreOpportunityIdentity(row: Row): OpportunityIdentity {
  const stored = row.identity
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const value = stored as Row
    const derived = identifyOpportunity({ companies: value.companies, unresolvedCompanies: value.unresolvedCompanies,
      industrySegment: value.segment, driver: value.driver, event: row.title || row.event || row.hypothesis })
    if (value.version === 1 && value.key === derived.key && value.confidence === derived.confidence) {
      const basis = value.basis && typeof value.basis === 'object' ? value.basis as Row : {}
      const allowed = ['explicit-alias', 'text-alias', 'explicit-exact', 'ambiguous', 'missing']
      if (basis.companies === 'canonical-exact-set' && allowed.includes(String(basis.segment)) && allowed.includes(String(basis.driver))) {
        derived.basis = { companies: 'canonical-exact-set', segment: String(basis.segment), driver: String(basis.driver) }
      }
      return derived
    }
  }
  return identifyOpportunity(row)
}

export type IdentityCandidate = { id: string; identity: OpportunityIdentity }
export type IdentityMatch = { matchedId: string | null; candidateIds: string[]; reason: 'exact' | 'unique-coverage-change' | 'ambiguous' | 'new' }

/** Only a unique subset/superset company coverage change may inherit an identity.
 * Disjoint/partially overlapping sets or competing candidates require review. */
export function matchOpportunity(identity: OpportunityIdentity, history: IdentityCandidate[]): IdentityMatch {
  const exact = unique(history.filter(item => item.identity.key === identity.key).map(item => item.id))
  if (exact.length) return { matchedId: exact.length === 1 ? exact[0] : null, candidateIds: exact, reason: exact.length === 1 ? 'exact' : 'ambiguous' }
  const candidates = identity.confidence === 'complete' ? history.filter(({ identity: old }) =>
    old.confidence === 'complete' && old.segment === identity.segment && old.driver === identity.driver &&
    (old.companies.every(code => identity.companies.includes(code)) || identity.companies.every(code => old.companies.includes(code)))
  ) : []
  const ids = unique(candidates.map(item => item.id))
  return { matchedId: ids.length === 1 ? ids[0] : null, candidateIds: ids,
    reason: ids.length === 1 ? 'unique-coverage-change' : ids.length ? 'ambiguous' : 'new' }
}

export type EconomicFact = {
  // Stable source fact identity (e.g. issuer + metric + reporting period + revision), not article ID.
  factId: string; evidenceIds: string[]; baselineEvidenceIds: string[]
  verifiedAt: string; status: 'verified'; detail: string
}
export type OpportunityNovelty = {
  newSourceEventIds: string[]; newEvidenceIds: string[]; newEconomicFactIds: string[]
  economicStatus: 'unverified' | 'verified-new-facts' | 'no-new-verified-facts'
  verifiedEconomicFacts: EconomicFact[]
}

/** Economic novelty is explicit, source-backed comparison with a known baseline.
 * Merely adding a publication/evidence ID never establishes economic novelty. */
export function assessOpportunityNovelty(input: {
  asOf: string; sourceEventIds: string[]; evidenceIds: string[]
  previousSourceEventIds?: string[]; previousEvidenceIds?: string[]; previousEconomicFactIds?: string[]
  economicFacts?: EconomicFact[]
}): OpportunityNovelty {
  const known = new Set([...(input.previousEvidenceIds || []), ...input.evidenceIds])
  const verifiedEconomicFacts = (input.economicFacts || []).filter(fact => fact.status === 'verified' && fact.factId.trim() && fact.detail.trim() &&
    Number.isFinite(Date.parse(fact.verifiedAt)) && Date.parse(fact.verifiedAt) <= Date.parse(input.asOf) &&
    fact.evidenceIds.length > 0 && fact.baselineEvidenceIds.length > 0 &&
    fact.evidenceIds.every(id => input.evidenceIds.includes(id)) && fact.baselineEvidenceIds.every(id => known.has(id)) &&
    fact.evidenceIds.some(id => !fact.baselineEvidenceIds.includes(id)))
  const newEconomicFactIds = unique(verifiedEconomicFacts.map(fact => fact.factId)).filter(id => !input.previousEconomicFactIds?.includes(id))
  return {
    newSourceEventIds: unique(input.sourceEventIds).filter(id => !input.previousSourceEventIds?.includes(id)),
    newEvidenceIds: unique(input.evidenceIds).filter(id => !input.previousEvidenceIds?.includes(id)),
    newEconomicFactIds, verifiedEconomicFacts,
    economicStatus: !verifiedEconomicFacts.length ? 'unverified' : newEconomicFactIds.length ? 'verified-new-facts' : 'no-new-verified-facts',
  }
}
