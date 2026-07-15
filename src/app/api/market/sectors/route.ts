import { NextResponse } from 'next/server'
import { proxyToDataService } from '@/lib/api/proxy'

/**
 * 获取板块数据
 * GET /api/market/sectors
 */
export async function GET() {
  return proxyToDataService({
    path: '/api/capital-flow/sector',
    params: { indicator: '今日' },
    fallback: async () => {
      // 返回空数据，不使用模拟数据
      return {
        sectors: [],
      }
    },
  })
}
