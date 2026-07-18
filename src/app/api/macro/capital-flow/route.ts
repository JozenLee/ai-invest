import { NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'macro_capital_flow'
const CACHE_TTL = 30 // 秒

/**
 * 获取宏观资金流向
 * GET /api/macro/capital-flow
 */
export async function GET() {
  // 检查缓存
  const cached = apiCache.get<any>(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/capital-flow/macro`, {
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    const result = {
      success: true,
      data: data.data || data,
      source: 'data-service',
    }
    apiCache.set(CACHE_KEY, result, CACHE_TTL)
    return NextResponse.json(result)
  } catch (error) {
    console.error('宏观资金流向代理请求失败:', error)

    // 降级：返回明确的错误状态（不返回假数据）
    return NextResponse.json({
      success: false,
      error: '宏观资金流向数据服务不可用',
      data: null,
      source: 'unavailable',
    })
  }
}
