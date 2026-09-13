import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { PlanningHolding } from '@/lib/portfolio/alternatives'
import type { RiskBudget } from '@/lib/portfolio/decision-support'
import type { ProductEvidence, ProductResearch } from '@/lib/portfolio/product-research'

// Test the pure boundary only: no transport or database calls are needed.
vi.mock('../analysis-prompt', () => ({ runAnalysisPrompt: vi.fn(), recoverableAnalysisError: vi.fn() }))
import { compactPrivateProductPacket, portfolioResearchPacket } from '../portfolio-research'
import { auditPrompt } from '../prompt-evidence'

const asOf = '2026-09-11T00:00:00Z'
const secrets = { amount: 987654321.12, quantity: 876543210.34, email: 'private-regression@example.invalid', channel: 'PRIVATE_CHANNEL_SENTINEL', accountId: 'PRIVATE_ACCOUNT_SENTINEL' }
const policy: RiskBudget = { riskProfile: 'moderate', investHorizon: 'long', minCashRatio: .1, maxIndustryRatio: .4, maxFundRatio: .2, maxSingleAdjustmentRatio: .1, stagedAdjustment: true }
const evidence = (key: string): ProductEvidence => ({
  id: createHash('sha256').update(key).digest('hex'), source: '公开基金定期报告', dataDate: '2026-06-30', publishedAt: '2026-08-25', observedAt: asOf,
  url: 'https://example.invalid/public-report.pdf', contentHash: createHash('sha256').update('document-' + key).digest('hex'),
  locator: '公开文件页码及原文定位。'.repeat(160),
})

function product(ticker: string, productType: ProductResearch['productType'], count = 40): ProductResearch {
  const report = evidence(ticker + '-report')
  const identity = evidence(ticker + '-identity')
  const nav = evidence(ticker + '-nav')
  const mapping = evidence(ticker + '-mapping')
  const underlying = ticker === '017470' ? '588200' : '588710'
  const navSeries = Array.from({ length: 90 }, (_, i) => ({ date: new Date(Date.UTC(2026, 5, i + 1)).toISOString().slice(0, 10), nav: 1 + i / 1000, adjustedNav: 1 + i / 1000, evidence: nav }))
  return {
    ticker, name: '公开产品' + ticker, productType, classification: 'official', identityEvidence: [identity],
    officialMapping: productType === 'feeder' ? { targetEtfCode: underlying, targetIndexCode: ticker === '017470' ? '000685.SH' : '950125.SH', targetIndexName: '公开跟踪指数', evidence: [mapping] } : null,
    navSeries, riskNavSeries: navSeries,
    disclosedHoldings: Array.from({ length: count }, (_, i) => ({ code: String(600000 + i), name: '披露股票' + i, kind: 'stock' as const, weightPct: i === 0 ? 0 : i === 1 ? null : 1.25, weightBasis: i === 1 ? 'unknown' as const : 'net-assets' as const, evidence: report })),
    assetAllocation: [{ asset: '股票', weightPct: 80, weightBasis: 'net-assets', evidence: report }, { asset: '现金', weightPct: 0, weightBasis: 'total-assets', evidence: report }],
    executionMaterials: { sell: { ticker, productType, asOf, side: 'sell', otc: { channel: secrets.channel, redemptionQuantity: secrets.quantity, lots: [{ id: secrets.accountId, quantity: secrets.quantity, acquiredAt: '2026-08-01', evidence: report, fee: { value: { ratePct: 1.5, fixedAmount: secrets.amount }, evidence: report, validUntil: '2026-09-12' } }] } } },
    exposure: { basis: 'disclosed-only', reportDate: '2026-06-30', knownWeightPct: 80, unobservedWeightPct: 20, limitation: '披露期暴露，不是实时权重', lookThrough: Array.from({ length: count }, (_, i) => ({ code: String(600000 + i), weightPct: i === 0 ? 0 : 1, via: productType === 'feeder' ? [underlying] : [], evidence: productType === 'feeder' ? [mapping, report, report] : [report, report] })) },
    coverage: { nav: true, adjustedNav: true, holdings: true, allocation: true, mappingRequired: productType === 'feeder', mapping: productType === 'feeder', adjustedNavWindow: { start: navSeries[0].date, end: navSeries.at(-1)!.date, observations: 90, fullHistoryObservations: 90, excludedObservations: 0, breakReason: null, basis: '显式复权净值' } },
    gaps: [{ ticker, code: 'disclosure-lag', detail: '披露权重不等于实时权重' }],
  }
}

function input(products: ProductResearch[]) {
  const holdings: PlanningHolding[] = products.map(p => ({ ticker: p.ticker, name: p.name, fundType: p.productType, industry: 'AI硬件', weightPct: 10, marketValue: secrets.amount, quantity: secrets.quantity, unitNav: 1.1, purchaseDate: '2026-08-01', researchReady: true, researchEvidenceIds: p.identityEvidence.map(e => e.id), targetEtfCode: p.officialMapping?.targetEtfCode, redemptionFeePct: 0, buyFeePct: null, navDate: '2026-09-10', executionGaps: ['待复核申请窗口'] }))
  const refs = products.flatMap(p => [...p.identityEvidence, ...(p.officialMapping?.evidence || []), ...p.disclosedHoldings.map(h => h.evidence), ...p.assetAllocation.map(a => a.evidence), ...p.navSeries.map(n => n.evidence), ...p.exposure.lookThrough.flatMap(h => h.evidence)])
  return { asOf, policy, cashWeightPct: 70, holdings, theses: [], productResearch: products, evidence: [...new Map(refs.map(e => [e.id, { id: e.id, source: e.source, dataDate: e.dataDate }])).values()] }
}

