import { RESEARCH_INPUT_CHARACTERS } from '../research-budgets'
import { runAnalysisPrompt } from '../analysis-prompt'
import { auditedResearchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { workflowEffort } from '../method-config'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'

/**
 * 步骤8: 市场分析
 */
export const marketAnalysisStep: StepDefinition = {
  name: 'market-analysis',
  description: '市场分析',
  dependencies: ['assess-data-quality', 'etf-actions', 'fetch-etf-data', 'fetch-market-snapshot', 'calculate-market-trends'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析市场趋势...')

    const prompt = await auditedResearchPrompt(context, 'market-analysis')
    let result:string
    try{
      const response = await runAnalysisPrompt(context, {model:process.env.CLAUDE_MODEL||'claude-opus-5',max_tokens:4096,maxInputCharacters:RESEARCH_INPUT_CHARACTERS['market-analysis'],effort:workflowEffort(context,'market-analysis'),timeoutMs:300000,maxAttempts:2,validateOutput:(text)=>validateResearchOutput(text,'market-analysis'),system: RESEARCH_SYSTEM,messages: [{ role: 'user', content: prompt }],temperature: 0.2})
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('market-analysis-ai-status',{status:'completed'},'DATA')
    }catch(error){
      await context.saveArtifact('market-analysis-ai-status',{status:'failed',reason:'智能市场观点未完成；未使用规则生成替代观点'},'DATA')
      throw error
    }

    await saveValidatedResearchOutput(context,'market-analysis',result)
    await context.updateProgress(1, 1, '市场分析完成')
  }
}
