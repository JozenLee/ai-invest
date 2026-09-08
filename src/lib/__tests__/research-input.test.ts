import { describe, it, expect } from 'vitest'
import { compactEvidence, marketSignals, newsSignals, researchEvidence } from '../workflow/research-input'
import type { StepContext } from '../workflow/types'

describe('decision-focused evidence', () => {
  it('removes operational noise while preserving zero, dates, sources and limitations', () => {
    expect(compactEvidence({ dataPoints: 100, history: [1,2], rules: {a:1}, missing: null, empty: [], price: 0, source: '交易所', date: '2026-09-04', stale: true })).toEqual({ price: 0, source: '交易所', date: '2026-09-04', stale: true })
  })
  it('preserves upstream claim citations instead of confusing them with raw snapshots', () => {
    const citations=[{claim:'观察',source:'交易所',date:'2026-09-04'}]
    expect(compactEvidence({evidence:citations})).toEqual({evidence:citations})
  })
  it('turns MA levels into distance and removes unverified technicals', () => {
    const row = { ticker: 'ETF',price:110,changePct:0,keyIndicators:{trend:{ma:{ma20:100}}},volatility:25,data_points:60 }
    expect(marketSignals([row])[0].indicators.distanceToMA20Pct).toBe(10)
    expect(marketSignals([{...row,qualityWarning:'断点'}])[0].indicators).toBeUndefined()
    expect(marketSignals([row])[0].dailyChangePct).toBe(0)
  })
  it('deduplicates and bounds news snippets', () => {
    const rows = Array.from({length:30},(_,i)=>({title:'新闻'+i,content:'甲'.repeat(1000)}))
    const result=newsSignals([...rows,rows[0]])
    expect(result).toHaveLength(16)
    expect(result.every(r=>r.excerpt.length<=320)).toBe(true)
  })
  it('bounds frozen event bodies before sending the event-analysis prompt', () => {
    const events=Array.from({length:30},(_,index)=>({id:`event-${index}`,title:`事件${index}`,category:'technology',publishedAt:'2026-09-07T08:00:00Z',expiresAt:'2026-09-10T08:00:00Z',companies:['公司甲'],segments:['芯片'],evidenceIds:[`evidence-${index}`],sources:['测试来源'],urls:['https://example.com'],excerpt:'长'.repeat(10000),status:'evidence',priority:5,verification:'source-linked-not-independently-verified'}))
    const context={artifacts:new Map<string,any>([['industry-info',{name:'AI算力硬件'}],['research-evaluation',{events,decisions:[]}],['data-quality',{modules:{}}]])} as StepContext
    const evidence=researchEvidence(context,'news-analysis')
    expect(evidence.events).toHaveLength(24)
    expect(evidence.events.every((event:{excerpt:string})=>event.excerpt.length<=480)).toBe(true)
    expect(JSON.stringify(evidence).length).toBeLessThan(20000)
  })
  it('public evidence never includes private portfolio and expands upstream JSON once', () => {
    const context={artifacts:new Map<string,any>([['industry-info',{name:'AI算力硬件'}],['market-analysis','{"analysis":"观察","score":null}'],['portfolio-evidence',{secret:'PRIVATE'}]])} as StepContext
    const evidence=researchEvidence(context,'industry-overview')
    expect(evidence.market).toEqual({analysis:'观察'})
    expect(JSON.stringify(evidence)).not.toContain('PRIVATE')
  })
  it('keeps company graph mappings and ETF exposure in the model evidence boundary', () => {
    const company={stockCode:'688001',stockName:'芯片公司',stage:'上游',stageCode:'upstream',segment:'芯片',segmentCode:'chip',source:'both',matchSource:'etf_holdings',matchConfidence:0.91,representativenessScore:0.82,selectionReason:'持仓验证',representativeEtfs:[{code:'159001',name:'芯片ETF',relevance:0.9,holdingVerified:true}],representativeIndices:[{code:'931000.CSI',name:'芯片指数',relevance:0.88}],financials:[{evidenceId:'fin-1',reportType:'income',period:'2026-06-30',publishDate:'2026-08-01',source:'tushare',currency:'CNY',metrics:[{label:'净利率',value:20}]}],announcements:[]}
    const graph={revisionId:'r1',version:1,contentHash:'h1',mappingRevisionId:'m1',mappingContentHash:'mh1',mappingPublishedAt:'2026-09-01',industry:{id:'i1',code:'ai',name:'AI'},coverage:{},evidenceUrls:[],stages:[{code:'upstream',name:'上游',segments:[{code:'chip',name:'芯片',companies:[company],etfs:company.representativeEtfs,indices:company.representativeIndices}]}],relations:[],eventMappings:[],companyMappings:[company],etfExposure:[{code:'159001',name:'芯片ETF',segments:[{stageCode:'upstream',stageName:'上游',segmentCode:'chip',segmentName:'芯片',relevance:0.9,matchedCompanies:['688001'],holdingVerified:true}]}]}
    const context={artifacts:new Map<string,any>([['industry-info',{name:'AI算力硬件'}],['graph-context',graph],['company-market-data',[company]],['etf-bindings',[{etf_code:'159001',etf_name:'芯片ETF'}]],['etf-holdings',[]]])} as StepContext
    const companyInput=researchEvidence(context,'company-analysis')
    expect(companyInput.companies[0].graphMapping).toMatchObject({stage:'上游',segment:'芯片',representativeEtfs:[{code:'159001'}]})
    const adviceInput=researchEvidence(context,'investment-advice')
    expect(adviceInput.graph.etfExposure[0]).toMatchObject({code:'159001',segments:[{segmentCode:'chip',matchedCompanies:['688001']}]})
  })
  it('bounds the industry synthesis packet instead of replaying full upstream evidence',()=>{
    const many=Array.from({length:30},(_,index)=>({code:String(index).padStart(6,'0'),name:'样本'+index,relevance:1-index/100,holdingVerified:false}))
    const graph={revisionId:'r1',version:1,contentHash:'h1',mappingRevisionId:'m1',mappingContentHash:'mh1',industry:{id:'i1',code:'ai',name:'AI'},coverage:{},evidenceUrls:[],
      stages:[{code:'upstream',name:'上游',segments:[{code:'chip',name:'芯片',companies:many,etfs:many,indices:many}]}],
      relations:many.map((_,index)=>({sourceName:'环节'+index,targetName:'下游'+index,type:'供应',direction:'positive',weight:.8,confidence:.8})),
      eventMappings:many,etfExposure:many.map(item=>({...item,segments:[{stageName:'上游',segmentName:'芯片',relevance:.9,holdingVerified:false,matchedCompanies:many.map(row=>row.code)}]}))}
    const module={analysis:'结论',evidence:many,counterEvidence:many,watchlist:many,catalysts:many.map(item=>({event:item.name,path:'芯片→服务器',affectedCompanies:many,affectedEtfs:many,conditions:'订单兑现',confidence:.8})),key_companies:many}
    const context={artifacts:new Map<string,any>([['industry-info',{name:'AI算力硬件'}],['graph-context',graph],['market-analysis',module],['news-analysis',module],['company-analysis',module]])} as StepContext
    const evidence=researchEvidence(context,'industry-overview')
    expect(evidence.graph.stages[0].segments[0].representativeCompanies).toHaveLength(1)
    expect(evidence.graph.relations).toHaveLength(8)
    expect(evidence.graph.eventMappings).toBeUndefined()
    expect(evidence.companies.keyCompanies).toHaveLength(8)
    expect(JSON.stringify(evidence).length).toBeLessThan(30000)
  })
})
