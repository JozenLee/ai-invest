import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { researchEvidence, researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'
import { deterministicAnalysisSelected, workflowEffort } from '../method-config'

type Row=Record<string,unknown>
const row=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{}
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)) as Row[]:[]
const list=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[]

function fallback(context:Parameters<NonNullable<StepDefinition['execute']>>[0]){
  const input=row(researchEvidence(context,'news-analysis')),events=rows(input.events),graph=row(input.graph),mappings=rows(graph.eventMappings)
  const catalystEvents=events.filter(event=>event.category!=='risk').slice(0,5)
  const catalysts=catalystEvents.map(event=>{
    const mapping=mappings.find(item=>item.eventId===event.id),path=rows(mapping?.paths)[0]
    const segments=list(path?.segmentNames).length?list(path?.segmentNames):list(event.segments)
    return {event:String(event.title||'事件标题待核验'),path:segments.length?`冻结事件 → ${segments.join(' → ')} → 相关指数基金（方向待复核）`:'冻结事件 → 产业环节待映射',affectedCompanies:list(path?.affectedCompanies).length?list(path?.affectedCompanies):list(event.companies),affectedEtfs:list(path?.affectedEtfs),conditions:'需由订单、财务、市场和实际指数暴露共同验证',confidence:'待智能复核'}
  })
  const evidence=events.slice(0,8).map(event=>({claim:String(event.title||'冻结事件'),source:list(event.sources).join('、')||'冻结事件来源',date:String(event.publishedAt||''),evidenceIds:list(event.evidenceIds).slice(0,6)}))
  const risks=events.filter(event=>event.category==='risk').slice(0,4).map(event=>`${String(event.title||'风险事件')}（${String(event.evidenceGrade||'等级待核验')}级证据，材料性${String(event.materialityScore??'待核验')}）`)
  return {analysis:`已对${events.length}项决策事件完成来源等级、独立性、材料性与图谱路径的确定性筛选；方向与影响仍由最终综合模型结合市场和财务证据判断。`,sentiment:'未知',catalysts,risks, evidence,watchlist:events.slice(0,6).map(event=>String(event.title||'')).filter(Boolean)}
}

/**
 * 步骤9: 资讯分析
 */
export const newsAnalysisStep: StepDefinition = {
  name: 'news-analysis',
  description: '资讯分析',
  dependencies: ['assess-data-quality', 'fetch-news'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析资讯动态...')

    const prompt = researchPrompt(context, 'news-analysis')

    let result:string
    if(deterministicAnalysisSelected(context,'news-analysis')||process.env.AI_ENABLE_EVENT_SYNTHESIS!=='true'){
      result=JSON.stringify(fallback(context))
      await context.saveArtifact('news-analysis-ai-status',{status:'deterministic',reason:deterministicAnalysisSelected(context,'news-analysis')?'本轮方法配置为仅确定性分析':'事件已在采集层完成分级去重，方向交由最终综合模型判断'},'DATA')
      await saveValidatedResearchOutput(context,'news-analysis',result)
      await context.updateProgress(1,1,'事件证据筛选完成')
      return
    }
    try{
      const response = await runAnalysisPrompt(context, {model:process.env.CLAUDE_FAST_MODEL,max_tokens:4096,effort:workflowEffort(context,'news-analysis'),timeoutMs:90000,maxAttempts:2,validateOutput:(text)=>validateResearchOutput(text,'news-analysis'),system: RESEARCH_SYSTEM,messages: [{ role: 'user', content: prompt }],temperature: 0.2})
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('news-analysis-ai-status',{status:'completed'},'DATA')
    }catch(error){
      if(!recoverableAnalysisError(error))throw error
      result=JSON.stringify(fallback(context))
      await context.saveArtifact('news-analysis-ai-status',{status:'fallback',reason:'智能服务中断或输出格式异常，已保留实际入模事件与来源并继续报告'},'DATA')
    }

    await saveValidatedResearchOutput(context,'news-analysis',result)
    await context.updateProgress(1, 1, '资讯分析完成')
  }
}
