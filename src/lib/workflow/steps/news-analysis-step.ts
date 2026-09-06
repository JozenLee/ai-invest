import { runAnalysisPrompt } from '../analysis-prompt'
import { researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput } from '../research-output'

/**
 * 步骤9: 资讯分析
 */
export const newsAnalysisStep: StepDefinition = {
  name: 'news-analysis',
  description: '资讯分析',
  dependencies: ['assess-data-quality', 'fetch-news'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析资讯动态...')

    const prompt = researchPrompt(context, 'news-analysis')

    const response = await runAnalysisPrompt(context, {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: RESEARCH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await saveValidatedResearchOutput(context,'news-analysis',result)
    await context.updateProgress(1, 1, '资讯分析完成')
  }
}
