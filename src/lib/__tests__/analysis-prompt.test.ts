import {beforeEach,describe,expect,it,vi} from 'vitest'
const create=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/ai/claude',()=>({claudeClient:{messages:{create}}}))
import {runAnalysisPrompt} from '@/lib/workflow/analysis-prompt'
import type {StepContext} from '@/lib/workflow/types'

function context(){const artifacts=new Map<string,unknown>();return {artifacts,context:{runId:'run',stepId:'step',input:{},artifacts,updateProgress:vi.fn(),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as StepContext}}
describe('workflow AI retry',()=>{
  beforeEach(()=>create.mockReset())
  it('retries one transient timeout and records the recovered attempt',async()=>{
    create.mockRejectedValueOnce(new Error('aborted')).mockResolvedValueOnce({content:[{type:'text',text:'{}'}]})
    const {context:ctx,artifacts}=context(),result=await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})
    expect(result.content[0].text).toBe('{}');expect(create).toHaveBeenCalledTimes(2);expect(artifacts.has('ai-error-attempt-1')).toBe(true);expect(artifacts.get('ai-request-status')).toMatchObject({attempt:2})
  })
})
