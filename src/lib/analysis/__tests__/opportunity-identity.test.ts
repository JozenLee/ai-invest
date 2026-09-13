import { describe, expect, it } from 'vitest'
import { identifyOpportunity, matchOpportunity, assessOpportunityNovelty } from '../opportunity-identity'
import { buildOpportunityLedger, deduplicateOpportunityHistory } from '../opportunity-ledger'

const identity = (companies = ['002463'], event = '高速PCB订单增长') => identifyOpportunity({ affectedCompanies: companies, event })
const base = {
  asOf: '2026-09-10T08:00:00Z',
  news: { catalysts: [{ event: '高速PCB订单增长', affectedCompanies: ['002463'], sourceEventIds: ['e1'] }] },
  events: [{ id: 'e1', status: 'evidence', publishedAt: '2026-09-09', evidenceIds: ['raw1'] }],
  holdings: [], decisions: [], graph: {},
}

describe('auditable opportunity identity', () => {
  it('ignores renamed model labels and canonicalizes security aliases and order', () => {
    const a = identifyOpportunity({ affectedCompanies: ['sz002463', '002916.SZ', '002463'], event: '高速PCB订单增长', opportunityKey: 'PCB机会' })
    const b = identifyOpportunity({ affectedCompanies: ['002916', '002463'], event: '印制电路板接单改善', opportunityKey: '高端板新机遇' })
    expect(a.key).toBe(b.key)
    expect(a).toMatchObject({ companies: ['002463', '002916'], segment: 'pcb', driver: 'orders', confidence: 'complete' })
    expect(a.basis).toMatchObject({ companies: 'canonical-exact-set', driver: 'text-alias' })
  })
  it('migrates decorated company labels from either resolved or unresolved history', () => {
    const canonical = identity(['002335', '301018'], '液冷订单增长')
    expect(identifyOpportunity({ companies: [], unresolvedCompanies: ['科华数据(002335)', '301018申菱环境'], event: '液冷订单增长' }).key).toBe(canonical.key)
    expect(identifyOpportunity({ affectedCompanies: ['科华数据(002335)', '301018申菱环境'], event: '液冷订单增长' })).toMatchObject({ companies: ['002335', '301018'], unresolvedCompanies: [], confidence: 'complete' })
  })
  it('matches renamed liquid cooling but separates drivers and markets', () => {
    expect(identity(['002463'], '液冷接单').key).toBe(identity(['002463'], 'liquid cooling orders').key)
    expect(identity(['002463'], 'PCB扩产').key).not.toBe(identity().key)
    expect(identity(['1.HK']).key).not.toBe(identity(['000001']).key)
  })
  it('does not merge disjoint, partially overlapping, conflicting or unresolved identities', () => {
    const previous = [{ id: 'a', identity: identity(['002463', '002916']) }]
    for (const next of [identity(['300476']), identity(['002916', '300476']), identity(['002463'], 'PCB扩产'), identity(['同名公司'])]) {
      expect(matchOpportunity(next, previous).matchedId).toBeNull()
    }
    expect(identifyOpportunity({ affectedCompanies: ['002463'], event: 'PCB订单与扩产' }).confidence).toBe('unresolved')
  })
  it('requires a unique candidate for company expansion; does not bridge two independent ideas', () => {
    const a = { id: 'a', identity: identity(['002463']) }, b = { id: 'b', identity: identity(['002916']) }
    expect(matchOpportunity(identity(['002463', '002916']), [a])).toMatchObject({ matchedId: 'a', reason: 'unique-coverage-change' })
    expect(matchOpportunity(identity(['002463', '002916']), [b, a])).toEqual({ matchedId: null, candidateIds: ['a', 'b'], reason: 'ambiguous' })
  })
  it('accepts explicit segment/driver but will not use a shared model key across companies', () => {
    const a = identifyOpportunity({ companies: ['002463'], industrySegment: 'pcb', driver: 'orders', title: '完全换名' })
    expect(a.key).toBe(identity().key)
    const ledger = buildOpportunityLedger({ ...base, news: { catalysts: [
      { ...base.news.catalysts[0], opportunityKey: 'pcb' },
      { ...base.news.catalysts[0], opportunityKey: 'pcb', affectedCompanies: ['002916'] },
    ] } })
    expect(ledger).toHaveLength(2)
  })
})

