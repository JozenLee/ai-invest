import { getSceneSettings } from '@/lib/ai/scene-settings'
import { claudeClient } from '@/lib/ai/claude'
import type { StepContext } from './types'
import { auditPrompt } from './prompt-evidence'
import {retryableAnalysisError,transientAnalysisTransportError,upstreamAnalysisGatewayError,analysisAccountUnavailable} from './retry-policy'

export function recoverableAnalysisError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return analysisAccountUnavailable(error)||upstreamAnalysisGatewayError(error)||transientAnalysisTransportError(error)||/timed?\s*out|timeout|aborted|aborterror|AI返回空内容|AI输出被截断|unterminated string|unexpected end of json|智能分析输出必须是JSON对象|输出缺少字段|输出字段类型错误|输出包含|输出校验失败|JSON at position/i.test(message)
}
export async function runAnalysisPrompt(context: StepContext, params: { model?: string; max_tokens?: number; system?: string; messages: Array<{ role: string; content: string }>; temperature?: number; effort?:'low'|'medium'|'high'|'xhigh'|'max';timeoutMs?:number; maxAttempts?:number; validateOutput?:(text:string)=>unknown }) {
  const scene = getSceneSettings('comprehensive')
  params = { ...params, model: scene.model, max_tokens: Math.min(params.max_tokens || 4096, scene.maxTokens) }
  for(const [key,value] of context.artifacts)if(key.startsWith('research-citations-'))await context.saveArtifact(key,value,'DATA')
  const audit = auditPrompt(params.messages)
  await context.saveArtifact('ai-input-audit', audit, 'DATA')
  if (!audit.passed) throw new Error(audit.budgetExceeded ? 'AI输入审计失败：证据包超过120000字符，请先按相关性、业务日期和完整引用筛选，不允许截断JSON后调用模型' : 'AI输入审计失败：内容过短或存在未展开对象/数组占位符')
  const prompt = { system: params.system, messages: params.messages, max_tokens: params.max_tokens, model: params.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',effort:params.effort||null, capturedAt: new Date().toISOString() }
  await context.saveArtifact('ai-prompt', prompt, 'DATA')
  const priorBillingFailure=[...context.artifacts.entries()].find(([key,value])=>key.startsWith('ai-error-attempt-')&&analysisAccountUnavailable(value?.message))
  if(context.artifacts.get('ai-service-status')?.status==='billing-blocked'||priorBillingFailure){
    await context.saveArtifact('ai-service-status',{status:'billing-blocked',reason:'模型账户余额不足；本轮停止后续付费请求，保留冻结证据与已完成的模型结果。'},'DATA')
    await context.saveArtifact('ai-request-status',{status:'blocked',attempt:0,model:prompt.model,message:'模型账户余额不足，未发起新请求。恢复账户额度后请新建分析。'},'DATA')
    throw new Error('403 Insufficient account balance')
  }
  const accessStatus=context.artifacts.get('ai-access-status')
  if(accessStatus?.status==='blocked'&&accessStatus.stepId===context.stepId){
    const error=new Error(accessStatus.message)
    await context.saveArtifact('ai-request-status',{status:'blocked',attempt:0,model:prompt.model,message:'本步骤上游访问已连续拒绝；停止重复请求，保留冻结证据。显式重跑可重新检测，独立模块继续执行。'},'DATA')
    throw error
  }
  const timeoutMs=Math.min(300000,Math.max(30000,Number(params.timeoutMs||process.env.AI_WORKFLOW_TIMEOUT_MS||240000)))
  const maxAttempts=Math.min(3,Math.max(1,Number(params.maxAttempts||2)))
  const {validateOutput}=params
  let correction:string|undefined
  const request={model:params.model,system:params.system,messages:params.messages,temperature:params.temperature,effort:params.effort}
  let lastError:unknown
  let attemptsUsed=0
  let consecutiveAccessDenials=0
  let outputBudget=Math.min(scene.maxTokens,Math.max(1024,params.max_tokens||4096))
  // Preserve prior invocation traces on resume; never pair a fresh response
  // with a stale error under the same attempt number.
  const previousAttempt=context.previousAIRequestAttempt||0
  for(let retry=1;retry<=maxAttempts;retry++){
    const attempt=previousAttempt+retry
    attemptsUsed=attempt
    const attemptStarted=Date.now()
    try{
      await context.saveArtifact('ai-request-status',{status:'running',attempt,timeoutMs,maxTokens:outputBudget,model:params.model||process.env.CLAUDE_MODEL||null},'DATA')
      await context.saveArtifact(`ai-request-attempt-${attempt}`,{...prompt,messages:correction?[...request.messages,{role:'user',content:correction}]:request.messages,max_tokens:outputBudget,temperature:params.temperature},'DATA')
      const result = await claudeClient.messages.create({...request,messages:correction?[...request.messages,{role:'user',content:correction}]:request.messages,max_tokens:outputBudget,timeoutMs})
      // Preserve the response before any caller-specific parsing can reject it.
      await context.saveArtifact(`ai-response-attempt-${attempt}`, result, 'DATA')
      await context.saveArtifact('ai-response', result, 'DATA')
      const empty=!result.content.some(block=>block.type==='text'&&block.text?.trim())
      if(empty||result.stop_reason==='max_tokens'){
        const budget=outputBudget
        outputBudget=Math.min(scene.maxTokens,Math.max(4096,outputBudget*2))
        throw new Error(`${empty?'AI返回空内容':'AI输出被截断'}（终止原因：${result.stop_reason||'unknown'}，输出预算：${budget}）`)
      }
      validateOutput?.(result.content[0].text)
      await context.saveArtifact('ai-request-status',{status:'completed',attempt,timeoutMs,durationMs:Date.now()-attemptStarted,maxTokens:outputBudget,model:result.model,stopReason:result.stop_reason,usage:result.usage},'DATA')
      return result
    }catch(error){
      lastError=error
      const detail=error instanceof Error?error.message:String(error)
      if(/JSON|输出|字段/.test(detail))correction='上次输出未通过校验：'+detail.slice(0,800)+'。请重新生成完整JSON，严格遵守字段类型；只输出JSON，不使用Markdown，不附加说明，字符串内部引号必须转义。不得新增输入中没有的交易目标。'
      if(analysisAccountUnavailable(error))await context.saveArtifact('ai-service-status',{status:'billing-blocked',reason:'模型账户余额不足；本轮停止后续付费请求，保留冻结证据与已完成的模型结果。'},'DATA')
      consecutiveAccessDenials=upstreamAnalysisGatewayError(error)&&/access forbidden/i.test(error instanceof Error?error.message:String(error))?consecutiveAccessDenials+1:0
      await context.saveArtifact(`ai-error-attempt-${attempt}`,{attempt,errorType:error instanceof Error?error.name:'Error',transportCode:error instanceof Error&&error.cause&&typeof error.cause==='object'&&'code' in error.cause?String(error.cause.code):null,message:error instanceof Error?error.message:'AI请求失败',timeoutMs,durationMs:Date.now()-attemptStarted,model:params.model||process.env.CLAUDE_MODEL||null},'DATA')
      if(retry>=maxAttempts||!retryableAnalysisError(error))break
      await new Promise(resolve=>setTimeout(resolve,process.env.VITEST?0:1000*retry))
    }
  }
  if(consecutiveAccessDenials>=2){
    await context.saveArtifact('ai-access-status',{status:'blocked',stepId:context.stepId,message:lastError instanceof Error?lastError.message:String(lastError),reason:'本步骤模型网关在有限重试后仍拒绝上游访问；暂停本步骤重复请求，其他模块继续独立检测。'},'DATA')
  }
  await context.saveArtifact('ai-request-status',{status:'failed',attempt:attemptsUsed,timeoutMs,model:prompt.model,message:lastError instanceof Error?lastError.message:'AI请求失败'},'DATA')
  throw lastError instanceof Error?lastError:new Error('AI请求失败')
}
