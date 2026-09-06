import { describe,it,expect } from 'vitest'
import { auditPrompt,companyEvidence,evidenceText } from '../workflow/prompt-evidence'
describe('expanded analysis evidence',()=>{
  it('rejects unexpanded objects rather than passing them to AI',()=>{
    expect(auditPrompt([{content:'有效数据'.repeat(50)+'[object Object]'}]).passed).toBe(false)
    expect(auditPrompt([{content:'有效数据'.repeat(50)+'[Array]'}]).passed).toBe(false)
    expect(auditPrompt([{content:'有效数据'.repeat(50)+evidenceText({price:123,financials:[{revenue:456}]})}]).passed).toBe(true)
  })
  it('keeps multiple report periods for growth comparisons',()=>{
    const rows=companyEvidence([{stockCode:'1',financials:[{reportType:'income',period:'2026',metrics:[{label:'营收',value:100}]},{reportType:'income',period:'2025',metrics:[{label:'营收',value:80}]},{reportType:'balance',period:'2026',metrics:[{label:'资产',value:200}]}]}])
    expect(rows[0].financials).toHaveLength(3)
    expect(rows[0].financials.find(r=>r.period==='2025')?.metrics['营收']).toBe(80)
    expect(rows[0].financials.find(r=>r.reportType==='income')?.metrics['营收']).toBe(100)
  })
})
