// src/lib/services/etf.service.ts
// ETF 数据服务

import { dataClient, ApiResponse } from '@/lib/data-client'

export interface ETFRealtime {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume: number
}

export interface ETFNav {
  ticker: string
  nav: number
  totalShares: number
  totalAssets: number
}

export const etfService = {
  async getRealtime(symbols: string[]): Promise<ApiResponse<ETFRealtime[]>> {
    return dataClient.get<ETFRealtime[]>('/api/etf/realtime', {
      symbols: symbols.join(','),
    })
  },

  async getDaily(ticker: string, days: number = 30): Promise<ApiResponse<any>> {
    return dataClient.get(`/api/etf/daily/${ticker}`, { days: String(days) })
  },

  async getNav(ticker: string): Promise<ApiResponse<ETFNav>> {
    return dataClient.get<ETFNav>(`/api/etf/nav/${ticker}`)
  },
}
