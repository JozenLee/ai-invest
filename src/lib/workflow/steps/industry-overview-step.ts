import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { researchEvidence, researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'

type Row=Record<string,any>
const parsed=(value:unknown):Row=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Row;try{const result=JSON.parse(String(value||'{}'));return result&&typeof result==='object'&&!Array.isArray(result)?result:{}}catch{return {}}}
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)) as Row[]:[]
const text=(value:unknown,max=180)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max)

function timeoutFallback(context:Parameters<NonNullable<StepDefinition['execute']>>[0]){
  const evidence=researchEvidence(context,'industry-overview') as Row
  const market=parsed(evidence.market),news=parsed(evidence.news),companies=parsed(evidence.companies),graph=parsed(evidence.graph)
  const catalysts=rows(news.catalysts),companyRows=rows(companies.keyCompanies)
  const segmentSignals=rows(graph.stages).flatMap(stage=>rows(stage.segments).map(segment=>{
    const names=rows(segment.representativeCompanies).map(item=>item.name||item.code).filter(Boolean)
    const relatedCompanies=companyRows.filter(item=>Array.isArray(item.graphPath)&&item.graphPath.some((part:unknown)=>String(part)===String(segment.name)))
    const relatedEvents=catalysts.filter(item=>String(item.path||'').includes(String(segment.name)))
    const products=rows(segment.matchedEtfs).map(item=>item.name||item.code).filter(Boolean)
    return {
      stage:stage.name||'未知',segment:segment.name||'未映射',
      companySignal:relatedCompanies.length?relatedCompanies.slice(0,3).map(item=>item.name).join('、')+'已有经营证据':names.length?names.slice(0,3).join('、')+'为图谱代表企业，经营证据待复核':'暂无可核验企业结论',
      eventSignal:relatedEvents.length?relatedEvents.slice(0,2).map(item=>item.event).join('；'):'暂无直接对应的已核验事件结论',
      etfExposure:products.length?products.slice(0,5).join('、'):'暂无已映射指数基金',
      evidenceBoundary:'本项由冻结图谱与已完成模块结构化汇编，未进行额外智能推断。',
    }
  }))
  const citations=[...rows(market.evidence),...rows(companies.evidence),...rows(news.evidence)].slice(0,10)
  return {
    analysis:'行业总览智能请求超时；本节已降级为冻结图谱、市场、企业与事件模块的结构化汇编，保留报告连续性，但不新增跨模块推断。',
    stage:'未知',
    segmentSignals,
    drivers:[text(market.analysis),text(companies.analysis),text(news.analysis)].filter(Boolean),
    outlook:{base:'沿用已完成模块的事实结论，等待下一轮复核跨模块一致性。',bull:'仅在市场、企业与事件证据共同改善后重新评估。',bear:'任一关键数据失效或风险证据增强时保持防御。'},
    evidence:citations,
    counterEvidence:[...rows(market.counterEvidence),...rows(companies.counterEvidence),...rows(news.counterEvidence),...rows(news.risks)].slice(0,8),
    watchlist:[...(Array.isArray(market.watchlist)?market.watchlist:[]),...(Array.isArray(companies.watchlist)?companies.watchlist:[]),...(Array.isArray(news.watchlist)?news.watchlist:[])].slice(0,8),
  }
}

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

    const prompt = researchPrompt(context, 'industry-overview')

    let result:string
    try{
      const response = await runAnalysisPrompt(context, {
        max_tokens:8192,
        timeoutMs:300000,
        maxAttempts:2,
        validateOutput:(text)=>validateResearchOutput(text,'industry-overview'),
      system: RESEARCH_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('industry-overview-ai-status',{status:'completed'},'DATA')
    }catch(error){
      if(!recoverableAnalysisError(error))throw error
      result=JSON.stringify(timeoutFallback(context))
      await context.saveArtifact('industry-overview-ai-status',{status:'fallback',reason:'智能服务超时，已使用冻结模块结构化汇编'},'DATA')
    }

    await saveValidatedResearchOutput(context,'industry-overview',result)
    await context.updateProgress(1, 1, '行业总览完成')
  }
}
