import {beforeEach,describe,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'

const getRunDetails=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/workflow/workflows/comprehensive-analysis',()=>({comprehensiveAnalysisWorkflow:{getRunDetails,getStepDependencies:vi.fn(()=>[])}}))
import {GET} from '../route'

describe('comprehensive step detail API',()=>{
  beforeEach(()=>getRunDetails.mockReset())
  it('loads only the requested step and summarizes oversized artifacts',async()=>{
    getRunDetails.mockResolvedValue({id:'run',metadata:'{}',steps:[{stepName:'freeze-research',progress:null,artifacts:[{artifactKey:'research-snapshot',artifactType:'DATA',size:800000,data:JSON.stringify({id:'snapshot',asOf:'2026-09-09',profile:{benchmark:'000300.SH'},etfs:[{}],companies:[{},{}],events:[{},{},{}],evidence:[{}],sectorFlows:[],projections:{'fetch-etfs':{}},records:{secret:'large'}})}]}]})
    const response=await GET(new NextRequest('http://localhost/api/analysis/comprehensive/run?view=step&stepName=freeze-research'),{params:Promise.resolve({runId:'run'})})
    const body=await response.json()
    expect(getRunDetails).toHaveBeenCalledWith('run',false,'freeze-research')
    expect(body.steps[0].artifacts[0]).toMatchObject({truncated:true,data:{id:'snapshot',counts:{etfs:1,companies:2,events:3},rawRecords:expect.any(String)}})
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})
