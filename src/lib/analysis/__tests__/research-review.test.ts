import { describe, expect, it } from 'vitest'
import { financialView } from '@/lib/market-detail'
import { enrichCatalysts, disclosedExposure, securityKey } from '../disclosed-exposure'
import { buildOpportunityLedger } from '../opportunity-ledger'
import { compactSynthesisInput } from '@/lib/workflow/synthesis-input'
import { assessDecisionTiming, effectiveDecisionTiming } from '../decision-timing'
import { buildReportQuality } from '../report-quality'
import { evaluateResearch } from '@/lib/research/engine'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { auditResearchConsistency } from '../research-consistency'

describe('investment research review regressions', () => {
  it('flags financial contradictions and prevents an advice-grade score', () => {
    const companies=[{code:'002916',name:'深南电路',financials:[{period:'2026-06-30',currency:'CNY',rawMetrics:[{label:'q_sales_yoy',value:53.4377},{label:'tr_yoy',value:46.3283}]}]}]
    const issues=auditResearchConsistency({key_companies:[{code:'002916',name:'深南电路',operatingEvidence:'H1营收同比53.4%',counterEvidence:'币种未标注'}]},companies)
    expect(issues).toHaveLength(2)
    expect(auditResearchConsistency({claim:'深南电路H1营收同比46.33%'},companies)).toEqual([])
    const quality=buildReportQuality({evaluation:evaluateResearch(fixture()),dataQuality:{status:'available'},consistencyIssues:issues.map(issue=>issue.detail)})
    expect(quality.usability).toBe('insufficient')
    expect(quality.overallScore).toBeLessThan(50)
  })
  it('keeps single-quarter and cumulative revenue growth distinct', () => {
    const view = financialView({ reportPeriod:'2026-06-30', reportType:'income', source:'tushare', publishDate:null,
      metricsJson:JSON.stringify({currency:'CNY',q_sales_yoy:53.4377,tr_yoy:46.3283,q_netprofit_yoy:90,netprofit_yoy:65.5463}) })
    expect(view.currency).toBe('CNY')
    expect(Object.fromEntries(view.metrics.map(item=>[item.label,item.value]))).toMatchObject({营收同比:46.3283,单季度营收同比:53.4377,净利润同比:65.5463,单季度净利润同比:90})
  })
  it('does not infer cumulative growth when only a quarterly value is present', () => {
    const view=financialView({reportPeriod:'2026-06-30',reportType:'income',source:'tushare',publishDate:null,metricsJson:'{"q_sales_yoy":53.4377}'})
    expect(view.metrics).toEqual([{label:'单季度营收同比',value:53.4377}])
  })
  const holdings=[{code:'688008',etfCode:'159995',weight:7.33,period:'2026-06-30',evidenceId:'h1'},{code:'688525',etfCode:'159995',weight:4.02,period:'2026-06-30',evidenceId:'h1'}]
  it('maps storage news to disclosed ETF holdings without promoting graph-only candidates', () => {
    const result=enrichCatalysts({catalysts:[{event:'存储订单',affectedCompanies:['688008','688525'],affectedEtfs:['159565']}]},holdings)
    expect(result.catalysts).toMatchObject([{affectedEtfs:['159995'],graphCandidateEtfs:['159565'],disclosedExposure:[{weightPct:11.35}]}])
    expect(disclosedExposure(['688008'],[...holdings,holdings[0]])[0].weightPct).toBe(7.33)
    expect(securityKey('009988')).toBe(securityKey('9988.HK'))
    expect(securityKey('000001')).not.toBe(securityKey('1.HK'))
  })
  it('retains evidence boundaries during synthesis compaction', () => {
    const packet=compactSynthesisInput({indexOverlaps:[{weightedOverlapPct:0,basis:'前十大持仓交集，不是完整指数重叠'}]})
    expect(packet.indexOverlaps).toEqual([{weightedOverlapPct:0,basis:'前十大持仓交集，不是完整指数重叠'}])
  })
  it('does not count repeated sources as new opportunities or mark missing ideas as realized', () => {
    const input={asOf:'2026-09-10T05:00:00Z',news:{catalysts:[{event:'存储订单',affectedCompanies:['688008'],conditions:'验证现金回收'}]},events:[{id:'event',title:'存储订单',status:'evidence',companies:['688008'],evidenceIds:['e1'],publishedAt:'2026-09-09'}],holdings,decisions:[{ticker:'159995',state:'risk-off'}],graph:{}}
    const first=buildOpportunityLedger(input)
    const second=buildOpportunityLedger({...input,asOf:'2026-09-11T05:00:00Z',history:[{opportunityLedger:first}]})
    expect(second[0]).toMatchObject({firstSeenAt:input.asOf,newEvidenceIds:[],state:'待基本面与价格共同验证'})
    expect(second[0].outcome).toContain('不能重复计为新机会')
    const third=buildOpportunityLedger({...input,asOf:'2026-09-12T05:00:00Z',news:{catalysts:[]},history:[{opportunityLedger:second}]})
    expect(third[0].outcome).toContain('不视为已兑现')
  })
  it('starts forward observations strictly after the first report and excludes the frozen-day open', () => {
    const snapshot=fixture()
    const base={asOf:snapshot.asOf,news:{catalysts:[{event:'新增订单',affectedCompanies:['600000']}]},events:snapshot.events,holdings:snapshot.etfs[0].holdings.map(holding=>({...holding,etfCode:'159995'})),decisions:[],graph:{},snapshot}
    const first=buildOpportunityLedger(base)
    expect(first[0].forwardObservation?.[0].returnPct).toBeNull()
    const earlier={...first[0],firstSeenAt:'2026-09-03T09:00:00Z'}
    const followup=buildOpportunityLedger({...base,history:[{opportunityLedger:[earlier]}]})
    expect(followup[0].forwardObservation?.[0]).toMatchObject({start:'2026-09-04',end:'2026-09-04',sessions:1,returnPct:0})
    expect(first[0].firstSeenAt).toBe(snapshot.asOf)
  })
  it('uses the last completed close for intraday valuation coverage', () => {
    const evaluation=evaluateResearch(fixture())
    const previous=evaluation.expectedSession!
    evaluation.expectedSession='2026-09-10'
    evaluation.products!.forEach(product=>{product.valuationDate=previous;product.pe=20})
    const timing=assessDecisionTiming({asOf:'2026-09-10T05:00:00Z',calendar:[{date:previous,open:true},{date:'2026-09-10',open:true}],expectedTickers:[],quotes:[]})
    const quality=buildReportQuality({evaluation,dataQuality:{status:'limited'},decisionTiming:{...timing,closeDataSession:previous}})
    expect(quality.dimensions.find(item=>item.key==='valuation')?.score).toBe(100)
  })
  it('blocks an old legacy execution-ready label when announcement coverage was zero', () => {
    const timing=assessDecisionTiming({asOf:'2026-09-10T05:06:58Z',calendar:[{date:'2026-09-09',open:true},{date:'2026-09-10',open:true}],expectedTickers:['159995'],quotes:[{code:'159995',tradeDate:'2026-09-10',fetchedAt:'2026-09-10T05:03:44Z'}],eventChecks:[]})
    expect(effectiveDecisionTiming({...timing,executionReady:true,label:'交易时段时效已通过'},'2026-09-10T05:07:00Z').executionReady).toBe(false)
  })
})

