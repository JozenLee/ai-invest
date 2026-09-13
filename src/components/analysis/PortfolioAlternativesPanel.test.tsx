import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PortfolioAlternatives, Alternative } from '@/lib/portfolio/alternatives'
import type { PortfolioDecisionSupport } from '@/lib/portfolio/decision-support'
import { PortfolioAlternativesPanel, PortfolioProductResearchPanel } from './PortfolioAlternativesPanel'
import { PortfolioDecisionPanel } from './PortfolioDecisionPanel'
vi.mock('./AnalysisResultView', () => ({ AnalysisResultView: () => null }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
const alternative = (id: string, source: Alternative['source']): Alternative => ({
  id, title: id === 'hold' ? '保持现有持仓' : id === 'rules' ? '技术规则方案' : '降低集中风险', source, horizonDays: 20,
  trades: source === 'hold' ? [] : [{ ticker: '017470', currentWeightPct: 20, targetWeightPct: 15, changeWeightPct: -5, amount: 5432.1, estimatedUnits: 100, estimatedFee: null, executionGaps: ['申赎窗口待核验'], settlementDays: null }], targetWeights: [],
  grossCashWeightPct: 15, netCashWeightPct: null, immediatelyAvailableCashWeightPct: 10, totalFee: null, turnoverPct: 5, feeBreakEvenPct: null,
  hardViolations: [], researchIssues: [], executionGaps: [], stress: [{ id: 'down', label: '需求下降情景', coveredWeightPct: 20, accountReturnRangePct: null, improvementVsHoldPct: null, basis: '订单承压条件假设' }],
  risk: { commonObservations: 0, coveragePct: 0, annualizedVolatilityPct: null, basis: '缺少同期复权净值' },
  ...(source === 'research' ? { proposal: { id, title: '降低集中风险', horizonDays: 20, objective: 'risk-reduction' as const, targets: [], thesisIds: ['h1'], evidenceIds: ['e1'], whyNow: '风险补偿下降', whyNotHold: '现有组合集中度偏高', sizingRationale: '压力损失预算约束', invalidation: '盈利预期上修', nextReview: '2026-10-01', opportunityCost: '减少上涨参与度' } } : {}),
})
const data = (): PortfolioAlternatives => ({ version: 1, asOf: '2026-09-11', selectedId: 'ai', requestedId: 'ai', selectionReason: '较不交易减少集中风险', alternatives: [alternative('hold', 'hold'), alternative('rules', 'rules'), alternative('ai', 'research')], reviewIssues: [], evidenceBoundary: '披露持仓非实时', status: 'research-selected' })
const action = (verified: boolean) => ({ ticker: '017470', name: '芯片联接', amount: 5432.1, mapping: { verified } }) as PortfolioDecisionSupport['actions'][number]
it('distinguishes hold, rules and research without suggesting execution; explains unknown costs and scenarios', () => {
  render(<PortfolioAlternativesPanel data={data()} executionReady={false}/> )
  expect(screen.getByText(/不交易基线 ·/)).toBeInTheDocument()
  expect(screen.getByText(/规则对照 ·/)).toBeInTheDocument()
  expect(screen.getByText(/研究备选 ·/)).toBeInTheDocument()
  expect(screen.getAllByText('费用未知')).toHaveLength(2)
  expect(screen.getByText('无交易')).toBeInTheDocument()
  expect(screen.getAllByText(/覆盖或费用不足，暂不可计算/)).toHaveLength(6)
  expect(screen.getByText(/场外需核验申赎窗口/)).toBeInTheDocument()
  expect(screen.queryByText(/下一.*交易时段/)).not.toBeInTheDocument()
  expect(screen.getByText('现有组合集中度偏高')).toBeInTheDocument()
  expect(screen.getByText('压力损失预算约束')).toBeInTheDocument()
  expect(screen.getByText('盈利预期上修')).toBeInTheDocument()
  expect(screen.getByText('减少上涨参与度')).toBeInTheDocument()
})
it('shows money only for selected verified research, never for rule comparison', () => {
  render(<PortfolioAlternativesPanel data={data()} actions={[action(true)]}/> )
  expect(screen.getAllByText(/5,432.10/)).toHaveLength(1)
})
it('hides money for unmapped or rejected research', () => {
  const d = data()
  const { rerender } = render(<PortfolioAlternativesPanel data={d} actions={[action(false)]}/> )
  expect(screen.queryByText(/5,432.10/)).not.toBeInTheDocument()
  d.alternatives[2].researchIssues = ['缺少产品级研究']
  rerender(<PortfolioAlternativesPanel data={d} actions={[action(true)]}/> )
  expect(screen.queryByText(/5,432.10/)).not.toBeInTheDocument()
})
it('handles empty alternatives and unknown product artifacts', () => {
  render(<><PortfolioAlternativesPanel data={{ ...data(), alternatives: [] }}/><PortfolioProductResearchPanel value={{ unexpected: [] }}/></>)
  expect(screen.getByText(/尚未保存可比较方案/)).toBeInTheDocument()
  expect(screen.getByText(/本轮未保存产品研究资料/)).toBeInTheDocument()
})
it('shows active product research without demanding an ETF mapping', () => {
  render(<PortfolioProductResearchPanel value={{ products: [{ ticker: '026633', name: '主动混合', productType: 'active', classification: 'official', coverage: { mappingRequired: false, nav: true }, exposure: { reportDate: null, knownWeightPct: null }, gaps: [{ detail: '披露持仓缺失' }] }] }}/> )
  expect(screen.getByText(/不强制套用目标指数基金/)).toBeInTheDocument()
  expect(screen.getByText('披露持仓缺失')).toBeInTheDocument()
  expect(screen.queryByText(/正式目标指数基金：/)).not.toBeInTheDocument()
})
it('V3 missing alternatives does not fall back to rule-driven amounts or claims', () => {
  render(<PortfolioDecisionPanel support={{ allocationVersion: 3, confidencePct: 80, summary: '研究仍待补齐', actions: [action(true)] } as PortfolioDecisionSupport} executionReady={false}/> )
  expect(screen.getByText(/未保存组合备选方案/)).toBeInTheDocument()
  expect(screen.queryByText(/5,432/)).not.toBeInTheDocument()
  expect(screen.queryByText(/规则数字不被覆盖/)).not.toBeInTheDocument()
  expect(screen.getByText(/不代表收益概率或投资胜率/)).toBeInTheDocument()
})
it('keeps legacy reports readable without new artifacts', () => {
  const legacy = {
    version: 1, allocationVersion: 2, industry: 'AI硬件', readiness: 'limited-advice', signal: 'watch', summary: '历史报告',
    confidencePct: 50, cashWeightPct: 10, cashTargetFloorPct: 10, proposedCashWeightPct: 10,
    currentIndustryWeightPct: 15, proposedIndustryWeightPct: 15, targetIndustryRangePct: [0, 20],
    mappingCoveragePct: 0, verifiedMappingCoveragePct: 0, costCoveragePct: 0, actions: [], gates: [],
    adjustmentPlan: { completed: true, remainingCashGapPct: 0, remainingIndustryReductionPct: 0, steps: [] },
  } as unknown as PortfolioDecisionSupport
  render(<PortfolioDecisionPanel support={legacy}/> )
  expect(screen.getByText('历史报告')).toBeInTheDocument()
  expect(screen.getByText(/旧版报告未保存分阶段路径/)).toBeInTheDocument()
})

it('refreshes only on click and reports each fund without replacing frozen research', async () => {
  let resolve!: (value: unknown) => void
  const fetcher = vi.fn(() => new Promise(r => { resolve = r }))
  vi.stubGlobal('fetch', fetcher)
  render(<PortfolioProductResearchPanel value={{ products: [{ ticker: '017470', name: '冻结产品名称' }] }}/>)
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '刷新基金资料' }))
  expect(screen.getByRole('button', { name: '正在刷新基金资料…' })).toBeDisabled()
  expect(fetcher).toHaveBeenCalledWith('/api/portfolio/product-research', expect.objectContaining({ method: 'POST', body: '{}', signal: expect.any(AbortSignal) }))
  await act(async () => resolve({ ok: true, json: async () => ({ results: [
    { ticker: '017470', status: 'refreshed', gaps: [] },
    { ticker: '024975', status: 'partial', gaps: ['复权净值缺失'] },
    { ticker: '026633', status: 'failed', gaps: ['公开采集失败'] },
  ] }) }))
  expect(screen.getByText((_text, element) => element?.tagName === 'P' && element.textContent === '017470 · 资料已刷新')).toBeInTheDocument()
  expect(screen.getByText((_text, element) => element?.tagName === 'P' && element.textContent === '024975 · 部分刷新')).toBeInTheDocument()
  expect(screen.getByText((_text, element) => element?.tagName === 'P' && element.textContent === '026633 · 刷新失败')).toBeInTheDocument()
  expect(screen.getByText('复权净值缺失')).toBeInTheDocument()
  expect(screen.getByText(/冻结产品名称/)).toBeInTheDocument()
  expect(screen.getByText(/新建分析后才会更新报告快照/)).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('recovers from HTTP failure, malformed data and network failure', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ ticker: '017470', status: 'bogus', gaps: [] }] }) })
    .mockRejectedValueOnce(new TypeError('fetch failed'))
  vi.stubGlobal('fetch', fetcher)
  render(<PortfolioProductResearchPanel value={null}/>)
  fireEvent.click(screen.getByRole('button', { name: '刷新基金资料' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('状态码 503')
  fireEvent.click(screen.getByRole('button', { name: '刷新基金资料' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('响应格式异常'))
  fireEvent.click(screen.getByRole('button', { name: '刷新基金资料' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('网络或响应异常'))
  expect(screen.getByRole('button', { name: '刷新基金资料' })).toBeEnabled()
})
it('aborts a stalled request at timeout and allows manual retry', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
    signal = init.signal
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })))
  render(<PortfolioProductResearchPanel value={null}/>)
  fireEvent.click(screen.getByRole('button', { name: '刷新基金资料' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(305000) })
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('alert')).toHaveTextContent('服务端可能仍在采集')
  expect(screen.getByRole('button', { name: '刷新基金资料' })).toBeEnabled()
})
it('aborts the in-flight refresh on unmount', async () => {
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
    signal = init.signal
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })))
  const { unmount } = render(<PortfolioProductResearchPanel value={null}/>)
  fireEvent.click(screen.getByRole('button', { name: '刷新基金资料' }))
  await act(async () => unmount())
  expect(signal.aborted).toBe(true)
})

