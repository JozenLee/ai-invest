import {expect,it,vi} from 'vitest'
vi.mock('@/lib/db',()=>({prisma:{}}))
import {validateFeedback,confirmDailyAccount} from '../lab/daily-store'
import type {DailyPlan} from '../lab/daily-plan'

const plan={id:'plan',asOf:'2026-09-04T09:00:00Z',actions:[{id:'A',ticker:'A',side:'buy'}]} as DailyPlan
const base={id:'receipt-001',actionId:'A',status:'filled',quantity:100,price:1.2,fee:0,occurredAt:'2026-09-04T10:00:00Z',note:''}
it('records a real fill separately from a submission and requires actual execution economics',()=>{
  expect(validateFeedback(base,plan,'2026-09-04T11:00:00Z')).toMatchObject({quantity:100,price:1.2,fee:0,status:'filled'})
  expect(validateFeedback({...base,status:'submitted'},plan,'2026-09-04T11:00:00Z').quantity).toBeUndefined()
  expect(()=>validateFeedback({...base,quantity:0},plan,'2026-09-04T11:00:00Z')).toThrow('实际份额')
  expect(()=>validateFeedback({...base,fee:undefined},plan,'2026-09-04T11:00:00Z')).toThrow('实际份额')
})
it('rejects future, unlinked and reasonless feedback',()=>{
  expect(()=>validateFeedback({...base,occurredAt:'2030-01-01'},plan,'2026-09-04T11:00:00Z')).toThrow('操作时间')
  expect(()=>validateFeedback({...base,actionId:'other'},plan,'2026-09-04T11:00:00Z')).toThrow('操作项')
  expect(()=>validateFeedback({...base,status:'cancelled'},plan,'2026-09-04T11:00:00Z')).toThrow('原因')
})
it('cannot silently confirm old balances without explicit current account facts',async()=>{
  await expect(confirmDailyAccount({confirmed:false})).rejects.toThrow('已核对')
  await expect(confirmDailyAccount({confirmed:true,portfolioId:'p',cashBalance:10,asOf:'2099-01-01',holdings:[]})).rejects.toThrow('业务时点')
})
