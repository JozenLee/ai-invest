import { describe, expect, it, vi } from 'vitest'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { independentHypothesisInput, HYPOTHESIS_INPUT_MAX_CHARS, HYPOTHESIS_SYSTEM, HYPOTHESIS_TASK, hypothesisValidationScope, validateInvestmentHypotheses, validateInvestmentTheses, assembleInvestmentTheses, type InvestmentHypothesis } from '../hypotheses'
import { scopedAnalysisContext } from '../scoped-analysis-context'
import { researchPrompt } from '../research-input'
import type { StepContext } from '../types'

function context(entries: Array<[string, unknown]> = []): StepContext {
  const artifacts = new Map(entries)
  return { runId: 'run', stepId: 'step', input: { totalAssets: 987654321 }, artifacts, updateProgress: vi.fn(), saveArtifact: vi.fn(async (key, value) => { artifacts.set(key, value) }) }
}
export function hypothesis(): InvestmentHypothesis {
  return { id: 'chip-demand', title: '订单兑现需要回款确认', productTickers: ['159995'], evidenceIds: ['event-one'], statements: [{ kind: '事实', text: '公告披露新增订单', evidenceIds: ['event-one'] }, { kind: '推断', text: '订单可能传导至收入', evidenceIds: ['event-one'] }], firstDisclosedAt: null, informationStatus: '待核验', informationDelta: '缺少历史订单比较', pricingStatus: '待核验', pricingEvidenceIds: [], horizonDays: 120, verification: { date: null, event: '下一期财报披露', metric: '收入和经营现金流' }, counterEvidence: ['回款尚未确认'], invalidation: '订单取消或回款持续恶化', expectedReturnPct: null, probability: null, pressureAssumptions: [] }
}
const assessment = { hypothesisId: 'chip-demand', stance: '维持观察', rationale: '现有证据尚不支持操作优于持有', technicalConflict: '均线偏弱不足以否定长期订单兑现假设', actionConditions: ['核验订单回款'], alternativeToTrading: '等待下一期财报以避免无信息优势的换手' }

describe('independent public research boundary', () => {
  it('does not transmit upstream opinions, technical rules, account data or live projections', () => {
    const snapshot = fixture()
    snapshot.projections = { 'fetch-company-data': { 'company-market-data': [{ stockCode: '600000', stockName: '公开公司', rating: 'SELL_SENTINEL', indicators: { state: 'SELL_SENTINEL' }, privateHoldings: [{ amount: 987654321 }], financials: [{ evidenceId: 'event-one', period: '2026-06-30', source: '公司公告', currency: 'CNY', metrics: [{ label: '营收同比', value: 20, private: 987654321 }] }] }] } }
    const ctx = context([['research-snapshot', snapshot], ['research-evaluation', { decisions: [{ state: 'SELL_SENTINEL', heldAction: 'SELL_SENTINEL', metrics: {}, conditions: [] }] }], ['sourceModules', { analysis: 'SELL_SENTINEL' }], ['market-analysis', 'SELL_SENTINEL'], ['company-analysis', 'SELL_SENTINEL'], ['industry-overview', { analysis: 'SELL_SENTINEL' }], ['portfolio-evidence', { amount: 987654321, holdings: ['PRIVATE_FUND'] }], ['company-market-data', [{ stockName: 'LIVE_SENTINEL' }]], ['data-quality', { modules: { portfolio: { detail: 'PRIVATE_FUND' } } }]])
    const input = independentHypothesisInput(ctx)
    const serialized = JSON.stringify(input)
    for (const secret of ['SELL_SENTINEL', '987654321', 'PRIVATE_FUND', 'LIVE_SENTINEL', 'sourceModules', 'overview', 'ruleBoundary']) expect(serialized).not.toContain(secret)
    expect(serialized).toContain('公开公司')
    expect(serialized).toContain('新增订单')
    expect(input.products[0].valuation).toMatchObject({ pe: 20, pb: 2 })
    expect(input.citationRegistry).toContainEqual(expect.objectContaining({ id: 'event-one' }))
    expect(researchPrompt(ctx, 'investment-hypotheses')).not.toContain('SELL_SENTINEL')
    expect(researchPrompt(ctx, 'investment-advice')).not.toContain('PRIVATE_FUND')
  })
  it('fails closed on a missing snapshot instead of falling back to upstream narrative', () => {
    const input = independentHypothesisInput(context([['company-market-data', [{ stockName: 'LIVE_SENTINEL' }]], ['investment-advice', { rating: 'SELL_SENTINEL' }]]))
    expect(input.products).toEqual([])
    expect(input.companies).toEqual([])
    expect(input.citationRegistry).toEqual([])
  })
})

