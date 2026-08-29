import { NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'sector_flow'
// 动态缓存TTL：交易时段30秒，非交易时段2分钟
const CACHE_TTL_TRADING = 30 // 秒
const CACHE_TTL_CLOSED = 120 // 秒

/**
 * 获取板块资金流向数据
 * GET /api/market/sectors
 */
export async function GET(request: Request) {
  // Check for force-refresh parameter
  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('refresh') === 'true'

  // Skip cache if force refresh requested
  if (!forceRefresh) {
    // 检查缓存
    const cached = apiCache.get<any>(CACHE_KEY)
    if (cached) {
      return NextResponse.json(cached)
    }
  }

  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/capital-flow/sector?indicator=今日${forceRefresh ? '&refresh=true' : ''}`, {
      signal: AbortSignal.timeout(15000),
    })

    if (response.ok) {
      const result = await response.json()

      if (result.success) {
        const data = {
          success: true,
          sectors: result.data || result.sectors || [],
          source: result.source || 'akshare',
          meta: result.meta || null,
        }

        // 动态TTL：根据交易状态调整缓存时间
        const isTrading = data.meta?.isRealtime === true
        const ttl = isTrading ? CACHE_TTL_TRADING : CACHE_TTL_CLOSED
        apiCache.set(CACHE_KEY, data, ttl)

        return NextResponse.json(data)
      }
    }

    // 返回空数据，不使用模拟数据
    return NextResponse.json({
      success: false,
      sectors: [],
      source: 'unavailable',
    })
  } catch (error) {
    console.error('[sectors API] 请求失败:', error)
    return NextResponse.json({
      success: false,
      sectors: [],
      source: 'unavailable',
    })
  }
}
