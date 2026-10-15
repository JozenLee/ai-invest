import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const create=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/ai/claude',()=>({claudeClient:{messages:{create}}}))
import {recoverableAnalysisError,runAnalysisPrompt} from '@/lib/workflow/analysis-prompt'
import type {StepContext} from '@/lib/workflow/types'

function context(){const artifacts=new Map<string,unknown>();return {artifacts,context:{runId:'run',stepId:'step',input:{},artifacts,updateProgress:vi.fn(async()=>undefined),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as StepContext}}
afterEach(()=>vi.useRealTimers())
describe('workflow AI retry',()=>{
  beforeEach(()=>{create.mockReset();vi.useRealTimers()})
  it('fails fast after a long timeout instead of repeating the same wait',async()=>{
    create.mockRejectedValueOnce(new Error('aborted')).mockResolvedValueOnce({content:[{type:'text',text:'{}'}]})
    const {context:ctx,artifacts}=context()
    await expect(runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})).rejects.toThrow('请求超时')
    expect(create).toHaveBeenCalledTimes(1);expect(artifacts.has('ai-error-attempt-1')).toBe(true);expect(artifacts.get('ai-request-status')).toMatchObject({attempt:1,status:'failed'})
  })

  it('publishes heartbeat progress while a model request is still running',async()=>{
    vi.useFakeTimers()
    let finish!:(value:unknown)=>void
    create.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    const {context:ctx}=context()
    const pending=runAnalysisPrompt(ctx,{timeoutMs:300000,messages:[{role:'user',content:'研究证据'.repeat(30)}]})
    await vi.advanceTimersByTimeAsync(15_001)
    expect(ctx.updateProgress).toHaveBeenCalledWith(0,1,expect.stringMatching(/已等待 15 秒.*最长 300 秒/))
    finish({content:[{type:'text',text:'{}'}],stop_reason:'end_turn',usage:{output_tokens:1}})
    await pending
    vi.useRealTimers()
  })
})

it('classifies transport and malformed model output as recoverable without masking account errors',()=>{
  expect(recoverableAnalysisError(new Error('Request was aborted.'))).toBe(true)
  expect(recoverableAnalysisError(new SyntaxError('Unterminated string in JSON at position 42'))).toBe(true)
  expect(recoverableAnalysisError(new Error('403 Insufficient account balance'))).toBe(false)
})

it('increases the budget on empty/truncated responses and retains attempt diagnostics',async()=>{
  create.mockReset()
  create.mockResolvedValueOnce({content:[{type:'text',text:''}],stop_reason:'max_tokens',usage:{output_tokens:1024}})
    .mockResolvedValueOnce({content:[{type:'text',text:'{"analysis":"完整内容"}'}],stop_reason:'end_turn',usage:{output_tokens:1800}})
  const {context:ctx,artifacts}=context()
  await runAnalysisPrompt(ctx,{max_tokens:900,messages:[{role:'user',content:'研究证据'.repeat(30)}]})
  expect(create.mock.calls[0][0].max_tokens).toBe(1024)
  expect(create.mock.calls[1][0].max_tokens).toBe(4096)
  expect(artifacts.get('ai-response-attempt-1')).toMatchObject({stop_reason:'max_tokens'})
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'completed',attempt:2})
})
it('marks exhausted empty responses as failed rather than completed',async()=>{
  create.mockReset();create.mockResolvedValue({content:[{type:'text',text:''}],stop_reason:'end_turn'})
  const {context:ctx,artifacts}=context()
  await expect(runAnalysisPrompt(ctx,{maxAttempts:2,messages:[{role:'user',content:'研究证据'.repeat(30)}]})).rejects.toThrow('空内容')
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'failed',attempt:2})
  expect(ctx.updateProgress).toHaveBeenLastCalledWith(0,1,expect.stringMatching(/智能分析失败.*AI返回空内容.*可继续本轮重试/))
})
it('rejects nonempty truncated output before callers attempt to parse JSON',async()=>{
  create.mockReset();create.mockResolvedValueOnce({content:[{type:'text',text:'{"analysis":'}],stop_reason:'max_tokens'}).mockResolvedValueOnce({content:[{type:'text',text:'{}'}],stop_reason:'end_turn'})
  const {context:ctx}=context();expect((await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})).content[0].text).toBe('{}')
})
it('retries schema-invalid text before declaring a request complete',async()=>{
  create.mockReset();create.mockResolvedValueOnce({content:[{type:'text',text:'不是JSON'}],stop_reason:'end_turn'}).mockResolvedValueOnce({content:[{type:'text',text:'{"ok":true}'}],stop_reason:'end_turn'})
  const {context:ctx,artifacts}=context()
  await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}],validateOutput:JSON.parse})
  expect(create).toHaveBeenCalledTimes(2)
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'completed',attempt:2})
  expect(create.mock.calls[0][0]).not.toHaveProperty('validateOutput')
  expect(create.mock.calls[1][0].messages.at(-1).content).toContain('上次输出未通过程序校验')
})

it('retries opted-in timeouts without adding misleading JSON repair instructions',async()=>{
  create.mockReset()
  create.mockRejectedValueOnce(new Error('Request was aborted.')).mockResolvedValueOnce({content:[{type:'text',text:'{}'}]})
  const {context:ctx,artifacts}=context()
  const messages=[{role:'user',content:'研究证据'.repeat(30)}]
  await runAnalysisPrompt(ctx,{messages,timeoutMs:240000,maxAttempts:2,retryTimeouts:true})
  expect(create).toHaveBeenCalledTimes(2)
  expect(create.mock.calls[1][0].messages).toEqual(messages)
  expect(artifacts.get('ai-error-attempt-1')).toMatchObject({message:expect.stringContaining('240 秒')})
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'completed',attempt:2})
})
it('bounds timeout retries and preserves a readable final failure',async()=>{
  create.mockReset();create.mockRejectedValue(new Error('Request was aborted.'))
  const {context:ctx,artifacts}=context()
  await expect(runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}],maxAttempts:2,retryTimeouts:true})).rejects.toThrow('第 2/2 次')
  expect(create).toHaveBeenCalledTimes(2)
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'failed',attempt:2})
})

it('restores evidence aliases before caller validation while preserving the original model response',async()=>{
  create.mockReset();create.mockResolvedValue({content:[{type:'text',text:'{"evidence":[{"claim":"事实","evidenceIds":["E1"]}]}'}],stop_reason:'end_turn'})
  const {context:ctx,artifacts}=context()
  artifacts.set(`active-ai-evidence-aliases:${ctx.stepId}`,{E1:'original-frozen-evidence'})
  const result=await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'冻结证据'.repeat(30)}],validateOutput:text=>expect(JSON.parse(text).evidence[0].evidenceIds).toEqual(['original-frozen-evidence'])})
  expect(result.content[0].text).toContain('original-frozen-evidence')
  expect(JSON.stringify(artifacts.get('ai-response-attempt-1'))).toContain('E1')
})
