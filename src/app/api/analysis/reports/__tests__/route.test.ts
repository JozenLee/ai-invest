import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { findMany,calendarFindFirst } = vi.hoisted(() => ({ findMany: vi.fn(),calendarFindFirst:vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { aIAnalysisReport: { findMany, create: vi.fn() },rawPayload:{findFirst:calendarFindFirst} } }))
vi.mock('@/lib/research/store',()=>({getResearchProfile:vi.fn(async(industryId:string)=>({version:1,industryId,name:'AI',benchmark:'000300.SH',horizonDays:20,sectors:[],segments:[],leaders:[],historyReports:{enabled:true,lookbackTradingDays:10,mode:'latest-per-trading-day'},rules:{minHistory:120,maxPremiumPct:.5,minDailyAmount:2e7,maxSpreadBps:20,maxVolatilityPct:60,flowDays:5,entryConfirmDays:3}}))}))

import { GET } from '../route'

describe('analysis report summaries', () => {
  beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));findMany.mockReset();calendarFindFirst.mockReset()})
  afterEach(()=>vi.useRealTimers())

  it('returns lightweight history records with recommendation confidence', async () => {
    findMany.mockResolvedValue([{
      id: 'report-1', type: 'comprehensive', industryId: 'ai', industryName: 'AI算力硬件', title: '报告', summary: '摘要', createdAt: new Date('2026-09-05T00:00:00Z'),
      dataJson: JSON.stringify({ dataQuality: { status: 'available' }, metadata: { runId: 'run-1' }, researchEvaluation: { decisions: [{ state: 'risk-off', conditions: [{ key: 'market', status: 'unmet' }], evidenceIds: ['e1'] }] } }),
    }])
    const response=await GET(new NextRequest('http://localhost/api/analysis/reports?industryId=ai&type=comprehensive&view=summary'))
    const payload=await response.json()
    expect(payload.reports[0]).toMatchObject({id:'report-1',recommendation:{stateCounts:{'risk-off':1}}})
    expect(payload.reports[0].recommendation.confidencePct).toBeGreaterThan(0)
    expect(payload.reports[0]).not.toHaveProperty('content')
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({take:100,select:expect.objectContaining({dataJson:true})}))
  })
  it('marks only the latest same-industry report per trading day for the next analysis',async()=>{
    calendarFindFirst.mockResolvedValue({payload:JSON.stringify({data:[{cal_date:'20260905',is_open:0},{cal_date:'20260904',is_open:1}]})})
    findMany.mockResolvedValue([
      {id:'latest',type:'comprehensive',industryId:'ai',industryName:'AI',title:'新',summary:'',createdAt:new Date('2026-09-04T12:00:00Z'),dataJson:JSON.stringify({researchEvaluation:{expectedSession:'2026-09-04',decisions:[]}})},
      {id:'older',type:'comprehensive',industryId:'ai',industryName:'AI',title:'旧',summary:'',createdAt:new Date('2026-09-04T10:00:00Z'),dataJson:JSON.stringify({researchEvaluation:{expectedSession:'2026-09-04',decisions:[]}})},
      {id:'other',type:'comprehensive',industryId:'ev',industryName:'新能源',title:'其他',summary:'',createdAt:new Date('2026-09-04T13:00:00Z'),dataJson:JSON.stringify({researchEvaluation:{expectedSession:'2026-09-04',decisions:[]}})},
    ])
    const response=await GET(new NextRequest('http://localhost/api/analysis/reports?scope=all&contextIndustryId=ai&type=comprehensive&view=summary'))
    const payload=await response.json()
    expect(payload.reports.map((item:{inclusionLabel:string})=>item.inclusionLabel)).toEqual(['纳入下一轮分析','同交易日较早版本','其他产业领域'])
  })
  it('hides graph verification reports from the default comprehensive history',async()=>{
    findMany.mockResolvedValue([
      {id:'verification',type:'comprehensive',industryId:'ai',industryName:'AI',title:'验证',summary:'',createdAt:new Date('2026-09-05T01:00:00Z'),dataJson:JSON.stringify({metadata:{verificationMode:'graph-e2e'},researchEvaluation:{decisions:[]}})},
      {id:'normal',type:'comprehensive',industryId:'ai',industryName:'AI',title:'正式',summary:'',createdAt:new Date('2026-09-05T00:00:00Z'),dataJson:JSON.stringify({metadata:{verificationMode:null},researchEvaluation:{decisions:[]}})},
    ])
    const response=await GET(new NextRequest('http://localhost/api/analysis/reports?industryId=ai&type=comprehensive&view=summary'))
    const payload=await response.json()
    expect(payload.reports.map((item:{id:string})=>item.id)).toEqual(['normal'])
  })
})
