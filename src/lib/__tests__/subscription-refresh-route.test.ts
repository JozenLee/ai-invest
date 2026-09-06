import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), create: vi.fn(), datasetUpdate: vi.fn(), runUpdate: vi.fn(), transaction: vi.fn(), notify: vi.fn(), overview: vi.fn(), syncGraph: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ prisma: {
  dataSubscription: { findMany: mocks.findMany },
  dataFetchRun: { findMany: vi.fn().mockResolvedValue([]), create: mocks.create, updateMany: mocks.runUpdate },
  subscriptionDataset: { updateMany: mocks.datasetUpdate },
  $transaction: mocks.transaction,
} }))
vi.mock('@/lib/subscription-dispatch', () => ({ notifySubscriptionWorker: mocks.notify }))
vi.mock('@/lib/data-subscription-overview', () => ({ getSubscriptionOverview: mocks.overview, syncGraphEtfSubscriptions: mocks.syncGraph }))
import { POST } from '@/app/api/data-subscriptions/refresh/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([{ instrument: { code: '159995' }, datasets: [
    { id: 'daily', datasetKey: 'constituent_stock_daily', enabled: true, status: 'failed' },
    { id: 'etf', datasetKey: 'etf_daily', enabled: true, status: 'success' },
    { id: 'active', datasetKey: 'stock_financial', enabled: true, status: 'running' },
  ] }])
  mocks.create.mockResolvedValue({ id: 'run' })
  mocks.datasetUpdate.mockImplementation(({ where }) => Promise.resolve({ count: where.id === 'active' ? 0 : 1 }))
  mocks.runUpdate.mockResolvedValue({ count: 1 })
  mocks.transaction.mockImplementation((operations) => typeof operations === 'function' ? operations({
    subscriptionDataset: { updateMany: mocks.datasetUpdate },
    dataFetchRun: { create: mocks.create, findMany: vi.fn().mockResolvedValue([{ id: 'run', datasetId: 'daily' }]), updateMany: mocks.runUpdate },
  }) : Promise.all(operations))
  mocks.notify.mockResolvedValue(undefined)
  mocks.overview.mockResolvedValue({ companies: [] })
})

describe('company refresh route', () => {
  it('queues only company datasets that are not already active', async () => {
    const response = await POST(new Request('http://localhost/api/data-subscriptions/refresh', { method: 'POST', body: JSON.stringify({ scope: 'company_quote' }) }))
    expect(response.status).toBe(202)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0][0].data.datasetId).toBe('daily')
    expect((await response.json()).data.runIds).toEqual(['run'])
    expect(mocks.notify).toHaveBeenCalledOnce()
  })
  it('reports dispatch failure and only rolls back still-queued tasks', async () => {
    mocks.notify.mockRejectedValue(new Error('后台不可用'))
    const response = await POST(new Request('http://localhost/api/data-subscriptions/refresh', { method: 'POST', body: JSON.stringify({ scope: 'company_quote' }) }))
    expect(response.status).toBe(503)
    expect((await response.json()).success).toBe(false)
    expect(mocks.runUpdate.mock.calls[0][0].where).toEqual({ id: { in: ['run'] }, status: 'queued' })
    const rollback = mocks.datasetUpdate.mock.calls.find(([argument]) => argument.where.status === 'queued')
    expect(rollback?.[0].where).toEqual({ id: { in: ['daily'] }, status: 'queued' })
  })
})
