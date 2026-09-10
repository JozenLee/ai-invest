import {beforeEach,describe,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'

const findUnique=vi.hoisted(()=>vi.fn())
const dispatchAnalysis=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/db',()=>({prisma:{executionRun:{findUnique}}}))
vi.mock('@/lib/workflow/background-runner',()=>({dispatchAnalysis}))
vi.mock('@/lib/security/request-origin',()=>({sameOriginRequest:vi.fn(()=>true)}))

import {POST} from './route'

describe('comprehensive selected-step execution',()=>{
  beforeEach(()=>{findUnique.mockReset();dispatchAnalysis.mockReset()})

  it('allows a completed run to repeat one selected step',async()=>{
    findUnique.mockResolvedValue({id:'run',status:'COMPLETED',steps:[{stepName:'market-analysis'}]})
    dispatchAnalysis.mockResolvedValue({alreadyRunning:false})
    const response=await POST(new NextRequest('http://localhost/api/analysis/comprehensive/run/execute?mode=step&stepName=market-analysis',{method:'POST'}),{params:Promise.resolve({runId:'run'})})
    expect(response.status).toBe(202)
    expect(dispatchAnalysis).toHaveBeenCalledWith('run','step','market-analysis')
  })

  it('does not restart the whole completed run',async()=>{
    findUnique.mockResolvedValue({id:'run',status:'COMPLETED',steps:[{stepName:'market-analysis'}]})
    const response=await POST(new NextRequest('http://localhost/api/analysis/comprehensive/run/execute?mode=all',{method:'POST'}),{params:Promise.resolve({runId:'run'})})
    expect(await response.json()).toMatchObject({completed:true})
    expect(dispatchAnalysis).not.toHaveBeenCalled()
  })
})
