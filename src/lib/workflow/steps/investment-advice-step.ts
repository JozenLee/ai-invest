import { buildOpportunityLedger } from '@/lib/analysis/opportunity-ledger'
/* eslint-disable @typescript-eslint/no-explicit-any -- Persisted AI artifacts are runtime-normalized heterogeneous JSON. */
import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepContext, StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchResponse, valuationNarrative, parseResearchObject } from '../research-output'
import { independentHypothesisInput, hypothesisValidationScope, validateInvestmentHypotheses, validateThesisAssessments, normalizeThesisAssessments, assembleInvestmentTheses, HYPOTHESIS_SYSTEM, HYPOTHESIS_TASK, type InvestmentHypothesis } from '../hypotheses'
import { scopedAnalysisContext } from '../scoped-analysis-context'
import { reportAdviceConfidence, indexRuleSummary } from '@/lib/analysis/report-insights'

const record=(value:unknown):Record<string,any>=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,any>;try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}}

/** Preserve JSON syntax errors inside the transport retry boundary. An explicit
 * insufficiency response is valid transport output, never successful research. */
export function parseHypothesisResponse(text: string, scope: ReturnType<typeof hypothesisValidationScope>) {
  const parsed = parseResearchObject(text)
  const corrections:string[]=[]
  const candidates=Array.isArray(parsed.hypotheses)?parsed.hypotheses.map((value,index)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return value
    const hypothesis={...(value as Record<string,unknown>)}
    if(!scope.disclosureHistoryVerified&&(hypothesis.firstDisclosedAt!==null||hypothesis.informationStatus!=='待核验')){
      hypothesis.firstDisclosedAt=null;hypothesis.informationStatus='待核验'
      corrections.push(`第${index+1}条假设将未经核验的首次披露状态收敛为待核验`)
    }
    if(!scope.pricingComparisonVerified&&(hypothesis.pricingStatus!=='待核验'||Array.isArray(hypothesis.pricingEvidenceIds)&&hypothesis.pricingEvidenceIds.length)){
      hypothesis.pricingStatus='待核验';hypothesis.pricingEvidenceIds=[]
      corrections.push(`第${index+1}条假设将缺少定价比较的状态收敛为待核验`)
    }
    if(!Array.isArray(hypothesis.pressureAssumptions)){
      hypothesis.pressureAssumptions=[]
      corrections.push(`第${index+1}条假设移除非数组压力假设`)
    }else{
      const valid=hypothesis.pressureAssumptions.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)&&typeof (item as Record<string,unknown>).label==='string'&&typeof (item as Record<string,unknown>).valuePct==='number'&&Number.isFinite((item as Record<string,unknown>).valuePct)&&((item as Record<string,unknown>).notForecast===true))
      if(valid.length!==hypothesis.pressureAssumptions.length){hypothesis.pressureAssumptions=valid;corrections.push(`第${index+1}条假设移除不符合非预测契约的压力项`)}
    }
    const parentEvidenceIds=Array.isArray(hypothesis.evidenceIds)?hypothesis.evidenceIds.filter(id=>typeof id==='string'&&scope.evidenceIds.includes(id)):[]
    if(Array.isArray(hypothesis.statements)&&parentEvidenceIds.length)hypothesis.statements=hypothesis.statements.map((statement,statementIndex)=>{
      if(!statement||typeof statement!=='object'||Array.isArray(statement))return statement
      const normalized={...(statement as Record<string,unknown>)}
      if(normalized.kind!=='情景'&&(!Array.isArray(normalized.evidenceIds)||!normalized.evidenceIds.length)){
        normalized.evidenceIds=parentEvidenceIds.slice(0,4)
        corrections.push(`第${index+1}条假设的第${statementIndex+1}个非情景陈述继承父级冻结证据`)
      }
      return normalized
    })
    return hypothesis
  }):parsed.hypotheses
  const hypotheses = validateInvestmentHypotheses(candidates, scope)
  if (hypotheses.length) return { hypotheses, insufficientReason: null, corrections }
  const insufficient = parsed.insufficient
  const reason = insufficient && typeof insufficient === 'object' && !Array.isArray(insufficient) ? (insufficient as Record<string, unknown>).reason : null
  if (typeof reason !== 'string' || reason.trim().length < 12) throw new Error('投资假设输出校验失败：未形成研究，hypotheses为空；不能以空数组完成任务。有证据请形成可证伪假设；确实不足须返回insufficient.reason说明具体缺口（至少12字符）。')
  return { hypotheses, insufficientReason: reason.trim(), corrections }
}

