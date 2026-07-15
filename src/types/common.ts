// 通用类型定义

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  meta?: {
    page?: number
    pageSize?: number
    total?: number
  }
}

export interface PaginatedRequest {
  page?: number
  pageSize?: number
}

export interface DateRange {
  start: string
  end: string
}

export type Market = 'A' | 'HK' | 'US'

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'

export type InvestmentHorizon = 'short' | 'medium' | 'long'

export type CyclePosition = 'upturn' | 'peak' | 'downturn' | 'trough'

export type Direction = 'positive' | 'negative'

export type Rating = 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell'

export type TrendDirection = 'bullish' | 'bearish' | 'neutral'

// 错误码
export enum ErrorCode {
  // 认证相关
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // 数据相关
  NOT_FOUND = 'NOT_FOUND',
  DATA_FETCH_ERROR = 'DATA_FETCH_ERROR',
  DATA_PARSE_ERROR = 'DATA_PARSE_ERROR',

  // 业务相关
  INVALID_TICKER = 'INVALID_TICKER',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',

  // AI相关
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  AI_RATE_LIMIT = 'AI_RATE_LIMIT',
}

// 自定义错误类
export class DataServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message)
    this.name = 'DataServiceError'
  }
}
