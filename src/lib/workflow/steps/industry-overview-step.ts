import { RESEARCH_INPUT_CHARACTERS } from '../research-budgets'
import { runAnalysisPrompt } from '../analysis-prompt'
import { auditedResearchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'
import { workflowEffort } from '../method-config'

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

    const prompt = await auditedResearchPrompt(context, 'industry-overview')

    let result:string
    try{
      const response = await runAnalysisPrompt(context, {
        model:process.env.CLAUDE_MODEL||process.env.CLAUDE_FAST_MODEL,
        max_tokens:4096,
        maxInputCharacters:RESEARCH_INPUT_CHARACTERS['industry-overview'],
        effort:workflowEffort(context,'industry-overview'),
        timeoutMs:240000,
        maxAttempts:2,
        retryTimeouts:true,
        validateOutput:(text)=>validateResearchOutput(text,'industry-overview'),
      system: RESEARCH_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('industry-overview-ai-status',{status:'completed'},'DATA')
    }catch(error){
      await context.saveArtifact('industry-overview-ai-status',{status:'failed',reason:'智能行业总览未完成；未使用规则生成替代观点'},'DATA')
      throw error
    }

    await saveValidatedResearchOutput(context,'industry-overview',result)
    await context.updateProgress(1, 1, '行业总览完成')
  }
}
