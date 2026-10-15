import { describe, expect, it } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { clusterEvents } from '@/lib/research/events'
import { auditClaim, auditEvidenceTree } from '../evidence-references'
import { decisionEvents, indexRuleSummary, productGroups } from '../report-insights'
import { renderValue } from '../full-research-report'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ReportAnalysisView } from '@/components/analysis/ReportAnalysisView'
import { refreshEventPaths } from '@/lib/workflow/event-paths'

describe('comprehensive report repairs',()=>{
  it('explains NAV date mismatch instead of calculating a cross-day premium',()=>{
    const snapshot=fixture();snapshot.etfs[0].product.date='2026-09-03';snapshot.etfs[0].product.navStatus='pending-publication'
    const result=evaluateResearch(snapshot)
    expect(result.decisions[0].metrics.premiumPct).toBeNull()
    expect(result.decisions[0].conditions.find(row=>row.key==='premium')).toMatchObject({availability:'pending-publication',detail:expect.stringContaining('2026-09-03')})
  })
  it('persists comparison candidates separately from execution readiness',()=>{
    const snapshot=fixture();snapshot.etfs.push({...structuredClone(snapshot.etfs[0]),ticker:'159801'})
    for(const etf of snapshot.etfs){etf.product.date='2026-09-03';etf.navHistory=etf.bars.map(bar=>({date:bar.date,nav:bar.close}))}
    const result=evaluateResearch(snapshot),group=result.productComparisons?.[0]
    expect(group?.candidate).toBeTruthy()
    expect(group?.executionReady).toBe(false)
    expect(group?.comparisonDate).toBe('2026-09-03')
  })
  it('does not count multiple wrappers as additional index votes',()=>{
    const result=evaluateResearch(fixture()),base=result.decisions[0]
    result.decisions=[{...base,state:'risk-off'},...Array.from({length:8},(_,i)=>({...base,ticker:'b'+i,indexCode:'B',state:'watch' as const})),{...base,ticker:'c',indexCode:'C',state:'watch'}]
    expect(indexRuleSummary(result)).toMatchObject({total:3,riskOff:1,signal:'watch'})
  })
  it('distinguishes a single product from insufficient data',()=>{
    expect(productGroups(evaluateResearch(fixture()))[0]).toMatchObject({status:'single-product',comparisonCandidate:null})
  })
  it('recalls policy based on body and preserves short leads for audit',()=>{
    const rows=clusterEvents([
      {id:'a',kind:'news',title:'周末要闻汇总',content:'七部门最新部署算力设施建设，指导意见提出推进算力基础设施互联与布局优化，支持相关产业创新发展。',source:'来源',segments:['compute'],publishedAt:'2026-09-03T08:00:00Z',fetchedAt:'2026-09-03T08:00:00Z'},
      {id:'b',kind:'news',title:'新芯片发布',content:'仅有标题',source:'来源',segments:['compute'],publishedAt:'2026-09-03T08:00:00Z',fetchedAt:'2026-09-03T08:00:00Z'},
    ],'2026-09-04T09:00:00Z')
    expect(rows.find(row=>row.evidenceIds.includes('a'))).toMatchObject({category:'policy',priority:4,status:'evidence'})
    expect(rows.find(row=>row.evidenceIds.includes('b'))?.status).toBe('lead')
    const evaluation=evaluateResearch(fixture());evaluation.events=rows
    expect(decisionEvents(evaluation,99)).toHaveLength(0)
  })
  it('does not collapse different company annual reports',()=>{
    const result=evaluateResearch(fixture()),base=result.events[0]
    result.events=[{...base,id:'a',title:'甲公司：2026年半年度报告',companies:['A']},{...base,id:'b',title:'乙公司：2026年半年度报告',companies:['B']}]
    expect(decisionEvents(result,99)).toHaveLength(2)
  })
  it('flags wrong reference dates and keeps identifiers out of headlines',()=>{
    const id='1d31ae67-a3c3-4821-9afc-55e4d0b8c3c9:bars:159995'
    const row=auditClaim({claim:'指数低于均线；证据：'+id,source:'Tushare/fund_adj',date:'2026-09-07'},[{id,source:'frozen-local-daily',dataDate:'2026-09-04',publishedAt:null,fetchedAt:'2026-09-07',hash:'h'}])
    expect(row.claim).not.toContain(id)
    expect(row.evidenceIds).toEqual([id])
    expect(row.referenceIssues?.join('')).toContain('2026-09-04')
    expect(row.date).toBe('2026-09-04')
    const html=renderToStaticMarkup(createElement(ReportAnalysisView,{value:{evidence:[row]}}))
    expect(html).not.toContain('<h5')
    expect(html).toContain('overflow-wrap:anywhere')
  })
  it('renders nested Markdown lists on distinct lines',()=>{
    const text=renderValue({evidence:[{claim:'判断',source:'来源'}]})
    expect(text).toContain('证据：\n')
    expect(text).not.toMatch(/证据：\s+-\s+-/)
  })
})
it('removes fabricated evidence identifiers while retaining valid references',()=>{
  const row=auditClaim({claim:'判断',source:'财报',date:'2026-09-09',evidenceIds:['valid','fabricated']},[{id:'valid',source:'财报',dataDate:'2026-06-30',publishedAt:'2026-08-20',fetchedAt:'2026-08-20',hash:'h'}])
  expect(row.evidenceIds).toEqual(['valid'])
  expect(row.date).toBe('2026-06-30')
  expect(row.referenceIssues?.join('')).toContain('已移除')
})

