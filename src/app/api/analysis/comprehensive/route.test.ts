import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const createRun = vi.hoisted(() => vi.fn())
vi.mock('@/lib/workflow/workflows/comprehensive-analysis', () => ({ comprehensiveAnalysisWorkflow: { createRun } }))
vi.mock('@/lib/workflow/run-lineage', () => ({ reviewBaseline: vi.fn(async () => ({})) }))
vi.mock('@/lib/research/store', () => ({ getResearchProfile: vi.fn(async () => ({})) }))
vi.mock('@/lib/security/request-origin', () => ({ sameOriginRequest: vi.fn(() => true) }))
import { POST } from './route'

beforeEach(() => { createRun.mockReset(); createRun.mockResolvedValue('run-local') })

it.each([{}, { refreshResearchData: true }, { rulesOnly: true }, { verificationMode: 'graph-e2e' }])(
  'creates a local-only analysis with request options %j', async options => {
    const response = await POST(new NextRequest('http://localhost/api/analysis/comprehensive', {
      method: 'POST', body: JSON.stringify({ industryId: 'ai', ...options }),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ runId: 'run-local' })
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ industryId: 'ai', refreshResearchData: false }))
  },
)
