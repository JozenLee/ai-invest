// 市场数据服务 - 数据与指标的桥梁
// 职责：获取数据 → 计算指标 → 生成信号

import { DailyData, IndicatorResult, SignalOutput, calculateAllIndicators, generateSignals } from '@/lib/indicators'
import { fetchIndicesFromYahoo, IndexQuote } from '@/lib/data-clients/yahoo'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

// 指数名称映射
const INDEX_NAMES: Record<string, string> = {
  'sh000001': '上证指数',
  'sz399001': '深证成指',
  'sz399006': '创业板指',
  'sh000688': '科创50',
  'sh000300': '沪深300',
}

export interface IndexIndicators {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  indicators: IndicatorResult
  signals: SignalOutput
}

export interface MarketOverview {
  indices: IndexIndicators[]
  timestamp: string
  source: string
}

// ETF估值数据接口
export interface ETFValuationItem {
  ticker: string
  name: string
  trackingIndex: string
  pe: {
    current: number
    percentile: number
    median: number
    min: number
    max: number
    historyYears: number
    dataPoints: number
    date: string
  } | null
  pb: {
    current: number
    percentile: number
    median: number
    min: number
    max: number
    dataPoints: number
    date: string
  } | null
  dividendYield: {
    current: number
    percentile: number
    dataPoints: number
    date: string
  } | null
  rating: 'undervalued' | 'fair' | 'overvalued' | 'unknown'
  source: string
  message?: string
}

export interface ETFValuationResponse {
  success: boolean
  data?: ETFValuationItem
  error?: string
}

/**
 * 从Python数据服务获取历史K线数据
 */
