import { buildPortfolioDecisionSupport, type PortfolioHoldingInput, type RiskBudget } from '@/lib/portfolio/decision-support'
import type { Evaluation } from '@/lib/research/contracts'
import type { StepDefinition } from '../types'

export const portfolioDecisionStep: StepDefinition = {
  name: 'portfolio-decision', description: '持仓穿透、风险预算与成本门禁决策', dependencies: ['fetch-portfolio', 'etf-actions', 'assess-data-quality', 'investment-advice'], estimatedDuration: 1200,
  async execute(context) {
    const portfolio = context.artifacts.get('portfolio-evidence') as { excluded?: boolean; asOf?: string | null; totalAssets?: number; cashWeightPct?: number; holdings?: PortfolioHoldingInput[]; riskBudget?: RiskBudget } | undefined
    const evaluation = context.artifacts.get('research-evaluation') as Evaluation | undefined
    if (portfolio?.excluded) { await context.saveArtifact('portfolio-decision-support', null, 'DATA'); await context.updateProgress(1, 1, '没有可用持仓，个人组合投资建议已跳过'); return }
    if (!portfolio || !evaluation || !portfolio.totalAssets || !portfolio.riskBudget) throw new Error('缺少组合快照、风险预算或规则评估')
    const support = buildPortfolioDecisionSupport({ evaluation, holdings: portfolio.holdings || [], totalAssets: portfolio.totalAssets, cashWeightPct: portfolio.cashWeightPct || 0, policy: portfolio.riskBudget, dataQualityAvailable: context.artifacts.get('data-quality')?.status === 'available', portfolioAsOf: portfolio.asOf || null, investmentAdvice: context.artifacts.get('investment-advice') })
    await context.saveArtifact('portfolio-decision-support', support, 'DATA')
    await context.updateProgress(1, 1, `${support.actions.length}只实际持仓已生成投资建议；综合置信度 ${support.confidencePct.toFixed(1)}%`)
  },
}
