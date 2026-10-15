import { describe, expect, it } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { decisionEvents, guardActionLanguage, productGroups, reportCoverage, reportReadiness, representativeProducts, safeDecisionAction } from '../report-insights'

describe('report investment readiness', () => {
  it('outputs a confidence-rated recommendation without a replay-history gate', () => {
    const evaluation = evaluateResearch(fixture())
    expect(reportReadiness(evaluation, { status: 'available' }).level).toBe('advice-ready')
    expect(reportReadiness(evaluation, { status: 'available' }).confidencePct).toBeGreaterThan(0)
    expect(safeDecisionAction(evaluation.decisions[0]).unheld).toBe('建仓')
    expect(safeDecisionAction(evaluation.decisions[0], false).unheld).toBe('仅供研究参考')
  })

  it('does not rank a product with an implausible tracking error', () => {
    const evaluation = evaluateResearch(fixture())
    const base=evaluation.decisions[0]
    evaluation.decisions=[{...structuredClone(base),ticker:'A'},{...structuredClone(base),ticker:'B'}]
    evaluation.products = [
      { ticker: 'A', indexCode: 'IDX', feePct: .5, navDate: evaluation.expectedSession, shareChangePct: null, trackingErrorPct: 120, alternatives: ['B'], exposure: [] },
      { ticker: 'B', indexCode: 'IDX', feePct: .3, navDate: evaluation.expectedSession, shareChangePct: null, trackingErrorPct: 1.2, alternatives: ['A'], exposure: [] },
    ]
    expect(productGroups(evaluation)[0].comparisonCandidate).toBe('B')
    expect(productGroups(evaluation)[0].products.find(item => item.ticker === 'A')?.trackingAnomaly).toBe(true)
  })

  it('keeps only decision-grade events', () => {
    const evaluation = evaluateResearch(fixture())
    evaluation.events.push({ ...evaluation.events[0], id: 'admin', category: 'administrative', priority: 5 })
    expect(decisionEvents(evaluation).some(item => item.id === 'admin')).toBe(false)
    evaluation.events.push({ ...evaluation.events[0], id: 'cash',title:'关于使用部分闲置募集资金进行现金管理的进展公告',evidenceGrade:'A',materialityScore:90 })
    expect(decisionEvents(evaluation).some(item=>item.id==='cash')).toBe(false)
  })

  it('reserves recent developments and both announcements and broader news',()=>{
    const evaluation=evaluateResearch(fixture()),base=evaluation.events[0]
    evaluation.events=Array.from({length:6},(_,index)=>({...base,id:`event-${index}`,title:`产业重大事件${index}`,publishedAt:`2026-09-${String(index+1).padStart(2,'0')}T01:00:00Z`,companies:index===0?['600000']:[],segments:[`环节${index}`],status:'evidence' as const,category:'technology' as const,priority:4,evidenceGrade:'A' as const,materialityScore:index===5?65:95,sourceTier:index===0?'primary' as const:'corroborated' as const,independentSourceCount:index===0?1:2}))
    const selected=decisionEvents(evaluation,4)
    expect(selected.map(item=>item.id)).toEqual(expect.arrayContaining(['event-0','event-5']))
    expect(selected.some(item=>item.companies.length>0)).toBe(true)
    expect(selected.some(item=>item.companies.length===0)).toBe(true)
  })

  it('reserves bounded slots for the highest influence events',()=>{
    const evaluation=evaluateResearch(fixture()),base=evaluation.events[0]
    evaluation.events=Array.from({length:20},(_,index)=>({...base,id:`impact-${index}`,title:`影响事件${index}`,publishedAt:`2026-09-${String((index%9)+1).padStart(2,'0')}T01:00:00Z`,status:'evidence' as const,category:'technology' as const,priority:4,evidenceGrade:'A' as const,materialityScore:90,influenceScore:index<6?95:60,influenceLevel:index<6?'high' as const:'medium' as const}))
    const selected=decisionEvents(evaluation,8)
    expect(selected.filter(item=>item.influenceLevel==='high').length).toBeGreaterThanOrEqual(4)
  })

  it('guards direct action wording in archived AI sections',()=>{
    expect(guardActionLanguage({analysis:'未持有观望、已持有减仓'},false)).toEqual({analysis:'未持有暂缓新增、已持有复核风险敞口'})
    expect(guardActionLanguage({recommendation:{unheld:'建仓',held:'减仓'}},false)).toEqual({recommendation:{unheld:'仅供研究参考',held:'复核风险敞口'}})
    expect(guardActionLanguage(JSON.stringify({recommendation:{unheld:'建仓',held:'减仓'}}),false)).toEqual({recommendation:{unheld:'仅供研究参考',held:'复核风险敞口'}})
  })
  it('separates missing data from unmet market signals and deduplicates valuation indices',()=>{
    const evaluation=evaluateResearch(fixture())
    evaluation.decisions[0].conditions.find(item=>item.key==='premium')!.value=null
    evaluation.decisions[0].conditions.find(item=>item.key==='premium')!.status='unknown'
    evaluation.decisions[0].conditions.find(item=>item.key==='trend')!.status='unmet'
    evaluation.products=[
      {ticker:'A',indexCode:'IDX',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:1,pe:20,valuationDate:evaluation.expectedSession,valuationSampleCount:1,exposure:[],alternatives:[]},
      {ticker:'B',indexCode:'IDX',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:1,pe:20,valuationDate:evaluation.expectedSession,valuationSampleCount:1,exposure:[],alternatives:[]},
    ]
    const coverage=reportCoverage(evaluation)
    expect(coverage.data.find(item=>item.key==='premium')?.known).toBe(0)
    expect(coverage.signalUnmet).toBe(1)
    expect(coverage.data.find(item=>item.key==='valuation-current')).toMatchObject({known:1,total:1})
  })
  it('counts market signals once per tracked index',()=>{
    const evaluation=evaluateResearch(fixture()),duplicate=structuredClone(evaluation.decisions[0])
    duplicate.ticker='159801';evaluation.decisions.push(duplicate)
    const coverage=reportCoverage(evaluation)
    expect(coverage.indexCount).toBe(1)
    expect(coverage.signalTotal).toBe(4)
  })
  it('selects one representative per exposure family and rejects anomalous tracking first',()=>{
    const evaluation=evaluateResearch(fixture()),chip=structuredClone(evaluation.decisions[0]),cloud=structuredClone(evaluation.decisions[0]),communication=structuredClone(evaluation.decisions[0])
    evaluation.decisions[0].name='芯片ETF华夏'
    chip.ticker='159801';chip.name='芯片ETF广发';cloud.ticker='159890';cloud.name='云计算ETF';communication.ticker='159583';communication.name='通信ETF';evaluation.decisions.push(chip,cloud,communication)
    evaluation.products=[{ticker:'159995',indexCode:'A',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:120,exposure:[],alternatives:[]},{ticker:'159801',indexCode:'A',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:1.5,exposure:[],alternatives:[]},{ticker:'159890',indexCode:'B',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:2,exposure:[],alternatives:[]},{ticker:'159583',indexCode:'C',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:1,exposure:[],alternatives:[]}]
    expect(representativeProducts(evaluation).map(item=>item.ticker)).toEqual(['159801','159890','159583'])
  })
})
