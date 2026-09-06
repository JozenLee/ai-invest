import { runAnalysisPrompt } from '../analysis-prompt'
import { researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput } from '../research-output'

/**
 * 步骤11: 行业总览
 */
export const industryOverviewStep: StepDefinition = {
  name: 'industry-overview',
  description: '行业总览',
  dependencies: ['assess-data-quality', 'market-analysis', 'news-analysis', 'company-analysis'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在生成行业总览...')

    const prompt = researchPrompt(context, 'industry-overview')

    const response = await runAnalysisPrompt(context, {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: RESEARCH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await saveValidatedResearchOutput(context,'industry-overview',result)
    await context.updateProgress(1, 1, '行业总览完成')
  }
}
