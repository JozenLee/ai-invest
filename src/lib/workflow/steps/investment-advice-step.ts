import { prepareUnifiedAllocation } from '@/lib/research/strategy/store'
import { RESEARCH_INPUT_CHARACTERS } from '../research-budgets'
import { validateDecisionFacts, validateProductEvidence } from '@/lib/analysis/decision-audit'
import { effectiveDecisionTiming } from '@/lib/analysis/decision-timing'
import { runAnalysisPrompt } from '../analysis-prompt'
import { auditedResearchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput, validateResearchOutput, valuationNarrative } from '../research-output'
import { reportAdviceConfidence, indexRuleSummary } from '@/lib/analysis/report-insights'
import { deterministicScenarios } from '@/lib/analysis/report-insights'
import { workflowEffort } from '../method-config'
import { decisionSemanticIssues, attachExecutionContracts, discloseQuantitativeOverrides, normalizeAIProductDecisions } from '@/lib/analysis/investment-conclusion'

/**
 * 步骤12: 投资建议
 */
export const investmentAdviceStep: StepDefinition = {
  name: 'investment-advice',
  description: '投资建议',
  dependencies: ['assess-data-quality', 'industry-overview', 'etf-actions'],
  estimatedDuration: 20000,

  async execute(context) {
    if(context.input.rulesOnly){
      const { prisma }=await import('@/lib/db')
      const { revalidateAdvice }=await import('@/lib/research/revalidate-advice')
      if(!context.input.parentRunId)throw new Error('盘前复核需要已归档的母报告，请先完成一次综合分析')
      const parent=await prisma.aIAnalysisReport.findFirst({where:{type:'comprehensive',dataJson:{contains:`"runId":"${context.input.parentRunId}"`}},orderBy:{createdAt:'desc'}})
      const data=parent?.dataJson?JSON.parse(parent.dataJson):null
      if(!data?.investmentAdvice||!data.researchEvaluation)throw new Error('母报告缺少可复核的AI观点与冻结评估')
      const advice=revalidateAdvice({advice:data.investmentAdvice,previous:data.researchEvaluation,current:context.artifacts.get('research-evaluation'),snapshot:context.artifacts.get('research-snapshot'),sourceReportId:parent!.id})
      await context.saveArtifact('investment-advice',JSON.stringify(advice),'DATA')
      const allocation=await prepareUnifiedAllocation({evaluation:context.artifacts.get('research-evaluation'),advice,snapshot:context.artifacts.get('research-snapshot'),runId:context.runId,generatedAt:new Date().toISOString()})
      await context.saveArtifact('unified-allocation',allocation,'DATA')
      await context.saveArtifact('investment-advice-ai-status',{status:'deterministic',reason:'原AI观点按新快照复核，保留原始来源；材料变化不自动延续'},'DATA')
      await context.saveArtifact('investment-advice-review-audit',advice.reviewAudit,'DATA')
      await context.updateProgress(1,1,'已用本轮冻结证据复核原观点与执行条件')
      return
    }
    await context.updateProgress(0, 1, '正在生成投资建议...')

    const prompt = await auditedResearchPrompt(context, 'investment-advice')

    const expectedTickers=(context.artifacts.get('research-evaluation')?.decisions||[]).map((item:{ticker:string})=>item.ticker)
    let result:string
    try{
      const response = await runAnalysisPrompt(context, {
        // The primary model repeatedly exceeds the five-minute SLA on the
        // ten-product execution contract. Use the responsive model here while
        // retaining medium/high workflow effort and strict post-validation.
        model:process.env.CLAUDE_FAST_MODEL||process.env.CLAUDE_MODEL,
        max_tokens:5120,
        maxInputCharacters:RESEARCH_INPUT_CHARACTERS['investment-advice'],
        effort:workflowEffort(context,'investment-advice'),
        timeoutMs:180000,
        maxAttempts:2,
        validateOutput:(text)=>{
          const clean=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')
          const value=JSON.parse(clean)
          if(!value?.executiveSummary||!value?.recommendation||!value?.tacticalView||!value?.strategicView)throw new Error('AI投资决策缺少核心字段')
          validateDecisionFacts(value,context.artifacts.get('research-evaluation'))
          validateProductEvidence(value,context.artifacts.get('research-evaluation'))
          for(const item of value.productDecisions||[]){
            const keys=item.triggerConditionKeys||[],states=item.triggerConditionStates||{}
            if(!Array.isArray(keys)||keys.some((key:string)=>!['market','trend','relative','flow','premium','liquidity','spread'].includes(key))||typeof states!=='object'||Array.isArray(states)||Object.values(states).some(state=>state!=='met'&&state!=='unmet'))throw new Error('执行条件校验失败：必须使用允许的条件key和met/unmet状态，不可引用目录序号或自造指标')
          }
          const products=normalizeAIProductDecisions(value.productDecisions,expectedTickers,true)
          const semanticIssues=products.flatMap(decisionSemanticIssues)
          const conflicts=discloseQuantitativeOverrides(products,context.artifacts.get('research-evaluation').decisions).disclosed
          if(conflicts.length)semanticIssues.push(`${conflicts.join('、')}处于风险收缩却仍持有或增加暴露，须提供更强证据与撤销条件；若风险退出有依据，应给出减仓方向，执行门禁单独核验；若无法判断则观望并列出待核验条件，不得将等待买入恢复作为持有理由`)
          if(semanticIssues.length)throw new Error(`执行条件校验失败：${semanticIssues.join('；')}`)
          if(products.some(item=>item.suggestedAdjustmentPct>5))throw new Error('执行条件校验失败：调整幅度单位为组合总资产百分点，单日建议不得超过5个百分点')
          return value
        },
      system: RESEARCH_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
      result = response.content[0].type === 'text' ? response.content[0].text : '{}'
      await context.saveArtifact('investment-advice-ai-status',{status:'completed'},'DATA')
    }catch(error){
      await context.saveArtifact('investment-advice-ai-status',{status:'failed',reason:'智能投资决策未完成；未使用规则生成替代观点'},'DATA')
      throw error
    }

    const evaluation=context.artifacts.get('research-evaluation')
    if(!evaluation)throw new Error('缺少冻结量化评估，无法生成逐产品执行合同')
    const clean=result.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')
    const adviceData=JSON.parse(clean)
    const graph=context.artifacts.get('graph-context')||context.artifacts.get('research-snapshot')?.graphContext
    const exposureRows=Array.isArray(graph?.etfExposure)?graph.etfExposure:[]
    adviceData.etfImplications=expectedTickers.map((ticker:string)=>{
      const exposure=exposureRows.find((item:{code?:string})=>item.code===ticker)
      const segments=(exposure?.segments||[]).slice(0,3)
      const segmentNames=[...new Set(segments.map((item:{segmentName?:string})=>item.segmentName).filter(Boolean))]
      const companies=[...new Set(segments.flatMap((item:{matchedCompanies?:Array<{name?:string;code?:string}>})=>(item.matchedCompanies||[]).map(company=>company.name||company.code).filter(Boolean)))].slice(0,5)
      return {ticker,exposureRationale:segmentNames.length?`已发布产业图谱覆盖${segmentNames.join('、')}`:'本轮未取得可核验的细分环节暴露',segments:segmentNames,companies,evidenceBoundary:'产业映射用于解释暴露；只有披露持仓验证的关系才用于权重计算，不代表实时持仓。'}
    })
    adviceData.scenarios=deterministicScenarios(evaluation)||{base:{conditions:'证据不足',probability:null,expectedReturn:null},bull:{conditions:'证据不足',probability:null,expectedReturn:null},bear:{conditions:'证据不足',probability:null,expectedReturn:null}}
    const overviewRaw=context.artifacts.get('industry-overview')
    const overview=(()=>{try{return typeof overviewRaw==='string'?JSON.parse(overviewRaw):overviewRaw||{}}catch{return {}}})()
    const executive=adviceData.executiveSummary||{}
    adviceData.thesis=String(executive.conclusion||adviceData.strategicView?.thesis||'')
    adviceData.counterEvidence=Array.isArray(overview.counterEvidence)?overview.counterEvidence.slice(0,3):[]
    adviceData.risks=Array.isArray(executive.mainRisks)?executive.mainRisks.slice(0,3):[]
    adviceData.watchlist=Array.isArray(executive.watchPoints)?executive.watchPoints.slice(0,3):[]
    const validated=await saveValidatedResearchOutput(context,'investment-advice',JSON.stringify(adviceData))
    Object.assign(adviceData,JSON.parse(validated))
    const normalizedDecisions=normalizeAIProductDecisions(adviceData.productDecisions,expectedTickers,true)
    const consistency=discloseQuantitativeOverrides(normalizedDecisions,evaluation.decisions.map((item:{ticker:string;state:string})=>({ticker:item.ticker,state:item.state})))
    adviceData.productDecisions=attachExecutionContracts(consistency.decisions.map(item=>({...item,adjustmentUnit:'portfolio-percentage-points' as const})),evaluation)
    const timing=context.artifacts.get('decision-timing')
    if(timing&&!effectiveDecisionTiming(timing).executionReady)adviceData.productDecisions=adviceData.productDecisions.map((item:ReturnType<typeof attachExecutionContracts>[number])=>({...item,executionContract:{...item.executionContract,status:'blocked',blockers:[...new Set([...(item.executionContract?.blockers||[]),'本轮行情或事件时效未通过'])]}}))
    await context.saveArtifact('investment-advice-consistency-validation',{status:consistency.disclosed.length?'limited':'passed',issues:consistency.disclosed.map(ticker=>`${ticker}量化冲突缺少模型解释，保留观点但禁止执行`),disclosuresAdded:consistency.disclosed.length,tickers:consistency.disclosed,note:consistency.disclosed.length?'程序仅补充量化冲突披露，未改变AI动作方向或幅度':'AI已完整披露量化冲突'},'DATA')
    adviceData.confidencePct=reportAdviceConfidence(evaluation,context.artifacts.get('data-quality'))
    // Preserve the model's assessment. Execution constraints are a separate,
    // explicitly labelled rule result rather than an overwrite of AI advice.
    adviceData.recommendationSource='AI投资决策；程序仅应用产品范围、数据时效、风险预算、费用与单日最大调整幅度'
    adviceData.ruleAssessment=indexRuleSummary(evaluation)
    adviceData.productSelection=evaluation?.productComparisons||[]
    adviceData.strategicView={...(adviceData.strategicView||{}),valuation:valuationNarrative(context.artifacts.get('research-evaluation')?.products||[])}
    const enriched=JSON.stringify(adviceData)
    await context.saveArtifact('investment-advice',enriched,'DATA')
    const allocation=await prepareUnifiedAllocation({evaluation,advice:adviceData,snapshot:context.artifacts.get('research-snapshot'),runId:context.runId,generatedAt:new Date().toISOString()})
    await context.saveArtifact('unified-allocation',allocation,'DATA')

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
