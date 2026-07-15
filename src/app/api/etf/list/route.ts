import { NextRequest, NextResponse } from 'next/server'
import { proxyToDataService } from '@/lib/api/proxy'

/**
 * 获取ETF列表
 * GET /api/etf/list?sector=ai&sort=change&order=desc
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sector = searchParams.get('sector')
  const sort = searchParams.get('sort') || 'change'
  const order = searchParams.get('order') || 'desc'

  return proxyToDataService({
    path: '/api/etf/list',
    params: { sector: sector || '', sort, order },
    fallback: async () => {
      // 返回AI相关ETF模拟数据
      return {
        etfs: [
          { code: '515070', name: '人工智能ETF', price: 1.25, change: 2.1, volume: 500000000 },
          { code: '159819', name: 'AI芯片ETF', price: 1.18, change: 1.8, volume: 300000000 },
          { code: '515790', name: '光模块ETF', price: 1.32, change: 3.5, volume: 200000000 },
          { code: '515880', name: '通信ETF', price: 1.15, change: 1.2, volume: 400000000 },
          { code: '159995', name: '芯片ETF', price: 1.08, change: -0.5, volume: 600000000 },
        ],
      }
    },
  })
}
