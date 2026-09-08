import { describe, expect, it } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { clusterEvents } from '@/lib/research/events'
import { auditClaim } from '../evidence-references'
import { decisionEvents, indexRuleSummary, productGroups } from '../report-insights'
import { renderValue } from '../full-research-report'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ReportAnalysisView } from '@/components/analysis/ReportAnalysisView'

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
    expect(decisionEvents(evaluation,99)).toHaveLength(1)
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

it('does not promote governance boilerplate into a decision risk event',()=>{
  const result=evaluateResearch(fixture()),event=result.events[0]
  result.events=[{...event,title:'董事会薪酬与考核委员会关于激励对象名单的核查意见',category:'risk',priority:5}]
  expect(decisionEvents(result,99)).toEqual([])
})
it('accepts a financial publication date without confusing it with the reporting period',()=>{
  const row=auditClaim({claim:'本期净利润增长',source:'财报',date:'2026-08-22',evidenceIds:['financial']},[{id:'financial',source:'财报',dataDate:'2026-06-30',publishedAt:'2026-08-22T00:00:00Z',fetchedAt:'2026-08-23',hash:'h'}])
  expect(row.referenceIssues).toEqual([])
})
it('merges near-duplicate watch items while preserving different thresholds',async()=>{
  const {consolidateWatchlist}=await import('../report-insights')
  const items=consolidateWatchlist(['云智算利用率及租赁价格','云智算利用率、租赁价格及资本开支','连续3日站上20日均线','连续5日站上20日均线'])
  expect(items).toEqual(['云智算利用率、租赁价格及资本开支','连续3日站上20日均线','连续5日站上20日均线'])
})
