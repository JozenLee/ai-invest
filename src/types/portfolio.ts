// 投资组合类型定义

import { RiskProfile, InvestmentHorizon } from './common'

export interface Portfolio {
  id: string
  userId: string
  name: string
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
  avgCost: number
  currentPrice?: number
  updatedAt: string
}

export interface PortfolioSummary {
  totalAssets: number
  totalCost: number
  totalPnl: number
  totalPnlPct: number
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
  avgCost: number
  currentPrice: number
  marketValue: number
  pnl: number
  pnlPct: number
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
  avgCost: number
}

export interface HoldingUpdateInput {
  quantity?: number
  avgCost?: number
  currentPrice?: number
}