export function normalizeInvestmentSynthesisResponse(text:string,hypotheses:InvestmentHypothesis[]){
  const parsed=parseResearchObject(text)
  const normalized=normalizeThesisAssessments(parsed.thesisAssessments)
  const assessments=validateThesisAssessments(normalized.assessments,hypotheses)
  const corrections=[...normalized.corrections]
  if('factChecks' in parsed){delete parsed.factChecks;corrections.push('移除可选的重复事实检查块，事实仍由本地冻结注册表校验')}
  parsed.thesisAssessments=assessments
  return {text:JSON.stringify(parsed),assessments,corrections}
}

const canonical = (value: unknown): string => {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, normalize(v)])) : item
  return JSON.stringify(normalize(value))
}

/** Only this phase's rejected attempts are eligible. Compare the frozen evidence
 * embedded in the original request, never a mutable latest-input artifact. */
export async function recoverStoredHypotheses(context: StepContext, input: ReturnType<typeof independentHypothesisInput>) {
  const prefix = 'investment-advice-hypotheses-ai-'
  const candidates = [...context.artifacts.keys()].flatMap(key => {
    const match = /^investment-advice-hypotheses-ai-response-attempt-(\d+)$/.exec(key)
    return match && context.artifacts.has(`${prefix}error-attempt-${match[1]}`) ? [{ key, attempt: Number(match[1]) }] : []
  }).sort((a, b) => b.attempt - a.attempt)
  for (const candidate of candidates) {
    let hypotheses: InvestmentHypothesis[]
    try {
      const request = context.artifacts.get(`${prefix}request-attempt-${candidate.attempt}`)
      const message = request?.messages?.find((m: {role?: string; content?: unknown}) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('\n冻结证据：'))
      if (!message) continue
      const originalInput = JSON.parse(message.content.slice(message.content.indexOf('\n冻结证据：') + '\n冻结证据：'.length))
      if (!input.asOf || originalInput.asOf !== input.asOf || canonical(originalInput.citationRegistry) !== canonical(input.citationRegistry)) continue
      // Additional protection against same-date evidence packets with changed products/facts.
      if (canonical(originalInput) !== canonical(input)) continue
      const response = context.artifacts.get(candidate.key)
      const text = response?.content?.find((block: {type?: string; text?: unknown}) => block.type === 'text' && typeof block.text === 'string')?.text
      if (typeof text !== 'string') continue
      const parsed = parseHypothesisResponse(text, hypothesisValidationScope(input))
      if (parsed.insufficientReason || !parsed.hypotheses.length) continue
      hypotheses = parsed.hypotheses
    } catch {
      // A stale or still-invalid response is never promoted; fresh validation may retry normally.
      continue
    }
    await context.saveArtifact('hypotheses-recovery', { sourceArtifact: candidate.key, asOf: input.asOf, reason: '修复校验后恢复原模型输出' }, 'DATA')
    return { hypotheses, sourceArtifact: candidate.key }
  }
  return null
}

function analysisFailureSummary(error:unknown){
  const detail=error instanceof Error?error.message:String(error)
  if(/输出校验失败|事实|结构|JSON|unterminated string|unexpected end/i.test(detail))return '模型已返回内容，但未通过本地事实或结构校验'
  if(/timed?\s*out|timeout|aborted|aborterror/i.test(detail))return '模型请求超时或被中断'
  if(/insufficient account balance|credit balance|insufficient credits|billing hard limit/i.test(detail))return '模型账户额度不可用'
  return '模型请求未完成'
}

