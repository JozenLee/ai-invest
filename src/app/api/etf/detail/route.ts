import { NextRequest, NextResponse } from 'next/server'
import { proxyToDataService } from '@/lib/api/proxy'

/**
 * 获取ETF详情
 * GET /api/etf/detail?code=515070
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({
      success: false,
      error: '缺少参数: code',
      data: null,
    })
  }

  return proxyToDataService({
    path: '/api/etf/detail',
    params: { code },
    fallback: async () => {
      // 返回模拟详情数据
      return {
        code,
        name: '人工智能ETF',
        price: 1.25,
        change: 2.1,
        changePct: 1.71,
        volume: 500000000,
        amount: 625000000,
        high: 1.26,
        low: 1.23,
        open: 1.24,
        prevClose: 1.23,
        holdings: [
          { stock: '英伟达', weight: 15.2 },
          { stock: 'AMD', weight: 8.5 },
          { stock: '台积电', weight: 7.8 },
        ],
      }
    },
  })
}
