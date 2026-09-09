import { describe, expect, it } from 'vitest'
import { normalizeExecutiveConclusion } from '../investment-conclusion'

describe('executive investment conclusion', () => {
  it('normalizes the decision-oriented conclusion modules', () => {
    const result = normalizeExecutiveConclusion({ executiveSummary: {
      conclusion: '  当前偏积极  ',
      allocationStance: '分批配置',
      keyDrivers: ['需求改善'],
      opportunities: [{ title: '订单兑现', status: '正在兑现', evidence: '新增订单公告', actionImplication: '复核建仓门禁' }],
      mainRisks: ['估值上行'],
      watchPoints: ['现金流'],
      actionPlan: { priority: '先核验流动性', unheld: '分批建仓', held: '继续持有' },
      historyComparison: [{ sourceDate: '2026-09-03', previousOpportunity: '订单改善', currentEvidence: '公告已发布', status: '已兑现', implication: '进入规则复核' }],
    } })
    expect(result.conclusion).toBe('当前偏积极')
    expect(result.opportunities[0]).toMatchObject({ title: '订单兑现', status: '正在兑现' })
    expect(result.historyComparison[0]).toMatchObject({ status: '已兑现', implication: '进入规则复核' })
  })

  it('keeps archived reviewTriggers as watch points', () => {
    expect(normalizeExecutiveConclusion({ conclusion: '旧观点', reviewTriggers: ['订单'] }).watchPoints).toEqual(['订单'])
  })
})
