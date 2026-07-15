import { NextRequest, NextResponse } from 'next/server'
import { proxyToDataService } from '@/lib/api/proxy'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

/**
 * 获取单个ETF估值数据
 * GET /api/etf/valuation?ticker=510300
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')
  const tickers = searchParams.get('tickers') // 批量查询

  // 批量查询模式
  if (tickers) {
    return proxyToDataService({
      path: '/api/valuation/batch',
      params: { tickers },
      timeout: 30000, // 批量查询超时时间更长
      fallback: async () => {
        return tickers.split(',').map(t => ({
          ticker: t.trim(),
          name: '未知',
          trackingIndex: '未知',
          pe: null,
          pb: null,
          dividendYield: null,
          rating: 'unknown' as const,
          source: 'fallback',
        }))
      },
    })
  }

  // 单个查询模式
  if (!ticker) {
    return NextResponse.json({
      success: false,
      error: '缺少参数: ticker 或 tickers',
      data: null,
    })
  }

  return proxyToDataService({
    path: '/api/valuation/etf',
    params: { ticker },
    timeout: 15000,
    fallback: async () => {
      return {
        ticker,
        name: '未知',
        trackingIndex: '未知',
        pe: null,
        pb: null,
        dividendYield: null,
        rating: 'unknown' as const,
        source: 'fallback',
      }
    },
  })
}
