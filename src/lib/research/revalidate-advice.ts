import { attachExecutionContracts, normalizeAIProductDecisions } from '@/lib/analysis/investment-conclusion'
import { chinaDate } from './time'
import type { Evaluation, ResearchSnapshot } from './contracts'
import { auditFinancialFacts, financialFacts } from '@/lib/analysis/financial-facts'
import { effectiveDecisionTiming } from '@/lib/analysis/decision-timing'

/** Renew conditions, never an AI thesis. Material evidence changes require a
 * new analysis; the original provenance survives successive morning reviews. */
export function revalidateAdvice(input: { advice: unknown; previous: Evaluation; current: Evaluation; snapshot: ResearchSnapshot; sourceReportId: string }) {
  const advice = (typeof input.advice === 'string' ? JSON.parse(input.advice) : input.advice) as Record<string,unknown> || {}
  const {previous,current,snapshot} = input
  const products=normalizeAIProductDecisions(advice.productDecisions,current.decisions.map(row=>row.ticker))
  const oldEvents=new Map(previous.events.map(event=>[event.id,JSON.stringify([event.evidenceIds,event.excerpt,event.category])]))
  const changedEvents=current.events.filter(event=>event.status==='evidence'&&event.category!=='administrative'&&(event.category==='risk'||event.priority>=4||event.influenceLevel==='high')&&oldEvents.get(event.id)!==JSON.stringify([event.evidenceIds,event.excerpt,event.category]))
  const financialIssues=auditFinancialFacts(advice,financialFacts(snapshot.projections['fetch-company-data']?.['company-market-data']))
  const productDecisions=products.map(product=>{
    const old=previous.decisions.find(row=>row.ticker===product.ticker),fresh=current.decisions.find(row=>row.ticker===product.ticker)!
    const sourceAsOf=product.reviewProvenance?.sourceAsOf||previous.asOf
    const elapsed=snapshot.calendar.filter(day=>day.open&&day.date>chinaDate(sourceAsOf)&&day.date<=chinaDate(current.asOf)).length
    const reasons:string[]=[]
    if(financialIssues.length)reasons.push('原观点财务事实与本轮冻结口径不一致，需要重新分析')
    if(elapsed>3||Date.parse(current.asOf)-Date.parse(sourceAsOf)>7*86400000)reasons.push('原AI观点超过3个交易日或7个自然日，需要重新分析')
    if(Date.parse(current.asOf)<=Date.parse(previous.asOf))reasons.push('复核快照必须晚于原研究快照')
    if(!product.executionContract)reasons.push('原报告缺少执行合同，不能通过规则复核补造')
    if(changedEvents.length)reasons.push(`新增或修订${changedEvents.length}项材料性事件，需要AI重新评估`)
    if(old?.indexCode!==fresh.indexCode||previous.profile.benchmark!==current.profile.benchmark||JSON.stringify(previous.profile.rules)!==JSON.stringify(current.profile.rules)||JSON.stringify(previous.profile.sectors)!==JSON.stringify(current.profile.sectors))reasons.push('研究标的映射或方法改变，需要重新分析')
    const fundamentalKeys=['holdings','fundamentals','profit-growth','cash-quality']
    if(fundamentalKeys.some(key=>JSON.stringify(old?.conditions.find(row=>row.key===key))!==JSON.stringify(fresh.conditions.find(row=>row.key===key))))reasons.push('持仓或基本面证据改变，需要重新分析')
    for(const rule of product.executionContract?.triggerRules||[]){
      const now=fresh.conditions.find(row=>row.key===rule.key)
      if(!now||now.operator!==rule.operator||now.threshold!==rule.threshold||now.label!==rule.label)reasons.push('触发指标口径改变，需要重新确认')
    }
    if(product.reviewProvenance?.status==='requires-new-analysis')reasons.push('上轮已要求新分析，规则复核不能解除')
    const inheritedBlockers=(product.executionContract?.blockers||[]).filter(reason=>!['模型选择的触发条件尚未满足','产品行情、复权或交易条件未通过','本轮行情或事件时效未通过'].includes(reason))
    reasons.push(...inheritedBlockers)
    // Bind current checks to current evidence; source opinion remains explicitly
    // dated and linked to its original report, never passed off as fresh AI work.
    const updated=attachExecutionContracts([{...product,evidenceIds:fresh.evidenceIds.filter(id=>current.evidence.some(row=>row.id===id)).slice(0,3),
      trigger:product.executionContract?.modelTrigger||product.trigger,
    }],current)[0]
    const timingBlocked=snapshot.decisionTiming&&!effectiveDecisionTiming(snapshot.decisionTiming,current.asOf).executionReady
    const blockers=[...new Set([...(updated.executionContract?.blockers||[]),...reasons,...(timingBlocked?['本轮行情或事件时效未通过']:[])])]
    return {...updated,reviewProvenance:{sourceAsOf,reviewedAsOf:current.asOf,sourceReportId:product.reviewProvenance?.sourceReportId||input.sourceReportId,status:reasons.length?'requires-new-analysis' as const:'revalidated' as const,reasons:[...new Set(reasons)]},
      executionContract:{...updated.executionContract!,status:blockers.length?'blocked' as const:updated.executionContract!.status,blockers}}
  })
  return {...advice,productDecisions,productSelection:current.productComparisons||[],recommendationSource:'原AI观点保留原始日期；本轮仅在新冻结证据上复核条件，不生成或改写投资方向',
    reviewAudit:{sourceReportId:input.sourceReportId,reviewedAsOf:current.asOf,changedMaterialEvents:changedEvents.map(event=>event.id),missingProducts:current.decisions.filter(row=>!products.some(product=>product.ticker===row.ticker)).map(row=>row.ticker)}}
}
