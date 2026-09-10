import { expect,it } from 'vitest'
import { compactSynthesisInput } from '../synthesis-input'
it('removes duplicate raw packets while preserving rules, zeros, dates and counter-evidence',()=>{
  const input={industry:'硬件',asOf:'2026-09-10',decisionRules:[{ticker:'001',state:'blocked',conditions:[{label:'趋势',status:'unmet',value:0,operator:'>',threshold:0}]}],sourceModules:{market:{analysis:'谨慎',evidence:[{claim:'信号',source:'交易所',date:'2026-09-10',evidenceIds:['internal-id']}],counterEvidence:['量能下降']}},graph:{revisionId:'hash',stages:['large tree'],etfExposure:[{code:'001',segments:[{segment:'芯片',holdingVerified:false}]}]},decisionEventEvidence:[{excerpt:'重复全文'.repeat(10000)}],historicalReportContext:Array.from({length:10},()=>({sessionDate:'2026-09-09',comprehensiveConclusion:{conclusion:'此前观点',opportunities:['等待兑现']}}))}
  const result=compactSynthesisInput(input)
  expect(JSON.stringify(result)).not.toContain('internal-id')
  expect(JSON.stringify(result)).not.toContain('重复全文')
  expect(JSON.stringify(result)).not.toContain('large tree')
  expect(result.decisionRules).toMatchObject([{conditions:[{value:0,threshold:0}]}])
  expect(result.graph).toMatchObject({etfExposure:[{segments:[{holdingVerified:false}]}]})
  expect(result.sourceModules).toMatchObject({market:{evidence:[{source:'交易所',date:'2026-09-10'}],counterEvidence:['量能下降']}})
  expect(result.dataScope).toMatchObject({historyReports:10,selectedHistoryReports:3})
  expect(JSON.stringify(result).length).toBeLessThan(2500)
})

it('preserves falsification and pricing boundaries in the final synthesis',()=>{
  const result=compactSynthesisInput({sourceModules:{news:{catalysts:[{opportunityKey:'pcb',sourceEventIds:['event-a'],invalidation:'连续两期毛利率下行',pricingAssessment:'无一致预期，不判断超预期',conditions:'订单回款'}]}}})
  expect(result.sourceModules).toMatchObject({news:{catalysts:[{sourceEventIds:['event-a'],invalidation:'连续两期毛利率下行',pricingAssessment:'无一致预期，不判断超预期'}]}})
})
