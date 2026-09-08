import { claudeClient } from '@/lib/ai/claude'
import type { StepContext } from './types'
import { auditPrompt } from './prompt-evidence'

export function recoverableAnalysisError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /timed?\s*out|timeout|aborted|aborterror|AI返回空内容|AI输出被截断|unterminated string|unexpected end of json|智能分析输出必须是JSON对象|输出缺少字段|JSON at position/i.test(message)
}
export async function runAnalysisPrompt(context: StepContext, params: { model?: string; max_tokens?: number; system?: string; messages: Array<{ role: string; content: string }>; temperature?: number; timeoutMs?:number; maxAttempts?:number; validateOutput?:(text:string)=>unknown }) {
  const audit = auditPrompt(params.messages)
  await context.saveArtifact('ai-input-audit', audit, 'DATA')
  if (!audit.passed) throw new Error('AI输入审计失败：内容过短或存在未展开对象/数组占位符')
  const prompt = { system: params.system, messages: params.messages, max_tokens: params.max_tokens, model: params.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514', capturedAt: new Date().toISOString() }
  await context.saveArtifact('ai-prompt', prompt, 'DATA')
  const timeoutMs=Math.min(300000,Math.max(30000,Number(params.timeoutMs||process.env.AI_WORKFLOW_TIMEOUT_MS||240000)))
  const maxAttempts=Math.min(3,Math.max(1,Number(params.maxAttempts||2)))
  const {validateOutput}=params
  const request={model:params.model,system:params.system,messages:params.messages,temperature:params.temperature}
  let lastError:unknown
  let outputBudget=Math.min(16384,Math.max(1024,params.max_tokens||4096))
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      await context.saveArtifact('ai-request-status',{status:'running',attempt,timeoutMs,maxTokens:outputBudget},'DATA')
      await context.saveArtifact(`ai-request-attempt-${attempt}`,{...prompt,max_tokens:outputBudget,temperature:params.temperature},'DATA')
      const result = await claudeClient.messages.create({...request,max_tokens:outputBudget,timeoutMs})
      // Preserve the response before any caller-specific parsing can reject it.
      await context.saveArtifact(`ai-response-attempt-${attempt}`, result, 'DATA')
      await context.saveArtifact('ai-response', result, 'DATA')
      const empty=!result.content.some(block=>block.type==='text'&&block.text?.trim())
      if(empty||result.stop_reason==='max_tokens'){
        const budget=outputBudget
        outputBudget=Math.min(16384,Math.max(4096,outputBudget*2))
        throw new Error(`${empty?'AI返回空内容':'AI输出被截断'}（终止原因：${result.stop_reason||'unknown'}，输出预算：${budget}）`)
      }
      validateOutput?.(result.content[0].text)
      await context.saveArtifact('ai-request-status',{status:'completed',attempt,timeoutMs,maxTokens:outputBudget,stopReason:result.stop_reason,usage:result.usage},'DATA')
      return result
    }catch(error){
      lastError=error
      await context.saveArtifact(`ai-error-attempt-${attempt}`,{attempt,message:error instanceof Error?error.message:'AI请求失败',timeoutMs},'DATA')
      if(attempt<maxAttempts)await new Promise(resolve=>setTimeout(resolve,process.env.VITEST?0:2000))
    }
  }
  await context.saveArtifact('ai-request-status',{status:'failed',attempt:maxAttempts,timeoutMs,message:lastError instanceof Error?lastError.message:'AI请求失败'},'DATA')
  throw lastError instanceof Error?lastError:new Error('AI请求失败')
}
