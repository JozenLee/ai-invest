import { describe, expect, it, vi } from 'vitest'
import { companySyncState, completedRunError, waitForSubscriptionRuns } from '@/lib/subscription-sync-status'

const dataset = (status: string, extras = {}) => ({ datasetKey: 'constituent_stock_daily', enabled: true, status, ...extras })

describe('company sync status', () => {
  it('ignores disabled and unrelated dataset categories', () => {
    expect(companySyncState('000001', [dataset('success'), dataset('failed', { enabled: false }), dataset('failed', { datasetKey: 'etf_holdings' })]).status).toBe('success')
  })
  it('does not treat pending as success', () => {
    expect(companySyncState('000001', [dataset('pending')]).status).toBe('pending')
    expect(companySyncState('000001', []).status).toBe('pending')
  })
  it('isolates companies in a partial batch', () => {
    const lastError = JSON.stringify({ message: '000002 timeout', failedCodes: ['000002'], succeededCodes: ['000001'] })
    expect(companySyncState('000001', [dataset('partial', { lastError })]).status).toBe('success')
    expect(companySyncState('000002', [dataset('partial', { lastError })])).toMatchObject({ status: 'failed', lastError: '000002 timeout' })
  })
  it('shows partial failure when other datasets succeeded', () => {
    expect(companySyncState('000001', [dataset('failed', { lastError: 'daily failed' }), dataset('success', { datasetKey: 'stock_financial' })]).status).toBe('partial')
  })
  it('normalizes stock codes in partial batch outcomes', () => {
    const lastError = JSON.stringify({ message: '港股数据未返回', failedCodes: ['00700.hk'], succeededCodes: ['000001.SZ'] })
    expect(companySyncState('700.hk', [dataset('partial', { lastError })]).status).toBe('failed')
    expect(companySyncState('000001', [dataset('partial', { lastError })]).status).toBe('success')
  })
  it('waits for active tasks and recognizes partial terminal status', () => {
    expect(completedRunError([{ status: 'running' }], 1)).toBeNull()
    expect(completedRunError([{ status: 'success' }], 2)).toBeNull()
    expect(completedRunError([{ status: 'partial' }], 1)).toContain('未完整同步')
    expect(completedRunError([{ status: 'failed' }], 1)).toContain('数据获取失败')
  })
  it('reports polling timeout instead of silently completing', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [{ status: 'running' }] }) })
    await expect(waitForSubscriptionRuns(['run'], fetcher, async () => {}, 2)).rejects.toThrow('仍在后台继续')
  })
  it('does not swallow status API failures', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: '服务不可用' }) })
    await expect(waitForSubscriptionRuns(['run'], fetcher)).rejects.toThrow('服务不可用')
  })
})
