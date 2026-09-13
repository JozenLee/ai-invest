import { describe,expect,it } from 'vitest'
import { deterministicAnalysisSelected, workflowEffort, workflowInput } from '../method-config'
import type { StepContext } from '../types'

const context={input:{nodeConfigs:{'market-analysis':{methodId:'deterministic-analysis',parameters:{}},'company-analysis':{methodId:'hybrid-ai',parameters:{effort:'high'}}}},inputs:new Map([['companies',[{code:'1'}]]]),artifacts:new Map([['companies',[{code:'legacy'}]]])} as unknown as StepContext

describe('workflow method configuration',()=>{
  it('selects real execution strategies',()=>{
    expect(deterministicAnalysisSelected(context,'market-analysis')).toBe(true)
    expect(workflowEffort(context,'company-analysis')).toBe('high')
  })

  it('prefers explicitly bound input ports over the legacy artifact map',()=>{
    expect(workflowInput<Array<{code:string}>>(context,'companies','companies')).toEqual([{code:'1'}])
  })
})