describe('ledger migration and disclosure boundaries', () => {
  it('merges renamed legacy history, preserves earliest firstSeen and all sources without mutating input', () => {
    const first = buildOpportunityLedger(base)[0]
    const a = { ...first, id: 'legacy-pcb-a', identity: undefined, evidenceIds: ['raw1'], sourceEventIds: ['e1'] }
    const b = { ...first, id: 'legacy-pcb-b', identity: undefined, title: '印制电路板接单改善', firstSeenAt: '2026-09-11T08:00:00Z', reviewedAt: '2026-09-11T08:00:00Z', evidenceIds: ['raw2'], sourceEventIds: ['e2'] }
    const history = [{ opportunityLedger: [b] }, { opportunityLedger: [a] }]
    const original = JSON.stringify(history)
    const next = buildOpportunityLedger({ ...base, asOf: '2026-09-12T08:00:00Z', history,
      news: { catalysts: [{ ...base.news.catalysts[0], event: 'PCB接单持续改善' }] } })
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: a.id, firstSeenAt: base.asOf, evidenceIds: ['raw1', 'raw2'], newEvidenceIds: [], sourceEventIds: ['e1', 'e2'] })
    expect(next[0].legacyIds).toEqual(['legacy-pcb-a', 'legacy-pcb-b'])
    expect(JSON.stringify(history)).toBe(original)
    expect(deduplicateOpportunityHistory(next)).toEqual(next)
  })
  it('deduplicates multiple current mentions and unions new sources', () => {
    const ledger = buildOpportunityLedger({ ...base, news: { catalysts: [base.news.catalysts[0], { ...base.news.catalysts[0], event: '印制电路板接单', sourceEventIds: ['e2'] }] },
      events: [...base.events, { ...base.events[0], id: 'e2', evidenceIds: ['raw2'] }] })
    expect(ledger).toHaveLength(1)
    expect(ledger[0].newEvidenceIds).toEqual(['raw1', 'raw2'])
    expect(ledger[0].novelty).toMatchObject({ newSourceEventIds: ['e1', 'e2'], economicStatus: 'unverified', newEconomicFactIds: [] })
  })
  it('excludes future history/evidence and never backdates firstSeen to a publication', () => {
    const prior = buildOpportunityLedger({ ...base, asOf: '2026-09-12T08:00:00Z' })
    const ledger = buildOpportunityLedger({ ...base, history: [{ opportunityLedger: prior }], events: [{ ...base.events[0], publishedAt: '2026-09-11' }] })
    expect(ledger[0].firstSeenAt).toBe(base.asOf)
    expect(ledger[0].evidenceIds).toEqual([])
  })
  it('only accepts explicitly verified first disclosure and keeps the report period distinct', () => {
    const event = { ...base.events[0], excerpt: '2026年上半年营收', firstDisclosureAt: '2026-08-20' }
    expect(buildOpportunityLedger({ ...base, events: [event] })[0].disclosureTimeline?.[0]).toMatchObject({ firstDisclosureAt: null, reportPeriod: '2026-06-30' })
    expect(buildOpportunityLedger({ ...base, events: [{ ...event, firstDisclosureStatus: 'verified', firstDisclosureEvidenceIds: ['raw1'] }] })[0].disclosureTimeline?.[0]).toMatchObject({ observedPublicationAt: '2026-09-09', firstDisclosureAt: '2026-08-20' })
  })
  it('retains two historical candidates when a current idea bridges them', () => {
    const previous = buildOpportunityLedger({ ...base, news: { catalysts: [base.news.catalysts[0], { ...base.news.catalysts[0], affectedCompanies: ['002916'] }] } })
    const current = buildOpportunityLedger({ ...base, asOf: '2026-09-11T08:00:00Z', history: [{ opportunityLedger: previous }], news: { catalysts: [{ ...base.news.catalysts[0], affectedCompanies: ['002463', '002916'] }] } })
    expect(current).toHaveLength(3)
    expect(current.find(row => row.companies.length === 2)?.identityMatch?.reason).toBe('ambiguous')
  })
  it('does not collapse two split current identities into one inherited ID', () => {
    const previous = buildOpportunityLedger({ ...base, news: { catalysts: [{ ...base.news.catalysts[0], affectedCompanies: ['002463', '002916'] }] } })
    const current = buildOpportunityLedger({ ...base, asOf: '2026-09-11T08:00:00Z', history: [{ opportunityLedger: previous }], news: { catalysts: [
      base.news.catalysts[0], { ...base.news.catalysts[0], affectedCompanies: ['002916'] },
    ] } })
    expect(current).toHaveLength(3)
    expect(new Set(current.map(row => row.id)).size).toBe(3)
    expect(current.filter(row => row.reviewedAt === '2026-09-11T08:00:00Z').every(row => row.identityMatch?.reason === 'ambiguous')).toBe(true)
  })
  it('retains auditable company coverage changes and a verified disclosure on later re-observation', () => {
    const previous = buildOpportunityLedger({ ...base, events: [{ ...base.events[0], firstDisclosureAt: '2026-08-20', firstDisclosureStatus: 'verified', firstDisclosureEvidenceIds: ['raw1'] }] })
    const current = buildOpportunityLedger({ ...base, asOf: '2026-09-11T08:00:00Z', history: [{ opportunityLedger: previous }], news: { catalysts: [{ ...base.news.catalysts[0], affectedCompanies: ['002463', '002916'] }] } })
    expect(current[0].identityHistory?.map(i => i.companies)).toEqual([['002463'], ['002463', '002916']])
    expect(current[0].disclosureTimeline?.[0].firstDisclosureAt).toBe('2026-08-20')
  })
  it('ignores forged persisted identity keys and excludes future reviewed evidence', () => {
    const previous = buildOpportunityLedger(base)[0]
    const future = { ...previous, reviewedAt: '2026-09-12T08:00:00Z', evidenceIds: ['future'] }
    const out = buildOpportunityLedger({ ...base, history: [{ opportunityLedger: [future] }] })
    expect(out[0].evidenceIds).toEqual(['raw1'])
    const bad = { ...previous, identity: { ...previous.identity!, key: 'forged', companies: [] } }
    expect(deduplicateOpportunityHistory([bad])[0].identity?.key).toBe(previous.identity?.key)
  })
  it('persists economic fact identity across repeated source publications without counting it twice', () => {
    const previous = buildOpportunityLedger(base)
    const fact = { factId: 'pcb/orders/2026h1/v2', evidenceIds: ['raw2'], baselineEvidenceIds: ['raw1'], verifiedAt: '2026-09-11T07:00:00Z', status: 'verified' as const, detail: '公告核验的订单修订' }
    const input = { ...base, asOf: '2026-09-11T08:00:00Z', history: [{ opportunityLedger: previous }], economicFacts: [fact],
      news: { catalysts: [{ ...base.news.catalysts[0], sourceEventIds: ['e2'] }] }, events: [{ ...base.events[0], id: 'e2', publishedAt: '2026-09-11', evidenceIds: ['raw2'] }] }
    const current = buildOpportunityLedger(input)
    expect(current[0].novelty?.newEconomicFactIds).toEqual([fact.factId])
    expect(current[0].firstSeenAt).toBe(base.asOf)
    const next = buildOpportunityLedger({ ...input, asOf: '2026-09-12T08:00:00Z', history: [{ opportunityLedger: current }] })
    expect(next[0].novelty?.economicStatus).toBe('no-new-verified-facts')
    expect(next[0].novelty?.newEconomicFactIds).toEqual([])
  })
})

