import { describe, it, expect } from 'vitest'
import { calculateVolumeAmplification } from '../market-calculations'
describe('raw turnover calculations',()=>{
  it('requires twenty prior observations',()=>{expect(calculateVolumeAmplification([])).toBeNull()})
  it('uses prior 20 rows and converts thousand yuan to hundred million yuan',()=>{
    const rows=Array.from({length:21},(_,i)=>({trade_date:String(20260801+i),amount:i===20?200000:100000}))
    expect(calculateVolumeAmplification(rows)).toMatchObject({currentVolume:2,avgVolume:1,amplification:2,sampleCount:20})
  })
})
