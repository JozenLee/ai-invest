import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn(), list: vi.fn(), latest: vi.fn(), evaluate: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({ default: { aIAnalysisReport: { findUnique: mocks.findUnique, findFirst: mocks.findFirst } } }))
vi.mock('@/lib/portfolio/forward-cohort-store', () => ({ listPortfolioForwardCohorts: mocks.list, latestPortfolioForwardEvaluation: mocks.latest, evaluatePortfolioForwardCohorts: mocks.evaluate }))
import { GET, POST } from './route'
const url = 'http://localhost:3000/api/portfolio/forward-evaluation'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirst.mockResolvedValue({ id: 'report-current', dataJson: JSON.stringify({ metadata: { runId: 'run-current' } }) })
  mocks.findUnique.mockResolvedValue({ id: 'report-requested', dataJson: JSON.stringify({ metadata: { runId: 'run-requested' } }) })
  mocks.list.mockResolvedValue([]); mocks.latest.mockResolvedValue(null)
  mocks.evaluate.mockResolvedValue({ checked: 0, remaining: 0, results: [], errors: [] })
})

describe('private current-report forward API', () => {
  it('defaults to only the latest comprehensive report lineage, never all cohorts', async () => {
    const response = await GET(new NextRequest(url))
    expect(response.status).toBe(200)
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { type: 'comprehensive' } }))
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({ runId: 'run-current' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ status: 'unverified', selector: { runId: 'run-current' }, validation: 'not-validated' })
  })
  it('reads an explicit run without looking at another account/report', async () => {
    mocks.list.mockResolvedValue([{ id: 'cohort', runId: 'run-explicit', status: 'unverified' }])
    const response = await GET(new NextRequest(`${url}?runId=run-explicit`))
    expect(mocks.findFirst).not.toHaveBeenCalled(); expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({ runId: 'run-explicit' })
    expect(await response.json()).toMatchObject({ records: [{ cohort: { id: 'cohort' }, latest: null }] })
  })
  it('uses the append-only report link when present', async () => {
    mocks.list.mockResolvedValue([{ id: 'cohort', runId: 'run-linked' }])
    await GET(new NextRequest(`${url}?reportId=report-linked`))
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.list).toHaveBeenCalledWith({ reportId: 'report-linked' })
  })
  it('falls back to that report dataJson metadata when a link is not yet appended', async () => {
    await GET(new NextRequest(`${url}?reportId=report-requested`))
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'report-requested' }, select: { id: true, dataJson: true } })
    expect(mocks.list).toHaveBeenLastCalledWith({ runId: 'run-requested' })
  })
  it('periodic POST evaluates only the selected run and never accepts a replacement cohort', async () => {
    const response = await POST(new NextRequest(url, { method: 'POST', body: JSON.stringify({ runId: 'run-explicit', sealed: { fabricated: true } }) }))
    expect(response.status).toBe(200)
    expect(mocks.evaluate).toHaveBeenCalledExactlyOnceWith({ runId: 'run-explicit', asOf: undefined, limit: undefined })
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })
  it('default periodic POST is also scoped to one latest report', async () => {
    await POST(new NextRequest(url, { method: 'POST', body: '{}' }))
    expect(mocks.evaluate).toHaveBeenCalledExactlyOnceWith({ runId: 'run-current', asOf: undefined, limit: undefined })
  })
  it('denies cross-origin mutations', async () => {
    const response = await POST(new NextRequest(url, { method: 'POST', headers: { origin: 'https://foreign.test' }, body: '{}' }))
    expect(response.status).toBe(403); expect(mocks.evaluate).not.toHaveBeenCalled()
  })
  it.each([{ runId: '' }, { limit: 0 }, { limit: 101 }, { asOf: '2999-01-01T00:00:00Z' }, { asOf: '2026-09-10' }])('rejects invalid request %j', async body => {
    const response = await POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }))
    expect(response.status).toBe(400); expect(mocks.evaluate).not.toHaveBeenCalled()
  })
  it('does not fabricate a run when the current report is missing', async () => {
    mocks.findFirst.mockResolvedValue(null)
    expect((await GET(new NextRequest(url))).status).toBe(404)
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('reports storage failure without exposing private payloads or editing the report', async () => {
    mocks.list.mockRejectedValue(new Error('private data'))
    const response = await GET(new NextRequest(`${url}?runId=run-explicit`))
    expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain('private data')
  })
})
