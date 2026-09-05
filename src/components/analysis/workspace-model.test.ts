import {describe,it,expect} from 'vitest'
import {PHASES,artifact,phaseState,runProgress,type AnalysisRun,type RunStep} from './workspace-model'
const step=(name:string,status:string):RunStep=>({id:name,stepName:name,stepIndex:0,status,artifacts:[]})
describe('unified workspace presentation',()=>{
  it('assigns every workflow step to exactly one phase',()=>{
    const names=PHASES.flatMap(p=>[...p.steps]);expect(names).toHaveLength(20);expect(new Set(names).size).toBe(20)
    expect(PHASES[1].steps).toContain('etf-actions')
  })
  it('distinguishes execution completion from skipped AI and failed work',()=>{
    expect(phaseState([step('market-analysis','SKIPPED')],['market-analysis'])).toBe('skipped')
    expect(phaseState([step('etf-actions','COMPLETED')],['etf-actions'])).toBe('completed')
    expect(phaseState([step('etf-actions','FAILED')],['etf-actions'])).toBe('failed')
  })
  it('counts optional skipped steps and expands stored JSON once',()=>{
    const run={steps:[step('a','COMPLETED'),step('b','SKIPPED'),{...step('c','COMPLETED'),artifacts:[{artifactKey:'research-evaluation',data:'{"snapshotId":"frozen"}'}]}]} as AnalysisRun
    expect(runProgress(run).percent).toBe(100)
    expect(artifact(run,'research-evaluation')).toEqual({snapshotId:'frozen'})
  })
})
