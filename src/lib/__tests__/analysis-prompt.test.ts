import {beforeEach,describe,expect,it,vi} from 'vitest'
const create=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/ai/claude',()=>({claudeClient:{messages:{create}}}))
import {recoverableAnalysisError,runAnalysisPrompt} from '@/lib/workflow/analysis-prompt'
import type {StepContext} from '@/lib/workflow/types'
import { newsAnalysisStep } from '@/lib/workflow/steps/news-analysis-step'

function context(){const artifacts=new Map<string,unknown>();return {artifacts,context:{runId:'run',stepId:'step',input:{},artifacts,updateProgress:vi.fn(),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as StepContext}}
describe('workflow AI retry',()=>{
  beforeEach(()=>{create.mockReset()})
  it('retries an SSE upstream denial while preserving the failed attempt',async()=>{
    const failure=new Error(JSON.stringify({type:'error',error:{type:'upstream_error',message:'Upstream access forbidden, please contact administrator'}}))
    create.mockRejectedValueOnce(failure).mockResolvedValueOnce({content:[{type:'text',text:'{"analysis":"已恢复"}'}],stop_reason:'end_turn',usage:{output_tokens:20}})
    const {context:ctx,artifacts}=context()
    await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'冻结研究证据'.repeat(30)}]})
    expect(create).toHaveBeenCalledTimes(2)
    expect(artifacts.get('ai-request-status')).toMatchObject({status:'completed',attempt:2})
    expect(recoverableAnalysisError(failure)).toBe(true)
    expect(recoverableAnalysisError(Object.assign(failure,{status:403}))).toBe(false)
  })
  it('does not retry an explicitly aborted request',async()=>{
    create.mockRejectedValueOnce(new Error('aborted')).mockResolvedValueOnce({content:[{type:'text',text:'{}'}]})
    const {context:ctx,artifacts}=context()
    await expect(runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})).rejects.toThrow('aborted')
    expect(create).toHaveBeenCalledTimes(1);expect(artifacts.has('ai-error-attempt-1')).toBe(true);expect(artifacts.get('ai-request-status')).toMatchObject({attempt:1,status:'failed'})
  })
  it('retains event evidence and labels degradation if upstream errors exhaust bounded attempts',async()=>{
    create.mockRejectedValue(new Error('{"error":{"type":"upstream_error","message":"Upstream access forbidden"}}'))
    const {context:ctx,artifacts}=context()
    artifacts.set('industry-info',{name:'算力硬件'})
    artifacts.set('news-events',[{id:'event-1',title:'订单进展',category:'demand',status:'evidence',priority:5,companies:['688008'],sources:['公司公告'],publishedAt:'2026-09-10',evidenceIds:['source-1']}])
    await newsAnalysisStep.execute(ctx)
    expect(create).toHaveBeenCalledTimes(3)
    expect(artifacts.get('ai-request-status')).toMatchObject({status:'failed',attempt:3})
    expect(artifacts.get('news-analysis-ai-status')).toMatchObject({status:'fallback'})
    expect(JSON.parse(String(artifacts.get('news-analysis')))).toMatchObject({sentiment:'未知',catalysts:[{sourceEventIds:['event-1'],affectedCompanies:['688008']} ]})
  })
})

