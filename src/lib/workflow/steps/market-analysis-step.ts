import { runAnalysisPrompt } from '../analysis-prompt'
import { researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput } from '../research-output'

/**
 * 步骤8: 市场分析
 */
export const marketAnalysisStep: StepDefinition = {
  name: 'market-analysis',
  description: '市场分析',
  dependencies: ['assess-data-quality', 'fetch-etf-data', 'fetch-market-snapshot', 'calculate-market-trends'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析市场趋势...')

    const prompt = researchPrompt(context, 'market-analysis')

    const response = await runAnalysisPrompt(context, {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: RESEARCH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await saveValidatedResearchOutput(context,'market-analysis',result)
    await context.updateProgress(1, 1, '市场分析完成')
  }
}
