import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'
import { comparePortfolioAlternatives, type AllocationResearch, type PlanningHolding } from '@/lib/portfolio/alternatives'
import type { RiskBudget } from '@/lib/portfolio/decision-support'
import type { InvestmentThesis } from '../hypotheses'
import type { StepContext } from '../types'

vi.mock('../analysis-prompt', () => ({ runAnalysisPrompt: vi.fn(), recoverableAnalysisError: (error: Error) => /timeout|输出校验失败/.test(error.message) }))
import { runAnalysisPrompt } from '../analysis-prompt'
import { researchPortfolioAllocation } from '../portfolio-research'

const totalAssets = 987654.32
const evidenceId = 'event-one'
const thesisId = 'orders-cashflow'
const ticker = '159995'
const destination = 'https://example.invalid'

function setup() {
  const snapshot = fixture(), evaluation = evaluateResearch(snapshot)
  const policy: RiskBudget = { riskProfile: 'moderate', investHorizon: 'medium', minCashRatio: .1, maxFundRatio: .5, maxIndustryRatio: .4, maxSingleAdjustmentRatio: .1, stagedAdjustment: true }
  const holdings: PlanningHolding[] = [{ ticker, name: '测试芯片基金', industry: evaluation.profile.name, weightPct: 30, marketValue: totalAssets * .3, quantity: totalAssets * .3 / 2, unitNav: 2, navDate: '2026-09-04', researchReady: true, researchEvidenceIds: [evidenceId], redemptionFeePct: null, buyFeePct: 0, settlementDays: 3, executionGaps: ['实际持有批次赎回费待核验'] }]
  const thesis: InvestmentThesis = { id: thesisId, title: '订单回款待验证', productTickers: [ticker], evidenceIds: [evidenceId], statements: [{ kind: '推断', text: '订单须由回款确认', evidenceIds: [evidenceId] }], firstDisclosedAt: null, informationStatus: '待核验', informationDelta: '缺少回款确认', pricingStatus: '待核验', pricingEvidenceIds: [], horizonDays: 20, verification: { date: null, event: '下一期财报', metric: '经营现金流' }, counterEvidence: ['回款恢复'], invalidation: '订单现金流恢复', expectedReturnPct: null, probability: null, pressureAssumptions: [], assessment: { hypothesisId: thesisId, stance: '减配候选', rationale: '比较下行风险与错失上涨', technicalConflict: '不按均线机械减仓', actionConditions: ['核验实际费用'], alternativeToTrading: '保留核心暴露并等待验证' } }
  const artifacts = new Map<string, unknown>([['research-snapshot', snapshot], ['research-evaluation', evaluation]])
  const context: StepContext = { runId: 'refinement-test', stepId: 'portfolio-decision', input: { portfolioAiConsent: destination }, artifacts, updateProgress: vi.fn(), saveArtifact: vi.fn(async (key, value) => { artifacts.set(key, value) }) }
  const input = { evaluation, holdings, policy, totalAssets, cashWeightPct: 70, portfolioAsOf: snapshot.asOf, qualityPassed: true, theses: [thesis] }
  const compare = (research: AllocationResearch) => comparePortfolioAlternatives({ ...input, asOf: snapshot.asOf, industryTickers: [ticker], researchQualityPassed: true, research, thesisProducts: { [thesisId]: [ticker] } })
  return { context, input, compare }
}

