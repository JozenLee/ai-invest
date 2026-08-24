// 投资组合类型定义

import { RiskProfile, InvestmentHorizon } from './common'

export interface Portfolio {
  id: string
  userId: string
  name: string
  category?: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
  holdings: Holding[]
}

export interface Holding {
  id: string
  portfolioId: string
  ticker: string
  market: string
  name: string
  quantity: number
  unitNav: number
  updatedAt: string
}

export interface PortfolioSummary {
  totalAssets: number
  totalCost?: number
  totalPnl?: number
  totalPnlPct?: number
  cashRatio: number
  holdings: HoldingSummary[]
  sectorAllocation: { sector: string; weight: number }[]
  riskMetrics: {
    concentrationRisk: number
    maxDrawdown: number
    sharpeRatio?: number
  }
}

export interface HoldingSummary {
  ticker: string
  name: string
  quantity: number
  unitNav: number
  marketValue: number
  weight: number
}

export interface UserSetting {
  id: string
  userId: string
  riskProfile: RiskProfile
  investHorizon: InvestmentHorizon
  totalAssets: number
  cashRatio: number
}

export interface PortfolioCreateInput {
  name: string
  isDefault?: boolean
}

export interface HoldingCreateInput {
  ticker: string
  market: string
  name: string
  quantity: number
  unitNav: number
}

export interface HoldingUpdateInput {
  quantity?: number
  unitNav?: number
}
