import { beforeEach, describe, expect, it, vi } from 'vitest'
const create = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ai/claude', () => ({ claudeClient: { messages: { create } } }))
import { portfolioAnalysisStep, validatePortfolioOutput } from '../steps/portfolio-analysis-step'
import type { StepContext } from '../types'

const valid = { analysis: '保持谨慎，先核验产品', conclusionApplication: '综合结论限制新增风险', priorities: [], risks: [], watchlist: [] }
// Reproduces the archived response shape without retaining private holdings.
const invalid = { analysis: { overview: '减至5%' }, conclusionApplication: { toIndustryExposure: '降低风险' }, priorities: [], risks: [{ description: '未核验' }], watchlist: [{ item: '补充数据' }] }
const response = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], stop_reason: 'end_turn', usage: {} })
function context(): StepContext {
  const artifacts: StepContext['artifacts'] = new Map([
    ['portfolio-decision-support', { signal: 'risk-off', readiness: 'blocked', actions: [], researchConclusion: { appliedToAllocation: '不新增风险' } }],
    ['investment-advice', { rating: '谨慎' }],
    ['portfolio-evidence', { asOf: '2026-09-10', holdingCount: 0, cashWeightPct: 100, holdings: [] }],
  ])
  return { runId: 'run', stepId: 'portfolio-step', input: { portfolioAiConsent: new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin }, artifacts, updateProgress: vi.fn(), saveArtifact: async (key, value) => { artifacts.set(key, value) } }
}
describe('portfolio output recovery', () => {
  beforeEach(() => create.mockReset())
  it('reports all incompatible fields and numeric targets together', () => {
    let message = ''
    try { validatePortfolioOutput(JSON.stringify(invalid)) } catch (error) { message = (error as Error).message }
    for (const field of ['analysis', 'conclusionApplication', 'risks', 'watchlist', '仓位数值']) expect(message).toContain(field)
  })
  it('corrects the archived response shape within the retry boundary', async () => {
    create.mockResolvedValueOnce(response(invalid)).mockResolvedValueOnce(response(valid))
    const ctx = context()
    await portfolioAnalysisStep.execute(ctx)
    expect(create).toHaveBeenCalledTimes(2)
    const correction = create.mock.calls[1][0].messages.at(-1).content
    for (const field of ['analysis', 'conclusionApplication', 'risks', 'watchlist', '仓位数值']) expect(correction).toContain(field)
    expect(ctx.artifacts.get('portfolio-analysis-ai-status')).toEqual({ status: 'completed' })
    expect(ctx.artifacts.get('portfolio-analysis').aiAnalysis).toEqual(valid)
    expect(ctx.artifacts.get('ai-request-status')).toMatchObject({ status: 'completed', attempt: 2 })
    expect(ctx.artifacts.has('ai-response-attempt-1')).toBe(true)
  })
  it('preserves local decisions after malformed JSON exhausts retries', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: '{"analysis": "未转义"引号"}' }], stop_reason: 'end_turn' })
    const ctx = context()
    await portfolioAnalysisStep.execute(ctx)
    expect(create).toHaveBeenCalledTimes(3)
    expect(ctx.artifacts.get('portfolio-analysis-ai-status')).toMatchObject({ status: 'fallback', detail: expect.stringContaining('完整JSON对象') })
    expect(ctx.artifacts.get('portfolio-analysis')).toMatchObject({ conclusionApplication: '不新增风险', portfolioView: { signal: 'risk-off', readiness: 'blocked' } })
    expect(ctx.artifacts.get('portfolio-analysis').aiAnalysis).toBeUndefined()
    expect(ctx.artifacts.get('ai-request-status')).toMatchObject({ status: 'failed', attempt: 3 })
  })
})