function plan(bothAt20Days: boolean): AllocationResearch {
  return { version: 1, preferredId: 'reduce', selectionReason: '比较条件压力后再判断', evidenceBoundary: '实际赎回费未知，压力情景不是预测', proposals: [{ id: 'reduce', title: '保留核心暴露的部分减仓', horizonDays: 20, objective: 'risk-reduction', targets: [{ ticker, targetWeightPct: 25 }], thesisIds: [thesisId], evidenceIds: [evidenceId], whyNow: '订单兑现待回款确认', whyNotHold: '降低下行情景损失', sizingRationale: '平衡现金流风险与反弹参与', invalidation: '回款证据改善', nextReview: '下一期财报', opportunityCost: '反弹时减少参与，费用待核验' }], scenarios: [
    { id: 'down', label: '订单回款延迟', horizonDays: 20, basis: '订单事实对应的条件压力假设', evidenceIds: [evidenceId], returns: [{ ticker, lowerPct: -20, upperPct: -10 }] },
    { id: 'up', label: '订单回款恢复', horizonDays: bothAt20Days ? 20 : 90, basis: '复苏条件下的机会成本假设', evidenceIds: [evidenceId], returns: [{ ticker, lowerPct: 10, upperPct: 20 }] },
  ] }
}
const review = (selectedId: 'hold' | 'reduce') => ({ selectedId, reason: selectedId === 'reduce' ? '相同期限的下行风险改善与上涨机会成本均已比较，实际费用仍需核验' : '方案仍缺少同期不利情景，保持基线等待研究完善，不宣称收益更优', rejectedAlternatives: ['hold', 'rules', 'reduce'].filter(id => id !== selectedId).map(id => ({ id, reason: '比较依据尚不足以优于选定方案' })) })

/** Exercise real response validation and write through the real scoped context so
 * call order assertions also verify the audit namespaces. */
function modelReplies(values: unknown[], trace: string[]) {
  let index = 0
  vi.mocked(runAnalysisPrompt).mockImplementation(async (context, params) => {
    const content = params.messages[0].content
    const stage = content.startsWith('当前候选集全部不可行') ? 'portfolio-plan-refinement' : content.includes('\n计算比较：') ? 'portfolio-selection' : 'portfolio-plan'
    trace.push(stage)
    if (index >= values.length) throw new Error('Unexpected extra model call: ' + stage)
    const text = JSON.stringify(values[index++])
    await context.saveArtifact('ai-request-attempt-1', { messages: params.messages }, 'DATA')
    params.validateOutput?.(text)
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn' } as Awaited<ReturnType<typeof runAnalysisPrompt>>
  })
}

beforeEach(() => { vi.mocked(runAnalysisPrompt).mockReset(); vi.stubEnv('ANTHROPIC_BASE_URL', destination) })
afterEach(() => vi.unstubAllEnvs())

