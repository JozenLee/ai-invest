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

  it('downgrades when every ETF is product-limited even if aggregate coverage is available',()=>{
    const evaluation=evaluateResearch(fixture())
    const quality=buildReportQuality({evaluation,dataQuality:{status:'available',perEtf:[{status:'limited'}]},preflight:{status:'fresh',failed:0}})
    expect(quality).toMatchObject({usability:'limited-advice',grade:'B',overallScore:79})
    expect(quality.executionReadinessScore).toBeLessThan(60)
    expect(quality.blockers.join('')).toContain('全部ETF均存在产品级数据缺口')
  })

  it('separates evidence confidence from unvalidated decision confidence',()=>{
    const evaluation=evaluateResearch(fixture())
    const quality=buildReportQuality({evaluation,dataQuality:{status:'available'},strategyValidation:{validation:'insufficient-history',trades:0,observations:6}})
    expect(quality.evidenceConfidenceScore).toBeGreaterThan(quality.decisionConfidenceScore)
    expect(quality.validationStatus).toBe('insufficient-history')
  })

  it('downgrades repaired AI outputs instead of silently retaining advice grade',()=>{
    const evaluation=evaluateResearch(fixture())
    const quality=buildReportQuality({evaluation,dataQuality:{status:'available'},outputValidations:{market:{status:'limited',issues:['引用修复']}}})
    expect(quality.usability).toBe('limited-advice')
    expect(quality.blockers.join('')).toContain('输出经过引用、日期或结构修复')
  })

  it('downgrades a report when frozen data did not actually reach an AI module',()=>{
    const evaluation=evaluateResearch(fixture())
    const quality=buildReportQuality({evaluation,dataQuality:{status:'available'},inputCoverage:{market:{passed:false,coveragePct:0,issues:['ETF代表样本不足']}}})
    expect(quality.usability).toBe('limited-advice')
    expect(quality.blockers.join('')).toContain('实际进入模型的证据覆盖不足')
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

it('marks a trading-session snapshot without fresh quotes as reference-only without hiding its research quality',async()=>{
  const { assessDecisionTiming }=await import('../decision-timing')
  const snapshot=fixture()
  const timing=assessDecisionTiming({asOf:'2026-09-04T06:30:00Z',calendar:snapshot.calendar,expectedTickers:['159995'],quotes:[]})
  const quality=buildReportQuality({evaluation:evaluateResearch(snapshot),dataQuality:{status:'available'},decisionTiming:timing})
  expect(timing).toMatchObject({executionReady:false,status:'reference-only',label:'仅供投资参考'})
  expect(quality.overallScore).toBeGreaterThanOrEqual(70)
  expect(quality.usability).toBe('limited-advice')
  expect(quality.executionReadinessScore).toBe(0)
})

it('preserves research quality while gating stale trading evidence',async()=>{
  const { assessDecisionTiming }=await import('../decision-timing')
  const snapshot=fixture()
  const trading=assessDecisionTiming({asOf:'2026-09-04T06:30:00Z',calendar:snapshot.calendar,expectedTickers:['159995'],quotes:[]})
  const closed=assessDecisionTiming({asOf:'2026-09-05T06:30:00Z',calendar:snapshot.calendar,expectedTickers:['159995'],quotes:[]})
  const evaluation=evaluateResearch(snapshot)
  const tradingQuality=buildReportQuality({evaluation,dataQuality:{status:'available'},decisionTiming:trading})
  const closedQuality=buildReportQuality({evaluation,dataQuality:{status:'available'},decisionTiming:closed})
  expect(closed.label).toBe('非交易时段 · 最新收盘数据')
  expect(closedQuality.overallScore).toBe(tradingQuality.overallScore)
  expect(tradingQuality.usability).toBe('limited-advice')
  expect(closedQuality.usability).toBe('advice-grade')
})

it('does not count a previous-session valuation as current evidence',()=>{
  const evaluation=evaluateResearch(fixture())
  evaluation.products![0].valuationDate='2026-09-03'
  const quality=buildReportQuality({evaluation,dataQuality:{status:'available'}})
  expect(quality.dimensions.find(item=>item.key==='valuation')?.score).toBe(0)
  evaluation.products![0].valuationDate=evaluation.expectedSession
  expect(buildReportQuality({evaluation,dataQuality:{status:'available'}}).dimensions.find(item=>item.key==='valuation')?.score).toBe(100)
})

it('uses the latest completed session for intraday valuation and excludes unpublished same-day NAV',async()=>{
  const { assessDecisionTiming }=await import('../decision-timing')
  const snapshot=fixture()
  snapshot.asOf='2026-09-04T06:30:00Z'
  const timing=assessDecisionTiming({asOf:snapshot.asOf,calendar:snapshot.calendar,expectedTickers:['159995'],quotes:[]})
  snapshot.decisionTiming=timing
  snapshot.etfs[0].product.date=timing.closeDataSession
  snapshot.etfs[0].product.navStatus='available'
  snapshot.etfs[0].product.valuationDate=timing.closeDataSession
  snapshot.etfs[0].product.bookPublishedAt=snapshot.asOf
  const evaluation=evaluateResearch(snapshot)
  expect(evaluation.decisions[0].conditions.find(item=>item.key==='premium')).toMatchObject({status:'unknown',availability:'pending-publication'})
  const quality=buildReportQuality({evaluation,dataQuality:{status:'available'},decisionTiming:timing})
  expect(quality.dimensions.find(item=>item.key==='valuation')).toMatchObject({score:100})
  expect(quality.dimensions.find(item=>item.key==='product')).toMatchObject({score:100,detail:'3/3项当期产品交易条件可核验'})
})

it('cannot turn complete data into executable advice when contracts or account gates fail',async()=>{
  const {applyExecutionQuality}=await import('../report-quality')
  const quality=buildReportQuality({evaluation:evaluateResearch(fixture()),dataQuality:{status:'available'}})
  const advice={productDecisions:[{heldAction:'减仓',executionContract:{status:'blocked',asOf:'2000-01-01T00:00:00Z',validUntil:'2099-01-01T00:00:00Z',triggerRules:[]}}]}
  const gated=applyExecutionQuality(quality,JSON.stringify(advice),{actions:[{executable:false}]},{executionReady:true})
  expect(gated.executionReadinessScore).toBe(0)
  expect(gated.dataReadinessScore).toBe(quality.executionReadinessScore)
  expect(gated.executionAudit).toMatchObject({products:1,verifiedProducts:0,executablePortfolioActions:0})
  expect(gated.usability).toBe('limited-advice')
  advice.productDecisions[0].executionContract.status='verified'
  expect(applyExecutionQuality(quality,advice,{actions:[{executable:false}]},{executionReady:true}).executionReadinessScore).toBe(0)
  expect(applyExecutionQuality(quality,advice,null,{executionReady:true}).executionReadinessScore).toBe(100)
  expect(applyExecutionQuality(quality,advice,null,{executionReady:false}).executionReadinessScore).toBe(0)
})

it('does not count an expired product contract as ready inside a still-valid report',async()=>{
  const {applyExecutionQuality}=await import('../report-quality')
  const quality=buildReportQuality({evaluation:evaluateResearch(fixture()),dataQuality:{status:'available'}})
  const advice={productDecisions:[{heldAction:'加仓',executionContract:{status:'verified',asOf:'2000-01-01T00:00:00Z',validUntil:'2000-01-02T00:00:00Z',triggerRules:[]}}]}
  expect(applyExecutionQuality(quality,advice,null,{executionReady:true}).executionReadinessScore).toBe(0)
})
