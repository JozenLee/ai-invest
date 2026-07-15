import { NextRequest, NextResponse } from 'next/server'
import { proxyToDataService } from '@/lib/api/proxy'

/**
 * 获取ETF历史数据
 * GET /api/etf/history?code=515070&period=daily&count=120
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const period = searchParams.get('period') || 'daily'
  const count = searchParams.get('count') || '120'

  if (!code) {
    return NextResponse.json({
      success: false,
      error: '缺少参数: code',
      data: null,
    })
  }

  return proxyToDataService({
    path: '/api/etf/history',
    params: { code, period, count },
    timeout: 15000,
  })
}
