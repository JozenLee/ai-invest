import { describe, expect, it } from 'vitest'
import { buildPortfolioResearchUniverse, buildPortfolioPlanningHoldings, validateProductExecution, type ProductRawPayload, type ProductEvidence, type ExecutionFact, type ProductExecutionInput, type ProductIdentity } from '../product-research'

const asOf = '2026-09-11T01:00:00Z'
const holdings = [
  { ticker:'017470', name:'嘉实科创板芯片ETF联接C', quantity:100 },
  { ticker:'024975', name:'华泰柏瑞科创板半导体材料设备ETF联接C', quantity:100 },
  { ticker:'026633', name:'平安半导体领航精选混合C', quantity:100 },
]
const raw = (datasetKey: string, targetCode: string, payload: unknown, id = datasetKey, fetchedAt = '2026-09-10T16:00:00Z'): ProductRawPayload => ({id,datasetKey,targetCode,payload:JSON.stringify(payload),contentHash:`hash:${id}`,provider:'Tushare',fetchedAt})
const evidence: ProductEvidence = {id:'disclosure', source:'official', url:'https://www.jsfund.cn/example', observedAt:'2026-09-10T15:00:00Z', publishedAt:'2026-09-10', dataDate:'2026-09-10',locator:'verified test fixture'}
const fact = <T>(value: T): ExecutionFact<T> => ({value,evidence,validUntil:'2026-09-12T01:00:00Z'})
const stock = (code: string, weight: number, period='20260630') => ({stock_code:code,weight,weightBasis:'net-assets',report_period:period,ann_date:'20260721'})
const run = (rawPayloads: ProductRawPayload[] = []) => buildPortfolioResearchUniverse({holdings,asOf,rawPayloads})

describe('actual portfolio product discovery', () => {
  it('discovers exact officially sourced feeder products and indexes, not a same-theme substitute', () => {
    const r=run()
    expect(r.products.map(p=>p.productType)).toEqual(['feeder','feeder','active'])
    expect(r.products[0].officialMapping?.targetEtfCode).toBe('588200')
    expect(r.products[1].officialMapping?.targetEtfCode).toBe('588710')
    expect(r.requests.filter(r=>r.targetType==='index').map(r=>r.targetCode)).toEqual(['000685.SH','950125.SH'])
    expect(r.requests.some(r=>r.targetCode==='588170')).toBe(false)
    expect(r.products.every(p=>p.identityEvidence.every(e=>e.url && e.locator))).toBe(true)
    expect(r.scope).toBe('private-portfolio')
    expect(JSON.stringify(r)).not.toContain('quantity')
  })
  it('researches active funds without inventing an ETF identity or benchmark holdings', () => {
    const r=run([raw('fund_research','026633',{data:{benchmark:'950125.SH',indexWeights:[{con_code:'688012',weight:95}],nav:[{nav_date:'20260910',unit_nav:1.1,ann_date:'20260910'}],holdings:[stock('688012',5)],assetAllocation:[{asset:'equity',weight:91,weightBasis:'total-assets',report_period:'20260630'}]}})])
    const p=r.products[2]
    expect(p.officialMapping).toBeNull()
    expect(p.coverage).toMatchObject({nav:true,holdings:true,allocation:true,mappingRequired:false,mapping:true})
    expect(p.disclosedHoldings).toHaveLength(1)
    expect(p.exposure.knownWeightPct).toBe(5)
    expect(p.assetAllocation[0].weightBasis).toBe('total-assets')
    expect(r.requests.filter(r=>r.requiredBy.includes('026633')).every(r=>r.targetType==='fund')).toBe(true)
    expect(p.gaps.some(g=>g.code==='target-etf-missing')).toBe(false)
  })
  it('does not turn local manual/provider labels or names into formal mapping', () => {
    const r=buildPortfolioResearchUniverse({asOf,holdings:[{ticker:'123456',name:'某ETF联接',targetEtfCode:'588170',mappingSource:'manual',mappingConfidence:1}]})
    expect(r.products[0].productType).toBe('feeder')
    expect(r.products[0].officialMapping).toBeNull()
    expect(r.requests.some(r=>r.targetCode==='588170')).toBe(false)
    expect(r.gaps.map(g=>g.code)).toContain('target-etf-missing')
  })
  it('does not backfill newly verified identities into historical snapshots', () => {
    const r=buildPortfolioResearchUniverse({holdings,asOf:'2026-09-01T01:00:00Z'})
    expect(r.products.every(p=>p.officialMapping===null)).toBe(true)
  })
  it('parses persisted official profiles and exposes required target lists', () => {
    const r=buildPortfolioResearchUniverse({asOf,holdings:[{ticker:'123456',name:'新联接'}],rawPayloads:[raw('fund_profile','123456',{identity:{ticker:'123456',productType:'feeder',targetEtfCode:'588710',targetIndexCode:'950125.SH',evidence:[evidence]}})]})
    expect(r.requiredEtfCodes).toEqual(['588710'])
    expect(r.requiredIndexCodes).toEqual(['950125.SH'])
    expect(r.products[0].identityEvidence[0].id).toBe('fund_profile')
    expect(r.products[0].classification).toBe('official')
  })
  it('rejects conflicting official identities and spoofed official domains', () => {
    const identity: ProductIdentity={ticker:'017470',productType:'feeder',targetEtfCode:'588170',evidence:[evidence]}
    expect(buildPortfolioResearchUniverse({holdings,asOf,identities:[identity]}).products[0].gaps.map(g=>g.code)).toContain('identity-conflict')
    identity.evidence=[{...evidence,url:'https://jsfund.cn.evil.test/fund'}]
    expect(buildPortfolioResearchUniverse({holdings,asOf,identities:[identity]}).products[0].officialMapping?.targetEtfCode).toBe('588200')
  })
})

