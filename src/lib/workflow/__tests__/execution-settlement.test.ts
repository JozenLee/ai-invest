import { expect, it, vi } from 'vitest'
import type { StepDefinition } from '../types'
const update=vi.hoisted(()=>vi.fn(async(_args:unknown)=>({})))
vi.mock('@/lib/db',()=>({prisma:{executionRun:{update}}}))
vi.mock('../execution-waves',()=>({executionWaves:(steps:StepDefinition[])=>[steps]}))
import { ExecutionOrchestrator } from '../execution-orchestrator'

it('waits for in-flight siblings before marking a parallel run failed',async()=>{
  let finish!:()=>void
  const sibling=new Promise<void>(resolve=>{finish=resolve})
  const steps=['market-analysis','news-analysis'].map(name=>({name,description:name,dependencies:[],execute:async()=>{}}))
  const workflow=new ExecutionOrchestrator('test',steps)
  vi.spyOn(workflow,'executeStep').mockImplementation(async(_run,name)=>{if(name==='news-analysis')throw new Error('upstream failed');await sibling})
  const result=workflow.executeAll('run').catch(error=>error)
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(update.mock.calls.some(call=>(call[0] as {data:{status:string}})?.data.status==='FAILED')).toBe(false)
  finish()
  expect((await result).message).toBe('upstream failed')
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED'})}))
})
