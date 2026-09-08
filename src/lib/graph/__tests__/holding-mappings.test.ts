import { describe, expect, it } from 'vitest'
import { withDisclosedHoldings } from '../holding-mappings'
import { buildFrozenGraphContext } from '../research-context'
import { fixture } from '@/lib/research/__tests__/fixtures'

describe('disclosed graph mappings',()=>{
  const group={id:'ai',name:'AI',revisionId:'published',version:1,stages:[{code:'upstream',name:'上游',segments:[{code:'chips',name:'芯片',companies:[{code:'600000',name:'企业'}],matchedEtfs:[]}]}]}
  it('joins disclosed evidence without publishing or mutating the source graph',()=>{
    const snapshot=fixture()
    const mapped=withDisclosedHoldings(group,snapshot.etfs,snapshot.asOf,'2026-09-04')
    const context=buildFrozenGraphContext(mapped,{})
    expect(context.coverage.holdingVerifiedCoveragePct).toBe(100)
    expect(context.companyMappings[0].representativeEtfs?.[0]).toMatchObject({code:'159995',holdingWeight:60,evidenceId:'raw-one'})
    expect(context.mappingRevisionId).toBeNull()
    expect(context.revisionId).toBe('published')
    expect(group.stages[0].segments[0].companies[0]).not.toHaveProperty('representativeEtfs')
  })
  it('does not manufacture mappings from missing weights or future disclosures',()=>{
    const snapshot=fixture()
    snapshot.etfs[0].holdings[0].weight=null
    const missing=buildFrozenGraphContext(withDisclosedHoldings(group,snapshot.etfs,snapshot.asOf,'2026-09-04'),{})
    expect(missing.coverage.holdingVerifiedCoveragePct).toBe(0)
    snapshot.etfs[0].holdings[0].weight=60
    snapshot.etfs[0].holdings[0].publishedAt='2027-01-01'
    expect(buildFrozenGraphContext(withDisclosedHoldings(group,snapshot.etfs,snapshot.asOf,'2026-09-04'),{}).coverage.holdingVerifiedCoveragePct).toBe(0)
  })
})
