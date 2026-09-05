import {describe,it,expect,vi} from 'vitest'
vi.mock('@/lib/db',()=>({prisma:{}}))
import {dueSlots,validateSchedule} from '../schedule'
describe('opt-in local review schedule',()=>{
  it('is quiet when disabled and uses Shanghai time',()=>{
    expect(dueSlots({enabled:false,times:['08:50']},new Date('2026-09-04T01:00:00Z'))).toEqual([])
    expect(dueSlots({enabled:true,times:['08:50','19:30']},new Date('2026-09-04T01:00:00Z'))).toEqual([{date:'2026-09-04',time:'08:50'}])
    expect(dueSlots({enabled:true,times:['08:50']},new Date('2026-09-05T01:00:00Z'))).toEqual([])
  })
  it('rejects invalid times and bounds daily frequency',()=>{
    expect(()=>validateSchedule({enabled:true,times:['25:00']})).toThrow()
    expect(()=>validateSchedule({enabled:true,times:[]})).toThrow()
    expect(validateSchedule({enabled:true,times:['19:30','08:50','08:50']}).times).toEqual(['08:50','19:30'])
  })
})
