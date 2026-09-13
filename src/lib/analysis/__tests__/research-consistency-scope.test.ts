import { expect, it } from 'vitest'
import { auditResearchConsistency } from '../research-consistency'
import { auditReportFacts } from '../fact-audit'

it('resolves each company inside a serialized report section instead of using the first company for all claims', () => {
  const companies = [
    { code: 'A', name: '企业甲', financials: [{ period: '2026-06-30', currency: 'CNY' }] },
    { code: 'B', name: '企业乙', financials: [{ period: '2026-06-30', currency: null }] },
  ]
  const section = JSON.stringify({ key_companies: [{ code: 'A', name: '企业甲', detail: '人民币报表' }, { code: 'B', name: '企业乙', detail: '财报币种未标注' }] })
  expect(auditResearchConsistency({ company: section }, companies)).toEqual([])
  companies[1].financials[0].currency = 'CNY'
  const issues = auditResearchConsistency({ company: section }, companies)
  expect(issues).toHaveLength(1)
  expect(issues[0].detail).toContain('企业乙')
  expect(issues[0].detail).not.toContain('企业甲')
})

it('distinguishes a future action condition from an unsupported claim of a current earnings surprise', () => {
  const future = auditReportFacts({ investmentTheses: [{ assessment: { actionConditions: ['订单超预期后，核验一致预期再重新评估'] } }] })
  expect(future.issues.some(issue => issue.code === 'unsupported-expectation')).toBe(false)
  const claim = auditReportFacts({ conclusion: '公司订单已经超预期' })
  expect(claim.issues.some(issue => issue.code === 'unsupported-expectation')).toBe(true)
})
