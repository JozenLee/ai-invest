import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { parseResearchObject } from '../research-output'
import type { StepDefinition } from '../types'
import { compactEvidence, qualityBoundary } from '../research-input'
type Row=Record<string,unknown>
const record=(value:unknown):Row=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Row;try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}}

export function validatePortfolioOutput(text:string){
  let parsed:Row
  try { parsed=parseResearchObject(text) } catch(error) {
    throw new Error('持仓分析输出校验失败：必须返回完整JSON对象，字符串内部引号必须转义；'+(error instanceof Error?error.message:String(error)))
  }
  // Report all violations together so a bounded retry can repair the whole
  // response instead of discovering one incompatible field on each attempt.
  const issues:string[]=[]
  for(const key of ['analysis','conclusionApplication'])if(typeof parsed[key]!=='string'||!String(parsed[key]).trim())issues.push(`${key} 必须是非空字符串，不能是对象`)
  for(const key of ['priorities','risks','watchlist'])if(!Array.isArray(parsed[key]))issues.push(`${key} 必须是数组`)
  for(const key of ['risks','watchlist'])if(Array.isArray(parsed[key])&&parsed[key].some(item=>typeof item!=='string'))issues.push(`${key} 只能包含字符串，不能包含对象`)
  for(const [index,item] of (Array.isArray(parsed.priorities)?parsed.priorities:[]).entries()){
    const row=record(item)
    if(!item||typeof item!=='object'||Array.isArray(item)||['ticker','name','reason'].some(key=>typeof row[key]!=='string')||!Array.isArray(row.watchPoints)||row.watchPoints.some(item=>typeof item!=='string'))issues.push(`priorities[${index}] 必须包含 ticker、name、reason 字符串与 watchPoints 字符串数组`)
  }
  // The model explains directions only. Allocation numbers belong to local rules.
  if(/(?:[%％]|百分点|[零一二三四五六七八九十]+成仓|[0-9]+(?:\.[0-9]+)?\s*(?:万元|亿元|元|份)|\b(?:targetWeightPct|changeWeightPct|amount|targetAmount)\b)/.test(JSON.stringify(parsed)))issues.push('输出包含仓位数值或交易金额；只允许文字解释方向，比例和目标由本地程序展示')
  if(issues.length)throw new Error('持仓分析输出校验失败：'+issues.join('；'))
  return parsed
}

