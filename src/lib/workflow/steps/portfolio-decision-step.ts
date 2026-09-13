import { type RiskBudget } from '@/lib/portfolio/decision-support'
import { buildResearchPortfolioDecisionSupport } from '@/lib/portfolio/research-allocation'
import type { PlanningHolding } from '@/lib/portfolio/alternatives'
import type { InvestmentThesis } from '../hypotheses'
import { researchPortfolioAllocation } from '../portfolio-research'
import type { Evaluation } from '@/lib/research/contracts'
import { portfolioAnalysisStep } from './portfolio-analysis-step'
import type { StepDefinition } from '../types'
import type { RiskBudgetSource } from '@/lib/portfolio/risk-budget'

export const portfolioDecisionStep: StepDefinition = {
  name: 'portfolio-decision', description: '持仓穿透、风险预算与成本门禁决策', dependencies: ['fetch-portfolio', 'assess-data-quality', 'investment-advice'], estimatedDuration: 180000,
  async execute(context) {
    const portfolio = context.artifacts.get('portfolio-evidence') as { excluded?: boolean; asOf?: string | null; totalAssets?: number; cashWeightPct?: number; holdings?: PlanningHolding[]; riskBudget?: RiskBudget; riskBudgetSource?: RiskBudgetSource } | undefined
    const evaluation = context.artifacts.get('research-evaluation') as Evaluation | undefined
    if (portfolio?.excluded) { await context.saveArtifact('portfolio-decision-support', null, 'DATA'); await context.updateProgress(1, 1, '没有可用持仓，个人组合投资建议已跳过'); return }
    if (!portfolio || !evaluation || !portfolio.totalAssets || !portfolio.riskBudget) throw new Error('缺少组合快照、风险预算或规则评估')
    const consistencyPassed=['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice'].every(key=>!(context.artifacts.get(`${key}-consistency`)||[]).some((issue:{severity:string})=>issue.severity==='error'))
    const outputsPassed=['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice'].every(key=>!(context.artifacts.get(`${key}-validation`)?.issues||[]).length&&context.artifacts.get(`${key}-ai-status`)?.status!=='fallback')
    // Missing data in an unrelated ETF does not block a researched holding; product checks remain per fund.
    const qualityPassed = outputsPassed && consistencyPassed && ['available','limited'].includes(context.artifacts.get('data-quality')?.status)
    const theses = (context.artifacts.get('investment-theses') || []) as InvestmentThesis[]
    const packet = (context.artifacts.get('portfolio-product-packet') || []).map((product: Record<string, unknown>) => ({ ...product, navSeries: Array.isArray(product.navSeries) ? product.navSeries.slice(-5) : [], executionMaterials: undefined }))
    await context.updateProgress(0, 3, '正在研究真实基金的备选方案与不交易机会成本')
    const allocationResearch = await researchPortfolioAllocation(context, { evaluation, holdings: portfolio.holdings || [], totalAssets: portfolio.totalAssets, cashWeightPct: portfolio.cashWeightPct || 0, policy: portfolio.riskBudget, portfolioAsOf: portfolio.asOf || null, qualityPassed, theses, productResearch: packet })
    const thesisProducts = Object.fromEntries([...theses.map(thesis => [thesis.id, thesis.productTickers] as const), ...(allocationResearch?.fundTheses || []).map(thesis => [thesis.id, [thesis.ticker]] as const)])
    const support = buildResearchPortfolioDecisionSupport({ evaluation, holdings: portfolio.holdings || [], totalAssets: portfolio.totalAssets, cashWeightPct: portfolio.cashWeightPct || 0, policy: portfolio.riskBudget, policySource: portfolio.riskBudgetSource, dataQualityAvailable: qualityPassed, portfolioAsOf: portfolio.asOf || null, investmentAdvice: context.artifacts.get('investment-advice'), allocationResearch, thesisProducts })
    const allocationStatus = context.artifacts.get('portfolio-allocation-ai-status')
    if (allocationStatus?.status === 'fallback') {
      const reason = allocationStatus.reason || '组合研究未完成'
      support.readiness = 'blocked'
      support.summary = `${reason}；本轮不形成主动持仓建议。当前持仓快照仍作为最新账户事实保留。`
      support.gates = [{ key: 'portfolio-research', label: '组合研究', met: false, detail: reason }, ...support.gates]
      if (support.alternatives) support.alternatives = { ...support.alternatives, selectionReason: support.summary, reviewIssues: [...new Set([...support.alternatives.reviewIssues, reason])] }
    }
    const universe = context.artifacts.get('frozen-portfolio-product-research')
    support.productResearch = universe ? { ...universe, products: packet } : null
    await context.saveArtifact('portfolio-decision-support', support, 'DATA')
    context.artifacts.set('portfolio-decision-support', support)
    const snapshot = context.artifacts.get('research-snapshot')
    if (snapshot?.calendar && support.alternatives) {
      const { capturePortfolioForwardCohort, evaluatePortfolioForwardCohorts } = await import('@/lib/portfolio/forward-cohort-store')
      const { withDatabaseBusyRetry } = await import('@/lib/db/retry')
      const cohort = await withDatabaseBusyRetry(() => capturePortfolioForwardCohort({ runId: context.runId, evaluation, portfolio: context.artifacts.get('portfolio-evidence'), alternatives: support.alternatives!, calendar: snapshot.calendar, aiReview: { status: context.artifacts.get('portfolio-allocation-ai-status')?.status === 'completed' ? 'passed' : 'missing', reason: support.alternatives!.selectionReason, evidenceIds: [...new Set(theses.flatMap(thesis => thesis.evidenceIds))], reviewedAt: new Date().toISOString() } }))
      await context.saveArtifact('portfolio-forward-cohort', { id: cohort.id, recordedAt: cohort.recordedAt, status: cohort.status, gaps: cohort.gaps }, 'DATA')
      if (evaluation.baselineReport?.id) {
        const receipt = await evaluatePortfolioForwardCohorts({ reportId: evaluation.baselineReport.id, asOf: evaluation.asOf, limit: 1 })
        await context.saveArtifact('portfolio-forward-evaluation', receipt, 'DATA')
      }
    }
    await portfolioAnalysisStep.execute(context)
    await context.updateProgress(3, 3, `${support.actions.length}只实际持仓已完成研究覆盖与多方案比较`)
  },
}
