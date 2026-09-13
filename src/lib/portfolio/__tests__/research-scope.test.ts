import { expect, it } from 'vitest'
import { requiredPortfolioEtfs } from '../research-scope'
import type { ProductResearchRequest } from '../product-research'

it('includes feeder underlyings that are absent from actual holdings without mixing another industry', () => {
  const holdings = ['017470','024975','026633','999999'].map((ticker, i) => ({ ticker, name: ticker, marketValue: 100, weightPct: 1, industry: i === 3 ? '其他产业' : 'AI算力硬件' }))
  const requests = [['017470','588200'],['024975','588710'],['999999','512345'],['017470','588200']].map(([owner, targetCode]) => ({ targetType: 'etf', targetCode, datasetKey: 'etf_research', requiredBy: [owner], reason: '正式关系' })) as ProductResearchRequest[]
  expect(requiredPortfolioEtfs(holdings, requests, { id: 'ai', name: 'AI算力硬件' }).map(item => item.code)).toEqual(['588200','588710'])
})
