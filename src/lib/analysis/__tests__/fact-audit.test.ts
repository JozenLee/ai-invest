import { describe, expect, it } from 'vitest'
import { auditReportFacts, buildResearchFactRegistry, type FactAuditInput, type ResearchFact } from '../fact-audit'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'

const fact = (overrides: Partial<ResearchFact> = {}): ResearchFact => ({ id: 'ma', metric: 'benchmark-ma60-deviation', subject: '000300', period: '2026-09-10', unit: 'ratio', value: -.032786, scope: [], evidenceIds: ['price'], ...overrides })
const claim = (f: ResearchFact, overrides = {}) => ({ ...f, factId: f.id, ...overrides })
const audit = (value: unknown, facts: ResearchFact[] = [fact()]) => auditReportFacts(value, { facts })

describe('deterministic fact support', () => {
  it('converts MA60 ratios to percent within declared precision', () => {
    expect(audit({ factChecks: [claim(fact(), { unit: 'percent', value: -3.28 })] }).status).toBe('passed')
    const issue=audit({ factChecks: [claim(fact(), { unit: 'percent', value: -.03 })] }).issues[0]
    expect(issue).toMatchObject({ code: 'value-mismatch', actual: -.03 })
    expect(issue.expected).toBeCloseTo(-3.2786,8)
  })
  it('requires object, period, metric, and company scope to match independently of numeric value', () => {
    const f = fact({ metric: 'disclosed-holding-weight', subject: '159995', value: 15.13, unit: 'percent', scope: ['688008','688525','688123'] })
    for (const wrong of [{subject:'159997'}, {period:'2026-03-31'}, {metric:'relative20'}, {scope:['688041']}]) {
      expect(audit({ factChecks: [claim(f, wrong)] }, [f]).issues[0].code).toBe('basis-mismatch')
    }
  })
  it('does not treat absolute return percent as relative percentage points', () => {
    const f = fact({metric:'relative20',unit:'percentage-point',value:[-5.69,.13],subject:'research-universe'})
    expect(audit({factChecks:[claim(f,{unit:'percent'})]},[f]).issues[0].code).toBe('unit-mismatch')
    expect(audit('全部ETF 20日相对收益-2.5%至-8.1%', [f]).issues.map(i=>i.code)).toEqual(['value-mismatch','unit-mismatch'])
    expect(audit('全部ETF 20日相对收益-5.69至+0.13个百分点',[f]).status).toBe('passed')
    expect(audit('全部ETF 20日相对收益劣后0.13至5.69个百分点',[fact({metric:'relative20',unit:'percentage-point',value:[-5.69,-.13],subject:'research-universe'})]).status).toBe('passed')
  })
  it('does not compare a named subset range or historical opinion with the current universe fact', () => {
    const range=fact({id:'range',metric:'return20',unit:'percent',value:[-12.06,-5.75],subject:'research-universe'})
    expect(audit('相关云计算ETF 20日收益-9.89%至-8.09%',[range])).toMatchObject({status:'not-assessed',issues:[]})
    expect(audit('10只产品20日收益-9.89%至-8.09%',[range]).issues[0]).toMatchObject({code:'value-mismatch'})
    const current=fact({value:-.0394468,period:'2026-09-11'})
    const output={executiveSummary:{historyComparison:[{sourceDate:'2026-09-07',previousOpportunity:'当时基准低于60日均线3.07%',currentEvidence:'本轮基准低于60日均线3.94%'}]}}
    expect(audit(output,[current])).toMatchObject({status:'passed',issues:[],checkedNarrativeClaims:1})
  })
  it('rejects missing, ambiguous, nonfinite, and malformed facts without silently trusting citations', () => {
    expect(audit({factChecks:[claim(fact(),{factId:'missing'})]}).issues[0].code).toBe('missing-fact')
    expect(audit({factChecks:[claim(fact())]},[fact(),fact({value:1})]).issues[0].code).toBe('ambiguous-fact')
    for (const wrong of [{value:Infinity}, {value:null}, {value:[]}, {scope:undefined}, {decimals:-1}, {decimals:99}]) {
      expect(audit({factChecks:[claim(fact(),wrong)]}).issues[0].code).toBe('invalid-claim')
    }
    expect(audit({factChecks:{}}).issues[0].code).toBe('invalid-claim')
  })
  it('checks prose near MA60 but leaves dates, prices, forecasts, and negated claims alone', () => {
    expect(audit('基准低于MA60约0.03%').status).toBe('failed')
    expect(audit('基准低于60日均线3.28%').status).toBe('passed')
    for(const text of ['2026-09-10的159995价格1.33，费率0.03%', '如果基准低于MA60约0.03%，则观察', '基准并非低于MA60约0.03%']) expect(audit(text).issues).toEqual([])
  })
  it('reports untouched prose as not assessed instead of implying semantic certification', () => {
    expect(audit('订单改善，保持观察')).toMatchObject({status:'not-assessed',checkedClaims:0,checkedNarrativeClaims:0})
  })
  it('detects a liquidity count contradiction without treating count as a ratio', () => {
    const f = fact({metric:'liquidity-qualified-count',unit:'count',value:6})
    expect(audit('5只ETF流动性达标',[f]).issues[0]).toMatchObject({expected:6,actual:5})
    expect(audit('6只ETF流动性达标',[f]).status).toBe('passed')
    expect(audit('5只ETF的费率较低',[f]).status).toBe('not-assessed')
    expect(audit('5只产品20日均额超2000万元门槛',[{...f,label:'20日平均成交额≥20000000元'}]).issues[0]).toMatchObject({expected:6,actual:5})
    expect(audit('5只产品20日均额超5000万元门槛',[{...f,label:'20日平均成交额≥20000000元'}]).issues).toEqual([])
  })
  it('catches the wrong company weight in tightly scoped ETF disclosure prose', () => {
    const f = fact({metric:'disclosed-holding-weight',subject:'159995',unit:'percent',value:7,label:'海光信息',scope:['688041']})
    expect(audit('159995海光信息披露权重15.13%',[f]).issues[0]).toMatchObject({expected:7,actual:15.13})
    expect(audit('159995海光信息披露权重7.00%',[f]).status).toBe('passed')
    expect(audit('159995海光信息利润增长15.13%',[f]).issues).toEqual([])
    expect(audit('159995海光信息披露权重15.13%',[f,{...f,id:'old',period:'2026-03-31'}]).status).toBe('not-assessed')
    expect(audit({ticker:'159995',exposureRationale:'海光信息等算力芯片企业权重15.13%（2026-06-30披露）'},[f]).issues[0].code).toBe('basis-mismatch')
  })
})

