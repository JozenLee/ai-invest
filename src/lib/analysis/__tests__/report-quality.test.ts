import { describe, expect, it } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { buildReportQuality, buildReportReviewDelta } from '../report-quality'

describe('report quality and review lineage', () => {
  it('keeps replay history informational instead of blocking current advice', () => {
    const evaluation = evaluateResearch(fixture())
    const quality = buildReportQuality({
      evaluation,
      dataQuality: { status: 'available' },
      preflight: { status: 'fresh', failed: 0 },
      validation: { tradeApproved: false, sessionCount: 1, spanDays: 0, totalTrades: 0, meanExcessReturnPct: null, maxDrawdownPct: null },
    })
    expect(quality.dimensions).toHaveLength(6)
    expect(quality.confidenceScore).toBeGreaterThan(69)
    expect(quality.usability).toBe('advice-grade')
    expect(quality.blockers).not.toContain('样本外验证尚未通过')
  })

  it('reports numeric condition changes even when the state is unchanged', () => {
    const previous = evaluateResearch(fixture())
    const current = structuredClone(previous)
    current.snapshotId = 'next'
    const condition = current.decisions[0].conditions.find(item => item.key === 'flow')!
    condition.value = Number(condition.value || 0) - 1
    const delta = buildReportReviewDelta({ current, previous, parentRunId: 'parent', baselineReportId: 'report' })
    expect(delta.status).toBe('changed')
    expect(delta.changedDecisions[0].conditions).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'flow' })]))
  })

  it('marks an identical review as unchanged', () => {
    const evaluation = evaluateResearch(fixture())
    const delta = buildReportReviewDelta({ current: structuredClone(evaluation), previous: evaluation })
    expect(delta.status).toBe('unchanged')
    expect(delta.changedDecisions).toEqual([])
  })
})
