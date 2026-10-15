import { financialFacts, validateFinancialFacts } from '@/lib/analysis/financial-facts'
import { expandEvidenceAliases } from './evidence-aliases'
import { validateDecisionFacts } from '@/lib/analysis/decision-audit'
import { claudeClient } from '@/lib/ai/claude'
import type { StepContext } from './types'
import { auditPrompt } from './prompt-evidence'
import {retryableAnalysisError} from './retry-policy'

export function recoverableAnalysisError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /timed?\s*out|timeout|aborted|aborterror|AI返回空内容|AI输出被截断|unterminated string|unexpected end of json|智能分析输出必须是JSON对象|输出缺少字段|JSON at position/i.test(message)
}
export async function runAnalysisPrompt(context: StepContext, params: { model?: string; max_tokens?: number;maxInputCharacters?:number; system?: string; messages: Array<{ role: string; content: string }>; temperature?: number; effort?:'low'|'medium'|'high'|'xhigh'|'max';timeoutMs?:number; maxAttempts?:number; retryTimeouts?:boolean; validateOutput?:(text:string)=>unknown }) {
  const audit = auditPrompt(params.messages,params.maxInputCharacters)
  await context.saveArtifact('ai-input-audit', audit, 'DATA')
  if (!audit.passed) throw new Error(audit.overBudgetBy?`AI输入审计失败：超过输入预算${audit.overBudgetBy}字符，请先压缩决策证据`:'AI输入审计失败：内容过短或存在未展开对象/数组占位符')
  const prompt = { system: params.system, messages: params.messages, max_tokens: params.max_tokens, model: params.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',effort:params.effort||null, capturedAt: new Date().toISOString() }
  await context.saveArtifact('ai-prompt', prompt, 'DATA')
  const timeoutMs=Math.min(300000,Math.max(30000,Number(params.timeoutMs||process.env.AI_WORKFLOW_TIMEOUT_MS||240000)))
  const maxAttempts=Math.min(3,Math.max(1,Number(params.maxAttempts||2)))
  const {validateOutput}=params
  let requestMessages=params.messages
  let lastError:unknown
  let attemptsUsed=0
  let outputBudget=Math.min(16384,Math.max(1024,params.max_tokens||4096))
  const scoped=(kind:string,attempt:number)=>context.attemptNumber?`${kind}-execution-${context.attemptNumber}-request-${attempt}`:`${kind}-attempt-${attempt}`
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    attemptsUsed=attempt
    const attemptStarted=Date.now()
    let heartbeat:ReturnType<typeof setInterval>|undefined
    try{
      await context.saveArtifact('ai-request-status',{status:'running',attempt,timeoutMs,maxTokens:outputBudget,model:params.model||process.env.CLAUDE_MODEL||null},'DATA')
      await context.updateProgress(0,1,`智能分析请求第 ${attempt}/${maxAttempts} 次（最长 ${Math.round(timeoutMs/1000)} 秒）`)
      await context.saveArtifact(scoped('ai-request',attempt),{...prompt,messages:requestMessages,max_tokens:outputBudget,temperature:params.temperature},'DATA')
      heartbeat=setInterval(()=>{
        const elapsedSeconds=Math.max(1,Math.round((Date.now()-attemptStarted)/1000))
        void context.updateProgress(0,1,`智能分析请求第 ${attempt}/${maxAttempts} 次，已等待 ${elapsedSeconds} 秒（最长 ${Math.round(timeoutMs/1000)} 秒）`).catch(()=>undefined)
      },15_000)
      const result = await claudeClient.messages.create({model:params.model,system:params.system,messages:requestMessages,temperature:params.temperature,effort:params.effort,max_tokens:outputBudget,timeoutMs})
      // Preserve the response before any caller-specific parsing can reject it.
      await context.saveArtifact(scoped('ai-response',attempt), structuredClone(result), 'DATA')
      const aliases=context.artifacts.get(`active-ai-evidence-aliases:${context.stepId}`) as Record<string,string>|undefined
      if(aliases&&Object.keys(aliases).length){
        for(const block of result.content){
          if(block.type==='text'&&block.text){
            try{const parsed=JSON.parse(block.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));block.text=JSON.stringify(expandEvidenceAliases(parsed,aliases))}catch{/* Normal validation handles malformed JSON and retries. */}
          }
        }
      }
      await context.saveArtifact('ai-response', result, 'DATA')
      const empty=!result.content.some(block=>block.type==='text'&&block.text?.trim())
      if(empty||result.stop_reason==='max_tokens'){
        const budget=outputBudget
        outputBudget=Math.min(16384,Math.max(4096,outputBudget*2))
        throw new Error(`${empty?'AI返回空内容':'AI输出被截断'}（终止原因：${result.stop_reason||'unknown'}，输出预算：${budget}）`)
      }
      validateOutput?.(result.content[0].text)
      const body=result.content.find(block=>block.type==='text')?.text
      if(body){
        const clean=body.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')
        if(clean.startsWith('{')){validateDecisionFacts(JSON.parse(clean),context.artifacts.get('research-evaluation'));validateFinancialFacts(JSON.parse(clean),financialFacts(context.artifacts.get('company-market-data')))}
      }
      await context.saveArtifact('ai-request-status',{status:'completed',attempt,timeoutMs,durationMs:Date.now()-attemptStarted,maxTokens:outputBudget,model:result.model,stopReason:result.stop_reason,usage:result.usage},'DATA')
      return result
    }catch(error){
      const timedOut=/timed?\s*out|timeout|aborted|aborterror/i.test(error instanceof Error?error.message:String(error))
      lastError=timedOut?new Error(`智能分析请求超时（${Math.round(timeoutMs/1000)} 秒，第 ${attempt}/${maxAttempts} 次）`):error
      const canRetry=retryableAnalysisError(error)||(params.retryTimeouts===true&&timedOut)
      if(retryableAnalysisError(error)&&attempt<maxAttempts){
        const message=error instanceof Error?error.message:'输出未通过校验'
        requestMessages=[...params.messages,{role:'user',content:`上次输出未通过程序校验：${message}。请重新生成完整JSON，逐项修正该错误；不得省略任何必需产品或字段，不要输出解释性前后缀。`}]
      }
      await context.saveArtifact(scoped('ai-error',attempt),{executionAttempt:context.attemptNumber||null,requestAttempt:attempt,message:lastError instanceof Error?lastError.message:'AI请求失败',timeoutMs,durationMs:Date.now()-attemptStarted,model:params.model||process.env.CLAUDE_MODEL||null},'DATA')
      if(attempt>=maxAttempts||!canRetry)break
      if(heartbeat){clearInterval(heartbeat);heartbeat=undefined}
      await context.updateProgress(0,1,`智能分析请求失败，准备第 ${attempt+1}/${maxAttempts} 次重试`)
      await new Promise(resolve=>setTimeout(resolve,process.env.VITEST?0:1000*attempt))
    }finally{
      if(heartbeat)clearInterval(heartbeat)
    }
  }
  await context.saveArtifact('ai-request-status',{status:'failed',attempt:attemptsUsed,timeoutMs,message:lastError instanceof Error?lastError.message:'AI请求失败'},'DATA')
  await context.updateProgress(0,1,`智能分析失败：${lastError instanceof Error?lastError.message:'AI请求失败'}；可继续本轮重试`)
  throw lastError instanceof Error?lastError:new Error('AI请求失败')
}
