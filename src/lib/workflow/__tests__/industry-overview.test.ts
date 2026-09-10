import { expect,it,vi } from 'vitest'
vi.mock('../analysis-prompt',()=>({runAnalysisPrompt:vi.fn(),recoverableAnalysisError:vi.fn()}))
import { buildIndustryOverview } from '../steps/industry-overview-step'
import { researchEvidence } from '../research-input'
import { companyResearchPacket } from '../prompt-evidence'
import type { StepContext } from '../types'

it('links events by stable identity and preserves text counter-evidence through the real packet',()=>{
 const artifacts=new Map<string,unknown>([
 ['research-snapshot',{asOf:'2026-09-10T08:45:00Z'}],
 ['graph-context',{stages:[{name:'上游',segments:[{code:'pcb',name:'高速PCB与载板',companies:[{code:'002463',name:'测试公司'}],etfs:[]}]}]}],
 ['news-events',[{id:'e1',segments:['pcb']}]],
 ['news-analysis',JSON.stringify({analysis:'事件',catalysts:[{event:'订单增长',sourceEventIds:['e1'],path:'不同的环节别名',invalidation:'回款下降',pricingAssessment:'待核验'}],risks:['收入确认延期']})],
 ['market-analysis',JSON.stringify({analysis:'市场',counterEvidence:['成交量下降']})],
 ['company-analysis',JSON.stringify({analysis:'企业',counterEvidence:['现金流弱']})],
 ])
 const ctx={artifacts} as StepContext
 const result=buildIndustryOverview(ctx)
 expect(result.segmentSignals[0].eventSignal).toBe('订单增长')
 expect(result.counterEvidence).toEqual(['成交量下降','现金流弱','收入确认延期'])
 const packet=researchEvidence(ctx,'industry-overview')
 expect(packet.asOf).toBe('2026-09-10T16:45:00.000+08:00')
 expect(packet.news.catalysts[0]).toMatchObject({invalidation:'回款下降',pricingAssessment:'待核验'})
})
it('computes full universe breadth without treating unknown observations as zero',()=>{
 const result=companyResearchPacket([{code:'a',profitGrowthPct:10,cashConversionPct:70},{code:'b',profitGrowthPct:-5,cashConversionPct:0},{code:'c',profitGrowthPct:null,cashConversionPct:null}])
 expect(result.coverage).toMatchObject({companyCount:3,profitGrowthKnown:2,positiveProfitGrowth:1,cashQualityKnown:2,healthyCashConversion:1,medianProfitGrowthPct:2.5})
})
