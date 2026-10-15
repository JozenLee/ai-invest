import { describe, expect, it, vi } from 'vitest'
import type { StepContext } from '../types'
import { researchEvidence, researchInputCoverage } from '../research-input'
import {fixture} from '@/lib/research/__tests__/fixtures'
import {evaluateResearch} from '@/lib/research/engine'

describe('investment advice evidence boundary',()=>{
  it('keeps stale historical conclusions out of current synthesis fields',()=>{
    const artifacts=new Map<string,unknown>([
      ['historical-report-context',[{reportId:'old',sessionDate:'2026-09-01',comprehensiveConclusion:{conclusion:'旧结论：财务覆盖率28.6%',opportunities:[{title:'旧机会'}],watchPoints:['旧观察项']}}]],
      ['data-quality',{status:'available',coverage:1,requested:8,available:8,companyCoverage:{total:49,profitGrowth:42,cashQuality:41},modules:{company:{status:'available'}}}],
      ['research-evaluation',{decisions:[],events:[],evidence:[],productComparisons:[],indexOverlaps:[],products:[]}],
      ['etf-bindings',[]],['etf-holdings',[]],['research-snapshot',{etfs:[]}],
    ])
    const context={artifacts,inputs:new Map(),input:{},runId:'run',stepId:'step',updateProgress:vi.fn(),saveArtifact:vi.fn()} as unknown as StepContext
    const result=researchEvidence(context,'investment-advice') as Record<string,unknown>
    expect(JSON.stringify(result)).not.toContain('财务覆盖率28.6%')
    expect(JSON.stringify(result)).toContain('旧机会')
    expect(JSON.stringify(result)).toContain('"profitGrowth":42')
  })
})

it('reasons once per index while retaining every product execution boundary',()=>{
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot),duplicate=structuredClone(evaluation.decisions[0])
  duplicate.ticker='159801';evaluation.decisions.push(duplicate)
  evaluation.products?.push({...evaluation.products[0],ticker:'159801'})
  const artifacts=new Map<string,unknown>([['research-snapshot',snapshot],['research-evaluation',evaluation],['data-quality',{status:'available'}],['etf-bindings',[]],['etf-holdings',[]]])
  const context={artifacts,inputs:new Map(),input:{}} as unknown as StepContext
  const result=researchEvidence(context,'investment-advice') as {indexDecisionMatrix:unknown[];productDecisionBoundary:unknown[]}
  expect(result.indexDecisionMatrix).toHaveLength(1)
  expect(result.productDecisionBoundary).toHaveLength(2)
})

it('passes unified event sentiment and announcement summaries into their AI stages',()=>{
  const announcementSummary='公司获得重大订单并开始量产供货，订单金额、交付周期和客户验收条件已在公告正文中披露，后续仍需跟踪产能爬坡和收入确认进度。'
  const event={id:'event-1',title:'企业公告获得重大订单',category:'demand',publishedAt:'2026-09-04T01:00:00.000Z',expiresAt:'2026-10-04T01:00:00.000Z',companies:['600000'],segments:['环节A'],evidenceIds:['announcement-1'],sources:['stock_announcement'],urls:[],excerpt:announcementSummary,summary:announcementSummary,status:'evidence',priority:4,verification:'source-linked-not-independently-verified',evidenceGrade:'A',sourceTier:'primary',independentSourceCount:1,materialityScore:88}
  const artifacts=new Map<string,unknown>([
    ['industry-info',{name:'测试产业'}],['data-quality',{status:'available',modules:{events:{status:'available'}}}],
    ['research-evaluation',{decisions:[],events:[event],evidence:[]}],['news-events',[event]],
    ['news-sentiment',{developmentTone:'积极',score:.6,announcementEvents:1,latestPublishedAt:event.publishedAt,freshness:'当前'}],
    ['company-market-data',[{stockCode:'600000',stockName:'测试公司',financials:[],announcements:[event],financialGaps:[]}]],
  ])
  const context={artifacts,inputs:new Map(),input:{}} as unknown as StepContext
  const news=researchEvidence(context,'news-analysis') as Record<string,unknown>
  const company=researchEvidence(context,'company-analysis') as {companies:Array<{announcements:unknown[]}>}
  expect(news.eventSentiment).toMatchObject({developmentTone:'积极',announcementEvents:1})
  expect(JSON.stringify(news)).toContain('announcement-1')
  expect(company.companies[0].announcements).toEqual([expect.objectContaining({title:event.title,evidenceIds:['announcement-1']})])
})

it('fails semantic market coverage when ETF data exists but the evaluation race leaves no representatives',()=>{
  const artifacts=new Map<string,unknown>([
    ['etf-market-data',[{ticker:'159995'}]],['research-evaluation',{decisions:[]}],['market-snapshot',{}],['data-quality',{status:'available'}],
  ])
  const context={artifacts,inputs:new Map(),input:{}} as unknown as StepContext
  const evidence=researchEvidence(context,'market-analysis')
  const audit=researchInputCoverage(context,'market-analysis',evidence)
  expect(audit.passed).toBe(false)
  expect(audit.issues.join('；')).toMatch(/量化评估|ETF代表样本/)
})

it('keeps up to sixteen decision events and prioritizes high influence rows',()=>{
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot),base=evaluation.events[0]
  evaluation.events=Array.from({length:20},(_,index)=>({...base,id:`event-${index}`,title:`高价值产业事件${index}`,publishedAt:`2026-09-${String((index%9)+1).padStart(2,'0')}T01:00:00Z`,category:'technology' as const,status:'evidence' as const,priority:4,evidenceGrade:'A' as const,materialityScore:90,influenceScore:index<8?90:60,influenceLevel:index<8?'high' as const:'medium' as const}))
  const artifacts=new Map<string,unknown>([['industry-info',{name:'测试产业'}],['research-snapshot',snapshot],['research-evaluation',evaluation],['data-quality',{status:'available'}],['news-sentiment',{}],['graph-context',{relations:[],eventMappings:[]}]])
  const context={artifacts,inputs:new Map(),input:{}} as unknown as StepContext
  const evidence=researchEvidence(context,'news-analysis') as {events:Array<{influenceLevel?:string}>}
  const audit=researchInputCoverage(context,'news-analysis',evidence)
  expect(evidence.events).toHaveLength(16)
  expect(evidence.events.filter(item=>item.influenceLevel==='high')).toHaveLength(8)
  expect(audit.passed).toBe(true)
})

it('shares condition labels and units without dropping product values or allowed trigger keys',()=>{
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot)
  const context={artifacts:new Map<string,unknown>([['research-snapshot',snapshot],['research-evaluation',evaluation]]),input:{}} as unknown as StepContext
  const result=researchEvidence(context,'investment-advice') as {defaultTriggerConditions:string[];triggerConditionCatalog:Array<{key:string;label:string;unit?:string;threshold:number}>;productDecisionBoundary:Array<{allowedTriggerConditions?:string[];productConditions:Array<{key:string;value:number;threshold:number}>}>}
  const spread=result.triggerConditionCatalog.find(row=>row.key==='spread')!
  expect(spread).toMatchObject({unit:'bps',threshold:evaluation.profile.rules.maxSpreadBps})
  expect(spread.label).toContain('基点')
  expect(result.defaultTriggerConditions).toContain('spread')
  expect(result.productDecisionBoundary[0].productConditions.find(row=>row.key==='spread')?.value).toBe(5)
})
