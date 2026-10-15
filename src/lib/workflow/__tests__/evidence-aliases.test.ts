import {expect,it} from 'vitest'
import {aliasEvidence,expandEvidenceAliases} from '../evidence-aliases'
it('compresses repeated identifiers losslessly without rewriting prose or invented references',()=>{
  const id='snapshot-9382f8e5-545d-4a19-a72f:bars:588200'
  const original={products:[{evidenceIds:[id]}],claims:[{evidenceIds:[id]}],allowedEvidenceIds:[id],reason:'E1 is just prose'}
  const {evidence,aliases}=aliasEvidence(original)
  expect(JSON.stringify(evidence).length).toBeLessThan(JSON.stringify(original).length)
  const restored=expandEvidenceAliases(evidence,aliases) as typeof original
  expect(restored.products).toEqual(original.products)
  expect(restored.claims).toEqual(original.claims)
  expect(restored.reason).toBe(original.reason)
  expect(expandEvidenceAliases({evidenceIds:['E404']},aliases)).toEqual({evidenceIds:['E404']})
})
