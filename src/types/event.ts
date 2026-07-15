// 事件驱动层类型定义

export type EventCategory =
  | 'policy'
  | 'earnings'
  | 'product'
  | 'partnership'
  | 'supply'
  | 'tech'
  | 'market'
  | 'regulation'

export type SentimentLabel =
  | 'very_bullish'
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'very_bearish'

export type TimeHorizon = 'short' | 'medium' | 'long'

export type ImpactMagnitude = 1 | 2 | 3 | 4 | 5

export interface EventAnalysis {
  id: string
  title: string
  source: string
  publishTime: string
  category: EventCategory

  // NLP分析结果
  entities: {
    companies: string[]
    sectors: string[]
    products: string[]
    people: string[]
  }

  sentiment: {
    score: number        // -1 ~ +1
    confidence: number   // 0~1
    label: SentimentLabel
  }

  impact: {
    timeHorizon: TimeHorizon
    magnitude: ImpactMagnitude
    affectedSectors: {
      sector: string
      direction: 'positive' | 'negative'
      weight: number
    }[]
    reasoning: string
  }

  summary: string
  fullAnalysis: string
}

export interface SectorTrend {
  sector: string
  period: string

  eventSummary: {
    totalEvents: number
    byCategory: Record<EventCategory, number>
    sentimentDistribution: {
      bullish: number
      neutral: number
      bearish: number
    }
  }

  trendAssessment: {
    currentStatus: string
    shortTermOutlook: string
    mediumTermOutlook: string
    keyDrivers: string[]
    keyRisks: string[]
    confidenceLevel: number
  }

  topEvents: EventAnalysis[]
}

export interface NewsArticle {
  id: string
  title: string
  content: string
  summary?: string
  source: string
  url?: string
  publishTime: string
  category: EventCategory
  sentiment?: number
  impact?: ImpactMagnitude
  entities?: string  // JSON
  sectors?: string   // JSON
  createdAt: string
}
