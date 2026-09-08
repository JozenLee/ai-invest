import {describe,it,expect,vi} from 'vitest'
const sdkCreate=vi.hoisted(()=>vi.fn())
vi.mock('@anthropic-ai/sdk',()=>({default:class {messages={create:sdkCreate}}}))
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
