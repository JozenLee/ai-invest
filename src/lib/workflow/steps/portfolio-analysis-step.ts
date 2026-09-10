import { recoverableAnalysisError, runAnalysisPrompt } from '../analysis-prompt'
import { parseResearchObject } from '../research-output'
import type { StepDefinition } from '../types'
import { compactEvidence, qualityBoundary } from '../research-input'
type Row=Record<string,unknown>
const record=(value:unknown):Row=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Row;try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}}

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
    priorities:actions.map(item=>({ticker:item.ticker,name:item.name,domainAction:item.action,productExecution:record(item.mapping).verified?'已完成产品穿透':'待补正式底层ETF/指数映射',reason:item.reason,gaps:item.gaps})),
    verificationBoundary:{verifiedProductCount:verified.length,pendingProductCount:unresolved.length,explanation:unresolved.length?'领域仓位结论已经生成；待核验仅指逐基金产品穿透、成本或交易时效，不代表整份持仓分析缺失。':'全部相关持仓已完成产品穿透。'},
  }
}
export const portfolioAnalysisStep: StepDefinition = {
  name: 'portfolio-analysis', description: '私有持仓风险与产业暴露分析', dependencies: ['portfolio-decision', 'assess-data-quality', 'investment-advice'], estimatedDuration: 20000,
  async execute(context) {
    const localSynthesis=localPortfolioSynthesis(context)
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
    const prompt = '基于以下持仓比例快照、最终综合投资结论和确定性组合门禁结果，给出账户本人的组合调整解释。必须明确说明综合结论如何作用于当前产业暴露、现金缓冲和逐基金动作，并指出最有价值的优先调整项与暂不调整项。不要改变程序计算的目标区间、金额或可执行状态；不要猜测收益率、成本或实时价格。当前领域仓位只与本领域上限比较，禁止把机器人、创新药等其他领域相加后对比单产业上限。常规上限与风险收缩后的动态目标上限分开解释。现金不足应允许降低风险的方案逐步修复，不得要求先达到现金底线才允许减仓。分类不是穿透持仓；未通过全部门禁时不得给出确定交易指令。输出中文JSON：{analysis,conclusionApplication,priorities:[{ticker,name,reason,watchPoints:[]}],risks:[],watchlist:[]}。只解释程序提供的仓位与动作，不重新输出目标数值或交易金额，供账户本人阅读。\n综合投资结论：' + JSON.stringify(investmentConclusion) + '\n持仓比例：' + JSON.stringify(compactEvidence(redacted)) + '\n组合门禁：' + JSON.stringify(ratioSupport) + '\n市场质量：' + JSON.stringify(qualityBoundary(context.artifacts.get('data-quality')))
    try {
      const result = await runAnalysisPrompt(context, { system: '你是审慎的组合风险研究员。只依据输入比例和已计算门禁解释持仓，不推断金额、份额或个人身份。', messages: [{ role: 'user', content: prompt }], max_tokens: 5120, effort:'low',timeoutMs:180000,validateOutput:(text)=>{
        const parsed=parseResearchObject(text)
        if(!parsed || typeof parsed.analysis!=='string' || !Array.isArray(parsed.priorities))throw new Error('持仓分析输出缺少字段')
      } })
      const aiAnalysis=parseResearchObject(result.content[0].text)
      await context.saveArtifact('portfolio-analysis',{...localSynthesis,mode:'授权 AI 持仓分析',aiAnalysis},'DATA')
      await context.saveArtifact('portfolio-analysis-ai-status',{status:'completed'},'DATA')
    } catch(error) {
      if(!recoverableAnalysisError(error))throw error
      await context.saveArtifact('portfolio-analysis',localSynthesis,'DATA')
      await context.saveArtifact('portfolio-analysis-ai-status',{status:'fallback',reason:'持仓智能解读未完成，保留本地穿透、仓位与风险门禁结果'},'DATA')
    }
    await context.updateProgress(1,1,'私有组合分析完成')
  }
}
