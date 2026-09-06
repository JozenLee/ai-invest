import { describe,it,expect } from 'vitest'
import { parseSocialReport,socialMarkdown,applyContinuityReview,compactSocialReport } from '../social-report'
describe('social report contract',()=>{
  it('does not publish unverified cross-break technical conclusions',()=>{
    const draft = { title:'观察',subtitle:'快照',takeaways:[],sections:[{title:'技术面',body:'18只ETF低于20日均线，RSI低位。'}],risks:[] }
    const validated = applyContinuityReview(draft, { continuityReview:{affectedEtfs:[{},{}]} })
    expect(validated.sections[0].body).not.toContain('18只ETF低于')
    expect(validated.sections[0].body).toContain('2只ETF')
    expect(draft.sections[0].body).toContain('18只ETF低于')
  })
  it('rejects incomplete generated documents',()=>{expect(()=>parseSocialReport('{}')).toThrow()})
  it('renders a public document without private payload fields',()=>{
    const report=parseSocialReport(JSON.stringify({title:'产业观察',subtitle:'研究快照',takeaways:['关注样本'],sections:[1,2,3].map(i=>({title:'证据'+i,body:'有来源的研究内容'})),risks:['历史不代表未来'],privatePortfolioAnalysis:'PRIVATE'}))
    expect(socialMarkdown(report)).not.toContain('PRIVATE'); expect(socialMarkdown(report)).toContain('不构成投资建议')
  })
  it('compacts only overlong version two prose and revalidates structure',()=>{
    const body='研究证据'.repeat(40)
    const report=compactSocialReport(JSON.stringify({version:2,title:'产业观察',subtitle:'研究快照',takeaways:['关注样本','关注风险','关注反证'],sections:['产业驱动','盈利质量','市场与估值','ETF映射','情景与反证','跟踪清单'].map(title=>({title,body})),risks:['历史不代表未来','数据存在缺口','不构成投资建议']}))
    expect(Array.from(report.sections[0].body)).toHaveLength(120)
    expect(report.sections[0].body.endsWith('…')).toBe(true)
  })
})
