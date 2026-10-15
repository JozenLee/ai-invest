import { describe, expect, it, vi } from 'vitest'
import { researchEvidence } from '@/lib/workflow/research-input'
import type { StepContext } from '@/lib/workflow/types'

describe('historical report prompt boundary', () => {
  it('passes only historical opportunities and watch points to final synthesis', () => {
    const comprehensiveConclusion = {
      conclusion: '此前认为订单改善可能成为机会',
      allocationStance: '等待确认',
      keyDrivers: ['需求'],
      opportunities: [{ title: '订单改善', status: '待观察', evidence: '等待公告', actionImplication: '确认后复核' }],
      mainRisks: ['估值'],
      watchPoints: ['订单公告'],
      actionPlan: { priority: '等待公告', unheld: '观望', held: '持有' },
      historyComparison: [],
    }
    const artifacts = new Map<string, unknown>([
      ['historical-report-context', [{ reportId: 'report-1', sessionDate: '2026-09-03', createdAt: '2026-09-03T08:00:00Z', title: '旧报告', summary: '不应进入提示词', recommendation: { unheld: '建仓' }, stateCounts: { eligible: 1 }, comprehensiveConclusion }]],
      ['research-evaluation', { decisions: [], events: [], products: [] }],
      ['industry-info', { name: 'AI算力' }],
    ])
    const context = { artifacts, input: { industryId: 'ai' }, updateProgress: vi.fn(), saveArtifact: vi.fn() } as unknown as StepContext
    const finalEvidence = researchEvidence(context, 'investment-advice') as Record<string, unknown>
    const history = finalEvidence.historicalReportContext as Array<Record<string, unknown>>
    expect(history[0]).toEqual({ reportId: 'report-1', sessionDate: '2026-09-03', opportunities: comprehensiveConclusion.opportunities, watchPoints: comprehensiveConclusion.watchPoints, role: '历史机会与观察项，仅用于historyComparison，禁止复制到本轮结论' })
    expect(JSON.stringify(history)).not.toContain('此前认为订单改善可能成为机会')
    expect(JSON.stringify(history)).not.toContain('不应进入提示词')
    expect(researchEvidence(context, 'industry-overview')).not.toHaveProperty('historicalReportContext')
  })
})

it('retains the latest reports regardless of storage order without mutating history',()=>{
  const reports=['11','14','18','24'].map(day=>({reportId:day,sessionDate:`2026-09-${day}`,comprehensiveConclusion:{opportunities:['订单'],watchPoints:['资金']}}))
  const artifacts=new Map<string,unknown>([['historical-report-context',reports],['research-evaluation',{decisions:[],events:[],products:[]}]])
  const evidence=researchEvidence({artifacts,input:{industryId:'ai'}} as unknown as StepContext,'investment-advice')
  expect(evidence.historicalReportContext.map((row:{reportId:string})=>row.reportId)).toEqual(['24','18'])
  expect(reports.map(row=>row.reportId)).toEqual(['11','14','18','24'])
})
