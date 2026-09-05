import { beforeEach, describe, expect, it, vi } from 'vitest'
const { prompt, db } = vi.hoisted(() => ({ prompt: vi.fn(), db: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } }))
vi.mock('@/lib/workflow/analysis-prompt', () => ({ runAnalysisPrompt: prompt }))
vi.mock('@/lib/db', () => ({ prisma: { aIAnalysisReport: db } }))
import { socialReportStep } from '../workflow/steps/social-report-step'
import { generateReportStep } from '../workflow/steps/generate-report-step'
import { parseSocialReport, REPORT_SECTIONS } from '../analysis/social-report'
import type { StepContext } from '../workflow/types'

const valid = { version: 2, title: '产业观察', subtitle: '来源与日期待核验', takeaways: ['需求','盈利','风险'], sections: REPORT_SECTIONS.map(title => ({title,body:'有依据的分析'})), risks: ['风险一','风险二','风险三'] }
const response = (value: unknown) => ({ content: [{type:'text',text:JSON.stringify(value)}] })
function context(): StepContext {
  const artifacts = new Map<string, any>([['industry-info', {id:'industry',name:'AI硬件'}], ['market-analysis',JSON.stringify({analysis:'完整市场证据',evidence:[{source:'交易所',date:'2026-09-04'}]})], ['portfolio-analysis','PRIVATE'], ['etf-actions',[]]])
  return {runId:'run',stepId:'step',input:{},artifacts,saveArtifact:vi.fn(async (key,data) => { artifacts.set(key,data) }),updateProgress:vi.fn()}
}
beforeEach(() => { vi.clearAllMocks(); prompt.mockReset(); db.findFirst.mockResolvedValue(null); db.create.mockResolvedValue({id:'saved'}); db.update.mockResolvedValue({id:'saved'}) })
describe('report recovery', () => {
  it('reports exact overflow paths and lengths, invalid JSON and section order', () => {
    expect(() => parseSocialReport(JSON.stringify({...valid,title:'字'.repeat(21)}))).toThrow('title：实际21字，最多20字')
    expect(() => parseSocialReport(JSON.stringify({...valid,sections:[...valid.sections].reverse()}))).toThrow('sections[0].title')
    expect(() => parseSocialReport('null')).toThrow('JSON对象')
    expect(() => parseSocialReport('{')).toThrow('有效JSON')
  })
  it('keeps valid legacy v1 reports readable', () => {
    expect(parseSocialReport(JSON.stringify({...valid,version:undefined})).title).toBe(valid.title)
  })
  it('builds the one-page report deterministically without another AI call', async () => {
    prompt.mockResolvedValueOnce(response({...valid,subtitle:'字'.repeat(81)})).mockResolvedValueOnce(response(valid))
    const ctx = context()
    await socialReportStep.execute(ctx)
    expect(prompt).not.toHaveBeenCalled()
    const attempts = [...ctx.artifacts.entries()].filter(([key]) => key.startsWith('social-report-attempt-')).map(([,value]) => value)
    expect(attempts).toHaveLength(0)
    expect(ctx.artifacts.get('social-report-status').status).toBe('ready')
    expect(ctx.artifacts.get('social-report-status').compacted).toBe(true)
  })
  it('saves full research when optional source analyses are sparse', async () => {
    prompt.mockResolvedValue(response({...valid,takeaways:[]}))
    const ctx = context()
    ctx.artifacts.set('social-report', valid) // stale output must not survive a failed replacement
    await socialReportStep.execute(ctx)
    expect(prompt).not.toHaveBeenCalled()
    expect(ctx.artifacts.get('social-report')).toBeTruthy()
    expect(ctx.artifacts.get('social-report-status').status).toBe('ready')
    await generateReportStep.execute(ctx)
    const saved = db.create.mock.calls[0][0].data
    expect(saved.content).toContain('完整市场证据')
    expect(saved.content).toContain('ETF规则观察')
    expect(saved.content).not.toContain('PRIVATE')
    expect(JSON.parse(saved.dataJson).privatePortfolioAnalysis).toBe('PRIVATE')
    expect(ctx.artifacts.get('report-id')).toBe('saved')
  })
  it('does not depend on an extra editor call and reuses an already saved report on resume', async () => {
    prompt.mockRejectedValue(new Error('AI连接失败'))
    const ctx = context()
    await socialReportStep.execute(ctx)
    db.findFirst.mockResolvedValue({id:'saved'})
    await generateReportStep.execute(ctx)
    expect(db.update).toHaveBeenCalledOnce()
    expect(db.create).not.toHaveBeenCalled()
  })
})
