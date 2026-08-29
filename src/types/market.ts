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

// ============================================================
// 统一市场数据类型定义（Unified Market Data Types）
// 用于 Dashboard、Market Overview、Capital Flow 页面共享
// ============================================================

export interface IndexData {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume?: number
  amount?: number
}

export interface NorthboundData {
  net: number          // 净流入（亿元）
  shConnect: number    // 沪股通（亿元）
  szConnect: number    // 深股通（亿元）
  stale: boolean       // 是否为历史数据
  dataDate: string     // 数据日期
  source: string       // 数据来源
}

// Data quality indicator for market data
export type DataQuality = 'realtime' | 'close' | 'estimated' | 'cached' | 'unavailable'

// 持续多日大单净流入趋势
export interface ConsecutiveTrend {
  days: number              // 连续天数
  totalNet: number          // 累计净流入（亿元）
  avgDaily: number          // 日均净流入（亿元）
  direction: 'inflow' | 'outflow'
  strength: 'strong' | 'moderate' | 'weak'
}

// 成交量放大情况
export interface VolumeAmplification {
  currentVolume: number     // 当日成交量（亿元）
  avgVolume: number         // 近N日均量（亿元）
  amplification: number     // 放大倍数
  isAmplified: boolean      // 是否放大（>1.5倍）
}

// 股价与资金流向背离
export interface PriceFlowDivergence {
  priceChange: number       // 股价涨跌幅（%）
  flowNet: number           // 资金净流入（亿元）
  isDivergent: boolean      // 是否背离
  divergenceType: 'bullish' | 'bearish' | 'none'  // 背离类型
  signal: string            // 信号说明
}

// 机构行为数据
export interface InstitutionalBehavior {
  dragonTiger: {            // 龙虎榜数据
    count: number           // 上榜次数
    netBuy: number          // 机构净买入（亿元）
    topStocks: Array<{
      name: string
      netBuy: number
    }>
  }
  institutionalSeats: {     // 机构席位
    buySeats: number        // 买方机构席位数
    sellSeats: number       // 卖方机构席位数
    netBuy: number          // 机构席位净买入（亿元）
  }
  northboundCapital: NorthboundData  // 北向资金（已有类型）
}

export interface CapitalFlowData {
  consecutiveTrend: ConsecutiveTrend | null
  volumeAmplification: VolumeAmplification | null
  priceFlowDivergence: PriceFlowDivergence | null
  institutionalBehavior: InstitutionalBehavior | null
  topInflowSectors: UnifiedSectorFlow[]
  topOutflowSectors: UnifiedSectorFlow[]
  source?: string
  sourceDetails?: {
    sectorFlow: string
    northbound: string
    volume?: string
    dragonTiger: string
  }
  dataDate?: string
  dataQuality?: DataQuality
  sectorDataQuality?: DataQuality
  sectorDataDate?: string
  sectorRealtime?: boolean

  // 保留旧字段以兼容过渡期
  market?: {
    institutionalNet: number
    institutionalPct: number
    retailNet: number
    retailPct: number
    totalNet: number
    sentiment: number
  }
  northbound?: NorthboundData
}

export interface MarketMeta {
  isOpen: boolean
  isPreMarket: boolean
  isPostMarket: boolean
  status: string
  statusText: string
  lastTradingDate: string
  isRealtime: boolean
  staleReason?: string | null
  dataDate?: string
}

export interface SourceDisplay {
  text: string
  icon: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
}

export interface StatusBadge {
  icon: string
  label: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
}

export interface SentimentDisplay {
  score: number
  label: string
  color: string
}

export interface MarketContextValue {
  indices: IndexData[]
  capitalFlow: CapitalFlowData | null
  northbound: NorthboundData | null
  sentiment: number
  marketMeta: MarketMeta | null
  isLoading: boolean
  error: string | null
  source: string
  lastUpdate: Date | null
  refetch: () => void
  format: {
    sourceDisplay: SourceDisplay
    timeDisplay: string
    statusBadge: StatusBadge
    sentimentDisplay: SentimentDisplay
  }
}

// UnifiedSectorFlow: 用于 CapitalFlowData 中的板块资金流向
// 与现有 SectorFlow 结构相同，使用别名避免命名冲突
export type UnifiedSectorFlow = SectorFlow

export const SOURCE_MAP: Record<string, SourceDisplay> = {
  'akshare_realtime': { text: 'AKShare实时', icon: 'database', variant: 'default' },
  'akshare': { text: 'AKShare', icon: 'database', variant: 'default' },
  'Tushare': { text: 'Tushare', icon: 'cloud', variant: 'default' },
  'AKShare': { text: 'AKShare', icon: 'database', variant: 'default' },
  '东方财富': { text: '东方财富', icon: 'database', variant: 'default' },
  '新浪财经': { text: '新浪财经', icon: 'cloud', variant: 'outline' },
  '缓存': { text: '缓存数据', icon: 'archive', variant: 'secondary' },
  '多源': { text: '多数据源', icon: 'database', variant: 'default' },
  'realtime': { text: '实时数据', icon: 'database', variant: 'default' },
  'cached': { text: '缓存数据', icon: 'archive', variant: 'secondary' },
  'yahoo': { text: 'Yahoo Finance', icon: 'cloud', variant: 'outline' },
  'unavailable': { text: '数据暂不可用', icon: 'alert', variant: 'destructive' },
  'loading': { text: '加载中...', icon: 'loader', variant: 'outline' },
}

export const SENTIMENT_THRESHOLDS = {
  HIGH_BULLISH: 75,
  BULLISH: 60,
  NEUTRAL_HIGH: 50,
  NEUTRAL_LOW: 40,
  BEARISH: 25,
} as const