describe('point-in-time local evidence parsing', () => {
  it('recovers a recent window from old frozen JSON without mutation or live reads',()=>{
    const legacy=JSON.parse(JSON.stringify(run([raw('fund_nav','017470',[{nav_date:'20260908',unit_nav:1},{nav_date:'20260909',unit_nav:1.1,adj_nav:1.2},{nav_date:'20260910',unit_nav:1.2,adj_nav:1.3}])])))
    for(const p of legacy.products){delete p.riskNavSeries;delete p.coverage.adjustedNavWindow;p.coverage.adjustedNav=false}
    const before=JSON.stringify(legacy)
    const out=buildPortfolioPlanningHoldings({holdings:[{...holdings[0],marketValue:100,weightPct:1}],universe:legacy})
    expect(out.planningHoldings[0].navHistory).toEqual([{date:'2026-09-09',nav:1.2},{date:'2026-09-10',nav:1.3}])
    expect(out.evidencePackets[0].coverage.adjustedNav).toBe(true)
    expect(JSON.stringify(legacy)).toBe(before)
  })
  it('retains full audit history while selecting the latest contiguous adjusted window', () => {
    const r=run([raw('fund_nav','017470',[
      {nav_date:'20260907',unit_nav:1},
      {nav_date:'20260908',unit_nav:1.1,adj_nav:1.2},
      {nav_date:'20260909',unit_nav:1.2,adj_nav:1.3},
      {nav_date:'20260910',unit_nav:1.3,adj_nav:1.4},
    ])])
    expect(r.products[0].navSeries).toHaveLength(4)
    expect(r.products[0].coverage.adjustedNav).toBe(true)
    expect(r.products[0].coverage.adjustedNavWindow).toMatchObject({start:'2026-09-08',end:'2026-09-10',observations:3,excludedObservations:1})
    expect(r.products[0].gaps.map(g=>g.code)).not.toContain('adjusted-nav-missing')
    const planning=buildPortfolioPlanningHoldings({holdings:[{...holdings[0],marketValue:100,weightPct:1}],universe:r})
    expect(planning.planningHoldings[0].navHistory?.map(n=>n.nav)).toEqual([1.2,1.3,1.4])
    expect(planning.evidencePackets[0].navSeries).toHaveLength(4)
  })
  it('never bridges a missing latest date, interior missing value or excluded conflicting date', () => {
    const points=[{nav_date:'20260908',unit_nav:1,adj_nav:1.1},{nav_date:'20260909',unit_nav:1.1},{nav_date:'20260910',unit_nav:1.2,adj_nav:1.3}]
    expect(run([raw('fund_nav','017470',points)]).products[0].riskNavSeries).toHaveLength(1)
    const lagged=run([raw('fund_nav','017470',[...points,{nav_date:'20260911',unit_nav:1.3}])]).products[0]
    expect(lagged.riskNavSeries).toHaveLength(1)
    expect(lagged.coverage.adjustedNavWindow.laggingObservations).toBe(1)
    const conflict=run([raw('fund_nav','017470',[...points,{nav_date:'20260909',unit_nav:2}])]).products[0]
    expect(conflict.riskNavSeries).toHaveLength(1)
    expect(conflict.coverage.adjustedNavWindow.breakReason).toBe('conflict')
  })
  it('does not rescale or join adjusted NAV across revisions or providers',()=>{
    const r=run([
      raw('fund_nav','017470',[{nav_date:'20260910',unit_nav:1,adj_nav:2}],'new'),
      raw('fund_nav','017470',[{nav_date:'20260909',unit_nav:1,adj_nav:1}],'old','2026-09-09T16:00:00Z'),
    ])
    expect(r.products[0].riskNavSeries).toHaveLength(1)
    expect(r.products[0].coverage.adjustedNavWindow.breakReason).toBe('source-or-revision-change')
  })
  it('reads existing research NAV envelope with dates, preserves raw IDs, excludes future and wrong-share rows', () => {
    const r=run([
      raw('etf_research','026633',{data:{nav:[
        {ts_code:'026633.OF',nav_date:'20260909',ann_date:'20260910',unit_nav:1.4,accum_nav:2.4},
        {ts_code:'026633.OF',nav_date:'20260910',ann_date:'20260911',unit_nav:1.5,adj_nav:1.7},
        {ts_code:'026632.OF',nav_date:'20260910',unit_nav:9},
        {nav_date:'20260912',unit_nav:2},
        {nav_date:'20260908',ann_date:'20260912',unit_nav:2},
        {nav_date:'20260230',unit_nav:2},
      ]}},'nav'),
      raw('fund_nav','026633',[{nav_date:'20260910',unit_nav:99}],'future','2026-09-12T00:00:00Z'),
    ])
    expect(r.products[2].navSeries.map(n=>[n.date,n.nav,n.adjustedNav])).toEqual([['2026-09-09',1.4,null],['2026-09-10',1.5,1.7]])
    expect(r.products[2].navSeries[0].evidence).toMatchObject({id:'nav',contentHash:'hash:nav',observedAt:'2026-09-10T16:00:00Z'})
  })
  it('uses latest revision without appending removed constituents and never renormalizes top holdings', () => {
    const r=run([
      raw('fund_holdings','026633',[stock('688012',6)],'new','2026-09-10T16:00:00Z'),
      raw('fund_holdings','026633',[stock('688012',5),stock('688041',9)],'old','2026-09-09T16:00:00Z'),
    ])
    expect(r.products[2].disclosedHoldings.map(h=>h.code)).toEqual(['688012'])
    expect(r.products[2].exposure).toMatchObject({knownWeightPct:6,unobservedWeightPct:94})
  })
  it('flags duplicate weight conflicts, unknown denominators, over-100 coverage and missing report dates', () => {
    const r=run([
      raw('fund_holdings','017470',[stock('688012',6),stock('688012',7),{stock_code:'688041',weight:10,report_period:'20260630'},{stock_code:'123456',weight:5}]),
      raw('fund_holdings','026633',[stock('688012',60),stock('688041',50)]),
    ])
    expect(r.products[0].disclosedHoldings[0].weightPct).toBeNull()
    expect(r.products[0].gaps.map(g=>g.code)).toEqual(expect.arrayContaining(['holding-conflict','holding-weight-unknown','holding-period-missing']))
    expect(r.products[2].exposure.knownWeightPct).toBeNull()
    expect(r.products[2].exposure.unobservedWeightPct).toBeNull()
  })
  it('multiplies only actual same-period feeder stakes by target disclosed holdings', () => {
    const r=run([
      raw('fund_holdings','017470',[{...stock('588200',94),kind:'fund'}]),
      raw('etf_holdings','588200',{data:[stock('688012',10),stock('688041',5)]}),
    ])
    expect(r.products[0].exposure.lookThrough.map(h=>h.weightPct)).toEqual([9.4,4.7])
    expect(r.products[0].exposure.lookThrough[0].evidence.map(e=>e.id)).toEqual(['fund_holdings','etf_holdings'])
    const missing=run([raw('etf_holdings','588200',[stock('688012',10)])])
    expect(missing.products[0].exposure.lookThrough).toEqual([])
    const mismatch=run([raw('fund_holdings','017470',[{...stock('588200',94),kind:'fund'}]),raw('etf_holdings','588200',[stock('688012',10,'20260331')])])
    expect(mismatch.products[0].exposure.lookThrough).toEqual([])
  })
  it('fails closed on malformed payloads and never consumes an undated mailbox NAV', () => {
    const r=buildPortfolioResearchUniverse({asOf,holdings:[{...holdings[2],unitNav:1.4}],rawPayloads:[{...raw('fund_nav','026633',[]),payload:'NaN'}]})
    expect(r.products[0].navSeries).toEqual([])
    expect(r.gaps.map(g=>g.code)).toContain('invalid-payload')
    expect(()=>buildPortfolioResearchUniverse({asOf:'bad',holdings})).toThrow()
  })
  it('does not mark a year-old NAV research-ready even with current portfolio disclosure', () => {
    const r=run([raw('fund_research','026633',{data:{nav:[{nav_date:'20250910',unit_nav:1.1,adj_nav:1.2}],holdings:[stock('688012',5)],assetAllocation:[{asset:'stocks',weightPct:90,weightBasis:'net-assets',report_period:'20260630'}]}})])
    expect(r.products[2].gaps.map(g=>g.code)).toContain('nav-stale')
    expect(buildPortfolioPlanningHoldings({holdings:[{ticker:'026633',name:'主动',marketValue:100,weightPct:1}],universe:r}).planningHoldings[0].researchReady).toBe(false)
  })
})

