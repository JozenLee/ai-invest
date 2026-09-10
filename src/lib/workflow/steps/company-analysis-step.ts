import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { researchEvidence, researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchOutput } from '../research-output'

type Row=Record<string,unknown>
const row=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{}
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)) as Row[]:[]
const list=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[]

function fallback(context:Parameters<NonNullable<StepDefinition['execute']>>[0]){
  const input=row(researchEvidence(context,'company-analysis')),companies=rows(input.companies)
  const keyCompanies=companies.slice(0,2).map(company=>{
    const mapping=row(company.graphMapping),financials=rows(company.financials),products=rows(mapping.representativeEtfs).map(item=>String(item.name||item.code||'')).filter(Boolean)
    return {code:String(company.stockCode||''),name:String(company.stockName||'代表企业'),graphPath:[mapping.stage,mapping.segment].filter(Boolean).map(String),selectionReason:String(mapping.selectionReason||'来自冻结产业图谱与指数基金持仓样本'),mappingConfidence:mapping.matchConfidence??'待核验',matchedProducts:products,operatingEvidence:`已冻结${financials.length}组最近报告期财务材料，智能经营判断待复核。`,counterEvidence:list(company.financialGaps).length?list(company.financialGaps).join('；'):'智能分析未完成，不新增企业经营推断。'}
  })
  const evidence=companies.slice(0,4).flatMap(company=>rows(company.financials).slice(0,1).map(financial=>({claim:`${String(company.stockName||company.stockCode||'代表企业')}财务材料已冻结，智能解读待复核。`,source:String(list(financial.sources)[0]||financial.source||'冻结财务数据'),date:String(financial.period||financial.publishDate||''),evidenceIds:list(financial.evidenceIds).length?list(financial.evidenceIds):financial.evidenceId?[String(financial.evidenceId)]:[]})))
  const coverage=row(input.coverage)
  const breadth=typeof coverage.companyCount==='number'?`全池${coverage.companyCount}家，盈利增长${coverage.positiveProfitGrowth??'未知'}/${coverage.profitGrowthKnown??'未知'}家可判样本，现金健康${coverage.healthyCashConversion??'未知'}/${coverage.cashQualityKnown??'未知'}家可判样本；缺失项不计为零。`:''
  const chain=[...new Set(keyCompanies.map(item=>item.graphPath.join(' → ')).filter(Boolean))]
  return {coverage,segmentAggregates:input.segmentAggregates,analysis:`企业分析智能请求未完成；${breadth}已保留${keyCompanies.length}家代表样本的图谱位置、产品映射和冻结财务材料，本节不新增个股判断。`,key_companies:keyCompanies,chain_structure:chain,evidence,counterEvidence:['智能企业分析未完成，不能从有限样本外推全产业景气。'],watchlist:keyCompanies.map(item=>`${item.name}后续财报与现金流`)}
}

/**
 * 步骤10: 企业分析
 */
export const companyAnalysisStep: StepDefinition = {
  name: 'company-analysis',
  description: '企业分析',
  dependencies: ['assess-data-quality', 'fetch-company-data'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析企业基本面...')

    const prompt = researchPrompt(context, 'company-analysis')

    let result:string
    try{
      const response = await runAnalysisPrompt(context, {model:process.env.CLAUDE_MODEL||'claude-opus-5',max_tokens:6144,effort:'low',timeoutMs:300000,maxAttempts:2,validateOutput:(text)=>validateResearchOutput(text,'company-analysis'),system: RESEARCH_SYSTEM,messages: [{ role: 'user', content: prompt }],temperature: 0.2})
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('company-analysis-ai-status',{status:'completed'},'DATA')
    }catch(error){
      if(!recoverableAnalysisError(error))throw error
      result=JSON.stringify(fallback(context))
      await context.saveArtifact('company-analysis-ai-status',{status:'fallback',reason:'智能服务中断或输出格式异常，已使用冻结企业样本生成可追溯降级结果'},'DATA')
    }

    await saveValidatedResearchOutput(context,'company-analysis',result)
    await context.updateProgress(1, 1, '企业分析完成')
  }
}