describe('frozen registry derivation', () => {
  function input(): FactAuditInput {
    const snapshot = fixture(), evaluation = evaluateResearch(snapshot)
    return {snapshot,evaluation}
  }
  it('computes flow totals from the evaluated sessions and sectors, excluding older rows sharing source IDs', () => {
    const data = input(), snapshot = data.snapshot!
    snapshot.sectorFlows!.push({...snapshot.sectorFlows![0],date:'2026-01-01',net:1e12})
    const flow = buildResearchFactRegistry(data).find(f=>f.metric==='sector-flow-sum')!
    expect(flow.value).toBe(50000000)
    expect(auditReportFacts('领域5日主力累计流出133亿元',data).status).toBe('failed')
    expect(auditReportFacts('领域6日主力累计流出133亿元',data).issues).toEqual([])
    expect(buildResearchFactRegistry(data).find(f=>f.metric==='sector-flow-sum' && f.label?.startsWith('4日'))?.value).toBe(40000000)
    expect(auditReportFacts('全市场5日主力累计流出133亿元',data).issues).toEqual([])
  })
  it('never emits a full flow sum or universe range for incomplete inputs', () => {
    const data = input()
    data.snapshot!.sectorFlows!.pop()
    data.evaluation!.decisions![0].metrics.return20Pct = null
    const facts = buildResearchFactRegistry(data)
    expect(facts.some(f=>f.metric==='sector-flow-sum' && f.label?.startsWith('5日'))).toBe(false)
    expect(facts.filter(f=>f.metric==='sector-flow-sum').every(f=>!f.period.endsWith(data.evaluation!.expectedSession!))).toBe(true)
    expect(facts.some(f=>f.metric==='return20' && f.subject==='research-universe')).toBe(false)
  })
  it('does not double-count or silently select contradictory daily flow rows', () => {
    const data = input()
    data.snapshot!.sectorFlows!.push({...data.snapshot!.sectorFlows![0]})
    expect(buildResearchFactRegistry(data).some(f=>f.metric==='sector-flow-sum' && f.label?.startsWith('5日'))).toBe(false)
    expect(buildResearchFactRegistry(data).find(f=>f.metric==='sector-flow-sum' && f.label?.startsWith('4日'))?.value).toBe(40000000)
  })
  it('distinguishes 133 from an explicitly supplied 268.7-亿元 fact using source units', () => {
    const f = fact({metric:'sector-flow-sum',unit:'CNY',value:-268.7e8,label:'4日领域主力净流入',period:'2026-09-07/2026-09-10'})
    expect(audit('领域4日主力累计流出133亿元',[f]).issues[0]).toMatchObject({actual:-133,expected:-268.7})
    expect(audit('领域4日主力累计流出268.7亿元',[f]).status).toBe('passed')
    expect(audit('领域板块连续四日资金净流出累计-133亿元，无主力占比数据无法判断资金结构',[f]).issues[0]).toMatchObject({expected:-268.7,actual:-133})
    expect(audit('领域三板块9月7日至10日累计净流出-268.7亿元',[f]).status).toBe('passed')
  })
  it('recomputes the actual archived four-day packet instead of blessing either contradictory prose total', () => {
    const data=input(),dates=['2026-09-07','2026-09-08','2026-09-09','2026-09-10']
    const sectors=['半导体','通信设备','IT服务']
    const nets=[[97.9775488,201.34683136,-10.7540064],[-41.21,-18.68,-33.18],[-108.97,20.62,-22.17],[-13,-44.08,-8.83]]
    data.snapshot!.profile!.sectors=sectors
    data.snapshot!.calendar=dates.map(date=>({date,open:true}))
    data.snapshot!.asOf='2026-09-10T08:00:00Z'
    data.snapshot!.sectorFlows=dates.flatMap((date,i)=>sectors.map((sector,j)=>({date,sector,net:nets[i][j]*1e8,netPct:null,evidenceId:'raw-one'})))
    data.evaluation!.expectedSession=dates[3]
    data.evaluation!.decisions![0].metrics.flowDays=0
    data.evaluation!.decisions![0].conditions=data.evaluation!.decisions![0].conditions.filter(c=>c.key!=='flow')
    const f=buildResearchFactRegistry(data).find(f=>f.metric==='sector-flow-sum' && f.label?.startsWith('4日'))!
    expect(f.value).toBeCloseTo(19.07037376e8,4)
    for(const total of ['133','268.7']) {
      const r=auditReportFacts(`领域板块连续四日资金净流出累计-${total}亿元`,data)
      expect(r.issues[0].code).toBe('value-mismatch')
      expect(r.issues[0].expected).toBeCloseTo(19.07037376,8)
    }
    expect(auditReportFacts('领域三板块9月7日至10日累计净流入19.07亿元',data).status).toBe('passed')
    expect(auditReportFacts('领域三板块9月8日至9日累计净流出203.59亿元',data).status).toBe('passed')
    expect(auditReportFacts('领域三板块2025年9月7日至10日累计净流出133亿元',data).status).toBe('not-assessed')
    const standalone={snapshot:data.snapshot}
    expect(auditReportFacts('领域三板块9月7日至10日累计净流出133亿元',standalone).issues[0].code).toBe('value-mismatch')
  })
  it('is pure and serializable for read-only archive use', () => {
    const data = input(), output={factChecks:[]}, before=JSON.stringify(data)
    expect(()=>JSON.stringify(auditReportFacts(output,data))).not.toThrow()
    expect(JSON.stringify(data)).toBe(before)
    expect(output).toEqual({factChecks:[]})
    expect(auditReportFacts(output,{...data,snapshot:{...data.snapshot,id:'wrong'}}).issues[0].code).toBe('basis-mismatch')
  })
  it('separates day-of-month, trailing sessions, and several windows in one paragraph',()=>{
    const flow=(id:string,period:string,value:number,days:number)=>fact({id,metric:'sector-flow-sum',period,unit:'CNY-100m',value,label:`${days}日领域主力净流入`})
    const facts=[flow('four','2026-09-07/2026-09-10',19.07037376,4),flow('today','2026-09-10/2026-09-10',-65.91,1),flow('ten','2026-08-28/2026-09-10',-900,10),flow('earlier','2026-09-08/2026-09-09',-203.59,2)]
    for(const separator of ['；','，','。','\n']) {
      const text=['9月7日至10日领域累计净流入19.07亿元','10日当日三板块合计流出-65.9亿元','近10日领域累计流出900亿元','9月8日至9日领域累计流出203.59亿元','10日当天三板块合计流出65.91亿元'].join(separator)
      expect(audit(text,facts)).toMatchObject({status:'passed',checkedNarrativeClaims:5,issues:[]})
    }
    const wrong=audit('9月7日至10日领域累计净流出268.7亿元；10日当日三板块合计流出65.9亿元',facts)
    expect(wrong.issues).toHaveLength(1)
    expect(wrong.issues[0].factIds).toEqual(['four'])
  })
  it('keeps mixed-source arithmetic informational instead of certifying a unified flow measure',()=>{
    const f=fact({metric:'sector-flow-sum',unit:'CNY-100m',value:19.07037376,period:'2026-09-07/2026-09-10',label:'4日领域主力净流入',comparability:'mixed-source'})
    const result=audit('领域4日累计净流出268.7亿元',[f])
    expect(result.status).toBe('warning')
    expect(result.issues.map(i=>i.severity)).toEqual(['warning','warning'])
    expect(audit('领域4日累计净流入19.07亿元',[f]).issues[0].code).toBe('basis-mismatch')
  })
  it('binds parenthetical four-day totals to their duration, not the preceding event date',()=>{
    const facts=[
      fact({id:'single',metric:'sector-flow-sum',unit:'CNY-100m',period:'2026-09-07/2026-09-07',value:288.57037376,label:'1日领域主力净流入'}),
      fact({id:'four',metric:'sector-flow-sum',unit:'CNY-100m',period:'2026-09-07/2026-09-10',value:19.07037376,label:'4日领域主力净流入',comparability:'mixed-source'}),
    ]
    const original='9月7日领域短期反弹（4日累计净流入19亿元），但随后3日再度流出270亿元；年化波动率37.6%~66.1%，多数超60%阈值，下行波动占比高。'
    const result=audit(original,facts)
    expect(result.checkedNarrativeClaims).toBe(1)
    expect(result.issues).toMatchObject([{code:'basis-mismatch',severity:'warning',actual:19,factIds:['four']}])
    for(const duration of ['4日','四日','4个交易日']) {
      expect(audit(`9月7日领域短期反弹（${duration}累计净流入19亿元）`,facts).issues.every(i=>i.factIds[0]==='four')).toBe(true)
    }
    expect(audit('9月7日领域累计净流入289亿元',facts).status).toBe('passed')
    expect(audit('9月7日领域累计净流入19亿元',facts).issues[0]).toMatchObject({severity:'error',expected:288.57037376,actual:19})
    expect(audit('截至9月7日领域4日累计净流入19亿元',facts).status).toBe('not-assessed')
    expect(audit('9月7日领域短期反弹（十四日累计净流入19亿元）',facts).status).toBe('not-assessed')
    expect(audit('领域近十四日累计净流入19亿元',facts).status).toBe('not-assessed')
  })
})

