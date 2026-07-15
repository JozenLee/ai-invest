// 分析模块类型定义

import { Rating, TrendDirection } from './common'
import { EventAnalysis, SectorTrend } from './event'
import { PropagationPath } from './graph'
import { SignalOutput, MacroCapitalFlow, ValuationData } from './market'

export interface InvestmentScore {
  ticker: string
  name: string
  trackingIndex: string
  timestamp: string

  dimensions: {
    technical: { score: number; weight: number; details: string[] }
    capitalFlow: { score: number; weight: number; details: string[] }
    sentiment: { score: number; weight: number; details: string[] }
    event: { score: number; weight: number; details: string[] }
    graph: { score: number; weight: number; details: string[] }
    etfQuality: { score: number; weight: number; details: string[] }
    valuation: { score: number; weight: number; details: string[] }
  }

  compositeScore: number
  rating: Rating
  confidence: number
}

export interface AIAnalysisRequest {
  userContext: {
    portfolio: PortfolioHolding[]
    totalAssets: number
    riskProfile: string
    investmentHorizon: string
    cashRatio: number
  }

  marketData: {
    signals: SignalOutput[]
    macroCapitalFlow: MacroCapitalFlow
    valuationMetrics: ValuationData[]
  }

  eventData: {
    recentEvents: EventAnalysis[]
    sectorTrends: SectorTrend[]
  }

  graphData: {
    relevantPaths: PropagationPath[]
    cyclePositions: { nodeId: string; position: string }[]
    sectorCorrelations: { source: string; target: string; correlation: number }[]
  }

  focusAreas: string[]
  specificQuestions?: string
}

export interface AIAnalysisResponse {
  marketOverview: {
    overallSentiment: string
    keyObservations: string[]
    riskLevel: 'low' | 'medium' | 'high' | 'very_high'
    capitalFlowSummary: string
  }

  sectorAnalysis: {
    sector: string
    outlook: 'bullish' | 'neutral' | 'bearish'
    reasoning: string
    keyDrivers: string[]
    keyRisks: string[]
    recommendedExposure: 'overweight' | 'market_weight' | 'underweight'
  }[]

  etfRecommendations: {
    ticker: string
    name: string
    trackingIndex: string
    action: 'buy' | 'hold' | 'sell'
    conviction: number
    positionSize: string
    reasoning: string
    catalysts: string[]
    risks: string[]
    timeHorizon: string
    referenceStocks: {
      ticker: string
      name: string
      role: string
      trend: string
    }[]
  }[]

  stockReference?: {
    ticker: string
    name: string
    sector: string
    analysisSummary: string
    role: string
  }[]

  portfolioAdvice: {
    currentAssessment: string
    suggestedChanges: {
      action: 'add' | 'reduce' | 'exit' | 'hold'
      ticker: string
      amount?: number
      reason: string
    }[]
    riskMetrics: {
      concentrationRisk: string
      sectorExposure: string
      hedgingSuggestion?: string
    }
  }

  fullReport: string
}

export interface PortfolioHolding {
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

export interface ETFAnalysisResult {
  score: InvestmentScore
  aiReport: AIAnalysisResponse
  graphPaths: PropagationPath[]
  recentEvents: EventAnalysis[]
}
