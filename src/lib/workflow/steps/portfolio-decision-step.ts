import { prisma } from '@/lib/db'
import { buildPortfolioDecisionSupport, type PortfolioHoldingInput, type RiskBudget } from '@/lib/portfolio/decision-support'
import type { Evaluation, ResearchSnapshot } from '@/lib/research/contracts'
import type { ReplayLedgerEntry } from '@/lib/research/replay'
import { summarizeValidation } from '@/lib/research/validation'
import type { StepDefinition } from '../types'

const parse = <T,>(value: string): T | null => { try { return JSON.parse(value) as T } catch { return null } }

export const portfolioDecisionStep: StepDefinition = {
  name: 'portfolio-decision', description: '持仓穿透、风险预算、成本与验证门禁决策', dependencies: ['fetch-portfolio', 'etf-actions', 'assess-data-quality'], estimatedDuration: 1200,
  async execute(context) {
    const portfolio = context.artifacts.get('portfolio-evidence') as { excluded?: boolean; asOf?: string | null; totalAssets?: number; cashWeightPct?: number; holdings?: PortfolioHoldingInput[]; riskBudget?: RiskBudget } | undefined
    const evaluation = context.artifacts.get('research-evaluation') as Evaluation | undefined
    if (portfolio?.excluded) { await context.saveArtifact('portfolio-decision-support', null, 'DATA'); await context.updateProgress(1, 1, '没有可用持仓，个人组合投资建议已跳过'); return }
    if (!portfolio || !evaluation || !portfolio.totalAssets || !portfolio.riskBudget) throw new Error('缺少组合快照、风险预算或规则评估')
    const ledger = await prisma.rawPayload.findMany({ where: { datasetKey: 'research_validation_ledger', targetCode: evaluation.profile.industryId }, orderBy: { fetchedAt: 'asc' }, take: 600, select: { payload: true } })
    const entries = ledger.flatMap(row => { const value = parse<{ snapshot?: ResearchSnapshot; evaluation?: Evaluation }>(row.payload); return value?.snapshot && value.evaluation ? [{ snapshot: value.snapshot, evaluation: value.evaluation } satisfies ReplayLedgerEntry] : [] })
    const validation = summarizeValidation(entries)
    const support = buildPortfolioDecisionSupport({ evaluation, holdings: portfolio.holdings || [], totalAssets: portfolio.totalAssets, cashWeightPct: portfolio.cashWeightPct || 0, policy: portfolio.riskBudget, dataQualityAvailable: context.artifacts.get('data-quality')?.status === 'available', validationApproved: validation.tradeApproved, portfolioAsOf: portfolio.asOf || null })
    await context.saveArtifact('portfolio-decision-support', support, 'DATA')
    await context.saveArtifact('portfolio-decision-validation', validation, 'DATA')
    await context.updateProgress(1, 1, `${support.actions.length}只实际持仓已生成投资建议；综合置信度 ${support.confidencePct.toFixed(1)}%`)
  },
}
