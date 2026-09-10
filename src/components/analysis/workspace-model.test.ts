import {describe,it,expect} from 'vitest'
import {PHASES,artifact,phaseState,runProgress,type AnalysisRun,type RunStep} from './workspace-model'
const step=(name:string,status:string):RunStep=>({id:name,stepName:name,stepIndex:0,status,artifacts:[]})
describe('unified workspace presentation',()=>{
  it('assigns every workflow step to exactly one phase',()=>{
    const names=PHASES.flatMap(p=>[...p.steps]);expect(names).toHaveLength(19);expect(new Set(names).size).toBe(19)
    expect(PHASES).toHaveLength(3)
    expect(PHASES.find(phase=>phase.id==='analysis')?.steps).not.toContain('etf-actions')
    expect(PHASES.find(phase=>phase.id==='output')?.steps).toEqual(['industry-overview','investment-advice','portfolio-decision','social-report','generate-report'])
  })
  it('distinguishes execution completion from skipped AI and failed work',()=>{
    expect(phaseState([step('market-analysis','SKIPPED')],['market-analysis'])).toBe('skipped')
    expect(phaseState([step('etf-actions','COMPLETED')],['etf-actions'])).toBe('completed')
    expect(phaseState([step('etf-actions','FAILED')],['etf-actions'])).toBe('failed')
  })
  it('counts optional skipped steps and expands stored JSON once',()=>{
    const workflowSteps=PHASES.flatMap(phase=>phase.steps.map(name=>step(name,name==='news-analysis'?'SKIPPED':'COMPLETED')))
    const run={steps:[...workflowSteps,{...step('artifact','COMPLETED'),artifacts:[{artifactKey:'research-evaluation',data:'{"snapshotId":"frozen"}'}]}]} as AnalysisRun
    expect(runProgress(run)).toMatchObject({total:19,done:19})
    expect(runProgress(run).percent).toBe(100)
    expect(artifact(run,'research-evaluation')).toEqual({snapshotId:'frozen'})
  })
})

it('counts archived 21-step runs by subprocess, not by three phase groups',()=>{
  const steps=PHASES.flatMap(phase=>phase.steps.map(name=>step(name,'COMPLETED')))
  expect(runProgress({steps:[...steps,step('etf-actions','COMPLETED'),step('portfolio-analysis','SKIPPED')]} as AnalysisRun)).toEqual({total:21,done:21,percent:100})
  expect(runProgress({steps:[step('market-analysis','COMPLETED'),step('news-analysis','FAILED')]} as AnalysisRun)).toEqual({total:2,done:1,percent:50})
})
