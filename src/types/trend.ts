// 领域趋势分析类型定义

export type TrendDirection = 'bullish' | 'neutral' | 'bearish'

export type CorrelationDirection = 'positive' | 'negative'

export interface SentimentDistribution {
  bullish: number
  neutral: number
  bearish: number
}

export interface DomainTrendSummary {
  domainCode: string
  domainName: string
  trendDirection: TrendDirection
  confidenceScore: number
  sentimentDistribution: SentimentDistribution
  relatedNewsCount: number
  keyDrivers: string[]  // Top 2
  keyRisks: string[]    // Top 2
  shortTermOutlook: string
}

export interface RelatedDomain {
  code: string
  name: string
  correlation: number  // 0-1
  direction: CorrelationDirection
  explanation: string
}

export interface DomainTrendDetail extends DomainTrendSummary {
  currentStatus: string
  mediumTermOutlook: string
  allKeyDrivers: string[]
  allKeyRisks: string[]
  relatedDomains: RelatedDomain[]
  relatedNews: Array<{
    id: string
    title: string
    source: string
    publishTime: string
    sentiment?: number
    relevanceScore?: number
  }>
  aiInsight: string
  lastUpdated: string
}

export interface TrendSummaryResponse {
  success: boolean
  data: DomainTrendSummary[] | {
    domains: DomainTrendSummary[]
    total: number
    newsCount: number
  }
  error?: string
  source?: string
  timestamp?: string
}

export interface TrendAnalysisResponse {
  success: boolean
  data: DomainTrendDetail | null
  error?: string
  source?: string
  timestamp?: string
}
