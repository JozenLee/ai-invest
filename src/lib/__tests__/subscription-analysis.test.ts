import { describe, it, expect, vi } from 'vitest'
const db = vi.hoisted(() => ({ eTFDaily: { findMany: vi.fn().mockResolvedValue([]) }, marketQuote: { findUnique: vi.fn().mockResolvedValue(null) }, newsArticle: { findMany: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/lib/db', () => ({ prisma: db }))
vi.mock('@/lib/subscription-config-store', () => ({ getSubscriptionConfig: vi.fn().mockResolvedValue({ historyPoints: 120 }) }))
vi.mock('@/lib/news-taxonomy', () => ({getNewsTaxonomy:vi.fn().mockResolvedValue([{industry_id:'test',segment_code:'test-segment'}]),matchesNewsIndustry:()=>true}))
import { fetchETFDataStep } from '../workflow/steps/fetch-etf-data-step'
import { fetchNewsStep } from '../workflow/steps/fetch-news-step'
import { assessDataQualityStep } from '../workflow/steps/assess-data-quality-step'
import type { StepContext } from '../workflow/types'
function context() {
  const artifacts = new Map<string, any>([['etf-codes', '510300'], ['industry-info', { id: 'test', name: '测试产业' }]])
  return { artifacts, input: {}, runId: 'test', stepId: 'test', updateProgress: vi.fn(), saveArtifact: vi.fn(async (key, value) => { artifacts.set(key, value) }) } as unknown as StepContext
}
describe('subscription-only analysis', () => {
  it('keeps missing ETF data explicit without external fallback', async () => {
    const network = vi.spyOn(globalThis, 'fetch')
    const ctx = context()
    await fetchETFDataStep.execute(ctx)
    expect(ctx.artifacts.get('etf-market-data')).toEqual([])
    expect(ctx.artifacts.get('etf-data-gaps').missingCodes).toEqual(['510300'])
    expect(network).not.toHaveBeenCalled(); network.mockRestore()
  })
  it('keeps unscored sentiment unknown rather than zero', async () => {
    const ctx = context()
    await fetchNewsStep.execute(ctx)
    expect(ctx.artifacts.get('news-sentiment').avgSentiment).toBeNull()
  })
  it('records a failed quality gate before allowing AI', async () => {
    const ctx = context()
    await expect(assessDataQualityStep.execute(ctx)).rejects.toThrow('门禁未通过')
    expect(ctx.artifacts.get('data-quality').status).toBe('blocked')
  })
})
