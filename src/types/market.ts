// 市场数据类型定义

export interface StockQuote {
  ticker: string
  name: string
  market: string
  price: number
  change: number
  changePct: number
  volume: number
  amount: number
  high: number
  low: number
  open: number
  preClose: number
  timestamp: string
}

export interface StockDaily {
  ticker: string
  market: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
}

export interface IndexDaily {
  code: string
  name: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  changePct?: number
}

export interface ETFDaily {
  ticker: string
  name: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
  nav?: number       // 净值
  shares?: number    // 份额（万份）
  premium?: number   // 溢折价率（%）
}

export interface ETFProfile {
  ticker: string
  name: string
  trackingIndex: string
  totalAssets: number
  trackingError: number
  managementFee: number
  custodianFee: number
  inceptionDate: string
}

export interface CapitalFlow {
  mainForceNet: number     // 主力净流入（万元）
  retailNet: number        // 散户净流入（万元）
  totalVolume: number      // 总成交额
  changePct?: number       // 涨跌幅
}

export interface SectorCapitalFlow {
  sector: string
  sectorLevel: string
  mainForceNet: number
  retailNet: number
  totalVolume: number
  changePct?: number
  consecutiveDays?: number
  trend: 'inflow' | 'outflow' | 'neutral'
}

export interface SectorFlow {
  sector: string
  netFlow: number       // 净流入（亿）
  changePct: number     // 涨跌幅
}

export interface MarketCapitalFlow {
  date: string
  market: {
    institutionalNet: number    // 机构/主力净流入（亿）
    institutionalPct: number    // 机构占比
    retailNet: number           // 散户净流入（亿）
    retailPct: number           // 散户占比
    totalNet: number            // 大盘总净流入（亿）
  }
  topInflowSectors: SectorFlow[]    // Top10资金流入板块
  topOutflowSectors: SectorFlow[]   // Top10资金流出板块
  source: string
  timestamp: string
}

export interface ETFFlow {
  ticker: string
  name: string
  trackingIndex: string
  netSubscription: number
  premiumDiscount: number
  totalAssets: number
  volume: number
  changePct: number
}

export interface ValuationData {
  ticker: string
  pe: number
  pePercentile: number
  pb: number
  pbPercentile: number
  ps?: number
  psPercentile?: number
  rating: 'undervalued' | 'fair' | 'overvalued'
}

// 技术指标
export interface TechnicalIndicators {
  trend: {
    ma: { [key: string]: number }
    macd: { dif: number; dea: number; macd: number }
    dmi: { pdi: number; mdi: number; adx: number; adxr: number }
    sar: number
  }
  momentum: {
    rsi: { [key: string]: number }
    kdj: { k: number; d: number; j: number }
    cci: number
    wr: number
  }
  volume: {
    obv: number
    vwap: number
    volumeRatio: number
    turnoverRate: number
  }
}

// 信号输出
export interface SignalOutput {
  ticker: string
  timestamp: string
  signals: {
    trend: {
      score: number
      direction: TrendDirection
      strength: number
      details: string
    }
    momentum: {
      score: number
      overbought: boolean
      oversold: boolean
      divergence: 'bullish' | 'bearish' | 'none'
    }
    volume: {
      score: number
      abnormal: boolean
      trendConfirm: boolean
    }
    capital: {
      mainForce: number
      northbound: number
      marginBalance: number
      sectorRotation: string
    }
    valuation: {
      pePercentile: number
      pbPercentile: number
      rating: 'undervalued' | 'fair' | 'overvalued'
    }
  }
  compositeScore: number
}

import { TrendDirection } from './common'

// 宏观资金流向（别名）
export type MacroCapitalFlow = MarketCapitalFlow
