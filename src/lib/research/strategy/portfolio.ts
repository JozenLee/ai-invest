import { buildDailyPlan, type DailyAccount } from '../lab/daily-plan'
import type { UnifiedDecisionVersion } from '../decision-ledger'
import type { Evaluation } from '../contracts'
import type { PortfolioDecisionSupport } from '@/lib/portfolio/decision-support'

/** Report and daily view project the same execution planner into their UI contracts. */
export function unifiedPortfolioSupport(input:{base:PortfolioDecisionSupport;decision:UnifiedDecisionVersion;evaluation:Evaluation;account:DailyAccount;now:string;prices:Record<string,number>;externalBlockers?:Record<string,string[]>}):PortfolioDecisionSupport{
  const plan=buildDailyPlan({evaluation:input.evaluation,decisionVersion:input.decision,account:input.account,now:input.now,prices:input.prices,externalBlockers:input.externalBlockers})
  const actions=plan.actions.map(row=>{
    const old=input.base.actions.find(a=>a.ticker===row.ticker)
    const product=input.decision.products.find(p=>p.ticker===row.decisionTicker)
    return {ticker:row.ticker,name:row.name,action:row.side==='buy'?'加仓' as const:row.side==='sell'?'减仓' as const:'持有' as const,currentWeightPct:row.currentWeightPct||0,targetWeightPct:row.status==='blocked'?null:row.targetWeightPct,changeWeightPct:row.status==='blocked'?null:row.changeWeightPct,amount:row.amount,estimatedUnits:row.referenceUnits,estimatedFee:row.estimatedFee,batches:1,executable:row.status!=='blocked',reason:row.reason,trigger:row.trigger,invalidation:row.invalidation,mapping:old?.mapping||{ticker:row.ticker,fundType:row.instrument,targetEtfCode:row.decisionTicker,targetIndexCode:input.evaluation.decisions.find(d=>d.ticker===row.decisionTicker)?.indexCode||null,decisionTicker:row.decisionTicker,method:'direct-etf' as const,confidence:1,verified:true},gaps:row.blockers,aiDecision:product?{...product,decisionSource:'ai' as const,quantitativeOverride:null}:old?.aiDecision,constraintNotes:row.checks}
  })
  const delta=actions.reduce((sum,a)=>sum+(a.changeWeightPct||0),0)
  return {...input.base,allocationVersion:4,allocationBasis:`统一策略 ${input.decision.strategyVersionId}；归档目标与每日执行共用同一账户计划器`,actions,summary:plan.summary,readiness:plan.blockers.length?'blocked':actions.every(a=>a.executable)?'advice-ready':'limited-advice',proposedIndustryWeightPct:input.base.currentIndustryWeightPct+delta,proposedCashWeightPct:input.base.cashWeightPct-delta,gates:[...input.base.gates,{key:'unified-plan',label:'统一目标执行约束',met:!plan.blockers.length,detail:plan.blockers.join('；')||'共享决策与执行入口'}]}
}