function timeoutFallback(context:StepContext,failureReason='模型请求未完成'){
  const evaluation=context.artifacts.get('research-evaluation')
  const overview=record(context.artifacts.get('industry-overview'))
  const graph=context.artifacts.get('graph-context')
  const exposures=new Map((graph?.etfExposure||[]).map((item:{code:string})=>[item.code,item]))
  const decisions=evaluation?.decisions||[]
  const riskOff=decisions.filter((item:{state?:string})=>item.state==='risk-off').length
  const eligible=decisions.filter((item:{state?:string})=>item.state==='eligible').length
  const signal=riskOff?'风险收缩':eligible?'满足实验条件':'持续观察'
  return {
    score:null,rating:'未形成模型评级',ratingBasis:`${failureReason}；本节仅沿用冻结规则，不是对市场证据充分性的模型评级`,
    executiveSummary:{
      conclusion:`当前${signal}。市场规则、产业链证据与事件材料尚未形成足以提高配置强度的一致信号；该信号仅为技术策略观测，未完成独立研究与方案比较，不能据此自动生成操作。`,
      allocationStance:'未形成可验证的新增配置方案；等待独立假设与账户约束复核。',
      keyDrivers:Array.isArray(overview.drivers)?overview.drivers.slice(0,3):[],
      opportunities:[],
      mainRisks:[`${failureReason}，未形成新增模型判断。`,'数据缺失不补零，未验证映射不作为交易依据。'],
      watchPoints:Array.isArray(overview.watchlist)?overview.watchlist.slice(0,3):['下一交易日复核市场与事件数据'],
      actionPlan:{priority:'恢复独立假设与方案比较。',unheld:'暂无独立研究支持新增操作。',held:'技术规则仅供复核；如有真实现金需求或预算限制，交账户执行层单独处理。'},
      historyComparison:[],
    },
    recommendation:{unheld:'观望',held:riskOff?'复核风险敞口':'持有',reason:`${failureReason}，动作仅沿用冻结规则状态。`},
    tacticalView:{horizon:(evaluation?.profile?.horizonDays||20)+'个交易日',signal,conditions:'等待交易时段时效、市场信号与关键数据门禁重新核验。'},
    strategicView:{horizon:'6—12个月',thesis:String(overview.analysis||'产业观点沿用已完成的结构化行业总览。'),valuation:null},
    thesis:'本节由冻结规则评估、行业总览与图谱暴露结构化汇编，不新增智能推断。',
    etfImplications:(evaluation?.products||[]).map((product:{ticker:string})=>{
      const exposure=exposures.get(product.ticker) as {segments?:Array<{segmentName?:string;matchedCompanies?:string[]}>}|undefined
      return {ticker:product.ticker,exposureRationale:exposure?.segments?.length?'来自冻结产业图谱的候选暴露，仍需最新持仓验证。':'尚未建立可核验产业暴露映射。',segments:(exposure?.segments||[]).map(item=>item.segmentName).filter(Boolean),companies:[...new Set((exposure?.segments||[]).flatMap(item=>item.matchedCompanies||[]))],evidenceBoundary:'图谱相关性与披露持仓均不代表实时权重。'}
    }),
    scenarios:{base:{conditions:'沿用当前冻结规则状态并等待数据复核。',probability:null,expectedReturn:null},bull:{conditions:'市场趋势、资金、持仓与企业证据形成一致改善。',probability:null,expectedReturn:null},bear:{conditions:'风险信号持续或关键证据进一步恶化。',probability:null,expectedReturn:null}},
    counterEvidence:Array.isArray(overview.counterEvidence)?overview.counterEvidence.slice(0,6):[],
    risks:[`${failureReason}，本节不包含新增模型判断。`,'数据缺失不补零，未验证映射不作为交易依据。'],
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
  estimatedDuration: 180000,

  async execute(context) {
    await context.updateProgress(0, 2, '正在独立形成投资假设...')

    const hypothesisInput = independentHypothesisInput(context)
    const scope = hypothesisValidationScope(hypothesisInput)
    let hypotheses: InvestmentHypothesis[] = []
    await context.saveArtifact('investment-hypotheses-input', hypothesisInput, 'DATA')
    const hypothesisContext = scopedAnalysisContext(context, 'investment-advice-hypotheses')
    try {
      const recovered = await recoverStoredHypotheses(context, hypothesisInput)
      if (recovered) {
        hypotheses = recovered.hypotheses
        await context.saveArtifact('investment-hypotheses-status', { status: 'completed', count: hypotheses.length, origin: 'recovered-response', sourceArtifact: recovered.sourceArtifact }, 'DATA')
      } else {
      const response = await runAnalysisPrompt(hypothesisContext, {
        max_tokens: 6144, effort: 'low', timeoutMs: 240000, maxAttempts: 2,
        system: HYPOTHESIS_SYSTEM,
        messages: [{ role: 'user', content: HYPOTHESIS_TASK + '\n冻结证据：' + JSON.stringify(hypothesisInput) }], temperature: 0.3,
        validateOutput: text => parseHypothesisResponse(text, scope),
      })
      const parsed = parseHypothesisResponse(response.content[0].type === 'text' ? response.content[0].text : '', scope)
      hypotheses = parsed.hypotheses
      if(parsed.corrections?.length)await context.saveArtifact('investment-hypotheses-normalization',{status:'corrected',corrections:parsed.corrections},'DATA')
      await context.saveArtifact('investment-hypotheses-status', parsed.insufficientReason ? { status: 'unavailable', count: 0, reason: parsed.insufficientReason } : { status: 'completed', count: hypotheses.length, origin: 'model-request' }, 'DATA')
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && !recoverableAnalysisError(error)) throw error
      await context.saveArtifact('investment-hypotheses-status', { status: 'unavailable', reason: error instanceof Error ? error.message : '独立假设未通过校验或模型请求未完成；不以规则观点冒充独立研究。' }, 'DATA')
    }
    await context.saveArtifact('investment-hypotheses', hypotheses, 'DATA')
    context.artifacts.set('investment-hypotheses', hypotheses)
    await context.updateProgress(1, 2, '独立假设已保存，正在交叉研判技术观测...')
    const prompt = researchPrompt(context, 'investment-advice')
    const synthesisContext = scopedAnalysisContext(context, 'investment-advice-synthesis')

    let result:string
    let synthesisNormalization:ReturnType<typeof normalizeInvestmentSynthesisResponse>|undefined
    try{
      if (!hypotheses.length) throw new Error('投资假设输出校验失败：独立研究未形成，不生成综合模型评级')
      const response = await runAnalysisPrompt(synthesisContext, {
        max_tokens:6144,
        effort:'low',
        timeoutMs:240000,
        // One correction attempt is enough for deterministic structure/fact
        // failures; three large serial responses made the fallback take minutes.
        maxAttempts:2,
        validateOutput:(text)=>{ synthesisNormalization=normalizeInvestmentSynthesisResponse(text,hypotheses); validateResearchResponse(synthesisNormalization.text,'investment-advice',context) },
      system: RESEARCH_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
      const raw=response.content[0].type === 'text' ? response.content[0].text : '{}'
      synthesisNormalization=synthesisNormalization||normalizeInvestmentSynthesisResponse(raw,hypotheses)
      result=synthesisNormalization.text
      if(synthesisNormalization.corrections.length)await context.saveArtifact('investment-advice-normalization',{status:'corrected',corrections:synthesisNormalization.corrections},'DATA')
      await context.saveArtifact('investment-advice-ai-status',{status:'completed'},'DATA')
    }catch(error){
      if(!(error instanceof SyntaxError)&&!recoverableAnalysisError(error))throw error
      const failureReason=analysisFailureSummary(error)
      result=JSON.stringify(timeoutFallback(context,failureReason))
      await context.saveArtifact('investment-advice-ai-status',{status:hypotheses.length?'fallback':'unavailable',reason:`${failureReason}，已使用冻结规则与行业总览结构化汇编`,detail:error instanceof Error?error.message:String(error)},'DATA')
    }

    const validated=await saveValidatedResearchOutput(context,'investment-advice',result)
    const adviceData=JSON.parse(validated)
    // Preserve phase-one evidence and claims exactly. Phase two contributes only assessments.
    const completed = context.artifacts.get('investment-advice-ai-status')?.status === 'completed'
    adviceData.investmentTheses = completed ? assembleInvestmentTheses(hypotheses, parseResearchObject(result).thesisAssessments) : []
    delete adviceData.thesisAssessments
    await context.saveArtifact('investment-theses', adviceData.investmentTheses, 'DATA')
    adviceData.independentHypothesesStatus = context.artifacts.get('investment-hypotheses-status')
    adviceData.constraintSeparation = { technicalStrategy: '均线、动量及规则动作是策略意见，不是硬约束。', executionConstraints: '金额与交易需另行核验账户预算、现金需求、产品规则和时效；本阶段不包含账户数据。' }
    const evaluation=context.artifacts.get('research-evaluation')
    adviceData.confidencePct=reportAdviceConfidence(evaluation,context.artifacts.get('data-quality'))
    // Preserve the model's assessment. Execution constraints are a separate,
    // explicitly labelled rule result rather than an overwrite of AI advice.
    adviceData.recommendationSource=!completed?'规则汇编（模型请求未完成）；未形成新增模型评级，实际动作仍受个人风险预算约束':'独立投资假设与技术观测交叉形成的模型研究观点；均线规则可被质疑，执行另受真实账户及产品约束'
    if (completed && !hypotheses.length) adviceData.recommendationSource = '模型综合研究观点；未形成独立投资假设，不提供可用于配置的thesis。技术规则仍仅为策略意见。'
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

    await context.updateProgress(2, 2, '投资建议完成')
  }
}
