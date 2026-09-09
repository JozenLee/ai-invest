import { describe, expect, it } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { buildReportQuality, buildReportReviewDelta } from '../report-quality'

describe('report quality and review lineage', () => {
  it('scores only current report evidence and excludes replay history', () => {
    const evaluation = evaluateResearch(fixture())
    const quality = buildReportQuality({
      evaluation,
      dataQuality: { status: 'available' },
      preflight: { status: 'fresh', failed: 0 },
    })
    expect(quality.dimensions).toHaveLength(5)
    expect(quality.dimensions.map(item=>item.key)).not.toContain('replay')
    expect(quality.confidenceScore).toBeGreaterThan(69)
    expect(quality.usability).toBe('advice-grade')
    expect(quality.blockers).not.toContain('样本外验证尚未通过')
  })
  it('does not call an intentionally skipped verification refresh a failed sync',()=>{
    const evaluation=evaluateResearch(fixture())
    const quality=buildReportQuality({evaluation,dataQuality:{status:'limited'},preflight:{status:'warning',queued:0,completed:0,failed:0,warnings:['本轮未触发外部同步，使用当前本地订阅快照']}})
    expect(quality.blockers).not.toContain('分析前同步未完全成功')
  })
  it('penalizes duplicate evidence and a degraded event synthesis',()=>{
    const evaluation=evaluateResearch(fixture())
    evaluation.evidence=[...evaluation.evidence,{...evaluation.evidence[0],id:'duplicate'}]
    const normal=buildReportQuality({evaluation,dataQuality:{status:'available'}})
    const degraded=buildReportQuality({evaluation,dataQuality:{status:'available'},analysisStatuses:{event:{status:'fallback'}}})
    expect(degraded.dimensions.find(item=>item.key==='evidence')!.score).toBeLessThan(normal.dimensions.find(item=>item.key==='evidence')!.score)
    expect(degraded.blockers.join('')).toContain('事件智能分析已降级')
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

it('counts omitted missing fields in the quality denominator',()=>{
  const snapshot=fixture()
  snapshot.etfs[0].product.spreadBps=null
  const evaluation=evaluateResearch(snapshot)
  expect(evaluation.omittedConditions?.some(item=>item.key==='spread')).toBe(true)
  const quality=buildReportQuality({evaluation,dataQuality:{status:'available'}})
  expect(quality.dimensions.find(item=>item.key==='product')?.score).toBe(75)
  expect(quality.blockers.some(item=>item.includes('仍计入质量覆盖率'))).toBe(true)
})

it('does not downgrade execution meaning after a trading-session snapshot is frozen',async()=>{
  const { assessDecisionTiming }=await import('../decision-timing')
  const snapshot=fixture()
  const timing=assessDecisionTiming({asOf:'2026-09-04T06:30:00Z',calendar:snapshot.calendar,expectedTickers:['159995'],quotes:[]})
  const quality=buildReportQuality({evaluation:evaluateResearch(snapshot),dataQuality:{status:'available'},decisionTiming:timing})
  expect(timing.executionReady).toBe(true)
  expect(quality.overallScore).toBeGreaterThanOrEqual(70)
  expect(quality.usability).toBe('advice-grade')
})

it('does not count a previous-session valuation as current evidence',()=>{
  const evaluation=evaluateResearch(fixture())
  evaluation.products![0].valuationDate='2026-09-03'
  const quality=buildReportQuality({evaluation,dataQuality:{status:'available'}})
  expect(quality.dimensions.find(item=>item.key==='valuation')?.score).toBe(0)
  evaluation.products![0].valuationDate=evaluation.expectedSession
  expect(buildReportQuality({evaluation,dataQuality:{status:'available'}}).dimensions.find(item=>item.key==='valuation')?.score).toBe(100)
})
