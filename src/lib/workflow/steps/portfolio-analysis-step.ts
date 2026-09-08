import { runAnalysisPrompt } from '../analysis-prompt'
import type { StepDefinition } from '../types'
import { compactEvidence, qualityBoundary } from '../research-input'
export const portfolioAnalysisStep: StepDefinition = {
  name: 'portfolio-analysis', description: '私有持仓风险与产业暴露分析', dependencies: ['portfolio-decision', 'assess-data-quality', 'investment-advice'], estimatedDuration: 20000,
  async execute(context) {
    if (context.input.publicOnly) {
      await context.saveArtifact('portfolio-analysis', null, 'DATA')
      return
    }
    const destination = new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin
    if (context.input.portfolioAiConsent !== destination) throw new Error('需要明确授权将持仓名称、代码与比例发送至 ' + destination + '。账户金额、邮箱和份额不会发送。')
    const evidence = context.artifacts.get('portfolio-evidence') || {}
    const holdings = (Array.isArray(evidence.holdings) ? evidence.holdings : []) as Array<Record<string, unknown>>
    const redacted = { asOf: evidence.asOf, holdingCount: evidence.holdingCount, cashWeightPct: evidence.cashWeightPct, topFiveWeightPct: evidence.topFiveWeightPct, industryWeightPct: evidence.industryWeightPct, riskBudget: evidence.riskBudget, holdings: holdings.map(row => ({ ticker: row.ticker, name: row.name, category: row.category, industry: row.industry, weightPct: row.weightPct, fundType: row.fundType, targetEtfCode: row.targetEtfCode, targetIndexCode: row.targetIndexCode, mappingConfidence: row.mappingConfidence, redemptionFeeKnown: typeof row.redemptionFeePct === 'number', costKnown: typeof row.costNav === 'number' })) }
    const investmentConclusion = compactEvidence(context.artifacts.get('investment-advice'))
    const prompt = '基于以下持仓比例快照、最终综合投资结论和确定性组合门禁结果，给出账户本人的组合调整解释。必须明确说明综合结论如何作用于当前产业暴露、现金缓冲和逐基金动作，并指出最有价值的优先调整项与暂不调整项。不要改变程序计算的目标区间、金额或可执行状态；不要猜测收益率、成本或实时价格。分类不是穿透持仓；未通过全部门禁时不得给出确定交易指令。输出简洁中文Markdown，供账户本人阅读，不用于社媒。\n综合投资结论：' + JSON.stringify(investmentConclusion) + '\n持仓比例：' + JSON.stringify(compactEvidence(redacted)) + '\n组合门禁：' + JSON.stringify(compactEvidence(context.artifacts.get('portfolio-decision-support'))) + '\n市场质量：' + JSON.stringify(qualityBoundary(context.artifacts.get('data-quality')))
    const result = await runAnalysisPrompt(context, { system: '你是审慎的组合风险研究员。', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 })
    await context.saveArtifact('portfolio-analysis', result.content[0].text, 'DATA')
    await context.updateProgress(1,1,'私有组合分析完成')
  }
}
