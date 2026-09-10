import { buildOpportunityLedger } from '@/lib/analysis/opportunity-ledger'
/* eslint-disable @typescript-eslint/no-explicit-any -- Persisted AI artifacts are runtime-normalized heterogeneous JSON. */
import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepContext, StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchOutput, valuationNarrative } from '../research-output'
import { reportAdviceConfidence, indexRuleSummary } from '@/lib/analysis/report-insights'

const record=(value:unknown):Record<string,any>=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,any>;try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}}

function timeoutFallback(context:StepContext){
  const evaluation=context.artifacts.get('research-evaluation')
  const overview=record(context.artifacts.get('industry-overview'))
  const graph=context.artifacts.get('graph-context')
  const exposures=new Map((graph?.etfExposure||[]).map((item:{code:string})=>[item.code,item]))
  const decisions=evaluation?.decisions||[]
  const riskOff=decisions.filter((item:{state?:string})=>item.state==='risk-off').length
  const eligible=decisions.filter((item:{state?:string})=>item.state==='eligible').length
  const signal=riskOff?'风险收缩':eligible?'满足实验条件':'持续观察'
  return {
    score:null,rating:'未形成模型评级',ratingBasis:'模型服务未完成请求；本节仅沿用冻结规则，不是对市场证据充分性的模型评级',
    executiveSummary:{
      conclusion:`当前${signal}。市场规则、产业链证据与事件材料尚未形成足以提高配置强度的一致信号；现阶段应以冻结规则状态为行动边界，并等待关键数据在后续交易日完成复核。`,
      allocationStance:riskOff?'优先压降超出风险预算的已核验暴露，未核验持仓先补齐映射与费用。':'维持现有风险预算，不因单一事件扩大仓位。',
      keyDrivers:Array.isArray(overview.drivers)?overview.drivers.slice(0,3):[],
      opportunities:[],
      mainRisks:['智能投资建议服务不可用或请求未完成，未形成新增模型判断。','数据缺失不补零，未验证映射不作为交易依据。'],
      watchPoints:Array.isArray(overview.watchlist)?overview.watchlist.slice(0,3):['下一交易日复核市场与事件数据'],
      actionPlan:{priority:riskOff?'先处理已触发的风险收缩条件。':'先等待数据与规则条件形成一致确认。',unheld:'等待规则、产品比较和数据门禁共同满足后再评估建仓。',held:riskOff?'结合个人风险预算复核并分批降低超限暴露。':'保持仓位并跟踪结论成立条件。'},
      historyComparison:[],
    },
    recommendation:{unheld:'观望',held:riskOff?'复核风险敞口':'持有',reason:'智能投资建议服务不可用或请求未完成，动作仅沿用冻结规则状态。'},
    tacticalView:{horizon:(evaluation?.profile?.horizonDays||20)+'个交易日',signal,conditions:'等待交易时段时效、市场信号与关键数据门禁重新核验。'},
    strategicView:{horizon:'6—12个月',thesis:String(overview.analysis||'产业观点沿用已完成的结构化行业总览。'),valuation:null},
    thesis:'本节由冻结规则评估、行业总览与图谱暴露结构化汇编，不新增智能推断。',
    etfImplications:(evaluation?.products||[]).map((product:{ticker:string})=>{
      const exposure=exposures.get(product.ticker) as {segments?:Array<{segmentName?:string;matchedCompanies?:string[]}>}|undefined
      return {ticker:product.ticker,exposureRationale:exposure?.segments?.length?'来自冻结产业图谱的候选暴露，仍需最新持仓验证。':'尚未建立可核验产业暴露映射。',segments:(exposure?.segments||[]).map(item=>item.segmentName).filter(Boolean),companies:[...new Set((exposure?.segments||[]).flatMap(item=>item.matchedCompanies||[]))],evidenceBoundary:'图谱相关性与披露持仓均不代表实时权重。'}
    }),
    scenarios:{base:{conditions:'沿用当前冻结规则状态并等待数据复核。',probability:null,expectedReturn:null},bull:{conditions:'市场趋势、资金、持仓与企业证据形成一致改善。',probability:null,expectedReturn:null},bear:{conditions:'风险信号持续或关键证据进一步恶化。',probability:null,expectedReturn:null}},
    counterEvidence:Array.isArray(overview.counterEvidence)?overview.counterEvidence.slice(0,6):[],
    risks:['智能投资建议服务不可用或请求未完成，本节不包含新增模型判断。','数据缺失不补零，未验证映射不作为交易依据。'],
    watchlist:Array.isArray(overview.watchlist)?overview.watchlist.slice(0,8):[],
  }
}

/**
 * 步骤12: 投资建议
 */
export const investmentAdviceStep: StepDefinition = {
  name: 'investment-advice',
  description: '投资建议',
  dependencies: ['assess-data-quality', 'industry-overview'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在生成投资建议...')

    const prompt = researchPrompt(context, 'investment-advice')

    let result:string
    try{
      const response = await runAnalysisPrompt(context, {
        max_tokens:8192,
        effort:'low',
        timeoutMs:300000,
        maxAttempts:2,
        validateOutput:(text)=>validateResearchOutput(text,'investment-advice'),
      system: RESEARCH_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('investment-advice-ai-status',{status:'completed'},'DATA')
    }catch(error){
      if(!recoverableAnalysisError(error))throw error
      result=JSON.stringify(timeoutFallback(context))
      await context.saveArtifact('investment-advice-ai-status',{status:'fallback',reason:'模型服务不可用或请求未完成，已使用冻结规则与行业总览结构化汇编'},'DATA')
    }

    const validated=await saveValidatedResearchOutput(context,'investment-advice',result)
    const adviceData=JSON.parse(validated)
    const evaluation=context.artifacts.get('research-evaluation')
    adviceData.confidencePct=reportAdviceConfidence(evaluation,context.artifacts.get('data-quality'))
    // Preserve the model's assessment. Execution constraints are a separate,
    // explicitly labelled rule result rather than an overwrite of AI advice.
    adviceData.recommendationSource=context.artifacts.get('investment-advice-ai-status')?.status==='fallback'?'规则汇编（模型请求未完成）；未形成新增模型评级，实际动作仍受个人风险预算约束':'模型研究观点；实际动作由逐产品规则与个人风险预算约束'
    adviceData.ruleAssessment=indexRuleSummary(evaluation)
    adviceData.productSelection=evaluation?.productComparisons||[]
    adviceData.strategicView={...(adviceData.strategicView||{}),valuation:valuationNarrative(context.artifacts.get('research-evaluation')?.products||[])}
    const ledger=buildOpportunityLedger({snapshot:context.artifacts.get('research-snapshot'),asOf:evaluation?.asOf||new Date().toISOString(),news:context.artifacts.get('news-analysis'),events:context.artifacts.get('news-events'),holdings:context.artifacts.get('etf-holdings'),decisions:evaluation?.decisions,graph:context.artifacts.get('graph-context'),history:context.artifacts.get('historical-report-context')})
    await context.saveArtifact('opportunity-ledger',ledger,'DATA')
    adviceData.opportunityLedger=ledger
    const enriched=JSON.stringify(adviceData)
    await context.saveArtifact('investment-advice',enriched,'DATA')

    // 保存综合评分
    try {
      await context.saveArtifact(
        'overall-score',
        { score: typeof adviceData.score === 'number' && Number.isFinite(adviceData.score) ? adviceData.score : null, rating: adviceData.rating || '证据不足，未评级' },
        'DATA'
      )
    } catch {
      console.warn('Failed to parse investment advice for scoring')
    }

    await context.updateProgress(1, 1, '投资建议完成')
  }
}
