import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'

afterEach(() => vi.unstubAllGlobals())
describe('subscription worker dispatch', () => {
  it.each([404, 500])('rejects HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }))
    await expect(notifySubscriptionWorker()).rejects.toThrow(`HTTP ${status}`)
  })
  it('rejects network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    await expect(notifySubscriptionWorker()).rejects.toThrow('请检查数据服务后重试')
  })
  it('requires an explicit accepted response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }))
    await expect(notifySubscriptionWorker()).rejects.toThrow('后台未接受任务')
  })
  it('accepts successful dispatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }))
    await expect(notifySubscriptionWorker()).resolves.toBeUndefined()
  })
})
