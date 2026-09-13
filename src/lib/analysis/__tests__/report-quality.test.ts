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

it('caps action readiness when a trading-session snapshot lacks quote and event checks',async()=>{
  const { assessDecisionTiming }=await import('../decision-timing')
  const snapshot=fixture()
  const timing=assessDecisionTiming({asOf:'2026-09-04T06:30:00Z',calendar:snapshot.calendar,expectedTickers:['159995'],quotes:[]})
  const quality=buildReportQuality({evaluation:evaluateResearch(snapshot),dataQuality:{status:'available'},decisionTiming:timing})
  expect(timing.executionReady).toBe(false)
  expect(quality.overallScore).toBeLessThanOrEqual(69)
  expect(quality.usability).toBe('limited-advice')
})

it('does not count a previous-session valuation as current evidence',()=>{
  const evaluation=evaluateResearch(fixture())
  evaluation.products![0].valuationDate='2026-09-03'
  const quality=buildReportQuality({evaluation,dataQuality:{status:'available'}})
  expect(quality.dimensions.find(item=>item.key==='valuation')?.score).toBe(0)
  evaluation.products![0].valuationDate=evaluation.expectedSession
  expect(buildReportQuality({evaluation,dataQuality:{status:'available'}}).dimensions.find(item=>item.key==='valuation')?.score).toBe(100)
})

it('does not let individually known fields hide seven broken technical chains',()=>{
 const evaluation=evaluateResearch(fixture())
 evaluation.decisions=Array.from({length:8},(_,i)=>({...structuredClone(evaluation.decisions[0]),ticker:String(i)}))
 evaluation.decisions.slice(1).forEach(d=>{d.state='blocked';d.conditions.find(c=>c.key==='adjustment')!.status='unknown'})
 const quality=buildReportQuality({evaluation,dataQuality:{status:'limited'}})
 expect(quality.technicalCoverage).toMatchObject({usable:1,total:8})
 expect(quality.dimensions.find(d=>d.key==='market')?.score).toBe(13)
 expect(quality.usability).toBe('insufficient')
})
it('does not label a complete dataset as a complete AI report when a model module fell back',()=>{
 const quality=buildReportQuality({evaluation:evaluateResearch(fixture()),dataQuality:{status:'available'},analysisStatuses:{market:{status:'fallback'}}})
 expect(quality.usability).toBe('limited-advice')
 expect(quality.overallScore).toBeLessThanOrEqual(69)
 expect(quality.blockers.join('')).toContain('市场智能分析已降级')
})

it('caps report quality for unresolved output citations but not completed corrections',()=>{
 const evaluation=evaluateResearch(fixture())
 const input={evaluation,dataQuality:{status:'available'},preflight:{status:'fresh',failed:0}}
 const corrected=buildReportQuality({...input,outputValidations:{market:{status:'corrected',issues:[]}}})
 expect(corrected.usability).toBe('advice-grade')
 const invalid=buildReportQuality({...input,outputValidations:{market:{status:'limited',issues:['引用来源不匹配']}}})
 expect(invalid.overallScore).toBeLessThanOrEqual(69)
 expect(invalid.dimensions.find(row=>row.key==='evidence')?.score).toBeLessThanOrEqual(69)
 expect(invalid.blockers).toContain('market：引用来源不匹配')
 expect(invalid.usability).toBe('limited-advice')
 const portfolio=buildReportQuality({...input,analysisStatuses:{portfolio:{status:'fallback'}}})
 expect(portfolio.blockers.join('')).toContain('持仓智能分析已降级')
})
