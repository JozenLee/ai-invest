import { accountConflictBlockers } from '@/lib/research/strategy/account-conflicts'
import { buildUnifiedDecisionVersion } from '@/lib/research/decision-ledger'
import { unifiedPortfolioSupport } from '@/lib/research/strategy/portfolio'
import { finalizeDecisionTiming } from '@/lib/analysis/decision-timing'
import { applyDecisionTimingGate, buildPortfolioDecisionSupport, type PortfolioHoldingInput, type RiskBudget } from '@/lib/portfolio/decision-support'
import type { Evaluation } from '@/lib/research/contracts'
import type { StepDefinition } from '../types'
import { persistAndReconcilePortfolioActions } from '@/lib/portfolio/action-ledger'

export const portfolioDecisionStep: StepDefinition = {
  name: 'portfolio-decision', description: '对AI逐产品动作应用持仓穿透、每日调整比例、风险预算与成本门禁', dependencies: ['fetch-portfolio', 'etf-actions', 'assess-data-quality', 'investment-advice'], estimatedDuration: 1200,
  async execute(context) {
    const portfolio = context.artifacts.get('portfolio-evidence') as { excluded?: boolean; portfolioId?:string;asOf?: string | null; sourceAsOf?:string|null;syncedAt?:string|null;totalAssets?: number; cashWeightPct?: number; holdings?: PortfolioHoldingInput[]; riskBudget?: RiskBudget } | undefined
    const evaluation = context.artifacts.get('research-evaluation') as Evaluation | undefined
    if (portfolio?.excluded) { await context.saveArtifact('portfolio-decision-support', null, 'DATA'); await context.updateProgress(1, 1, '没有可用持仓，个人组合投资建议已跳过'); return }
    if (!portfolio || !evaluation || !portfolio.totalAssets || !portfolio.riskBudget) throw new Error('缺少组合快照、风险预算或规则评估')
    let support = buildPortfolioDecisionSupport({ evaluation, holdings: portfolio.holdings || [], totalAssets: portfolio.totalAssets, cashWeightPct: portfolio.cashWeightPct || 0, policy: portfolio.riskBudget, dataQualityAvailable: context.artifacts.get('data-quality')?.status === 'available', portfolioAsOf: portfolio.sourceAsOf||portfolio.asOf||null,portfolioSyncedAt:portfolio.syncedAt||null, investmentAdvice: context.artifacts.get('investment-advice') })
    const allocation=context.artifacts.get('unified-allocation')
    if(allocation){
      const decision=buildUnifiedDecisionVersion({reportId:`pending:${context.runId}`,runId:context.runId,industryId:evaluation.profile.industryId,snapshotId:evaluation.snapshotId,generatedAt:allocation.generatedAt,horizonTradingDays:evaluation.profile.horizonDays,evaluation,investmentAdvice:context.artifacts.get('investment-advice'),allocation,reportQuality:{usability:context.artifacts.get('data-quality')?.status==='available'?'advice-grade':'insufficient',executionReadinessScore:context.artifacts.get('data-quality')?.status==='available'?100:0}})
      const account={portfolioId:portfolio.portfolioId||'unassigned',asOf:portfolio.sourceAsOf||portfolio.asOf||null,totalAssets:portfolio.totalAssets,cashWeightPct:portfolio.cashWeightPct||0,holdings:portfolio.holdings||[],riskBudget:portfolio.riskBudget}
      const externalBlockers=await accountConflictBlockers(evaluation.profile.industryId,allocation,evaluation,account,allocation.generatedAt)
      support=unifiedPortfolioSupport({externalBlockers,base:support,decision,evaluation,account:{portfolioId:portfolio.portfolioId||'unassigned',asOf:portfolio.sourceAsOf||portfolio.asOf||null,totalAssets:portfolio.totalAssets,cashWeightPct:portfolio.cashWeightPct||0,holdings:portfolio.holdings||[],riskBudget:portfolio.riskBudget},now:allocation.generatedAt,prices:Object.fromEntries((context.artifacts.get('research-snapshot')?.etfs||[]).map((etf:{ticker:string;bars:Array<{date:string;close:number}>})=>[etf.ticker,etf.bars.find(bar=>bar.date===allocation.sourceDate)?.close||0]))})
    }
    const timing=context.artifacts.get('decision-timing')
    if(timing) support=applyDecisionTimingGate(support,finalizeDecisionTiming(timing,new Date().toISOString()))!
    if(portfolio.portfolioId&&!allocation){
      const ledger=await persistAndReconcilePortfolioActions({portfolioId:portfolio.portfolioId,runId:context.runId,industry:evaluation.profile.name,asOf:evaluation.asOf,confidencePct:support.confidencePct,totalAssets:portfolio.totalAssets,cashWeightPct:portfolio.cashWeightPct||0,policy:portfolio.riskBudget,actions:support.actions})
      const resolved=new Map(ledger.actions.map(action=>[action.ticker,action]))
      const actions=support.actions.map(action=>resolved.get(action.ticker)||action)
      const delta=actions.reduce((sum,action)=>sum+(action.changeWeightPct||0),0)
      support={...support,actions,proposedIndustryWeightPct:Number((support.currentIndustryWeightPct+delta).toFixed(2)),proposedCashWeightPct:Number(((portfolio.cashWeightPct||0)-delta).toFixed(2)),actionLedger:{asOf:ledger.asOf,conflicts:ledger.conflicts,sourceRunIds:ledger.sourceRunIds,basis:ledger.basis}}
    }
    await context.saveArtifact('portfolio-decision-support', support, 'DATA')
    await context.updateProgress(1, 1, `${support.actions.length}只实际持仓已生成投资建议；综合置信度 ${support.confidencePct.toFixed(1)}%`)
  },
}