it('keeps an opportunity identity when its company coverage expands and exposes discovery steps',()=>{
 const input={asOf:'2026-09-10T08:00:00Z',news:{catalysts:[{opportunityKey:'pcb',event:'PCB订单',affectedCompanies:['002463'],sourceEventIds:['event'],conditions:'订单回款',invalidation:'毛利恶化'}]},events:[{id:'event',title:'PCB订单',status:'evidence',evidenceIds:['raw'],publishedAt:'2026-09-09'}],holdings:[],decisions:[],graph:{}}
 const prior=buildOpportunityLedger(input)
 const next=buildOpportunityLedger({...input,asOf:'2026-09-11T08:00:00Z',news:{catalysts:[{...input.news.catalysts[0],affectedCompanies:['002463','002916']}]},history:[{opportunityLedger:prior}]})
 expect(next).toHaveLength(1)
 expect(next[0].id).toBe(prior[0].id)
 expect(next[0].firstSeenAt).toBe(prior[0].firstSeenAt)
 expect(next[0].discoveryPlan).toHaveLength(3)
 expect(next[0].disclosureTimeline?.[0]).toMatchObject({firstDisclosureAt:null,reportPeriod:null,observedPublicationAt:'2026-09-09'})
 expect(next[0].informationStatus).toContain('未核验不宣称超预期')
})
it('separates a historical financial reporting period from a new article date',async()=>{
 const {disclosedReportPeriod}=await import('../opportunity-ledger')
 expect(disclosedReportPeriod({publishedAt:'2026-09-09',excerpt:'2026 年上半年实现营业收入增长'})).toBe('2026-06-30')
 expect(disclosedReportPeriod({publishedAt:'2026-09-09',excerpt:'订单增长'})).toBeNull()
 expect(disclosedReportPeriod({excerpt:'2025年上半年与2026年上半年数据对比'})).toBeNull()
})
it('resolves model company names through unique frozen identities before ETF exposure matching',()=>{
 const holdings=[{code:'688041',name:'海光信息',etfCode:'159995',weight:7,period:'2026-06-30',evidenceId:'h'}]
 const result=enrichCatalysts({catalysts:[{affectedCompanies:['海光信息','未核验公司']}]},holdings)
 expect(result.catalysts).toMatchObject([{affectedCompanies:['688041'],unresolvedCompanies:['未核验公司'],disclosedExposure:[{ticker:'159995',weightPct:7}]}])
 const ambiguous=enrichCatalysts({catalysts:[{affectedCompanies:['同名公司']}]},holdings,[{name:'同名公司',code:'600000'},{name:'同名公司',code:'1.hk'}])
 expect(ambiguous.catalysts).toMatchObject([{affectedCompanies:[],unresolvedCompanies:['同名公司']}])
})
