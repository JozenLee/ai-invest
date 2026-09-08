import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const listRuns=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/workflow/workflows/comprehensive-analysis',()=>({comprehensiveAnalysisWorkflow:{listRuns,createRun:vi.fn()}}))
vi.mock('@/lib/workflow/run-lineage',()=>({reviewBaseline:vi.fn()}))
vi.mock('@/lib/research/store',()=>({getResearchProfile:vi.fn()}))
vi.mock('@/lib/security/request-origin',()=>({sameOriginRequest:vi.fn(()=>true)}))

import { GET } from '../route'

describe('comprehensive analysis run history',()=>{
  it('keeps graph verification runs out of the default user history',async()=>{
    listRuns.mockResolvedValue([
      {id:'verification',metadata:{verificationMode:'graph-e2e'}},
      {id:'analysis',metadata:{verificationMode:null}},
    ])
    const response=await GET(new NextRequest('http://localhost/api/analysis/comprehensive?industryId=ai&limit=10'))
    expect((await response.json()).map((run:{id:string})=>run.id)).toEqual(['analysis'])
    expect(listRuns).toHaveBeenCalledWith(100,'ai')
  })
})