it('does not promote governance boilerplate into a decision risk event',()=>{
  const result=evaluateResearch(fixture()),event=result.events[0]
  result.events=[{...event,title:'董事会薪酬与考核委员会关于激励对象名单的核查意见',category:'risk',priority:5}]
  expect(decisionEvents(result,99)).toEqual([])
})
it('merges near-duplicate rumours across sources and keeps them out of decisions',()=>{
  const base={kind:'news' as const,content:'公司公告称传闻不实，相关造谣者已被行政处罚。'.repeat(4),segments:['chip'],publishedAt:'2026-09-07T08:00:00Z',fetchedAt:'2026-09-07T09:00:00Z'}
  const events=clusterEvents([
    {...base,id:'a',title:'行云科技：“算力卡被卡在海关”的相关传闻造谣者已被行政处罚',source:'媒体甲'},
    {...base,id:'b',title:'行云科技：市场传闻造谣者已被行政处罚',source:'媒体乙'},
  ],'2026-09-08T00:00:00Z')
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({independentSourceCount:1,category:'other'})
  const evaluation=evaluateResearch(fixture());evaluation.events=events
  expect(decisionEvents(evaluation,99)).toEqual([])
})
it('accepts a financial publication date without confusing it with the reporting period',()=>{
  const row=auditClaim({claim:'本期净利润增长',source:'财报',date:'2026-08-22',evidenceIds:['financial']},[{id:'financial',source:'财报',dataDate:'2026-06-30',publishedAt:'2026-08-22T00:00:00Z',fetchedAt:'2026-08-23',hash:'h'}])
  expect(row.referenceIssues).toEqual([])
})
it('re-audits inherited evidence trees with one consolidated date range',()=>{
  const result=auditEvidenceTree({evidence:[{claim:'多期财务趋势',date:'2026-09-09',evidenceIds:['a','b'],referenceIssues:['旧版逐条误报']}]},[
    {id:'a',source:'财报',dataDate:'2025-12-31',publishedAt:'2026-03-01',fetchedAt:'2026-03-01',hash:'a'},
    {id:'b',source:'财报',dataDate:'2026-06-30',publishedAt:'2026-08-20',fetchedAt:'2026-08-20',hash:'b'},
  ]) as {evidence:Array<Record<string,unknown>>}
  expect(result.evidence[0]).toMatchObject({date:'2025-12-31—2026-06-30',referenceIssues:['多期判断日期已按冻结证据标注为2025-12-31—2026-06-30']})
})
it('merges near-duplicate watch items while preserving different thresholds',async()=>{
  const {consolidateWatchlist}=await import('../report-insights')
  const items=consolidateWatchlist(['云智算利用率及租赁价格','云智算利用率、租赁价格及资本开支','连续3日站上20日均线','连续5日站上20日均线'])
  expect(items).toEqual(['云智算利用率、租赁价格及资本开支','连续3日站上20日均线','连续5日站上20日均线'])
})

it('repairs inherited event paths through company mappings when the event is outside the retained graph event window',()=>{
  const graph={
    eventMappings:[],
    companyMappings:[{code:'002463',name:'沪电股份',segment:'高速PCB',segmentCode:'pcb',evidenceUrls:[]}],
    etfExposure:[{code:'159995',name:'芯片ETF',segments:[{stageCode:'mid',stageName:'中游',segmentCode:'pcb',segmentName:'高速PCB',relevance:.8,matchedCompanies:['002463'],holdingVerified:true}]}],
  } as unknown as import('@/lib/graph/research-context').FrozenGraphContext
  const result=refreshEventPaths({catalysts:[{event:'旧事件',path:'冻结事件 → 产业环节待映射',affectedCompanies:['sz002463'],affectedEtfs:[]}],evidence:[{claim:'科华数据科华数据投资者关系管理信息',date:'2026-09-04T00:00:00.000Z',referenceIssues:['引用abcd日期为2026-09-04，与判断日期2026-09-04T00:00:00.000Z不同']}]},graph) as {catalysts:Array<Record<string,unknown>>;evidence:Array<Record<string,unknown>>}
  expect(result.catalysts[0]).toMatchObject({path:'冻结事件 → 高速PCB → 相关指数基金（方向待复核）',affectedCompanies:['002463'],affectedEtfs:['159995']})
  expect(result.evidence[0]).toMatchObject({claim:'科华数据投资者关系管理信息',date:'2026-09-04',referenceIssues:[]})
})
