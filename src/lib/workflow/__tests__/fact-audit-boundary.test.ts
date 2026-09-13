import { describe, expect, it } from 'vitest'
import { saveValidatedResearchOutput, validateResearchResponse } from '../research-output'
import type { StepContext } from '../types'
import type { ResearchFact } from '@/lib/analysis/fact-audit'

function context() {
  const fact:ResearchFact={id:'ma',metric:'benchmark-ma60-deviation',subject:'000300',period:'2026-09-10',unit:'ratio',value:-.032786,scope:[],evidenceIds:[]}
  const artifacts=new Map<string,unknown>([['research-facts',[fact]]])
  return {artifacts,saveArtifact:async(key:string,value:unknown)=>{artifacts.set(key,value)}} as StepContext
}
const raw=(analysis:string)=>JSON.stringify({analysis,trend:'震荡',risk_level:'中',evidence:[],counterEvidence:[],watchlist:[]})
describe('fact auditing inside generation boundaries',()=>{
  it('rejects numeric contradictions while still in the model retry boundary',()=>{
    expect(()=>validateResearchResponse(raw('基准低于MA60约0.03%'),'market-analysis',context())).toThrow(/冻结值/)
    expect(validateResearchResponse(raw('基准低于MA60约3.28%'),'market-analysis',context()).factAudit.status).toBe('passed')
  })
  it('persists failure details without silently correcting the original report',async()=>{
    const ctx=context(),value=raw('基准低于MA60约0.03%')
    await saveValidatedResearchOutput(ctx,'market-analysis',value)
    expect(ctx.artifacts.get('market-analysis')).toBe(value)
    expect(ctx.artifacts.get('market-analysis-fact-audit')).toMatchObject({status:'failed',issues:[{code:'value-mismatch',path:'report.analysis'}]})
    expect(ctx.artifacts.get('market-analysis-validation')).toMatchObject({status:'limited',issues:[expect.any(String)]})
  })
  it('returns semantic warnings to callers and persists them as limitations',async()=>{
    const ctx=context(),value=raw('经营现金/利润高直接归因资本开支收缩')
    expect(validateResearchResponse(value,'market-analysis',ctx).factAudit.status).toBe('warning')
    await saveValidatedResearchOutput(ctx,'market-analysis',value)
    expect(ctx.artifacts.get('market-analysis-validation')).toMatchObject({status:'passed',issues:[],warnings:[expect.any(String)]})
    expect(ctx.artifacts.get('market-analysis-consistency')).toMatchObject([{code:'accounting-causality'}])
  })
  it('now rejects pre-existing company contradictions before saving',()=>{
    const ctx=context()
    ctx.artifacts.set('company-market-data',[{name:'深南电路',financials:[{period:'2026-06-30',currency:'CNY'}]}])
    expect(()=>validateResearchResponse(raw('深南电路币种未标注'),'market-analysis',ctx)).toThrow(/冻结财报已标注币种/)
  })
})
