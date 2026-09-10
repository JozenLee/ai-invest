import { expect,it } from 'vitest'
import { fixture } from './fixtures'
import { assessTechnicalReadiness } from '../technical-readiness'
import { evaluateResearch } from '../engine'

it('separates pending close factors from historical reference without changing today decisions',()=>{
  const snapshot=fixture();snapshot.asOf='2026-09-04T08:45:00Z'
  snapshot.etfs=Array.from({length:8},(_,i)=>({...structuredClone(snapshot.etfs[0]),ticker:String(i),indexCode:`index${i}`,indexBars:structuredClone(snapshot.etfs[0].indexBars)}))
  for(const etf of snapshot.etfs.slice(1,7))etf.factors.pop()
  snapshot.etfs[7].bars.pop()
  snapshot.etfs.forEach(etf=>etf.indexBars.pop())
  const before=JSON.stringify(snapshot)
  const result=assessTechnicalReadiness(snapshot)
  expect(result).toMatchObject({usable:1,requested:8,referenceSession:'2026-09-03',asOf:'2026-09-04T16:45:00.000+08:00'})
  expect(result.perEtf[1].issues).toContainEqual(expect.objectContaining({field:'factors',status:'pending-publication'}))
  expect(result.perEtf[7].issues).toContainEqual(expect.objectContaining({field:'daily',status:'stale'}))
  expect(result.perEtf.every(etf=>etf.reference?.executionReady===false)).toBe(true)
  expect(evaluateResearch(snapshot).decisions.filter(d=>d.state!=='blocked')).toHaveLength(1)
  expect(JSON.stringify(snapshot)).toBe(before)
  const ready=fixture()
  expect(assessTechnicalReadiness(ready)).toMatchObject({usable:1,referenceSession:'2026-09-04'})
})
it('does not hide an interior history gap or an upstream failure as pending publication',()=>{
  const snapshot=fixture();snapshot.asOf='2026-09-04T08:45:00Z'
  snapshot.etfs[0].factors.splice(-5,1)
  snapshot.etfs[0].fieldStatus={factors:{status:'failed',detail:'上游请求失败'}}
  const result=assessTechnicalReadiness(snapshot)
  expect(result.perEtf[0].issues).toContainEqual(expect.objectContaining({field:'factors',status:'failed'}))
  expect(result.usable).toBe(0)
  expect(result.perEtf[0].reference?.date||'').not.toBe('2026-09-04')
})
it('rejects historical references without a verified calendar',()=>{
 const snapshot=fixture();snapshot.calendar=[]
 expect(assessTechnicalReadiness(snapshot)).toMatchObject({usable:0,referenceSession:null})
})
it('keeps ETF technical coverage separate from benchmark alignment and reference date',()=>{
 const snapshot=fixture();snapshot.benchmarkBars.pop()
 const result=assessTechnicalReadiness(snapshot)
 expect(result.usable).toBe(1)
 expect(result.perEtf[0].issues.some(issue=>issue.field==='benchmark')).toBe(true)
 expect(result.referenceSession).toBe('2026-09-03')
})
