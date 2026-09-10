import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { assessDecisionTiming } from '@/lib/analysis/decision-timing'
const { findUnique }=vi.hoisted(()=>({findUnique:vi.fn()}))
vi.mock('@/lib/db',()=>({prisma:{aIAnalysisReport:{findUnique}}}))
import { GET } from './route'

afterEach(()=>vi.useRealTimers())
it('expires API execution readiness at read time without changing the archived research timestamp',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-10T06:00:00Z'))
  const timing=assessDecisionTiming({asOf:'2026-09-10T05:00:00Z',calendar:[{date:'2026-09-09',open:true},{date:'2026-09-10',open:true}],expectedTickers:['159995'],quotes:[{code:'159995',tradeDate:'2026-09-10',fetchedAt:'2026-09-10T04:59:00Z'}],eventChecks:[{key:'159995',lastSuccessAt:'2026-09-10T04:59:00Z'}]})
  expect(timing.executionReady).toBe(true)
  findUnique.mockResolvedValue({id:'test',type:'comprehensive',createdAt:new Date('2026-09-10T05:01:00Z'),content:'交易时段时效已通过',dataJson:JSON.stringify({decisionTiming:timing})})
  const result=await GET(new NextRequest('http://localhost/api/analysis/reports/test'),{params:Promise.resolve({id:'test'})})
  const data=await result.json()
  expect(JSON.parse(data.dataJson).decisionTiming).toMatchObject({executionReady:false,asOf:timing.asOf})
  expect(data.content).not.toContain('时效已通过')
})
