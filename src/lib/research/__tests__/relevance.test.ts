import {describe,it,expect} from 'vitest'
import {matchesResearchDomain,researchTerms} from '../relevance'
describe('domain text relevance',()=>{
  const terms=researchTerms(['AI算力硬件','GPU/AI芯片','光模块','中科曙光'])
  it('retains domain catalysts and company-specific evidence',()=>{
    expect(matchesResearchDomain('算力平台推进资源整合','数据中心提供低成本算力',terms)).toBe(true)
    expect(matchesResearchDomain('中科曙光发布半年度报告','',terms)).toBe(true)
    expect(matchesResearchDomain('海外GPU出口限制升级','',terms)).toBe(true)
  })
  it('rejects unrelated records even if an upstream classifier tagged the domain',()=>{
    expect(matchesResearchDomain('妇幼保健院合同纠纷获立案','医疗信息系统项目',terms)).toBe(false)
    expect(matchesResearchDomain('农业育种行业会议召开','种子价格变化',terms)).toBe(false)
  })
  it('does not let generic words define a domain',()=>{
    expect(terms).not.toContain('行业');expect(terms).not.toContain('产业');expect(terms).not.toContain('硬件');expect(terms).not.toContain('科技')
    expect(terms).not.toContain('ai');expect(terms).not.toContain('人工');expect(terms).not.toContain('智能')
    expect(matchesResearchDomain('AI视频应用引发讨论','影视公司推出AIGC短剧',terms)).toBe(false)
  })
})
