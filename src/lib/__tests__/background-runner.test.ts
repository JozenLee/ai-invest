import { beforeEach, describe, expect, it, vi } from 'vitest'
const fakes = vi.hoisted(() => ({ mkdir: vi.fn(), readFile: vi.fn(), unlink: vi.fn(), spawn: vi.fn() }))
vi.mock('node:fs/promises', () => ({ default: { mkdir: fakes.mkdir, readFile: fakes.readFile, unlink: fakes.unlink }, mkdir: fakes.mkdir, readFile: fakes.readFile, unlink: fakes.unlink }))
vi.mock('node:child_process', () => ({ default: { spawn: fakes.spawn }, spawn: fakes.spawn }))
import { dispatchAnalysis } from '../workflow/background-runner'
describe('background analysis dispatch', () => {
  beforeEach(() => { vi.resetAllMocks() })
  it('rejects paths and unknown modes before starting a process', async () => {
    await expect(dispatchAnalysis('../other', 'all')).rejects.toThrow('无效')
    await expect(dispatchAnalysis('valid-run', 'unknown')).rejects.toThrow('无效')
    expect(fakes.spawn).not.toHaveBeenCalled()
  })
  it('does not duplicate a live worker', async () => {
    fakes.readFile.mockResolvedValue(String(process.pid))
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    expect(await dispatchAnalysis('valid-run', 'all')).toEqual({ alreadyRunning: true })
    expect(kill).toHaveBeenCalledWith(process.pid, 0)
    expect(fakes.spawn).not.toHaveBeenCalled()
    kill.mockRestore()
  })
})
