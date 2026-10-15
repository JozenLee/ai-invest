import {describe,expect,it} from 'vitest'
import {saveValidatedResearchOutput,validateResearchOutput,valuationNarrative} from '@/lib/workflow/research-output'
import type {StepContext} from '@/lib/workflow/types'

describe('research output validation',()=>{
  it('rejects incomplete stage output',()=>{
    expect(()=>validateResearchOutput('{"analysis":"x"}','market-analysis')).toThrow(/缺少字段/)
  })
  it('repairs surrounding prose and trailing commas without a second model call',()=>{
    const raw='说明如下：\n```json\n{"analysis":"观察","trend":"未知","risk_level":"未知","evidence":[],"counterEvidence":[],"watchlist":[],}\n```\n以上。'
    expect(validateResearchOutput(raw,'market-analysis').text).toContain('"analysis":"观察"')
  })
  it('requires a dedicated comprehensive conclusion for investment advice',()=>{
    const raw=JSON.stringify({rating:'谨慎',tacticalView:{},strategicView:{},thesis:'单模块观点',etfImplications:[],scenarios:{},counterEvidence:[],risks:[],watchlist:[]})
    expect(()=>validateResearchOutput(raw,'investment-advice')).toThrow(/executiveSummary/)
  })
  it('flags legacy conclusions that omit opportunity and action modules',()=>{
    const raw=JSON.stringify({rating:'谨慎',executiveSummary:{conclusion:'谨慎',allocationStance:'低配',keyDrivers:[],mainRisks:[],actionPlan:{unheld:'观望',held:'持有'},reviewTriggers:[]},recommendation:{unheld:'观望',held:'持有',reason:'证据不足'},productDecisions:[],tacticalView:{},strategicView:{},thesis:'产业观点',etfImplications:[],scenarios:{},counterEvidence:[],risks:[],watchlist:[]})
    const result=validateResearchOutput(raw,'investment-advice')
    expect(result.issues.join('')).toContain('opportunities')
    expect(result.issues.join('')).toContain('priority')
  })
  it('removes ETF adjustment sources from company financial claims',()=>{
    const raw=JSON.stringify({analysis:'x',stage:'成长期',drivers:[],outlook:'x',evidence:[{claim:'公司净利润增长',source:'Tushare/fund_adj；公司财报'}],counterEvidence:[],watchlist:[]})
    const result=validateResearchOutput(raw,'industry-overview')
    expect(result.text).not.toContain('fund_adj')
    expect(result.issues).toEqual(expect.arrayContaining(['已移除不能支持公司财务结论的ETF复权因子来源','行业总览缺少按产业环节组织的segmentSignals']))
  })
  it('builds valuation text from distinct indices without confusing NAV dates',()=>{
    const text=valuationNarrative([{indexCode:'IDX',pe:20,pb:2,valuationDate:'2026-09-04',valuationSource:'constituents'},{indexCode:'IDX',pe:20,pb:2,valuationDate:'2026-09-04',valuationSource:'constituents'}])
    expect(text).toContain('1个跟踪指数');expect(text).toContain('2026-09-04');expect(text).toContain('constituents')
  })
  it('records a limited status when AI prose drops available graph mappings',async()=>{
    const artifacts=new Map<string,any>([['graph-context',{revisionId:'r1',mappingRevisionId:'m1',companyMappings:[{representativeEtfs:[{code:'159001'}]}]}]])
    const context={artifacts,saveArtifact:async(key:string,value:unknown)=>{artifacts.set(key,value)}} as StepContext
    const raw=JSON.stringify({analysis:'x',key_companies:[],chain_structure:[],evidence:[],counterEvidence:[],watchlist:[]})
    await saveValidatedResearchOutput(context,'company-analysis',raw)
    expect(artifacts.get('company-analysis-graph-usage-validation')).toMatchObject({status:'limited',mappingRevisionId:'m1'})
  })
  it('marks nested company fields as limited instead of accepting shape-only JSON',async()=>{
    const artifacts=new Map<string,any>()
    const context={artifacts,saveArtifact:async(key:string,value:unknown)=>{artifacts.set(key,value)}} as StepContext
    const raw=JSON.stringify({analysis:'x',key_companies:[{公司:'测试公司',代码:'600000'}],chain_structure:[],evidence:[],counterEvidence:[],watchlist:[]})
    await saveValidatedResearchOutput(context,'company-analysis',raw)
    expect(artifacts.get('company-analysis-validation')).toMatchObject({status:'limited'})
    expect(artifacts.get('company-analysis-validation').issues.join('')).toContain('graphPath')
  })
})
