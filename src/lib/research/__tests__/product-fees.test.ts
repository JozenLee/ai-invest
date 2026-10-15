import {expect,it} from 'vitest'
import {managementFeePct} from '../product-fees'
it('reads documented fees by instrument without rescaling or zero-filling',()=>{
  expect(managementFeePct([{ts_code:'588200.SH',m_fee:0.15}],'588200')).toBe(.15)
  expect(managementFeePct([{ts_code:'588200.SH',m_fee:0}],'588200')).toBe(0)
  expect(managementFeePct([{ts_code:'588200.SH',m_fee:0.15}],'159995')).toBeNull()
  expect(managementFeePct([{ts_code:'588200.SH',m_fee:null}],'588200')).toBeNull()
  expect(managementFeePct([],'588200',{ts_code:'588200.SH',mgt_fee:.5})).toBe(.5)
})