function localPortfolioSynthesis(context:Parameters<NonNullable<StepDefinition['execute']>>[0]){
  const support=record(context.artifacts.get('portfolio-decision-support'))
  const advice=record(context.artifacts.get('investment-advice'))
  const executive=record(advice.executiveSummary)
  const actions=Array.isArray(support.actions)?support.actions.map(item=>record(item)):[]
  const verified=actions.filter(item=>record(item.mapping).verified===true)
  const unresolved=actions.filter(item=>record(item.mapping).verified!==true)
  return {
    mode:'综合结论驱动的本地持仓分析',
    sourceConclusion:{rating:advice.rating||'未评级',conclusion:executive.conclusion||advice.thesis||'综合结论尚未形成',allocationStance:executive.allocationStance||null},
    portfolioView:{signal:support.signal||'未知',readiness:support.readiness||'blocked',currentIndustryWeightPct:support.currentIndustryWeightPct??null,targetIndustryRangePct:support.targetIndustryRangePct||null,proposedIndustryWeightPct:support.proposedIndustryWeightPct??null,cashWeightPct:support.cashWeightPct??null,proposedCashWeightPct:support.proposedCashWeightPct??null},
    conclusionApplication:record(support.researchConclusion).appliedToAllocation||'综合投资结论已作为新增风险门禁；确定性风控规则不由模型覆盖。',
    priorities:actions.map(item=>({ticker:item.ticker,name:item.name,domainAction:item.action,productExecution:record(item.mapping).verified?'已核验产品研究依据':record(item.mapping).fundType==='active'?'待补基金自身净值、持仓与资产配置':'待补正式产品关系与自身数据',reason:item.reason,gaps:item.gaps})),
    verificationBoundary:{verifiedProductCount:verified.length,pendingProductCount:unresolved.length,explanation:unresolved.length?'领域仓位结论已经生成；待核验仅指逐基金产品穿透、成本或交易时效，不代表整份持仓分析缺失。':'全部相关持仓已完成产品穿透。'},
  }
}
export const portfolioAnalysisStep: StepDefinition = {
  name: 'portfolio-analysis', description: '私有持仓风险与产业暴露分析', dependencies: ['portfolio-decision', 'assess-data-quality', 'investment-advice'], estimatedDuration: 20000,
  async execute(context) {
    const localSynthesis=localPortfolioSynthesis(context)
    const decisionSupport = context.artifacts.get('portfolio-decision-support')
    if (decisionSupport?.allocationVersion === 3) {
      await context.saveArtifact('portfolio-analysis', { ...localSynthesis, mode: '投资假设与备选方案比较', conclusionApplication: decisionSupport.alternatives?.selectionReason, evidenceBoundary: decisionSupport.alternatives?.evidenceBoundary }, 'DATA')
      await context.saveArtifact('portfolio-analysis-ai-status', context.artifacts.get('portfolio-allocation-ai-status') || { status: 'local-synthesis' }, 'DATA')
      await context.updateProgress(1, 1, '已保留模型方案取舍及本地资金计算，不重复生成持仓解释')
      return
    }
    if (context.input.publicOnly || context.input.rulesOnly) {
      await context.saveArtifact('portfolio-analysis',localSynthesis,'DATA')
      await context.saveArtifact('portfolio-analysis-ai-status',{status:'local-synthesis',reason:'未授权发送私有持仓；基于已完成的AI综合投资结论在本地形成结构化持仓分析'},'DATA')
      await context.updateProgress(1,1,'已根据综合投资结论生成本地持仓分析；逐基金待核验项单独标注')
      return
    }
    const destination = new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin
    if (context.input.portfolioAiConsent !== destination) throw new Error('需要明确授权将持仓名称、代码与比例发送至 ' + destination + '。账户金额、邮箱和份额不会发送。')
    const evidence = context.artifacts.get('portfolio-evidence') || {}
    const holdings = (Array.isArray(evidence.holdings) ? evidence.holdings : []) as Array<Record<string, unknown>>
    const redacted = { asOf: evidence.asOf, holdingCount: evidence.holdingCount, cashWeightPct: evidence.cashWeightPct, topFiveWeightPct: evidence.topFiveWeightPct, industryWeightPct: evidence.industryWeightPct, riskBudget: evidence.riskBudget, holdings: holdings.map(row => ({ ticker: row.ticker, name: row.name, category: row.category, industry: row.industry, industryMappingConfidence:row.industryMatchConfidence,weightPct: row.weightPct, fundType: row.fundType, targetEtfCode: row.targetEtfCode, targetIndexCode: row.targetIndexCode, productMappingConfidence: row.mappingConfidence, redemptionFeeKnown: typeof row.redemptionFeePct === 'number', costKnown: typeof row.costNav === 'number' })) }
    const investment = record(compactEvidence(context.artifacts.get('investment-advice')))
    const investmentConclusion = compactEvidence({rating:investment.rating,executiveSummary:investment.executiveSummary,tacticalView:investment.tacticalView,strategicView:investment.strategicView})
    const support=record(context.artifacts.get('portfolio-decision-support'))
    // Only ratios and execution flags cross the model boundary; amounts, units and costs stay local.
    const ratioSupport=compactEvidence({industry:support.industry,standardIndustryCapPct:typeof record(support.policy).maxIndustryRatio==='number'?Number(record(support.policy).maxIndustryRatio)*100:null,signal:support.signal,readiness:support.readiness,currentIndustryWeightPct:support.currentIndustryWeightPct,targetIndustryRangePct:support.targetIndustryRangePct,proposedIndustryWeightPct:support.proposedIndustryWeightPct,cashWeightPct:support.cashWeightPct,proposedCashWeightPct:support.proposedCashWeightPct,
      actions:(Array.isArray(support.actions)?support.actions:[]).map(value=>{const item=record(value);return {ticker:item.ticker,name:item.name,action:item.action,currentWeightPct:item.currentWeightPct,targetWeightPct:item.targetWeightPct,changeWeightPct:item.changeWeightPct,verified:record(item.mapping).verified}}),
      gates:(Array.isArray(support.gates)?support.gates:[]).map(value=>{const gate=record(value);return {label:gate.label,met:gate.met}}),
    })
    const prompt = '基于以下持仓比例快照、最终综合投资结论和确定性组合门禁结果，给出账户本人的组合调整解释。必须明确说明综合结论如何作用于当前产业暴露、现金缓冲和逐基金动作，并指出最有价值的优先调整项与暂不调整项。不要改变程序计算的目标区间、金额或可执行状态；不要猜测收益率、成本或实时价格。当前领域仓位只与本领域上限比较，禁止把机器人、创新药等其他领域相加后对比单产业上限。常规上限与风险收缩后的动态目标上限分开解释。现金不足应允许降低风险的方案逐步修复，不得要求先达到现金底线才允许减仓。分类不是穿透持仓；未通过全部门禁时不得给出确定交易指令。输出严格JSON：{"analysis":"整体解释","conclusionApplication":"结论如何作用于持仓","priorities":[{"ticker":"代码","name":"名称","reason":"解释","watchPoints":["观察项"]}],"risks":["风险"],"watchlist":["观察项"]}。analysis与conclusionApplication必须是非空字符串，其余为数组。所有文字禁止复述或新增百分比、百分点、交易金额及目标数值，比例由本地面板展示。整份最多700个中文字，priorities最多3项，每项reason最多60字；risks与watchlist各最多3条。不要Markdown或JSON外说明。只解释程序提供的仓位与动作，不重新输出目标数值或交易金额，供账户本人阅读。\n综合投资结论：' + JSON.stringify(investmentConclusion) + '\n持仓比例：' + JSON.stringify(compactEvidence(redacted)) + '\n组合门禁：' + JSON.stringify(ratioSupport) + '\n市场质量：' + JSON.stringify(qualityBoundary(context.artifacts.get('data-quality')))
    try {
      const result = await runAnalysisPrompt(context, { system: '你是审慎的组合风险研究员。只依据输入比例和已计算门禁解释持仓，不推断金额、份额或个人身份。', messages: [{ role: 'user', content: prompt }], max_tokens: 5120, effort:'low',timeoutMs:180000,maxAttempts:3,validateOutput:validatePortfolioOutput })
      const aiAnalysis=validatePortfolioOutput(result.content[0].text)
      await context.saveArtifact('portfolio-analysis',{...localSynthesis,mode:'授权 AI 持仓分析',aiAnalysis},'DATA')
      await context.saveArtifact('portfolio-analysis-ai-status',{status:'completed'},'DATA')
    } catch(error) {
      if(!recoverableAnalysisError(error))throw error
      await context.saveArtifact('portfolio-analysis',localSynthesis,'DATA')
      await context.saveArtifact('portfolio-analysis-ai-status',{status:'fallback',reason:'持仓智能解读未完成，保留本地穿透、仓位与风险门禁结果',detail:error instanceof Error?error.message:String(error)},'DATA')
    }
    await context.updateProgress(1,1,'持仓分析已归档；智能解读状态见校验结果')
  }
}