describe('product-specific execution evidence', () => {
  const otc: NonNullable<ProductExecutionInput['otc']>={channel:'sales-channel',status:fact('open'),cutoff:fact('开放日15:00截止，超时下一开放日'),settlement:fact({confirmation:'渠道确认日',cashArrival:'以渠道到账安排为准的已核验具体窗口'}),lots:[{id:'lot1',quantity:100,acquiredAt:'2026-08-01',evidence,fee:fact({ratePct:0,fixedAmount:0})}],redemptionQuantity:50}
  it('does not require ETF quotes, premiums or ETF mapping for an active or feeder redemption', () => {
    for (const productType of ['active','feeder'] as const) {
      const r=validateProductExecution({ticker:'026633',productType,asOf,side:'sell',otc})
      expect(r.informationReady).toBe(true)
      expect(r.mechanism).toBe('otc-unknown-nav')
      expect(r.priceKnownBeforeExecution).toBe(false)
    }
  })
  it('requires all redemption batches and fee sources without manufacturing a zero fee', () => {
    const r=validateProductExecution({ticker:'026633',productType:'active',asOf,side:'sell',otc:{...otc,lots:[],redemptionQuantity:50}})
    expect(r.gaps.map(g=>g.code)).toContain('redemption-lots')
    const expired=validateProductExecution({ticker:'026633',productType:'active',asOf,side:'sell',otc:{...otc,redemptionQuantity:101,lots:[{...otc.lots![0],fee:{...otc.lots![0].fee,validUntil:'2026-09-10T01:00:00Z'}}]}})
    expect(expired.gaps.map(g=>g.code)).toEqual(expect.arrayContaining(['redemption-fee','redemption-quantity']))
  })
  it('buy does not require redemption batches, but does require subscription fee evidence', () => {
    expect(validateProductExecution({ticker:'026633',productType:'active',asOf,side:'buy',otc:{...otc,lots:undefined,subscriptionFee:fact({ratePct:0,fixedAmount:0})}}).informationReady).toBe(true)
    expect(validateProductExecution({ticker:'026633',productType:'active',asOf,side:'buy',otc}).gaps.map(g=>g.code)).toContain('subscription-fee')
  })
  it('exchange ETF requires actual quote/liquidity, commissions and settlement', () => {
    const exchange: NonNullable<ProductExecutionInput['exchange']>={quote:fact({bid:1,ask:1.01,availableQuantity:1000}),status:fact('open'),commission:fact({ratePct:0.01,minimumAmount:5}),settlement:fact('证券渠道已核验结算规则')}
    expect(validateProductExecution({ticker:'588200',productType:'etf',asOf,side:'sell',exchange}).informationReady).toBe(true)
    expect(validateProductExecution({ticker:'588200',productType:'etf',asOf,side:'sell',otc}).informationReady).toBe(false)
    expect(validateProductExecution({ticker:'588200',productType:'etf',asOf,side:'sell',exchange:{...exchange,quote:fact({bid:2,ask:1,availableQuantity:100})}}).gaps.map(g=>g.code)).toContain('exchange-quote')
  })
  it('adapts planning fields without leaking balances/batches into the evidence packet', () => {
    const r=run([raw('fund_research','026633',{data:{nav:[{nav_date:'20260910',unit_nav:1.1,adj_nav:1.2}],holdings:[stock('688012',5)],assetAllocation:[{asset:'stocks',weightPct:90,weightBasis:'net-assets',report_period:'20260630'}]}})])
    const inputHoldings=[{ticker:'026633',name:'主动基金',marketValue:12345,weightPct:10,quantity:9000,unitNav:1.1,redemptionFeePct:9}]
    const out=buildPortfolioPlanningHoldings({holdings:inputHoldings,universe:r})
    expect(out.planningHoldings[0]).toMatchObject({marketValue:12345,researchReady:true,redemptionFeePct:null,buyFeePct:null,mappingConfidence:null,navHistory:[{date:'2026-09-10',nav:1.2}],navDate:'2026-09-10'})
    expect(out.evidencePackets[2].navSeries[0].nav).toBe(1.1)
    expect(JSON.stringify(out.evidencePackets)).not.toMatch(/marketValue|quantity|lots|channel/)
  })
  it('parses local normalized execution records and applies zero fees only with evidence', () => {
    const buy: ProductExecutionInput={ticker:'026633',productType:'active',side:'buy',asOf,otc:{...otc,subscriptionFee:fact({ratePct:0,fixedAmount:0})}}
    const sell: ProductExecutionInput={ticker:'026633',productType:'active',side:'sell',asOf,otc:{...otc,settlement:fact({confirmation:'T+1',cashArrival:'T+3',cashArrivalBusinessDays:3})}}
    const r=buildPortfolioResearchUniverse({holdings,asOf,portfolioId:'account-a',rawPayloads:[raw('fund_execution','026633',{portfolioId:'account-a',data:{buy,sell}})]})
    const out=buildPortfolioPlanningHoldings({holdings:[{ticker:'026633',name:'主动基金',marketValue:100,weightPct:1,quantity:100}],universe:r})
    expect(out.planningHoldings[0]).toMatchObject({buyFeePct:0,redemptionFeePct:0,settlementDays:3})
    const partial=buildPortfolioPlanningHoldings({holdings:[{ticker:'026633',name:'主动基金',marketValue:200,weightPct:2,quantity:200}],universe:r})
    expect(partial.planningHoldings[0].redemptionFeePct).toBeNull()
    const sellOnly=buildPortfolioPlanningHoldings({holdings:[{ticker:'026633',name:'主动基金',marketValue:100,weightPct:1,quantity:100}],universe:r,executionByTicker:{'026633':{sell}}}).planningHoldings[0] as typeof out.planningHoldings[0] & {executionGapsBySide:{buy:string[];sell:string[]}}
    expect(sellOnly.executionGapsBySide.sell).toEqual([])
    expect(sellOnly.executionGapsBySide.buy.length).toBeGreaterThan(0)
    expect(sellOnly.executionGaps).toEqual([])
    const scoped=raw('fund_execution','026633',{portfolioId:'account-a',data:{sell}})
    expect(run([scoped]).products[2].executionMaterials).toEqual({})
    const own=buildPortfolioResearchUniverse({holdings,asOf,portfolioId:'account-a',rawPayloads:[scoped]})
    expect(own.products[2].executionMaterials.sell?.otc?.lots?.[0].fee.evidence.observedAt).toBe(evidence.observedAt)
  })
})

