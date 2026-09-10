import {describe,it,expect,vi} from 'vitest'
const sdkCreate=vi.hoisted(()=>vi.fn())
vi.mock('@anthropic-ai/sdk',()=>({default:class {messages={stream:(...args:unknown[])=>({finalMessage:()=>sdkCreate(...args)})}}}))
import {ClaudeClient} from '@/lib/ai/claude'
describe('AI response normalization',()=>{
  it('collects all text blocks while preserving termination and usage metadata',async()=>{
    sdkCreate.mockResolvedValue({id:'response',model:'configured-model',content:[{type:'thinking',thinking:'private reasoning'},{type:'text',text:'first'},{type:'text',text:'second'}],stop_reason:'end_turn',usage:{output_tokens:42}})
    const client=new ClaudeClient({apiKey:'test-only',model:'configured-model'})
    const result=await client.messages.create({messages:[{role:'user',content:'question'}],max_tokens:4096,temperature:.3})
    expect(result.content[0].text).toBe('first\nsecond')
    expect(result).toMatchObject({stop_reason:'end_turn',usage:{output_tokens:42},contentTypes:['thinking','text','text']})
    expect(JSON.stringify(result)).not.toContain('private reasoning')
    expect(sdkCreate).toHaveBeenCalledWith(expect.objectContaining({max_tokens:4096,temperature:.3,model:'configured-model'}),expect.anything())
  })
  it('retains empty response metadata without throwing away the cause',async()=>{
    sdkCreate.mockResolvedValue({content:[],stop_reason:'max_tokens',usage:{output_tokens:900},id:'limited',model:'configured-model'})
    const result=await new ClaudeClient({apiKey:'test-only'}).messages.create({prompt:'question',max_tokens:900})
    expect(result).toMatchObject({content:[{type:'text',text:''}],stop_reason:'max_tokens',usage:{output_tokens:900}})
  })
})

 it('classifies the local deadline as a timeout instead of an explicit cancellation',async()=>{
  vi.useFakeTimers()
  sdkCreate.mockImplementationOnce((_body,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Request was aborted.')))))
  try {
    const pending=new ClaudeClient({apiKey:'test-only'}).messages.create({prompt:'question',timeoutMs:30000})
    const assertion=expect(pending).rejects.toMatchObject({name:'TimeoutError',message:'AI request timed out after 30000ms'})
    await vi.advanceTimersByTimeAsync(30000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
    expect(sdkCreate.mock.calls.at(-1)?.[1]).toMatchObject({timeout:30000,maxRetries:0})
  } finally { vi.useRealTimers() }
 })
