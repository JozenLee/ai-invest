import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyAnalysisParent } from '../worker-ipc'

afterEach(() => vi.unstubAllGlobals())
describe('detached worker notifications', () => {
  it('does not send after the startup channel disconnects', async () => {
    const send = vi.fn()
    vi.stubGlobal('process', { connected: false, send })
    await notifyAnalysisParent({ error: 'original failure' })
    expect(send).not.toHaveBeenCalled()
  })
  it('handles a channel closing between the connection check and send', async () => {
    const send = vi.fn((_message: unknown, callback: (error: Error) => void) => {
      callback(new Error('Channel closed'))
      return false
    })
    vi.stubGlobal('process', { connected: true, send })
    await expect(notifyAnalysisParent({ ready: true })).resolves.toBeUndefined()
  })
})
