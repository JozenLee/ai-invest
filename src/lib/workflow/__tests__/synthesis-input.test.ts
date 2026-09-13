import { expect,it } from 'vitest'
import { compactSynthesisInput } from '../synthesis-input'
it('removes duplicate raw packets while preserving rules, zeros, dates and counter-evidence',()=>{
  const input={industry:'硬件',asOf:'2026-09-10',decisionRules:[{ticker:'001',state:'blocked',conditions:[{label:'趋势',status:'unmet',value:0,operator:'>',threshold:0}]}],sourceModules:{market:{analysis:'谨慎',evidence:[{claim:'信号',source:'交易所',date:'2026-09-10',evidenceIds:['internal-id']}],counterEvidence:['量能下降']}},graph:{revisionId:'hash',stages:['large tree'],etfExposure:[{code:'001',segments:[{segment:'芯片',holdingVerified:false}]}]},decisionEventEvidence:[{excerpt:'重复全文'.repeat(10000)}],historicalReportContext:Array.from({length:10},()=>({sessionDate:'2026-09-09',comprehensiveConclusion:{conclusion:'此前观点',opportunities:['等待兑现']}}))}
  const result=compactSynthesisInput(input)
  expect(JSON.stringify(result)).toContain('internal-id')
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

it('keeps only referenced citations and unresolved upstream issues',()=>{
 const id='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
 const unused='f'.repeat(64)
 const result=compactSynthesisInput({citationRegistry:[{id,source:'冻结计算/企业全池统计',dataDate:'2026-09-10'},{id:unused,source:'未使用来源'}],technicalReadiness:{usable:10,requested:10,perEtf:Array.from({length:10},()=>({history:'重复行情'.repeat(100)}))},sourceModules:{companies:{evidence:[{claim:'全池统计',source:'冻结计算/企业全池统计',date:'2026-09-10',evidenceIds:[id],referenceIssues:['待核验']}],universeStatistics:{evidenceIds:[id]}}}})
 expect(result.citationRegistry).toEqual([{id,source:'冻结计算/企业全池统计',dataDate:'2026-09-10'}])
 expect(result.sourceModules).toMatchObject({companies:{evidence:[{evidenceIds:[id],referenceIssues:['待核验']}],universeStatistics:{evidenceIds:[id]}}})
 expect(JSON.stringify(result)).not.toContain(unused)
 expect(JSON.stringify(result)).not.toContain('重复行情')
})

it('compacts fact metadata while retaining every field required for fact checks',()=>{
 const fact={id:'fact:return20:001:2026-09-10:001',metric:'return20',subject:'001',period:'2026-09-10',unit:'percent',value:-3.2,scope:['001'],source:'冻结计算/指标事实',evidenceIds:['raw-a'],inputEvidenceCount:99}
 const result=compactSynthesisInput({factRegistry:[fact],citationRegistry:[{id:fact.id,source:'冻结计算/指标事实',dataDate:'2026-09-10'}]})
 expect(result.factRegistry).toEqual([{id:fact.id,metric:'return20',subject:'001',period:'2026-09-10',unit:'percent',value:-3.2,scope:['001']}])
 expect(JSON.stringify(result)).not.toContain('inputEvidenceCount')
 expect(result.citationRegistry).toHaveLength(1)
})
