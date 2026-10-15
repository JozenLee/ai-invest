import {beforeEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({parent:vi.fn(),create:vi.fn(),execute:vi.fn(),details:vi.fn(),lab:vi.fn()}))
vi.mock('@/lib/db',()=>({prisma:{aIAnalysisReport:{findFirst:mocks.parent}}}))
vi.mock('../lease',()=>({withResearchLease:(_key:string,_id:string,work:()=>unknown)=>work()}))
vi.mock('@/lib/workflow/workflows/comprehensive-analysis',()=>({comprehensiveAnalysisWorkflow:{createRun:mocks.create,executeAll:mocks.execute,getRunDetails:mocks.details}}))
vi.mock('../lab/store',()=>({runLab:mocks.lab}))
import {refreshUnifiedResearch} from '../refresh'
beforeEach(()=>{vi.resetAllMocks();mocks.parent.mockResolvedValue({id:'report',dataJson:JSON.stringify({metadata:{runId:'parent'},researchEvaluation:{snapshotId:'old'}})});mocks.create.mockResolvedValue('review');mocks.details.mockResolvedValue({status:'COMPLETED',steps:[{artifacts:[{artifactKey:'unified-decision-version',data:JSON.stringify({id:'decision',snapshotId:'new'})}]}]});mocks.lab.mockResolvedValue({snapshotId:'new',decisionVersionId:'decision'})})
it('refreshes through review → archived decision → same-snapshot experiment',async()=>{
  expect(await refreshUnifiedResearch('ai')).toMatchObject({runId:'review',snapshotId:'new',decisionVersionId:'decision'})
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({rulesOnly:true,parentRunId:'parent',baselineSnapshotId:'old'}))
  expect(mocks.lab).toHaveBeenCalledWith('ai','new')
  expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.lab.mock.invocationCallOrder[0])
})
it('never creates an orphan experiment when review failed or decision was not archived',async()=>{
  mocks.details.mockResolvedValue({status:'FAILED',steps:[]})
  await expect(refreshUnifiedResearch('ai')).rejects.toThrow('未完成')
  expect(mocks.lab).not.toHaveBeenCalled()
})
it('rejects a linked experiment from another decision',async()=>{
  mocks.lab.mockResolvedValue({decisionVersionId:'other'})
  await expect(refreshUnifiedResearch('ai')).rejects.toThrow('不一致')
})
