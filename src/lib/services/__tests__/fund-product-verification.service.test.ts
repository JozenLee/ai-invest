import { describe,expect,it } from 'vitest'
import { vi } from 'vitest'
vi.mock('@/lib/db',()=>({prisma:{}}))
import { conservativeRedemptionFee } from '../fund-product-verification.service'

const schedule=[
  {condition:'0天<持有期限<7天',minDays:0,maxDays:7,feePct:1.5},
  {condition:'7天<=持有期限<30天',minDays:7,maxDays:30,feePct:1},
  {condition:'30天<=持有期限<180天',minDays:30,maxDays:180,feePct:.5},
  {condition:'180天<=持有期限',minDays:180,maxDays:null,feePct:0},
]

describe('conservativeRedemptionFee',()=>{
  const now=new Date('2026-09-16T00:00:00Z')
  it('uses the highest fee that can still apply after the observed holding floor',()=>{
    expect(conservativeRedemptionFee(schedule,new Date('2026-09-03T00:00:00Z'),now)).toBe(1)
    expect(conservativeRedemptionFee(schedule,new Date('2026-03-01T00:00:00Z'),now)).toBe(0)
  })
  it('does not claim a fee when no schedule exists',()=>expect(conservativeRedemptionFee([],now,now)).toBeNull())
})
