import {describe,it,expect,vi,beforeEach} from 'vitest'
const db=vi.hoisted(()=>({executionRun:{findUnique:vi.fn()}}))
vi.mock('@/lib/db',()=>({prisma:db}))
import {reviewBaseline} from '@/lib/workflow/run-lineage'
beforeEach(()=>vi.clearAllMocks())
describe('unified analysis review lineage',()=>{
  it('starts a new independent analysis without inventing a parent',async()=>{
    expect(await reviewBaseline('ai')).toEqual({parentRunId:null,baselineSnapshotId:null})
    expect(db.executionRun.findUnique).not.toHaveBeenCalled()
  })
  it('uses the selected report snapshot rather than a later unrelated review',async()=>{
    db.executionRun.findUnique.mockResolvedValue({workflowId:'comprehensive-analysis',status:'COMPLETED',metadata:JSON.stringify({industryId:'ai'}),steps:[{artifacts:[{data:JSON.stringify({snapshotId:'exact-parent-snapshot'})}]}]})
    expect(await reviewBaseline('ai','parent-run')).toEqual({parentRunId:'parent-run',baselineSnapshotId:'exact-parent-snapshot'})
  })
  it('rejects cross-domain, unfinished and legacy parents',async()=>{
    for(const parent of [null,{workflowId:'comprehensive-analysis',status:'RUNNING'},{workflowId:'comprehensive-analysis',status:'COMPLETED',metadata:'{"industryId":"other"}',steps:[]},{workflowId:'comprehensive-analysis',status:'COMPLETED',metadata:'{"industryId":"ai"}',steps:[]}]){
      db.executionRun.findUnique.mockResolvedValue(parent)
      await expect(reviewBaseline('ai','parent-run')).rejects.toThrow()
    }
  })
})
