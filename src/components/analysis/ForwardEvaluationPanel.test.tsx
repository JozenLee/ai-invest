import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ForwardEvaluationPanel } from './ForwardEvaluationPanel'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
const response = (value: unknown) => ({ ok: true, json: async () => value })
const payload = (reportId = 'r1', sufficient = true) => ({ reportId, status: 'captured', records: [{
  cohort: { id: 'c1', status: 'ready', gaps: [], recordedAt: '2026-09-11', original: 'PRIVATE-RAW-DO-NOT-RENDER' },
  latest: { evaluation: { status: sufficient ? 'paper-observed' : 'insufficient', reasons: sufficient ? [] : ['费用时效未知；样本不足'], results: ['no-trade', 'rules', 'ai'].map(arm => ({ arm, metrics: { netReturnPct: sufficient ? 1.25 : 0, maxDrawdownPct: 0, turnoverPct: 0 } })), comparisons: [{ arm: 'ai', against: 'no-trade', netReturnDifferencePp: .5, drawdownDifferencePp: -.2 }] } },
}] })
it('reads only the current report, projects public-facing fields and posts only on explicit click', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(payload())).mockResolvedValueOnce(response({ reportId: 'r1', checked: 1 })).mockResolvedValueOnce(response(payload()))
  vi.stubGlobal('fetch', fetcher)
  render(<ForwardEvaluationPanel reportId="r1"/>)
  await screen.findByText(/已有纸面观察/)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][0]).toBe('/api/portfolio/forward-evaluation?reportId=r1')
  expect(screen.queryByText(/PRIVATE-RAW/)).not.toBeInTheDocument()
  expect(screen.getAllByText('1.25%')).toHaveLength(3)
  expect(screen.getByText(/净收益差 0.50个百分点/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更新前向观察' }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"reportId":"r1"}' })
  expect(fetcher.mock.calls[2][0]).toBe('/api/portfolio/forward-evaluation?reportId=r1')
})
it('does not display zero returns or differences when sample or fee validation is insufficient', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload('r1', false))))
  render(<ForwardEvaluationPanel reportId="r1"/>)
  await screen.findByText('费用时效未知；样本不足')
  expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  expect(screen.queryByText(/净收益差/)).not.toBeInTheDocument()
  expect(screen.getAllByText('待有效观察')).toHaveLength(9)
})
it('aborts old-report fetches and never renders stale responses or posts a previous report', async () => {
  let resolveOld!: (value: unknown) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce(response({ reportId: 'r2', records: [], reason: '新报告无记录' })).mockResolvedValueOnce(response({ reportId: 'r2', checked: 0 })).mockResolvedValueOnce(response({ reportId: 'r2', records: [] }))
  vi.stubGlobal('fetch', fetcher)
  const { rerender } = render(<ForwardEvaluationPanel reportId="r1"/>)
  const oldSignal = fetcher.mock.calls[0][1].signal
  rerender(<ForwardEvaluationPanel reportId="r2"/>)
  await screen.findByText('新报告无记录')
  expect(oldSignal.aborted).toBe(true)
  await act(async () => resolveOld(response(payload('r1'))))
  expect(screen.queryByText(/已有纸面观察/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更新前向观察' }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4))
  expect(fetcher.mock.calls[2][1].body).toBe('{"reportId":"r2"}')
})
it('handles HTTP errors and rejects a mismatched report response', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce(response(payload('wrong'))).mockResolvedValueOnce(response({ reportId: 'r1', records: [] }))
  vi.stubGlobal('fetch', fetcher)
  render(<ForwardEvaluationPanel reportId="r1"/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500')
  fireEvent.click(screen.getByRole('button', { name: '重新读取观察' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('与当前报告不一致'))
  expect(screen.queryByText('1.25%')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新读取观察' }))
  await screen.findByText(/暂无可用前向记录/)
  expect(fetcher.mock.calls.every(call => call[1].method !== 'POST')).toBe(true)
})
it('protects stalled reads with timeout and resets update controls', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
    signal = init.signal
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })))
  render(<ForwardEvaluationPanel reportId="r1"/>)
  expect(screen.getByRole('button', { name: '更新前向观察' })).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('alert')).toHaveTextContent('请求超时')
  expect(screen.getByRole('button', { name: '更新前向观察' })).toBeEnabled()
})
it('reports a failed update while keeping previously read observations', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(payload())).mockRejectedValueOnce(new TypeError('fetch failed')))
  render(<ForwardEvaluationPanel reportId="r1"/>)
  await screen.findByText(/已有纸面观察/)
  fireEvent.click(screen.getByRole('button', { name: '更新前向观察' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('下方为上次读取结果')
  expect(screen.getAllByText('1.25%')).toHaveLength(3)
})

it('shows valid paper observations and legitimate zero returns alongside non-blocking limitations', async () => {
  const data = payload()
  const evaluation = data.records[0].latest.evaluation
  evaluation.reasons = ['仅单个冻结方案观察，不证明策略有效']
  evaluation.results[0].metrics.netReturnPct = 0
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<ForwardEvaluationPanel reportId="r1"/>)
  await screen.findByText('仅单个冻结方案观察，不证明策略有效')
  expect(screen.getAllByText('1.25%')).toHaveLength(2)
  expect(screen.getAllByText('0.00%')).toHaveLength(7)
  expect(screen.getByText(/净收益差 0.50个百分点/)).toBeInTheDocument()
})
it('hides fake zero metrics when status is insufficient even with no reasons', async () => {
  const data = payload('r1', false)
  data.records[0].latest.evaluation.reasons = []
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<ForwardEvaluationPanel reportId="r1"/>)
  await screen.findByText(/尚无满足条件的完整观察/)
  expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  expect(screen.queryByText(/净收益差/)).not.toBeInTheDocument()
  expect(screen.getAllByText('待有效观察')).toHaveLength(9)
})
it('hides all metrics for an incomplete arm and suppresses comparisons involving it', async () => {
  const data = payload()
  data.records[0].latest.evaluation.results[2].metrics.turnoverPct = NaN
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<ForwardEvaluationPanel reportId="r1"/>)
  await screen.findByText(/已有纸面观察/)
  expect(screen.getAllByText('1.25%')).toHaveLength(2)
  expect(screen.getAllByText('待有效观察')).toHaveLength(3)
  expect(screen.queryByText(/净收益差/)).not.toBeInTheDocument()
})