describe('one bounded portfolio plan refinement', () => {
  it('repairs mismatched horizons before independent selection without sending amounts or inventing fees', async () => {
    const { context, input, compare } = setup()
    const initial = plan(false), refined = plan(true)
    expect(compare(initial).selectedId).toBe('hold')
    expect(compare(initial).reviewIssues.join('')).toContain('不利的情景')
    expect(compare(refined).selectedId).toBe('reduce')
    const trace: string[] = []
    modelReplies([initial, refined, review('reduce')], trace)
    const result = await researchPortfolioAllocation(context, input)
    expect(trace).toEqual(['portfolio-plan', 'portfolio-plan-refinement', 'portfolio-selection'])
    expect(result?.preferredId).toBe('reduce')
    expect(result?.scenarios.map(s => s.horizonDays)).toEqual([20, 20])
    expect(context.artifacts.has('portfolio-plan-refinement-ai-request-attempt-1')).toBe(true)
    expect(context.artifacts.has('portfolio-selection-ai-request-attempt-1')).toBe(true)
    const selectionPrompt = vi.mocked(runAnalysisPrompt).mock.calls[2][1].messages[0].content
    expect(selectionPrompt).toContain('不得遗漏原技术规则对照')
    expect(selectionPrompt).toContain('选定后必须覆盖的全部对照编号集合')
    const repair = vi.mocked(runAnalysisPrompt).mock.calls[1][1].messages[0].content
    for (const secret of [input.totalAssets, input.holdings[0].marketValue, input.holdings[0].quantity]) expect(repair).not.toContain(String(secret))
    for (const key of ['"marketValue":', '"totalAssets":', '"quantity":', '"amount":', '"estimatedFee":']) expect(repair).not.toContain(key)
    expect(repair).toContain('"feesKnown":false')
    expect(repair).toContain('"feeKnown":false')
    const computed = compare(result!).alternatives.find(a => a.id === 'reduce')!
    expect(computed.totalFee).toBeNull()
    expect(computed.netCashWeightPct).toBeNull()
    expect(computed.trades[0].estimatedFee).toBeNull()
    expect(computed.stress.every(s => s.improvementVsHoldPct === null)).toBe(true)
    expect(context.artifacts.get('portfolio-allocation-ai-status')).toEqual({ status: 'completed' })
  })

  it('reuses the saved same-inputHash refinement even if it remains infeasible', async () => {
    const { context, input } = setup()
    const initial = plan(false), stillInvalid = plan(false)
    stillInvalid.proposals[0].sizingRationale = '已复核规模，但仍待补同期机会成本情景'
    const firstTrace: string[] = []
    modelReplies([initial, stillInvalid, review('hold')], firstTrace)
    expect((await researchPortfolioAllocation(context, input))?.preferredId).toBe('hold')
    expect(firstTrace).toEqual(['portfolio-plan', 'portfolio-plan-refinement', 'portfolio-selection'])
    const saved = context.artifacts.get('portfolio-plan-refinement') as { inputHash: string; research: AllocationResearch }
    const firstPrompt = vi.mocked(runAnalysisPrompt).mock.calls[0][1].messages[0].content
    const marker = '\n冻结研究与账户比例：'
    const packet = JSON.parse(firstPrompt.slice(firstPrompt.lastIndexOf(marker) + marker.length))
    expect(saved.inputHash).toBe(createHash('sha256').update(JSON.stringify({ packet, research: initial })).digest('hex'))
    expect(saved.research).toEqual(stillInvalid)
    const savedBefore = JSON.stringify(saved)
    const secondTrace: string[] = []
    vi.mocked(runAnalysisPrompt).mockReset()
    modelReplies([initial, review('hold')], secondTrace)
    const result = await researchPortfolioAllocation(context, input)
    expect(secondTrace).toEqual(['portfolio-plan', 'portfolio-selection'])
    expect(result?.proposals[0].sizingRationale).toBe(stillInvalid.proposals[0].sizingRationale)
    expect(result?.preferredId).toBe('hold')
    expect(JSON.stringify(context.artifacts.get('portfolio-plan-refinement'))).toBe(savedBefore)
    expect(context.artifacts.get('portfolio-allocation-ai-status')).toEqual({ status: 'completed' })
  })

  it('skips refinement when an initial research proposal is feasible', async () => {
    const { context, input, compare } = setup()
    const initial = plan(true)
    expect(compare(initial).selectedId).toBe('reduce')
    const trace: string[] = []
    modelReplies([initial, review('reduce')], trace)
    expect((await researchPortfolioAllocation(context, input))?.preferredId).toBe('reduce')
    expect(trace).toEqual(['portfolio-plan', 'portfolio-selection'])
    expect(context.artifacts.has('portfolio-plan-refinement')).toBe(false)
    expect(context.artifacts.has('portfolio-plan-refinement-ai-request-attempt-1')).toBe(false)
  })

  it('reports the exact omitted comparison id when review forgets the rules baseline', async () => {
    const { context, input } = setup()
    const initial = plan(true)
    const incomplete = review('hold')
    incomplete.rejectedAlternatives = incomplete.rejectedAlternatives.filter(item => item.id !== 'rules')
    const trace: string[] = []
    modelReplies([initial, incomplete], trace)
    expect(await researchPortfolioAllocation(context, input)).toBeNull()
    expect(context.artifacts.get('portfolio-allocation-ai-status')).toMatchObject({
      status: 'fallback',
      detail: expect.stringContaining('未逐一解释对照项 rules'),
    })
  })
})