function assertNoPrivateFields(packet: unknown) {
  const serialized = JSON.stringify(packet)
  for (const value of Object.values(secrets)) expect(serialized).not.toContain(String(value))
  const forbidden = new Set(['amount', 'marketValue', 'quantity', 'units', 'email', 'accountId', 'channel', 'executionMaterials', 'purchaseDate', 'lots', 'redemptionQuantity', 'fixedAmount'])
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { expect(forbidden.has(key), key).toBe(false); visit(item) }
  }
  visit(packet)
}

describe('private portfolio research packet', () => {
  it('omits account amounts, quantities, email, channel and execution materials from products and holdings', () => {
    const p = product('017470', 'feeder')
    const contaminated = { ...p, ...secrets, disclosedHoldings: p.disclosedHoldings.map(h => ({ ...h, ...secrets, evidence: { ...h.evidence, ...secrets } })), identityEvidence: p.identityEvidence.map(e => ({ ...e, ...secrets })) }
    const request = input([contaminated])
    request.holdings = request.holdings.map(h => ({ ...h, ...secrets, executionMaterials: p.executionMaterials }))
    const before = JSON.stringify(request)
    const packet = portfolioResearchPacket(request)
    assertNoPrivateFields(packet)
    expect(packet.holdings[0]).toMatchObject({ ticker: '017470', weightPct: 10, feeKnown: true, buyFeeKnown: false, targetEtfCode: '588200' })
    expect(packet.productResearch[0].officialMapping?.targetEtfCode).toBe('588200')
    expect(packet.cashWeightPct).toBe(70)
    expect(JSON.stringify(request)).toBe(before)
  })

  it('retains every disclosed stock, weight basis, disclosure period and complete scope reference', () => {
    const products = [product('017470', 'feeder'), product('024975', 'feeder'), product('026633', 'active')]
    const request = input(products)
    const packet = portfolioResearchPacket(request)
    expect(packet.evidence).toEqual(request.evidence)
    const scope = new Set(packet.evidence.map(e => e.id))
    products.forEach((original, i) => {
      const compact = packet.productResearch[i]
      expect(compact.disclosedHoldings).toEqual(original.disclosedHoldings.map(h => ({ code: h.code, name: h.name, kind: h.kind, weightPct: h.weightPct, weightBasis: h.weightBasis, period: h.evidence.dataDate, evidenceId: h.evidence.id })))
      expect(compact.exposure.lookThrough).toEqual(original.exposure.lookThrough.map(h => ({ code: h.code, weightPct: h.weightPct, via: h.via, evidenceIds: [...new Set(h.evidence.map(e => e.id))] })))
      expect(compact.assetAllocation).toEqual(original.assetAllocation.map(a => ({ asset: a.asset, weightPct: a.weightPct, weightBasis: a.weightBasis, period: a.evidence.dataDate, evidenceId: a.evidence.id })))
      expect(compact.exposure).toMatchObject({ reportDate: '2026-06-30', unobservedWeightPct: 20 })
      expect(compact.navSeries).toHaveLength(2)
      expect(compact.navSeries.map(n => n.date)).toEqual(original.navSeries.slice(-2).map(n => n.date))
      expect(compact.officialMapping === null).toBe(original.productType === 'active')
      for (const id of [...compact.disclosedHoldings.map(h => h.evidenceId), ...compact.exposure.lookThrough.flatMap(h => h.evidenceIds), ...(compact.officialMapping?.evidenceIds || [])]) {
        expect(typeof id).toBe('string')
        expect(String(id)).toHaveLength(64)
        expect(scope.has(id as string)).toBe(true)
      }
    })
  })

  it('fits a large repeated-source workload into the model budget without reducing the disclosed universe', () => {
    const products = [product('017470', 'feeder'), product('024975', 'feeder'), product('026633', 'active')]
    const raw = JSON.stringify(products)
    expect(raw.length).toBeGreaterThan(215_552)
    const packet = portfolioResearchPacket(input(products))
    const content = JSON.stringify(packet)
    expect(content.length).toBeLessThan(80_000)
    expect(content.length).toBeLessThan(raw.length / 4)
    expect(packet.productResearch.reduce((n, p) => n + p.disclosedHoldings.length, 0)).toBe(120)
    expect(packet.productResearch.reduce((n, p) => n + p.exposure.lookThrough.length, 0)).toBe(120)
    expect(auditPrompt([{ content }])).toMatchObject({ passed: true, budgetExceeded: false, maxCharacters: 120_000 })
    assertNoPrivateFields(packet)
  })

  it('handles absent optional product evidence without creating fabricated exposures', () => {
    expect(compactPrivateProductPacket(undefined)).toEqual([])
    expect(compactPrivateProductPacket(null)).toEqual([])
    const packet = portfolioResearchPacket(input([]))
    expect(packet.productResearch).toEqual([])
    expect(packet.evidence).toEqual([])
  })
})
