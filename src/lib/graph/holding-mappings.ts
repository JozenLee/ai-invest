import type { ETFInput } from '@/lib/research/contracts'
import { requiredHoldingPeriod } from '@/lib/research/engine'
import { securityCode } from '@/lib/research/normalization'
import type { RawGraphGroup } from './research-context'

/** Derived snapshot links, never a rewrite or a publication of the source graph. */
export function withDisclosedHoldings(group: RawGraphGroup, etfs: ETFInput[], asOf: string, cutoff: string): RawGraphGroup {
  const result = structuredClone(group)
  const floor = requiredHoldingPeriod(cutoff)
  const update = (company: Record<string, any>) => {
    const code = securityCode(company.ticker || company.code)
    const existing = company.representativeEtfs || company.representative_etfs || []
    const verified = etfs.flatMap(etf => {
      if (new Set(etf.holdings.map(row=>row.code)).size!==etf.holdings.length ||
          new Set(etf.holdings.map(row=>row.period)).size!==1 ||
          etf.holdings.reduce((sum,row)=>sum+(row.weight||0),0)>100.5) return []
      const holding = etf.holdings.find(row => row.code === code)
      const knownAt = holding?.publishedAt || holding?.observedAt
      if (!holding?.period || !floor || holding.period < floor || holding.period > cutoff ||
          !knownAt || !(Date.parse(knownAt) <= Date.parse(asOf)) ||
          holding.weight === null || !Number.isFinite(holding.weight) || holding.weight <= 0 || holding.weight > 100) return []
      return [{code:etf.ticker,name:etf.name,relevance:0,holdingVerified:true,
        holdingWeight:holding.weight,reportPeriod:holding.period,source:holding.source,evidenceId:holding.evidenceId}]
    })
    company.representativeEtfs = [
      ...existing.filter((ref: {code:string}) => !etfs.some(etf=>etf.ticker===ref.code)), ...verified,
    ]
  }
  for (const stage of result.stages || []) for (const segment of stage.segments || []) for (const company of segment.companies || []) update(company)
  for (const company of result.companies || []) update(company)
  return result
}
