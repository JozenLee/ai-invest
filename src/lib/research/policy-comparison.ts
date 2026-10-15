import type { Evaluation, ResearchSnapshot } from './contracts'
import { compactReplaySnapshot, replayResearch, type ReplayCosts } from './replay'
import { normalizeAIProductDecisions } from '@/lib/analysis/investment-conclusion'

export type ArchivedPolicy = { evaluation:Evaluation; generatedAt:string; investmentAdvice:unknown }
/** Fair comparison: both policies become available at report publication time.
 * This next-open experiment never invents intraday fills or extends an expiry. */
export function compareResearchPolicies(snapshot:ResearchSnapshot, reports:ArchivedPolicy[], costs:ReplayCosts={commissionBps:3,slippageBps:5}) {
  const valid=reports.filter(row=>row.evaluation.profile.industryId===snapshot.profile.industryId&&Date.parse(row.generatedAt)>=Date.parse(row.evaluation.asOf)&&Date.parse(row.generatedAt)<Date.parse(snapshot.asOf))
    .sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt))
  const bySession=new Map<string,ArchivedPolicy>()
  for(const report of valid){
    // A pre-open review supersedes last night's signal for the same future
    // opening. Do not group by the price session (yesterday's close).
    const nextOpen=snapshot.calendar.filter(day=>day.open&&Date.parse(`${day.date}T09:30:00+08:00`)>Date.parse(report.generatedAt)).sort((a,b)=>a.date.localeCompare(b.date))[0]
    bySession.set(nextOpen?.date||report.generatedAt,report)
  }
  const ordered=[...bySession.values()]
  const template=compactReplaySnapshot(snapshot)
  const snapshots=ordered.map(row=>({...structuredClone(template),id:row.evaluation.snapshotId,asOf:row.generatedAt,capturedAt:row.generatedAt}))
  // Add only a terminal price observation, with no fabricated current signal.
  snapshots.push({...template,id:`price-observation:${snapshot.id}`})
  const ruleEvaluations=ordered.map(row=>({...row.evaluation,asOf:row.generatedAt}))
  let executableAIProducts=0,excludedAIProducts=0
  const aiEvaluations=ordered.map(row=>{
    let advice:Record<string,unknown>={}
    try{advice=typeof row.investmentAdvice==='string'?JSON.parse(row.investmentAdvice):row.investmentAdvice as Record<string,unknown>||{}}catch{}
    const products=normalizeAIProductDecisions(advice.productDecisions,row.evaluation.decisions.map(item=>item.ticker))
    return {...row.evaluation,asOf:row.generatedAt,decisions:row.evaluation.decisions.map(decision=>{
      const ai=products.find(item=>item.ticker===decision.ticker),contract=ai?.executionContract
      const executable=contract?.status==='verified'&&Date.parse(contract.validUntil)>Date.parse(row.generatedAt)&&Array.isArray(contract.triggerRules)&&contract.triggerRules.every(rule=>rule.status===(rule.requiredStatus||'met'))
      if(executable)executableAIProducts++;else excludedAIProducts++
      const state:typeof decision.state=!executable?'blocked':ai?.heldAction==='减仓'?'risk-off':ai?.unheldAction==='建仓'?'eligible':'watch'
      return {...decision,state,expiresAt:contract?.validUntil||row.generatedAt}
    })}
  })
  const rules=replayResearch(snapshots,ruleEvaluations,costs),ai=replayResearch(snapshots,aiEvaluations,costs)
  const metrics=(result:ReturnType<typeof replayResearch>)=>result.results.map(row=>{
    const record=row as unknown as Record<string,unknown>
    const sufficient=Number(record.observations||0)>=252&&row.trades.length>=30
    return {ticker:row.ticker,trades:row.trades.length,observations:Number(record.observations||0),performanceUsable:sufficient,
      returnPct:sufficient?row.returnPct:null,buyAndHoldReturnPct:sufficient?record.buyAndHoldReturnPct??null:null,
      excessOverBuyAndHoldPct:sufficient?record.excessOverBuyAndHoldPct??null:null,maxDrawdownPct:sufficient?row.maxDrawdownPct:null,
      skipped:record.skipped||[]}
  })
  return {status:'paper-only',reports:ordered.length,executableAIProducts,excludedAIProducts,costs,rules:metrics(rules),ai:metrics(ai),
    basis:'同一报告可用时点、后续开盘和成本下比较规则、AI与买入持有。AI组合仓位幅度未模拟；只评估场内ETF方向，不能代表联接基金申赎或真实账户收益。过期与未核验合同不成交。达到252观察值和30笔交易仍需样本外验证。'}
}