describe('investment thesis contract', () => {
  const scope = { productTickers: ['159995'], evidenceIds: ['event-one'], asOf: '2026-09-04T09:00:00Z' }
  it('retains a thesis that disagrees with technical rules without inventing forecasts', () => {
    const h = hypothesis()
    h.pressureAssumptions = [{ label: '估值下调压力，非预测', valuePct: -20, notForecast: true }]
    const result = assembleInvestmentTheses(validateInvestmentHypotheses([h], scope), [assessment])
    expect(validateInvestmentTheses(result, scope)[0]).toEqual({ ...h, assessment })
    expect(result[0].assessment.technicalConflict).toContain('不足以否定')
    expect(hypothesisValidationScope(independentHypothesisInput(context([['research-snapshot', fixture()]]))).productTickers).toEqual(['159995'])
  })
  it.each([
    { productTickers: ['PRIVATE_FUND'] }, { informationStatus: '新增经济信息' }, { pricingStatus: '未反映', pricingEvidenceIds: ['event-one'] }, { informationDelta: '有70%概率兑现' }, { evidenceIds: ['invented'] }, { probability: 0.7 }, { expectedReturnPct: 12 },
    { statements: [{ kind: '事实', text: '无来源数字', evidenceIds: [] }] }, { horizonDays: 0 },
    { firstDisclosedAt: '2027-01-01' }, { firstDisclosedAt: '2026-02-30' }, { informationStatus: '首次披露' },
    { pricingStatus: '未反映', pricingEvidenceIds: [] }, { counterEvidence: [] }, { invalidation: '' },
    { pressureAssumptions: [{ label: '预测', valuePct: 20, notForecast: false }] },
  ])('rejects unsupported or malformed claims: %j', patch => {
    expect(() => validateInvestmentHypotheses([{ ...hypothesis(), ...patch }], scope)).toThrow('输出校验失败')
  })
  it('promotes valid child citations omitted from the parent without changing the saved response', () => {
    const childId='d96148'+'a'.repeat(58)
    const pricingId='d12c'+'b'.repeat(60)
    const h=hypothesis()
    h.statements[0].evidenceIds=[childId,childId]
    h.pricingEvidenceIds=[pricingId]
    const before=JSON.stringify(h)
    const result=validateInvestmentHypotheses([h], {...scope,evidenceIds:[...scope.evidenceIds,childId,pricingId]})[0]
    expect(result.evidenceIds).toEqual(['event-one',childId,pricingId])
    expect(result.statements[0].evidenceIds).toEqual([childId])
    expect(JSON.stringify(h)).toBe(before)
    const emptyParent={...h,evidenceIds:[]}
    expect(validateInvestmentHypotheses([emptyParent], {...scope,evidenceIds:[...scope.evidenceIds,childId,pricingId]})[0].evidenceIds).toEqual([childId,'event-one',pricingId])
  })
  it('rejects genuinely out-of-scope child ids with the exact id and statement path', () => {
    const illegal='1308'+'f'.repeat(60)
    const h=hypothesis()
    h.statements[1].evidenceIds=[illegal]
    expect(()=>validateInvestmentHypotheses([h],scope)).toThrow(`chip-demand.statements[1].evidenceIds含冻结scope外编号：${illegal}`)
    // Putting the same illegal ID in the parent cannot launder it into scope.
    h.evidenceIds.push(illegal)
    expect(()=>validateInvestmentHypotheses([h],scope)).toThrow(illegal)
  })
  it('requires every original hypothesis exactly once and strips undeclared private/order fields', () => {
    expect(() => assembleInvestmentTheses([hypothesis()], [])).toThrow('遗漏')
    expect(() => assembleInvestmentTheses([hypothesis()], [{ ...assessment, hypothesisId: 'fabricated' }])).toThrow('未知')
    const result = validateInvestmentTheses([{ ...hypothesis(), accountAmount: 12345, assessment: { ...assessment, targetWeight: 10 } }], scope)
    expect(JSON.stringify(result)).not.toContain('accountAmount')
    expect(JSON.stringify(result)).not.toContain('targetWeight')
  })
})

