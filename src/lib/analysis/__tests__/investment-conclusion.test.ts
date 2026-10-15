import { describe, expect, it } from 'vitest'
import { normalizeAIProductDecisions, normalizeExecutiveConclusion } from '../investment-conclusion'

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

  it('requires one bounded AI decision for every product in the allowed universe',()=>{
    const rows=[{ticker:'159995',unheldAction:'建仓',heldAction:'加仓',suggestedAdjustmentPct:12,confidencePct:88,reason:'多模块改善',trigger:'趋势延续',invalidation:'盈利反转',evidenceIds:['e1']}]
    expect(normalizeAIProductDecisions(rows,['159995'],true)[0]).toMatchObject({ticker:'159995',suggestedAdjustmentPct:12,decisionSource:'ai'})
    expect(()=>normalizeAIProductDecisions(rows,['159995','588200'],true)).toThrow('缺少588200')
    expect(()=>normalizeAIProductDecisions([{...rows[0],suggestedAdjustmentPct:0}],['159995'],true)).toThrow('范围不完整')
  })

  it('canonicalizes a signed reduction into the unsigned magnitude consumed by portfolio constraints',()=>{
    const rows=[{ticker:'159995',unheldAction:'观望',heldAction:'减仓',suggestedAdjustmentPct:-2,confidencePct:76,reason:'风险证据增强',trigger:'指数连续两日收盘弱于趋势线',invalidation:'指数收盘重新站上趋势线',quantitativeOverride:null,evidenceIds:['e1']}]
    expect(normalizeAIProductDecisions(rows,['159995'],true)[0]).toMatchObject({ticker:'159995',heldAction:'减仓',suggestedAdjustmentPct:2})
  })

  it('rejects a negative adjustment when the action is not a reduction',()=>{
    const rows=[{ticker:'159995',unheldAction:'建仓',heldAction:'加仓',suggestedAdjustmentPct:-2,confidencePct:76,reason:'证据改善',trigger:'指数连续两日收盘站上趋势线',invalidation:'指数收盘跌回趋势线下方',quantitativeOverride:null,evidenceIds:['e1']}]
    expect(()=>normalizeAIProductDecisions(rows,['159995'],true)).toThrow('范围不完整')
  })
})

it('does not compile a bullish recovery trigger into a risk-reduction instruction',async()=>{
  const {decisionSemanticIssues}=await import('../investment-conclusion')
  expect(decisionSemanticIssues({heldAction:'减仓',unheldAction:'观望',trigger:'连续3日净流入',triggerConditionKeys:['flow'],triggerConditionStates:{flow:'met'}})).toHaveLength(2)
  expect(decisionSemanticIssues({heldAction:'减仓',unheldAction:'观望',trigger:'领域多日均值低于零',triggerConditionKeys:['flow'],triggerConditionStates:{flow:'unmet'}})).toEqual([])
  expect(decisionSemanticIssues({heldAction:'持有',unheldAction:'观望',trigger:'未来连续3日净流入才考虑建仓',triggerConditionKeys:['flow'],triggerConditionStates:{flow:'met'}})).toEqual([])
})

it('distinguishes abstention from holding through risk-off and never certifies it as execution-ready',async()=>{
  const {discloseQuantitativeOverrides,attachExecutionContracts}=await import('../investment-conclusion')
  const {evaluateResearch}=await import('@/lib/research/engine')
  const {fixture}=await import('@/lib/research/__tests__/fixtures')
  const evaluation=evaluateResearch(fixture())
  const [watch]=normalizeAIProductDecisions([{ticker:'159995',unheldAction:'观望',heldAction:'观望',suggestedAdjustmentPct:0,confidencePct:0,reason:'缺少足够证据',trigger:'补齐证据',invalidation:'更新证据',evidenceIds:['raw-one']}],['159995'],true)
  const states=[{ticker:'159995',state:'risk-off'}]
  expect(discloseQuantitativeOverrides([watch],states).disclosed).toEqual([])
  expect(discloseQuantitativeOverrides([{...watch,heldAction:'持有'}],states).disclosed).toEqual(['159995'])
  expect(attachExecutionContracts([watch],evaluation)[0].executionContract.status).toBe('manual-review')
})
