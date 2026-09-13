import type { RiskBudget } from './decision-support'

/** Product defaults are explicit and shared by the API, UI and frozen analysis input. */
export const DEFAULT_RISK_BUDGET: RiskBudget = {
  riskProfile: 'moderate',
  investHorizon: 'medium',
  minCashRatio: 0.01,
  maxIndustryRatio: 0.2,
  maxFundRatio: 0.15,
  maxSingleAdjustmentRatio: 0.05,
  stagedAdjustment: true,
}

export type RiskBudgetSource = 'user-saved' | 'system-default'

export const riskBudgetSourceLabel = (source: RiskBudgetSource) =>
  source === 'user-saved' ? '已保存的账户配置' : '系统默认配置（尚未保存）'
