import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { researchEvidence, researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { deterministicAnalysisSelected, workflowEffort } from '../method-config'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'

type Row=Record<string,unknown>
const row=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{}
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)) as Row[]:[]
const list=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[]

function fallback(context:Parameters<NonNullable<StepDefinition['execute']>>[0]){
  const input=row(researchEvidence(context,'market-analysis')),market=row(input.market),etfs=rows(market.etfs)
  const evidence=etfs.slice(0,6).map(item=>({claim:`${String(item.name||item.ticker||'指数基金')}最近完整收盘数据已冻结，智能趋势解读待复核。`,source:String(item.source||'冻结行情数据'),date:String(item.date||''),evidenceIds:list(item.evidenceIds).slice(0,3)}))
  return {analysis:`市场分析智能请求未完成；已保留${etfs.length}只产品的冻结行情、技术质量和逐产品规则，本节不新增趋势推断。`,dimensions:[{name:'行情与规则',judgment:'待智能复核',detail:'报告继续使用冻结规则状态；具体价格、流动性和条件可在投资决策页核对。',evidenceIds:evidence.flatMap(item=>item.evidenceIds).slice(0,8)}],dataBoundary:'这是可追溯降级结果，不把缺失或中断解释为市场利空。',score:null,trend:'未知',risk_level:'未知',evidence,counterEvidence:[],watchlist:['下一轮重试市场趋势智能解读']}
}

/**
 * 步骤8: 市场分析
 */
export const marketAnalysisStep: StepDefinition = {
  name: 'market-analysis',
  description: '市场分析',
  dependencies: ['assess-data-quality', 'fetch-etf-data', 'fetch-market-snapshot', 'calculate-market-trends'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析市场趋势...')

    const prompt = researchPrompt(context, 'market-analysis')
    if(deterministicAnalysisSelected(context,'market-analysis')){
      await context.saveArtifact('market-analysis-ai-status',{status:'deterministic',reason:'本轮方法配置为仅确定性分析'},'DATA')
      await saveValidatedResearchOutput(context,'market-analysis',JSON.stringify(fallback(context)))
      await context.updateProgress(1,1,'确定性市场分析完成')
      return
    }

    let result:string
    try{
      const response = await runAnalysisPrompt(context, {model:process.env.CLAUDE_MODEL||'claude-opus-5',max_tokens:3072,effort:workflowEffort(context,'market-analysis'),timeoutMs:300000,maxAttempts:2,validateOutput:(text)=>validateResearchOutput(text,'market-analysis'),system: RESEARCH_SYSTEM,messages: [{ role: 'user', content: prompt }],temperature: 0.2})
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('market-analysis-ai-status',{status:'completed'},'DATA')
    }catch(error){
      if(!recoverableAnalysisError(error))throw error
      result=JSON.stringify(fallback(context))
      await context.saveArtifact('market-analysis-ai-status',{status:'fallback',reason:'智能服务中断或输出格式异常，已使用冻结行情与规则生成可追溯降级结果'},'DATA')
    }

    await saveValidatedResearchOutput(context,'market-analysis',result)
    await context.updateProgress(1, 1, '市场分析完成')
  }
}
