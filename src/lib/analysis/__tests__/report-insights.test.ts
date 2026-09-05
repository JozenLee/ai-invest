import { describe, expect, it } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { decisionEvents, guardActionLanguage, productGroups, reportReadiness, representativeProducts, safeDecisionAction } from '../report-insights'

describe('report investment readiness', () => {
  it('fails closed while research rules are experimental', () => {
    const evaluation = evaluateResearch(fixture())
    expect(reportReadiness(evaluation, { status: 'available' }, false).level).toBe('watch-only')
    expect(safeDecisionAction(evaluation.decisions[0], false).unheld).toBe('观察候选')
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
  })

  it('guards direct action wording in archived AI sections',()=>{
    expect(guardActionLanguage({analysis:'未持有观望、已持有减仓'},false)).toEqual({analysis:'未持有暂缓新增、已持有复核风险敞口'})
  })
  it('selects one representative per exposure family and rejects anomalous tracking first',()=>{
    const evaluation=evaluateResearch(fixture()),chip=structuredClone(evaluation.decisions[0]),cloud=structuredClone(evaluation.decisions[0]),communication=structuredClone(evaluation.decisions[0])
    evaluation.decisions[0].name='芯片ETF华夏'
    chip.ticker='159801';chip.name='芯片ETF广发';cloud.ticker='159890';cloud.name='云计算ETF';communication.ticker='159583';communication.name='通信ETF';evaluation.decisions.push(chip,cloud,communication)
    evaluation.products=[{ticker:'159995',indexCode:'A',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:120,exposure:[],alternatives:[]},{ticker:'159801',indexCode:'A',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:1.5,exposure:[],alternatives:[]},{ticker:'159890',indexCode:'B',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:2,exposure:[],alternatives:[]},{ticker:'159583',indexCode:'C',feePct:.5,navDate:null,shareChangePct:null,trackingErrorPct:1,exposure:[],alternatives:[]}]
    expect(representativeProducts(evaluation).map(item=>item.ticker)).toEqual(['159801','159890','159583'])
  })
})
