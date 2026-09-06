import {describe,expect,it} from 'vitest'
import {validateResearchOutput,valuationNarrative} from '@/lib/workflow/research-output'

describe('research output validation',()=>{
  it('rejects incomplete stage output',()=>{
    expect(()=>validateResearchOutput('{"analysis":"x"}','market-analysis')).toThrow(/缺少字段/)
  })
  it('removes ETF adjustment sources from company financial claims',()=>{
    const raw=JSON.stringify({analysis:'x',stage:'成长期',drivers:[],outlook:'x',evidence:[{claim:'公司净利润增长',source:'Tushare/fund_adj；公司财报'}],counterEvidence:[],watchlist:[]})
    const result=validateResearchOutput(raw,'industry-overview')
    expect(result.text).not.toContain('fund_adj')
    expect(result.issues).toHaveLength(1)
  })
  it('builds valuation text from distinct indices without confusing NAV dates',()=>{
    const text=valuationNarrative([{indexCode:'IDX',pe:20,pb:2,valuationDate:'2026-09-04',valuationSource:'constituents'},{indexCode:'IDX',pe:20,pb:2,valuationDate:'2026-09-04',valuationSource:'constituents'}])
    expect(text).toContain('1个跟踪指数');expect(text).toContain('2026-09-04');expect(text).toContain('constituents')
  })
})
