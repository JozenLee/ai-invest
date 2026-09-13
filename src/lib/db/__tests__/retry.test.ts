import { describe, expect, it, vi } from 'vitest'
import { withDatabaseBusyRetry } from '../retry'
describe('idempotent SQLite writes', () => {
  it('retries transient contention with the exact same frozen payload', async () => {
    const payload = { snapshotId: 'frozen', asOf: '2026-09-10' }
    const write = vi.fn().mockRejectedValueOnce(new Error('database is locked')).mockResolvedValue(payload)
    const pause = vi.fn(async () => undefined)
    expect(await withDatabaseBusyRetry(() => write(payload), { pause })).toBe(payload)
    expect(write.mock.calls).toEqual([[payload], [payload]])
    expect(pause).toHaveBeenCalledOnce()
  })
  it('does not retry arbitrary errors or retry contention without a bound', async () => {
    const pause = vi.fn(async () => undefined)
    const invalid = vi.fn().mockRejectedValue(new Error('invalid immutable snapshot'))
    await expect(withDatabaseBusyRetry(invalid, { pause })).rejects.toThrow('immutable')
    expect(invalid).toHaveBeenCalledOnce()
    const busy = vi.fn().mockRejectedValue({ meta: { driverAdapterError: { cause: { originalMessage: 'database is locked' } } } })
    await expect(withDatabaseBusyRetry(busy, { attempts: 3, pause })).rejects.toBeDefined()
    expect(busy).toHaveBeenCalledTimes(3)
  })
})
