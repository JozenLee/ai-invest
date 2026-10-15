import {it,expect} from 'vitest'
import {calibrateForecasts} from '../forecast-calibration'
import {fixture} from './fixtures'
import {evaluateResearch} from '../engine'
import {dataRemediationPlan} from '../remediation'
it('does not fabricate calibration from confidence or reveal small-sample success rates',()=>{
  const snapshot=fixture()
  const forecast={ticker:'159995',generatedAt:'2026-08-01T00:00:00Z',target:'outperform-benchmark',horizonTradingDays:20,probability:.7}
  const result=calibrateForecasts([forecast,forecast,{...forecast,target:'confidence'}],snapshot,20)
  expect(result.maturedOutcomes).toBe(1)
  expect(result.rejectedForecasts).toBe(1)
  expect(result.brierScore).toBeNull()
  expect(result.hitRatePct).toBeNull()
  expect(result.samples[0].asOf).toBe('2026-08-03')
})
it('does not backdate a delayed report prediction to its frozen snapshot',()=>{
  const result=calibrateForecasts([{ticker:'159995',generatedAt:'2026-09-04T05:19:00Z',target:'outperform-benchmark',horizonTradingDays:20,probability:.7}],fixture(),20)
  expect(result.maturedOutcomes).toBe(0)
  expect(result.pendingOutcomes).toBe(1)
})
it('creates repair tasks for missing evidence but not weak market signals',()=>{
  const evaluation=evaluateResearch(fixture())
  evaluation.decisions[0].conditions.find(item=>item.key==='premium')!.status='unknown'
  evaluation.decisions[0].conditions.find(item=>item.key==='market')!.status='unmet'
  const plan=dataRemediationPlan(evaluation)
  expect(plan.some(item=>item.condition==='premium'&&item.priority==='critical')).toBe(true)
  expect(plan.some(item=>item.condition==='market')).toBe(false)
})
