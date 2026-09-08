import { describe, expect, it } from 'vitest'
import { buildMatchingPrompt } from '../etf-index-matching'

describe('ETF/index matching prompt', () => {
  it('exposes holding evidence and disclosure boundary to the model', () => {
    const prompt = buildMatchingPrompt({
      nodeName: 'AI芯片',
      nodeType: 'segment',
      etfCandidates: [{
        ticker: '159001',
        name: '芯片ETF',
        evidenceScore: 0.9,
        holdingWeight: 18.5,
        holdingCount: 3,
        matchedCompanies: ['企业A'],
      }],
      indexCandidates: [],
    })
    expect(prompt).toContain('命中3家代表企业')
    expect(prompt).toContain('持仓有披露期滞后')
  })
})
