import {afterEach,expect,it,vi} from 'vitest'
const complete=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/ai/ai-factory',()=>({aiClient:{complete}}))
import {matchHoldingsToGraphIndustries} from '../portfolio-industry-matcher.service'
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
it('does not send imported account quantities or valuations to the industry classifier',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[{code:'chip',name:'芯片'}]})}))
  complete.mockResolvedValue('{"matches":[]}')
  const imported={ticker:'017470',name:'芯片ETF联接C',category:'指数基金',quantity:987654.321,unitNav:123.456,cashBalance:543210.98}
  await matchHoldingsToGraphIndustries([imported])
  const prompt=complete.mock.calls[0][0].prompt
  expect(prompt).toContain('017470');expect(prompt).toContain('芯片ETF联接C')
  for(const privateValue of ['quantity','unitNav','cashBalance','987654.321','123.456','543210.98'])expect(prompt).not.toContain(privateValue)
})