describe('substage request audit isolation', () => {
  it('preserves stage and resumed attempts and shares global service blocks', async () => {
    const ctx = context([['ai-request-attempt-9', { legacy: true }]])
    ctx.previousAIRequestAttempt = 9
    const first = scopedAnalysisContext(ctx, 'investment-advice-hypotheses')
    expect(first.stepId).toBe(ctx.stepId)
    expect(first.previousAIRequestAttempt).toBe(0)
    await first.saveArtifact('ai-request-attempt-1', { stage: 'first' }, 'DATA')
    await first.saveArtifact('ai-response-attempt-1', { stage: 'first-response' }, 'DATA')
    const second = scopedAnalysisContext(ctx, 'investment-advice-synthesis')
    await second.saveArtifact('ai-request-attempt-1', { stage: 'second' }, 'DATA')
    await second.saveArtifact('ai-service-status', { status: 'billing-blocked' }, 'DATA')
    expect(ctx.artifacts.get('investment-advice-hypotheses-ai-request-attempt-1')).toEqual({ stage: 'first' })
    expect(ctx.artifacts.get('investment-advice-synthesis-ai-request-attempt-1')).toEqual({ stage: 'second' })
    expect(ctx.artifacts.get('ai-request-attempt-9')).toEqual({ legacy: true })
    const resumed = scopedAnalysisContext(ctx, 'investment-advice-hypotheses')
    expect(resumed.previousAIRequestAttempt).toBe(1)
    expect(resumed.artifacts.get('ai-service-status')).toEqual({ status: 'billing-blocked' })
    expect(resumed.artifacts.get('ai-request-attempt-1')).toEqual({ stage: 'first' })
    expect(resumed.artifacts.has('ai-request-attempt-9')).toBe(false)
  })
})


describe('bounded large frozen evidence regression', () => {
  it('bounds million-character sources with complete ids, full-universe statistics and stratified examples', () => {
    const snapshot = fixture()
    snapshot.companies = Array.from({length: 120}, (_, i) => ({...snapshot.companies[0], code: String(600000+i), segment: '环节'+i%12, evidenceIds:['event-one'], profitGrowthPct:i-60}))
    snapshot.projections = {'fetch-company-data':{'company-market-data':snapshot.companies.map((c,i)=>({stockCode:c.code,stockName:c.name,segment:c.segment,financials:[0,1,2].map(n=>({evidenceId:'event-one',reportType:n===0?'利润表':'现金流量表',period:n===2?'2025-12-31':'2026-06-30',source:'公司公告',metrics:Array.from({length:40},(_,m)=>({label:'净利润指标'+m,value:i+m}))}))}))}}
    snapshot.events = Array.from({length:1500},(_,i)=>({...snapshot.events[0],id:'event-'+i, priority:i%5, companies:[snapshot.companies[i%120].code], sourceTier:i%2?'secondary':'primary', excerpt:'冻结公告正文'.repeat(160), sources:Array.from({length:30},(_,n)=>'公开来源'+n)}))
    const before=JSON.stringify(snapshot)
    expect(before.length).toBeGreaterThan(1_000_320)
    const ctx=context([['research-snapshot',snapshot]])
    const input=independentHypothesisInput(ctx)
    expect(JSON.stringify(input).length).toBeLessThanOrEqual(HYPOTHESIS_INPUT_MAX_CHARS)
    expect(JSON.stringify(input).length+HYPOTHESIS_SYSTEM.length+HYPOTHESIS_TASK.length+20).toBeLessThan(80_000)
    expect(input.selection.serializedCharacters).toBe(JSON.stringify(input).length)
    expect(input.companyUniverse.companyCount).toBe(120)
    expect(input.companyUniverse.profitGrowthKnown).toBe(120)
    expect(input.companies).toHaveLength(10)
    expect(new Set(input.companies.map(c=>c.segment)).size).toBe(10)
    for(const c of input.companies){const reports=c.financials as Array<{period:string;metrics:unknown[]}>;expect(reports).toHaveLength(2);expect(new Set(reports.map(r=>r.period)).size).toBe(1);expect(reports.every(r=>r.metrics.length<=6)).toBe(true)}
    expect(input.events).toHaveLength(12)
    expect(input.selection.events.excluded).toBe(1488)
    expect(input.events.every(e=>e.sourceTier==='primary')).toBe(true)
    expect(input.citationRegistry.some(e=>e.id==='event-one')).toBe(true)
    expect(JSON.stringify(snapshot)).toBe(before)
    expect(ctx.artifacts.get('research-citations-investment-hypotheses')).toEqual(expect.arrayContaining([expect.objectContaining({inputEvidenceIds:['event-one'],value:expect.objectContaining({companyCount:120})})]))
  })
  it('evicts complete oversized records instead of truncating evidence ids or source fields',()=>{
    const snapshot=fixture()
    snapshot.events[0].sources=['巨型来源'.repeat(40_000)]
    snapshot.evidence[0].source='巨型来源'.repeat(40_000)
    const input=independentHypothesisInput(context([['research-snapshot',snapshot]]))
    expect(JSON.stringify(input).length).toBeLessThanOrEqual(HYPOTHESIS_INPUT_MAX_CHARS)
    expect(input.events).toEqual([])
    expect(input.selection.events.excludedByBudget).toBe(1)
    expect(input.selection.products.excluded).toBe(1)
  })
})
