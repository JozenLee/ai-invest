import { NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'capital_flow_macro'
const CACHE_TTL = 30 // 秒

export async function GET() {
  // 检查缓存
  const cached = apiCache.get<any>(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/capital-flow/macro`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(20000),
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success && result.data) {
        const data = {
          success: true,
          data: result.data,
          source: result.data?.source || 'akshare',
        }
        apiCache.set(CACHE_KEY, data, CACHE_TTL)
        return NextResponse.json(data)
      }
      return NextResponse.json({
        success: false,
        error: result.error || '无法获取资金流向数据',
        data: null,
        source: 'unavailable',
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Python数据服务响应异常',
      data: null,
      source: 'unavailable',
    })
  } catch (error) {
    console.error('Python数据服务不可用:', error)

    // 降级：返回符合前端期望结构的模拟数据
    return NextResponse.json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        market: {
          institutionalNet: 0,
          institutionalPct: 0,
          retailNet: 0,
          retailPct: 0,
          totalNet: 0,
          sentiment: 50,
        },
        northbound: {
          net: 0,
          shConnect: 0,
          szConnect: 0,
          stale: true,
          dataDate: '',
        },
        topInflowSectors: [],
        topOutflowSectors: [],
        source: 'unavailable',
        dataDate: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
      },
      source: 'unavailable',
    })
  }
}