describe('accounting and expectations', () => {
  it('warns about investing cash flow incorrectly explaining operating cash conversion', () => {
    expect(audit('经营现金/利润高直接归因资本开支收缩').issues[0]).toMatchObject({code:'accounting-causality',severity:'warning'})
    for(const text of ['资本开支下降带来自由现金流改善','不能将经营现金/利润高直接归因资本开支收缩','经营现金/利润高；资本开支收缩']) expect(audit(text).issues).toEqual([])
    expect(audit({selectionReason:'经营现金流转化率322.4%',operatingEvidence:'资本开支收缩期现金回流加速，资产负债率33.8%'}).issues[0].code).toBe('accounting-causality')
  })
  it('requires point-in-time consensus for an expectations beat, not a growth number or valid source ID', () => {
    expect(audit({claim:'营收超预期',evidenceIds:['price']}).issues[0].code).toBe('unsupported-expectation')
    const actual=fact({id:'actual',metric:'revenue',unit:'CNY',value:110,basis:'actual',availableAt:'2026-08-01T00:00:00Z'})
    const consensus={...actual,id:'consensus',value:100,basis:'consensus' as const,availableAt:'2026-07-30T00:00:00Z'}
    const output={claim:'营收超预期',expectationBasis:{actualFactId:'actual',consensusFactId:'consensus'}}
    expect(audit(output,[actual,consensus]).issues).toEqual([])
    for(const wrong of [{period:'2025-09-10'}, {availableAt:'2026-08-02'}, {basis:'actual' as const}, {value:120}, {evidenceIds:[]}]) {
      expect(audit(output,[actual,{...consensus,...wrong}]).issues[0].code).toBe('unsupported-expectation')
    }
    expect(audit('缺乏一致预期，不能宣称超预期').issues).toEqual([])
    expect(audit({informationStatus:'材料新增仅表示获得材料，未核验不宣称超预期',scenarios:{bull:{conditions:'收入超预期'}}}).issues).toEqual([])
    expect(audit({claim:'营收超预期',expectationBasis:output.expectationBasis,analysis:'另一公司超预期'},[actual,consensus]).issues).toHaveLength(1)
  })
  it('includes same-period financial consistency in the public report audit', () => {
    const companyData=[{code:'002916',name:'深南电路',financials:[{period:'2026-06-30',currency:'CNY',rawMetrics:[{label:'q_sales_yoy',value:53.4377},{label:'tr_yoy',value:46.3283}]}]}]
    expect(auditReportFacts({claim:'深南电路H1营收同比53.4%'},{companyData}).issues[0]).toMatchObject({code:'company-consistency',severity:'error'})
  })
})