it('allows explicit billing degradation while rejecting invalid credentials',()=>{
  expect(recoverableAnalysisError(new Error('Request was aborted.'))).toBe(true)
  expect(recoverableAnalysisError(new SyntaxError('Unterminated string in JSON at position 42'))).toBe(true)
  expect(recoverableAnalysisError(new Error('403 Insufficient account balance'))).toBe(true)
  expect(recoverableAnalysisError(Object.assign(new Error('Invalid API key'),{status:403}))).toBe(false)
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
})
it('rejects an oversized evidence packet before issuing a paid model request',async()=>{
  create.mockReset()
  const {context:ctx,artifacts}=context()
  await expect(runAnalysisPrompt(ctx,{messages:[{role:'user',content:'证据'.repeat(61000)}]})).rejects.toThrow('超过120000字符')
  expect(create).not.toHaveBeenCalled()
  expect(artifacts.get('ai-input-audit')).toMatchObject({passed:false,budgetExceeded:true})
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
})

 it('retries a deadline timeout and records the successful second attempt',async()=>{
  create.mockReset()
  create.mockRejectedValueOnce(new Error('AI request timed out after 300000ms'))
    .mockResolvedValueOnce({model:'claude-opus-5',content:[{type:'text',text:'{}'}],stop_reason:'end_turn'})
  const {context:ctx,artifacts}=context()
  await runAnalysisPrompt(ctx,{model:'claude-opus-5',messages:[{role:'user',content:'研究证据'.repeat(30)}]})
  expect(create).toHaveBeenCalledTimes(2)
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'completed',attempt:2,model:'claude-opus-5'})
 })
 it('bounds repeated timeout retries and retains the requested model on failure',async()=>{
  create.mockReset();create.mockRejectedValue(new Error('Request timed out.'))
  const {context:ctx,artifacts}=context()
  await expect(runAnalysisPrompt(ctx,{model:'claude-opus-5',maxAttempts:2,messages:[{role:'user',content:'研究证据'.repeat(30)}]})).rejects.toThrow('timed out')
  expect(create).toHaveBeenCalledTimes(2)
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'failed',attempt:2,model:'claude-opus-5'})
 })

const streamFailure=JSON.stringify({error:{message:'upstream stream disconnected: unexpected EOF',type:'stream_read_error'},type:'error'})
it('retries the observed gateway stream error and accepts the complete replacement',async()=>{
  create.mockReset();create.mockRejectedValueOnce(new Error(streamFailure)).mockResolvedValueOnce({model:'claude-opus-5',content:[{type:'text',text:'{}'}],stop_reason:'end_turn'})
  const {context:ctx,artifacts}=context()
  await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})
  expect(create).toHaveBeenCalledTimes(2)
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'completed',attempt:2})
  expect(recoverableAnalysisError(new Error(streamFailure))).toBe(true)
  expect(recoverableAnalysisError(new Error('401 invalid API key'))).toBe(false)
})
it('keeps old failures separate from a successful resumed invocation',async()=>{
  create.mockReset();create.mockResolvedValue({model:'claude-opus-5',content:[{type:'text',text:'{}'}],stop_reason:'end_turn'})
  const {context:ctx,artifacts}=context()
  ctx.previousAIRequestAttempt=2
  artifacts.set('ai-error-attempt-2',{message:streamFailure})
  await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})
  expect(artifacts.get('ai-request-status')).toMatchObject({status:'completed',attempt:3})
  expect(artifacts.has('ai-error-attempt-2')).toBe(true)
  expect(artifacts.has('ai-error-attempt-3')).toBe(false)
})