it('shows gross improvement and conditional cost threshold while unknown fees keep net improvement unknown', () => {
  const d = data()
  d.alternatives = [alternative('ai', 'research')]
  d.alternatives[0].stress[0].grossImprovementVsHoldPct = [0.35, 0.8]
  d.alternatives[0].stress[0].maximumCostRateForImprovementPct = 3.5
  render(<PortfolioAlternativesPanel data={d}/>)
  expect(screen.getByText('未扣费毛改善：0.35 ～ 0.80个百分点')).toBeInTheDocument()
  expect(screen.getByText('综合费用临界率：3.50%（按买卖双边交易总额）')).toBeInTheDocument()
  expect(screen.getAllByText('覆盖或费用不足，暂不可计算')).toHaveLength(2)
  expect(screen.getByText(/临界率不是实际费率、概率或收益保证/)).toBeInTheDocument()
  expect(screen.getByText(/低于正的费用临界率/)).toBeInTheDocument()
  expect(screen.getByText('费用未知')).toBeInTheDocument()
  expect(screen.queryByText('0.00个百分点')).not.toBeInTheDocument()
})
it('preserves old and null stress fields without inventing gross improvement or cost thresholds', () => {
  const d = data()
  d.alternatives = [alternative('hold', 'hold'), alternative('ai', 'research')]
  d.alternatives[1].stress[0].grossImprovementVsHoldPct = null
  d.alternatives[1].stress[0].maximumCostRateForImprovementPct = null
  render(<PortfolioAlternativesPanel data={d}/>)
  expect(screen.queryByText(/未扣费毛改善：/)).not.toBeInTheDocument()
  expect(screen.queryByText(/综合费用临界率：/)).not.toBeInTheDocument()
  expect(screen.getAllByText('覆盖或费用不足，暂不可计算')).toHaveLength(4)
})
it('shows verified unselected research calculations without changing the chosen hold plan', () => {
  const d = data()
  d.selectedId = 'hold'
  d.status = 'hold-pending-evidence'
  const verified = { ...action(true), amount: null }
  const { rerender } = render(<PortfolioAlternativesPanel data={d} actions={[verified]}/> )
  expect(screen.getByText('未采用方案测算，不是当前操作建议')).toBeInTheDocument()
  expect(screen.getAllByText(/5,432.10/)).toHaveLength(1)
  expect(screen.getByText(/预计份额 100.00/)).toBeInTheDocument()
  expect(screen.getByText(/不交易基线 · 本轮选中/)).toBeInTheDocument()
  expect(screen.getByText(/研究备选 · 比较方案/)).toBeInTheDocument()
  rerender(<PortfolioAlternativesPanel data={d} actions={[action(false)]}/> )
  expect(screen.queryByText(/5,432.10/)).not.toBeInTheDocument()
  expect(screen.queryByText('未采用方案测算，不是当前操作建议')).not.toBeInTheDocument()
  d.alternatives[2].hardViolations = ['违反账户约束']
  rerender(<PortfolioAlternativesPanel data={d} actions={[verified]}/> )
  expect(screen.queryByText(/5,432.10/)).not.toBeInTheDocument()
  d.alternatives[2].hardViolations = []
  d.alternatives[2].researchIssues = ['产品研究不足']
  rerender(<PortfolioAlternativesPanel data={d} actions={[verified]}/> )
  expect(screen.queryByText(/5,432.10/)).not.toBeInTheDocument()
})
it('shows selection reason once and labels product coverage accurately in V3', () => {
  const d = data()
  render(<PortfolioDecisionPanel support={{ allocationVersion: 3, confidencePct: 100, confidenceMeaning: '产品研究覆盖率，不是投资胜率或收益置信度', summary: `当前报告仅供参考。当前报告仅供参考。${d.selectionReason}`, alternatives: d, actions: [] } as unknown as PortfolioDecisionSupport}/> )
  expect(screen.getAllByText(new RegExp(d.selectionReason))).toHaveLength(1)
  expect(screen.queryByText(/100.0%/)).not.toBeInTheDocument()
  expect(screen.getByText(/资料覆盖详见下方基金资料/)).toBeInTheDocument()
  expect(screen.queryByText(/数据与研究置信度/)).not.toBeInTheDocument()
  expect(screen.queryByText(/当前报告仅供参考/)).not.toBeInTheDocument()
})

