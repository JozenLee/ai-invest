import { RESEARCH_INPUT_CHARACTERS } from '../research-budgets'
import { runAnalysisPrompt } from '../analysis-prompt'
import { auditedResearchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'
import { workflowEffort } from '../method-config'

/**
 * 步骤9: 资讯分析
 */
export const newsAnalysisStep: StepDefinition = {
  name: 'news-analysis',
  description: '资讯分析',
  dependencies: ['assess-data-quality', 'etf-actions', 'fetch-news', 'freeze-research'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析资讯动态...')

    const prompt = await auditedResearchPrompt(context, 'news-analysis')

    let result:string
    try{
      const response = await runAnalysisPrompt(context, {model:process.env.CLAUDE_FAST_MODEL||process.env.CLAUDE_MODEL,max_tokens:4096,maxInputCharacters:RESEARCH_INPUT_CHARACTERS['news-analysis'],effort:workflowEffort(context,'news-analysis'),timeoutMs:180000,maxAttempts:2,validateOutput:(text)=>validateResearchOutput(text,'news-analysis'),system: RESEARCH_SYSTEM,messages: [{ role: 'user', content: prompt }],temperature: 0.1})
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('news-analysis-ai-status',{status:'completed'},'DATA')
    }catch(error){
      await context.saveArtifact('news-analysis-ai-status',{status:'failed',reason:'智能新闻研判未完成；未使用规则生成替代观点'},'DATA')
      throw error
    }

    await saveValidatedResearchOutput(context,'news-analysis',result)
    await context.updateProgress(1, 1, '资讯分析完成')
  }
}
