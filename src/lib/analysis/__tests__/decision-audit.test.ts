import { describe,it,expect } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { validateDecisionFacts,auditDecisionEvidence } from '../decision-audit'
import { attachExecutionContracts,normalizeAIProductDecisions } from '../investment-conclusion'
import { normalizeSocialReport } from '../social-report'

describe('real report failure regressions',()=>{
  it('rejects a 100x spread unit error in executive prose without silently repairing it',()=>{
    const evaluation=evaluateResearch(fixture())
    evaluation.decisions[0].conditions.find(row=>row.key==='spread')!.value=20.498804
    expect(()=>validateDecisionFacts({executiveSummary:{mainRisks:['买卖价差20.50%超20%门槛']}},evaluation)).toThrow('数值事实校验失败')
    expect(()=>validateDecisionFacts({reason:'买卖价差0.205%超0.20%门槛'},evaluation)).not.toThrow()
    expect(()=>validateDecisionFacts({reason:'买卖价差20.50基点，略超20基点'},evaluation)).not.toThrow()
  })
  it('does not equate valid citations with missing product evidence',()=>{
    expect(auditDecisionEvidence({productDecisions:[{ticker:'159995',evidenceIds:[]},{ticker:'588200',evidenceIds:['fake']}]},evaluateResearch(fixture()))).toHaveLength(2)
  })
  it('generates trigger prose from the exact monitored conditions and preserves contracts through normalization',()=>{
    const evaluation=evaluateResearch(fixture())
    const rows=normalizeAIProductDecisions([{ticker:'159995',unheldAction:'观望',heldAction:'加仓',suggestedAdjustmentPct:2,confidencePct:30,reason:'观察',trigger:'错误的模型触发文字',triggerConditionKeys:['spread'],manualReviewConditions:[],invalidation:'财报变化',evidenceIds:['raw-one']}],['159995'],true)
    const [decision]=attachExecutionContracts(rows,evaluation)
    expect(decision.trigger).toContain('基点')
    expect(decision.trigger).not.toContain('错误的模型触发文字')
    expect(decision.executionContract?.status).toBe('verified')
    expect(normalizeAIProductDecisions([decision],['159995'])[0].executionContract).toEqual(decision.executionContract)
    const [manual]=attachExecutionContracts([{...rows[0],manualReviewConditions:['订单需人工确认']}],evaluation)
    expect(manual.executionContract?.status).toBe('manual-review')
  })
  it('blocks unresolved numeric conditions and absent evidence',()=>{
    const evaluation=evaluateResearch(fixture())
    const rows=normalizeAIProductDecisions([{ticker:'159995',unheldAction:'观望',heldAction:'持有',suggestedAdjustmentPct:0,confidencePct:30,reason:'观察',trigger:'原条件',triggerConditionKeys:['made-up'],invalidation:'变化',evidenceIds:[]}],['159995'])
    expect(attachExecutionContracts(rows,evaluation)[0].executionContract?.status).toBe('blocked')
  })
  it('counts only same-session valuations in the one-page summary',()=>{
    const evaluation=evaluateResearch(fixture())
    evaluation.products![0].valuationDate='2026-09-03'
    const report=normalizeSocialReport({title:'观察',subtitle:'',takeaways:['估值：6个指数有可核验当期值。'],sections:[],risks:[]},evaluation)
    expect(report.takeaways[0]).toBe('估值：暂无可核验当期估值。')
  })
})

it('rejects complete-absence claims when factors are partially available',()=>{
  const snapshot=fixture()
  snapshot.etfs[0].factors.splice(-10,1)
  const evaluation=evaluateResearch(snapshot)
  expect(evaluation.decisions[0].adjustmentAudit).toMatchObject({status:'partial',priceDates:121,matchedFactorDates:120})
  expect(()=>validateDecisionFacts({analysis:'10只ETF复权因子全部缺失，无法验证趋势'},evaluation)).toThrow('已有复权因子')
  expect(()=>validateDecisionFacts({analysis:'复权日期覆盖不完整，暂不使用技术信号'},evaluation)).not.toThrow()
})

it('does not accept another product citation just because it exists in the snapshot',()=>{
  const evaluation=evaluateResearch(fixture())
  evaluation.evidence.push({id:'other-product',source:'other ETF',dataDate:'2026-09-04',publishedAt:null,fetchedAt:evaluation.asOf,hash:'other'})
  const issues=auditDecisionEvidence({productDecisions:[{ticker:'159995',evidenceIds:['other-product']}]},evaluation)
  expect(issues[0].reason).toContain('该产品')
})

it('rejects unconditional allocation prose that contradicts every product action',()=>{
  const evaluation=evaluateResearch(fixture())
  const productDecisions=[{ticker:'159995',unheldAction:'观望',heldAction:'减仓'}]
  expect(()=>validateDecisionFacts({productDecisions,executiveSummary:{conclusion:'159995流动性良好，可配置。'}},evaluation)).toThrow('投资结论一致性')
  expect(()=>validateDecisionFacts({productDecisions,executiveSummary:{conclusion:'159995为流动性候选，当前暂不建仓。'}},evaluation)).not.toThrow()
  expect(()=>validateDecisionFacts({productDecisions,executiveSummary:{conclusion:'待趋势确认后可配置159995。'}},evaluation)).not.toThrow()
})

it('separates liquidity qualification from a selected shortlist',()=>{
  const evaluation=evaluateResearch(fixture())
  expect(()=>validateDecisionFacts('流动性合格产品仅三只可作候选。',evaluation)).toThrow('成交额门槛实际有1只达标')
  expect(()=>validateDecisionFacts('流动性头部三只可作候选，成交额达标不等于可执行。',evaluation)).not.toThrow()
  expect(()=>validateDecisionFacts('流动性合格产品仅159995一只。',evaluation)).not.toThrow()
})
