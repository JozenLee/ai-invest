import { runAnalysisPrompt } from '../analysis-prompt'
import type { StepDefinition } from '../types'
import { compactEvidence, qualityBoundary } from '../research-input'
export const portfolioAnalysisStep: StepDefinition = {
  name: 'portfolio-analysis', description: '私有持仓风险与产业暴露分析', dependencies: ['fetch-portfolio', 'assess-data-quality'], estimatedDuration: 20000,
  async execute(context) {
    if (context.input.publicOnly) {
      await context.saveArtifact('portfolio-analysis', null, 'DATA')
      return
    }
    const destination = new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin
    if (context.input.portfolioAiConsent !== destination) throw new Error('需要明确授权将持仓名称、代码与比例发送至 ' + destination + '。账户金额、邮箱和份额不会发送。')
    const prompt = '基于以下持仓快照分析现金缓冲、前五集中度、产业暴露与数据缺口。不要猜测收益率、成本或实时价格。分类不是穿透持仓；不得给出确定交易指令。输出简洁中文Markdown，供账户本人阅读，不用于社媒。\n' + JSON.stringify(compactEvidence(context.artifacts.get('portfolio-evidence'))) + '\n市场质量：' + JSON.stringify(qualityBoundary(context.artifacts.get('data-quality')))
    const result = await runAnalysisPrompt(context, { system: '你是审慎的组合风险研究员。', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 })
    await context.saveArtifact('portfolio-analysis', result.content[0].text, 'DATA')
    await context.updateProgress(1,1,'私有组合分析完成')
  }
}
