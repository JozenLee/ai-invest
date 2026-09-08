import { describe, expect, it } from 'vitest'
import { selectResearchOrderbook } from '../orderbook'
import { holdingPeriod, securityCode } from '../normalization'

const quote = {code:'159995',date:'2026-09-07',publishedAt:'2026-09-07T06:16:00Z',bid:1,ask:1.001}
describe('frozen product observations',()=>{
  it('uses todays fresh order book independently of Friday close data',()=>{
    expect(selectResearchOrderbook([quote],'159995','2026-09-07T06:17:00Z','2026-09-04',true)).toEqual(quote)
    expect(selectResearchOrderbook([quote],'159995','2026-09-07T06:22:00Z','2026-09-04',true)).toBeUndefined()
    expect(selectResearchOrderbook([quote],'159995','2026-09-07T06:15:00Z','2026-09-04',true)).toBeUndefined()
  })
  it('rejects crossed books, wrong symbols and dates inconsistent with source timestamps',()=>{
    for(const bad of [{...quote,bid:2},{...quote,code:'159801'},{...quote,publishedAt:'2026-09-04T06:16:00Z'}]) {
      expect(selectResearchOrderbook([bad],'159995','2026-09-07T06:17:00Z','2026-09-04',true)).toBeUndefined()
    }
  })
  it('normalizes legacy public period labels and Hong Kong aliases',()=>{
    expect(holdingPeriod('2026年2季度股票投资明细 来源：天天基金 截止至：2026-06-30')).toBe('2026-06-30')
    expect(holdingPeriod('2026年2季度')).toBeNull()
    expect(securityCode('00700.HK')).toBe(securityCode('0700.HK'))
    expect(securityCode('00700.HK')).toBe('700.hk')
  })
})
