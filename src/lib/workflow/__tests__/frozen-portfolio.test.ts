import { describe, expect, it, vi } from 'vitest'
const find = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ prisma: { portfolio: { findFirst: find } } }))
import { fetchPortfolioStep } from '../steps/fetch-portfolio-step'
import type { StepContext } from '../types'

const context = (values: Array<[string, unknown]>) => {
  const artifacts = new Map(values)
  return { runId: 'run', stepId: 'portfolio', input: {}, artifacts, updateProgress: vi.fn(), saveArtifact: async (key: string, value: unknown) => { artifacts.set(key, value) } } as StepContext
}
describe('private account point-in-time boundary', () => {
  it('reuses the frozen private account despite a later database update', async () => {
    const frozen = { holdings: [{ ticker: '017470', quantity: 10 }], totalAssets: 100, asOf: '2026-09-10' }
    find.mockResolvedValue({ totalAssets: 99999 })
    const ctx = context([['research-snapshot', { id: 'public-snapshot', asOf: '2026-09-10' }], ['frozen-portfolio-evidence', frozen]])
    await fetchPortfolioStep.execute(ctx)
    expect(ctx.artifacts.get('portfolio-evidence')).toEqual(frozen)
    expect(find).not.toHaveBeenCalled()
    expect(JSON.stringify(ctx.artifacts.get('research-snapshot'))).not.toContain('017470')
    expect(JSON.stringify(ctx.artifacts.get('research-snapshot'))).not.toContain('totalAssets')
  })
  it('does not splice a current account into a historical run without a frozen account', async () => {
    const ctx = context([['research-snapshot', { id: 'legacy' }]])
    await fetchPortfolioStep.execute(ctx)
    expect(ctx.artifacts.get('portfolio-evidence')).toMatchObject({ excluded: true })
    expect(find).not.toHaveBeenCalled()
  })
})