describe('source novelty is not economic novelty', () => {
  const novelty = { asOf: base.asOf, sourceEventIds: ['reprint'], evidenceIds: ['new'], previousEvidenceIds: ['baseline'] }
  const fact = { factId: 'issuer/orders/2026h1/revision1', evidenceIds: ['new'], baselineEvidenceIds: ['baseline'], verifiedAt: '2026-09-09T08:00:00Z', status: 'verified' as const, detail: '相对已披露订单基线的更正' }
  it('does not treat a reprint/new evidence ID as verified economic change', () => {
    expect(assessOpportunityNovelty(novelty)).toMatchObject({ newEvidenceIds: ['new'], economicStatus: 'unverified', newEconomicFactIds: [] })
  })
  it('requires linked current evidence, a known baseline and timely verification', () => {
    for (const invalid of [{ ...fact, baselineEvidenceIds: [] }, { ...fact, baselineEvidenceIds: ['missing'] }, { ...fact, evidenceIds: ['missing'] }, { ...fact, verifiedAt: '2026-09-12T08:00:00Z' }]) {
      expect(assessOpportunityNovelty({ ...novelty, economicFacts: [invalid] }).economicStatus).toBe('unverified')
    }
    expect(assessOpportunityNovelty({ ...novelty, economicFacts: [fact] }).economicStatus).toBe('verified-new-facts')
    expect(assessOpportunityNovelty({ ...novelty, economicFacts: [fact], previousEconomicFactIds: [fact.factId] })).toMatchObject({ economicStatus: 'no-new-verified-facts', newEconomicFactIds: [] })
  })
})