it('reads newly collected evidence without changing the report snapshot', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ research: { products: [{ ticker: '017470', name: '最新资料', coverage: { nav: true, adjustedNav: true }, navSeries: [{ date: '2026-09-10', nav: 2.699 }] }] } }) }))
  render(<PortfolioProductResearchPanel value={{ products: [{ ticker: '017470', name: '报告原始资料', coverage: { nav: true, adjustedNav: false } }] }}/>)
  fireEvent.click(screen.getByRole('button', { name: '查看最新已入库资料' }))
  expect(await screen.findByText(/最新资料 ·/)).toBeInTheDocument()
  expect(screen.getByText('2.6990')).toBeInTheDocument()
  expect(screen.getByText(/上方方案仍使用生成报告时的资料/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '返回报告原始资料' }))
  expect(screen.getByText(/报告原始资料 ·/)).toBeInTheDocument()
  expect(screen.queryByText('2.6990')).not.toBeInTheDocument()
})

it('renders saved model identifiers as Chinese names without modifying saved data', () => {
  const d = data()
  d.selectionReason = 'hold对照ai，down情景下继续核验。'
  render(<PortfolioAlternativesPanel data={d}/>)
  expect(screen.getByText(/保持现有持仓对照降低集中风险，需求下降情景下继续核验/)).toBeInTheDocument()
  expect(d.selectionReason).toBe('hold对照ai，down情景下继续核验。')
})
