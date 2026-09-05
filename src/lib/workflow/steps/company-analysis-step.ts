import { runAnalysisPrompt } from '../analysis-prompt'
import { researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput } from '../research-output'

/**
 * 步骤10: 企业分析
 */
export const companyAnalysisStep: StepDefinition = {
  name: 'company-analysis',
  description: '企业分析',
  dependencies: ['assess-data-quality', 'fetch-company-data'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析企业基本面...')

    const prompt = researchPrompt(context, 'company-analysis')

    const response = await runAnalysisPrompt(context, {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: RESEARCH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await saveValidatedResearchOutput(context,'company-analysis',result)
    await context.updateProgress(1, 1, '企业分析完成')
  }
}