async function fetchKlineData(
  code: string,
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  count: number = 120
): Promise<DailyData[]> {
  try {
    const localResponse = await fetch(
      `${DATA_SERVICE_URL}/api/data/local/indices/${encodeURIComponent(code)}?days=${Math.max(count, 30)}`,
      { signal: AbortSignal.timeout(2500) }
    )
    if (localResponse.ok) {
      const localPayload = await localResponse.json()
      const localRows = localPayload?.data?.history
      if (Array.isArray(localRows) && localRows.length > 0) {
        return localRows.map((row: any) => ({
          date: String(row.date || ''),
          open: Number(row.open || 0),
          high: Number(row.high || 0),
          low: Number(row.low || 0),
          close: Number(row.close || 0),
          volume: Number(row.volume || 0),
          amount: Number(row.amount || 0),
        })).filter((row: DailyData) => row.close > 0)
      }
    }
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/market/kline?code=${code}&period=${period}&count=${count}`,
      { signal: AbortSignal.timeout(10000) }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!data.success || !data.data?.klines) {
      throw new Error('Invalid response format')
    }

    // 转换为DailyData格式
    return data.data.klines.map((kline: any) => ({
      date: kline.date,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      amount: kline.amount,
    }))
  } catch (error) {
    console.error(`获取${code}K线数据失败:`, error)
    return []
  }
}

/**
 * 生成模拟K线数据（当API不可用时）
 */
function generateMockKlineData(code: string, count: number = 120): DailyData[] {
  const data: DailyData[] = []
  const basePrice = code.includes('000001') ? 3000 : 1000
  let price = basePrice

  for (let i = count; i > 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)

    const change = (Math.random() - 0.5) * 40
    price += change

    const high = price + Math.random() * 20
    const low = price - Math.random() * 20
    const volume = Math.floor(Math.random() * 1000000000) + 100000000

    data.push({
      date: date.toISOString().split('T')[0],
      open: price - change,
      high,
      low,
      close: price,
      volume,
      amount: volume * price,
    })
  }

  return data
}

/**
 * 获取指数的完整指标分析
 */
export async function getIndexIndicators(code: string): Promise<IndexIndicators | null> {
  // 获取历史K线数据
  let klineData = await fetchKlineData(code, 'daily', 120)

  // 如果API不可用，使用模拟数据
  if (klineData.length === 0) {
    console.warn(`使用模拟数据: ${code}`)
    klineData = generateMockKlineData(code, 120)
  }

  if (klineData.length < 60) {
    console.error(`${code} 数据不足60天，无法计算指标`)
    return null
  }

  // 计算所有指标
  const indicators = calculateAllIndicators(klineData)

  // 生成信号
  const signals = generateSignals(code, indicators)

  // 获取实时行情
  let price = 0
  let change = 0
  let changePct = 0

  try {
    const yahooData = await fetchIndicesFromYahoo([code])
    if (yahooData.length > 0) {
      price = yahooData[0].price
      change = yahooData[0].change
      changePct = yahooData[0].changePct
    }
  } catch (error) {
    // 使用最后一天的收盘价
    const lastDay = klineData[klineData.length - 1]
    price = lastDay.close
    const prevDay = klineData[klineData.length - 2]
    change = lastDay.close - prevDay.close
    changePct = (change / prevDay.close) * 100
  }

  return {
    code,
    name: INDEX_NAMES[code] || code,
    price,
    change,
    changePct,
    indicators,
    signals,
  }
}

/**
 * 获取市场概览（含所有指数的指标分析）
 */
export async function getMarketOverview(): Promise<MarketOverview> {
  const INDEX_CODES = ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'sh000300']

  const results = await Promise.allSettled(
    INDEX_CODES.map(code => getIndexIndicators(code))
  )

  const indices = results
    .filter((r): r is PromiseFulfilledResult<IndexIndicators | null> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value as IndexIndicators)

  return {
    indices,
    timestamp: new Date().toISOString(),
    source: indices.some(i => i.indicators) ? 'calculated' : 'unavailable',
  }
}

/**
 * 获取单个指数的技术指标（供API调用）
 */
export async function getIndexTechnicalIndicators(code: string): Promise<{
  success: boolean
  data?: {
    code: string
    name: string
    indicators: IndicatorResult
    signals: SignalOutput
  }
  error?: string
}> {
  const result = await getIndexIndicators(code)

  if (!result) {
    return {
      success: false,
      error: `无法获取${code}的指标数据`,
    }
  }

  return {
    success: true,
    data: {
      code: result.code,
      name: result.name,
      indicators: result.indicators,
      signals: result.signals,
    },
  }
}

/**
 * 获取单个ETF的估值数据
 *
 * 通过Python数据服务获取ETF跟踪指数的PE/PB/股息率及历史百分位。
 * 当数据服务不可用时返回降级数据。
 *
 * @param ticker ETF代码，如 "510300"
 * @returns 估值数据，包含PE/PB/股息率及百分位
 */
export async function getETFValuation(ticker: string): Promise<ETFValuationResponse> {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/valuation/etf?ticker=${ticker}`,
      { signal: AbortSignal.timeout(15000) }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    if (data.success && data.data) {
      return {
        success: true,
        data: data.data as ETFValuationItem,
      }
    }

    return {
      success: false,
      error: data.error || '获取估值数据失败',
    }
  } catch (error) {
    console.error(`获取ETF估值数据失败 ${ticker}:`, error)
    return {
      success: false,
      error: `估值数据服务不可用: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 批量获取ETF估值数据
 *
 * @param tickers ETF代码列表
 * @returns 每个ETF的估值数据
 */
export async function getBatchETFValuation(
  tickers: string[]
): Promise<ETFValuationItem[]> {
  if (tickers.length === 0) return []

  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/valuation/batch?tickers=${tickers.join(',')}`,
      { signal: AbortSignal.timeout(30000) }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    if (data.success && Array.isArray(data.data)) {
      return data.data
        .filter((item: any) => item.success && item.data)
        .map((item: any) => item.data as ETFValuationItem)
    }

    return []
  } catch (error) {
    console.error('批量获取ETF估值数据失败:', error)
    return []
  }
}

export const marketDataService = {
  getIndexIndicators,
  getMarketOverview,
  getIndexTechnicalIndicators,
  getETFValuation,
  getBatchETFValuation,
}
