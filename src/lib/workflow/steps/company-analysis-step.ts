import { RESEARCH_INPUT_CHARACTERS } from '../research-budgets'
import { runAnalysisPrompt } from '../analysis-prompt'
import { auditedResearchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { workflowEffort } from '../method-config'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'

/**
 * 步骤10: 企业分析
 */
export const companyAnalysisStep: StepDefinition = {
  name: 'company-analysis',
  description: '企业分析',
  dependencies: ['assess-data-quality', 'fetch-company-data', 'freeze-research'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析企业基本面...')

    const prompt = await auditedResearchPrompt(context, 'company-analysis')
    let result:string
    try{
      const response = await runAnalysisPrompt(context, {model:process.env.CLAUDE_FAST_MODEL||process.env.CLAUDE_MODEL||'claude-opus-5',max_tokens:4096,maxInputCharacters:RESEARCH_INPUT_CHARACTERS['company-analysis'],effort:workflowEffort(context,'company-analysis'),timeoutMs:180000,maxAttempts:2,validateOutput:(text)=>validateResearchOutput(text,'company-analysis'),system: RESEARCH_SYSTEM,messages: [{ role: 'user', content: prompt }],temperature: 0.1})
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('company-analysis-ai-status',{status:'completed'},'DATA')
    }catch(error){
      await context.saveArtifact('company-analysis-ai-status',{status:'failed',reason:'智能企业观点未完成；未使用规则生成替代观点'},'DATA')
      throw error
    }

    await saveValidatedResearchOutput(context,'company-analysis',result)
    await context.updateProgress(1, 1, '企业分析完成')
  }
}
