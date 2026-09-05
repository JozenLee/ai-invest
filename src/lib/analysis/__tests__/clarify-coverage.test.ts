import {describe,it,expect} from 'vitest'
import {clarifyCoverageLanguage} from '../clarify-coverage'
describe('research coverage wording',()=>{
  it('does not confuse technical usability with ETF subscription coverage',()=>{
    expect(clarifyCoverageLanguage('ETF覆盖率为0%，不能判断趋势。',18)).toBe('可用于决策的技术证据覆盖率为0%（已关联18只ETF），不能判断趋势。')
    expect(clarifyCoverageLanguage('ETF覆盖率100%。',18)).toBe('ETF覆盖率100%。')
  })
})
