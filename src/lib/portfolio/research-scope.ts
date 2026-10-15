import type { PlanningHolding } from './alternatives'
import type { ProductResearchRequest } from './product-research'

/** An underlying ETF is usually absent from the account's products list. Route by verified request ownership. */
export function requiredPortfolioEtfs(holdings: PlanningHolding[], requests: ProductResearchRequest[], industry: { id: string; name: string }) {
  const relevant = new Set(holdings.filter(holding => holding.industry === industry.name || holding.industryCode === industry.id).map(holding => holding.ticker))
  return [...new Set(requests.filter(request => request.targetType === 'etf' && /^\d{6}$/.test(request.targetCode) && request.requiredBy.some(code => relevant.has(code))).map(request => request.targetCode))].map(code => ({ code, name: code }))
}

