// src/lib/services/market.service.ts
// 市场数据服务
// 通过统一数据客户端获取市场数据

import { dataClient, ApiResponse } from '@/lib/data-client'

export interface IndexData {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume: number
  amount: number
}

export interface MarketOverview {
  indices: IndexData[]
  source: string
  timestamp: string
}

export interface CapitalFlowData {
  mainNetInflow: number
  mainNetInflowPct: number
  midNetInflow: number
  smallNetInflow: number
  date: string
}

export interface SectorFlow {
  name: string
  changePct: number
  mainNetInflow: number
}

export interface NorthboundFlow {
  date: string
  value: number
  shConnect: number
  szConnect: number
}

export const marketService = {
  async getOverview(): Promise<ApiResponse<MarketOverview>> {
    return dataClient.get<MarketOverview>('/api/market/overview')
  },

  async getIndexData(code: string, days: number = 30): Promise<ApiResponse<any>> {
    return dataClient.get(`/api/market/index/${code}`, { days: String(days) })
  },

  async getCapitalFlow(): Promise<ApiResponse<CapitalFlowData>> {
    return dataClient.get<CapitalFlowData>('/api/capital-flow/overview')
  },

  async getSectorFlow(indicator: string = '今日'): Promise<ApiResponse<SectorFlow[]>> {
    return dataClient.get<SectorFlow[]>('/api/capital-flow/sector', { indicator })
  },

  async getNorthboundFlow(): Promise<ApiResponse<NorthboundFlow>> {
    return dataClient.get<NorthboundFlow>('/api/capital-flow/northbound')
  },

  async getNorthboundHistory(days: number = 30): Promise<ApiResponse<NorthboundFlow[]>> {
    return dataClient.get<NorthboundFlow[]>('/api/capital-flow/northbound/history', { days: String(days) })
  },
}
