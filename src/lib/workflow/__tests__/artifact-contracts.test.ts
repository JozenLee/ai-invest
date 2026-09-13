import { describe,expect,it } from 'vitest'
import { validateArtifactValue } from '../artifact-contracts'

describe('artifact contracts',()=>{
  it('validates structured port payloads',()=>{
    expect(validateArtifactValue('etf-bindings',[]).valid).toBe(true)
    expect(validateArtifactValue('etf-bindings',{}).valid).toBe(false)
    expect(validateArtifactValue('market-analysis','{"analysis":"ok"}').valid).toBe(true)
    expect(validateArtifactValue('market-analysis','plain markdown').valid).toBe(false)
  })

  it('requires explicit nullable ports',()=>{
    expect(validateArtifactValue('portfolio-analysis',null).valid).toBe(false)
    expect(validateArtifactValue('portfolio-analysis',null,{nullable:true}).valid).toBe(true)
  })
})
