import { claudeClient } from '@/lib/ai/claude'
import type { StepContext } from './types'
import { auditPrompt } from './prompt-evidence'
export async function runAnalysisPrompt(context: StepContext, params: { model?: string; max_tokens?: number; system?: string; messages: Array<{ role: string; content: string }>; temperature?: number }) {
  const audit = auditPrompt(params.messages)
  await context.saveArtifact('ai-input-audit', audit, 'DATA')
  if (!audit.passed) throw new Error('AI输入审计失败：内容过短或存在未展开对象/数组占位符')
  const prompt = { system: params.system, messages: params.messages, max_tokens: params.max_tokens, model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514', capturedAt: new Date().toISOString() }
  await context.saveArtifact('ai-prompt', prompt, 'DATA')
  const timeoutMs=Math.min(300000,Math.max(30000,Number(process.env.AI_WORKFLOW_TIMEOUT_MS||150000)))
  let lastError:unknown
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const result = await claudeClient.messages.create({...params,timeoutMs})
      // Preserve the response before any caller-specific parsing can reject it.
      await context.saveArtifact('ai-response', result, 'DATA')
      await context.saveArtifact('ai-request-status',{status:'completed',attempt,timeoutMs},'DATA')
      if (!result.content[0]?.text?.trim()) throw new Error('AI返回空内容')
      return result
    }catch(error){
      lastError=error
      await context.saveArtifact(`ai-error-attempt-${attempt}`,{attempt,message:error instanceof Error?error.message:'AI请求失败',timeoutMs},'DATA')
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,process.env.VITEST?0:2000))
    }
  }
  throw lastError instanceof Error?lastError:new Error('AI请求失败')
}