it('stops repeating upstream access denials within the same step after bounded retries',async()=>{
 create.mockReset();create.mockRejectedValue(new Error('{"error":{"type":"upstream_error","message":"Upstream access forbidden"}}'))
 const {context:ctx,artifacts}=context()
 const params={maxAttempts:2,messages:[{role:'user',content:'研究证据'.repeat(30)}]}
 await expect(runAnalysisPrompt(ctx,params)).rejects.toThrow('forbidden')
 expect(create).toHaveBeenCalledTimes(2)
 expect(artifacts.get('ai-access-status')).toMatchObject({status:'blocked'})
 await expect(runAnalysisPrompt(ctx,params)).rejects.toThrow('forbidden')
 expect(create).toHaveBeenCalledTimes(2)
 expect(artifacts.get('ai-request-status')).toMatchObject({status:'blocked',attempt:0})
})
it('does not latch an outage when a transport failure is followed by only one upstream denial',async()=>{
 create.mockReset();create.mockRejectedValueOnce(new Error('Connection error.')).mockRejectedValueOnce(new Error('{"error":{"type":"upstream_error","message":"Upstream access forbidden"}}'))
 const {context:ctx,artifacts}=context()
 await expect(runAnalysisPrompt(ctx,{maxAttempts:2,messages:[{role:'user',content:'研究证据'.repeat(30)}]})).rejects.toThrow('forbidden')
 expect(artifacts.has('ai-access-status')).toBe(false)
})
it('labels an unavailable investment model independently of evidence sufficiency',async()=>{
 const {investmentAdviceStep}=await import('@/lib/workflow/steps/investment-advice-step')
 create.mockReset();create.mockRejectedValue(new Error('timeout'))
 const {context:ctx,artifacts}=context()
 artifacts.set('research-evaluation',{decisions:[],products:[],profile:{horizonDays:20}})
 artifacts.set('industry-info',{name:'算力硬件'})
 await investmentAdviceStep.execute(ctx)
 const advice=JSON.parse(String(artifacts.get('investment-advice')))
 expect(advice.rating).toBe('未形成模型评级')
 expect(advice.recommendationSource).toContain('规则汇编')
 expect(advice.ratingBasis).toContain('不是对市场证据充分性的模型评级')
})
it('lets independent modules recover after a step-specific upstream denial',async()=>{
 create.mockReset();create.mockResolvedValue({content:[{type:'text',text:'{}'}],stop_reason:'end_turn'})
 const {context:ctx,artifacts}=context()
 artifacts.set('ai-access-status',{status:'blocked',stepId:'another-step',message:'upstream denied'})
 await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})
 expect(create).toHaveBeenCalledOnce()
})
it('degrades on exhausted account balance without retrying or charging subsequent modules',async()=>{
 create.mockReset();const billing=Object.assign(new Error('403 Insufficient account balance'),{status:403});create.mockRejectedValue(billing)
 const {context:ctx,artifacts}=context()
 const params={messages:[{role:'user',content:'研究证据'.repeat(30)}]}
 expect(recoverableAnalysisError(billing)).toBe(true)
 await expect(runAnalysisPrompt(ctx,params)).rejects.toThrow('balance')
 expect(create).toHaveBeenCalledOnce()
 expect(artifacts.get('ai-service-status')).toMatchObject({status:'billing-blocked'})
 await expect(runAnalysisPrompt({...ctx,stepId:'next'},params)).rejects.toThrow('balance')
 expect(create).toHaveBeenCalledOnce()
})
it('recognizes a recorded billing error when resuming a legacy run',async()=>{
 create.mockReset();const {context:ctx,artifacts}=context()
 artifacts.set('ai-error-attempt-2',{message:'403 Insufficient account balance'})
 await expect(runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}]})).rejects.toThrow('balance')
 expect(create).not.toHaveBeenCalled()
})

it('feeds the concrete validation failure into the next request and archives that repair prompt',async()=>{
 create.mockReset()
 create.mockResolvedValueOnce({model:'claude-opus-5',content:[{type:'text',text:'{"analysis":{}}'}],stop_reason:'end_turn'})
 create.mockResolvedValueOnce({model:'claude-opus-5',content:[{type:'text',text:'{"analysis":"完整解释"}'}],stop_reason:'end_turn'})
 const {context:ctx,artifacts}=context()
 await runAnalysisPrompt(ctx,{messages:[{role:'user',content:'研究证据'.repeat(30)}],validateOutput:(text)=>{if(typeof JSON.parse(text).analysis!=='string')throw new Error('输出字段类型错误：analysis 必须是非空字符串')}})
 expect(create.mock.calls[1][0].messages.at(-1).content).toContain('analysis 必须是非空字符串')
 expect((artifacts.get('ai-request-attempt-2') as {messages:Array<{content:string}>}).messages.at(-1)?.content).toContain('analysis 必须是非空字符串')
})
