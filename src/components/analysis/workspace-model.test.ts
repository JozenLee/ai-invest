import {describe,it,expect} from 'vitest'
import {PHASES,artifact,phaseState,runProgress,shouldPollRun,type AnalysisRun,type RunStep} from './workspace-model'
const step=(name:string,status:string):RunStep=>({id:name,stepName:name,stepIndex:0,status,artifacts:[]})
describe('unified workspace presentation',()=>{
  it('assigns every workflow step to exactly one phase',()=>{
    const names=PHASES.flatMap(p=>[...p.steps]);expect(names).toHaveLength(22);expect(new Set(names).size).toBe(22)
    expect(PHASES).toHaveLength(8)
    expect(PHASES.find(phase=>phase.id==='analysis')?.steps).toContain('etf-actions')
    expect(PHASES.find(phase=>phase.id==='portfolio')?.steps).toEqual(['portfolio-decision','portfolio-analysis'])
  })
  it('distinguishes execution completion from skipped AI and failed work',()=>{
    expect(phaseState([step('market-analysis','SKIPPED')],['market-analysis'])).toBe('skipped')
    expect(phaseState([step('etf-actions','COMPLETED')],['etf-actions'])).toBe('completed')
    expect(phaseState([step('etf-actions','FAILED')],['etf-actions'])).toBe('failed')
  })
  it('counts optional skipped steps and expands stored JSON once',()=>{
    const workflowSteps=PHASES.flatMap(phase=>phase.steps.map(name=>step(name,name==='portfolio-analysis'?'SKIPPED':'COMPLETED')))
    workflowSteps[0]={...workflowSteps[0],artifacts:[{artifactKey:'research-evaluation',data:'{"snapshotId":"frozen"}'}]}
    const run={steps:workflowSteps} as AnalysisRun
    expect(runProgress(run)).toMatchObject({total:22,done:22})
    expect(runProgress(run).percent).toBe(100)
    expect(artifact(run,'research-evaluation')).toEqual({snapshotId:'frozen'})
  })
  it('presents archived completed runs as fully closed after workflow upgrades',()=>{
    const legacySteps=PHASES.flatMap(phase=>phase.steps.slice(0,Math.max(1,phase.steps.length-1)).map(name=>step(name,'COMPLETED')))
    const run={status:'COMPLETED',steps:legacySteps} as AnalysisRun
    expect(runProgress(run)).toEqual({total:legacySteps.length,done:legacySteps.length,percent:100})
  })
  it('uses the persisted topology node count and actual node states for live progress',()=>{
    const steps=[step('freeze-research','COMPLETED'),step('fetch-market-snapshot','RUNNING'),step('fetch-etfs','PENDING')]
    const run={status:'RUNNING',steps} as AnalysisRun
    expect(runProgress(run)).toEqual({total:3,done:1,percent:33})
  })
  it('keeps polling through the pending-to-running transition and stops at terminal states',()=>{
    expect(shouldPollRun('PENDING')).toBe(true)
    expect(shouldPollRun('RUNNING')).toBe(true)
    expect(shouldPollRun('COMPLETED')).toBe(false)
    expect(shouldPollRun('FAILED')).toBe(false)
  })
})
