import type { Bar } from '../contracts'

export const LAB_VERSION = '2.0.0'
export type StrategySpec = {
  id: string; name: string; version: string
  entryMode?: 'confirmed' | 'graded' | 'probe'
  drawdownBudget: number; exposure: number; maxWeight: number; targetVolatility: number
  rebalanceSessions: number; topN: number
  modules: Array<'momentum' | 'relative-strength' | 'trend' | 'volatility'>
}
export type HistoricalExecutionRules={
  lotSize:number;minimumCommission:number;maxParticipation:number;settlementSessions:number
  // Explicit historical availability; absence is unknown, never tradable by default.
  sessions:Record<string,{canBuy:boolean;canSell:boolean;source:string;availableAt:string}>
}
export type LabAsset = { ticker: string; indexCode: string; bars: Bar[];rawBars?:Bar[];execution?:HistoricalExecutionRules }
export type LabDataset = {
  snapshotId: string; asOf: string; benchmark: string; benchmarkBars: Bar[]; assets: LabAsset[]
  exclusions: Array<{ ticker: string; reason: string }>
  limitations: string[]
}
export type ModuleValue = { id: string; version: string; value: number | null; unit: string; evidenceIds?: string[] }
export type TargetPlan = {
  decisions?: Array<{ticker:string;status:'eligible'|'watch'|'missing';reason:string;trigger:string;invalidation:string}>
  rebalance?: boolean; scheduledSession?: string
  id: string; strategyId: string; generatedAt: string; validUntil: string; sourceDate: string
  decisionVersionId?: string | null; policyVersionId?: string
  targets: Record<string, number>; reason: string
  features: Array<{ ticker: string; modules: ModuleValue[] }>
}
export type PaperFill = { planId: string; date: string; ticker: string; side: 'buy' | 'sell'; units: number; price: number; notional: number; cost: number;executionUnits?:number;executionPrice?:number }
export type PaperResult = {
  strategyId: string; observations: number; trades: number; costs: number; turnover: number
  returnPct: number | null; benchmarkReturnPct: number | null; excessReturnPct: number | null
  maxDrawdownPct: number | null; recoverySessions: number; volatilityPct: number | null
  equity: Array<{ date: string; equity: number; benchmark: number; cashWeight: number }>
  fills: PaperFill[]; skipped: Array<{ planId: string; reason: string }>
  attribution: Array<{ ticker: string; pnl: number; cost: number }>
  latestTargets: Record<string, number>; halted: boolean
}
export const LAB_COSTS = { commissionBps: 3, slippageBps: 5 }
export const STRATEGIES: StrategySpec[] = [
  { id: 'active-20', name: '积极 · 20%回撤预算', version: LAB_VERSION, drawdownBudget: .2, exposure: .6, maxWeight: .3, targetVolatility: .25, rebalanceSessions: 5, topN: 3, modules: ['momentum','relative-strength','trend','volatility'] },
  { id: 'growth-30', name: '进取 · 30%回撤预算', version: LAB_VERSION, drawdownBudget: .3, exposure: .8, maxWeight: .4, targetVolatility: .35, rebalanceSessions: 5, topN: 3, modules: ['momentum','relative-strength','trend','volatility'] },
  { id: 'high-risk-40', name: '高波动 · 40%回撤预算', version: LAB_VERSION, drawdownBudget: .4, exposure: .95, maxWeight: .5, targetVolatility: .45, rebalanceSessions: 5, topN: 3, modules: ['momentum','relative-strength','trend','volatility'] },
]

export const ENTRY_FAMILIES = [
  {id:'confirmed' as const,name:'趋势确认',rule:'收盘价高于60日均线时参与，否则现金'},
  {id:'graded' as const,name:'分级参与',rule:'高于60日均线全档参与；低于均线10%以内且20日相对强度为正时半档；低于20%以内且5日动量和相对强度为正时四分之一档'},
  {id:'probe' as const,name:'提前试探',rule:'高于60日均线全档参与；否则在高于20日均线、5日动量和20日相对强度均为正时四分之一档试探'},
]
/** The nine hypotheses are frozen together; no winner is selected from their historical curves. */
export const EXPERIMENT_STRATEGIES:StrategySpec[]=ENTRY_FAMILIES.flatMap(family=>STRATEGIES.map(spec=>({...spec,id:`${family.id}-${spec.id}`,entryMode:family.id,name:`${family.name} · ${spec.name}`})))
