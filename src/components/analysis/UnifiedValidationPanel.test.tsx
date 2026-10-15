import {afterEach,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {UnifiedValidationPanel} from './UnifiedValidationPanel'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('keeps a missing archive explicit and posts bounded comparison settings',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({result:null,runs:[]})}).mockResolvedValueOnce({ok:false,json:async()=>({error:'需要一份包含统一策略目标的新版综合报告'})})
  vi.stubGlobal('fetch',fetcher)
  render(<UnifiedValidationPanel industryId="ai"/>)
  await screen.findByText(/尚无统一策略验证记录/)
  expect(screen.getByRole('button',{name:'精确重放本次结果'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('候选调整幅度'),{target:{value:'0.5'}})
  fireEvent.click(screen.getByRole('button',{name:'登记候选并对照验证'}))
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2))
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'compare',adjustmentScale:.5,protocol:{commissionBps:3,slippageBps:5}})
  expect(await screen.findByRole('alert')).toHaveTextContent('新版综合报告')
})
