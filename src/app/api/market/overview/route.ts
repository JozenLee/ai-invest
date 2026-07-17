import { NextResponse } from 'next/server'
import { fetchIndicesFromYahoo } from '@/lib/data-clients/yahoo'
import { apiCache } from '@/lib/cache'
import { getCachedMarketOverview, setCachedMarketOverview } from '@/lib/market-cache'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'market_overview'
const CACHE_TTL = 30 // 秒

// 主要指数配置（Yahoo Finance 格式）
const INDEX_CODES = ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'sh000300']

export async function GET() {
  // 检查缓存
  const cached = apiCache.get<any>(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    // 优先：Python 数据服务（多源聚合）
    const response = await fetch(`${DATA_SERVICE_URL}/api/market/overview`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(20000),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.indices?.length > 0) {
        const result = {
          ...data,
          source: data.data?.source || 'akshare'
        }
        apiCache.set(CACHE_KEY, result, CACHE_TTL)
        // 持久化到文件缓存
        setCachedMarketOverview(result)
        return NextResponse.json(result)
      }
    }
  } catch (error) {
    console.warn('Python数据服务不可用，尝试Yahoo Finance降级:', error)
  }

  // 降级：Yahoo Finance
  try {
    const yahooData = await fetchIndicesFromYahoo(INDEX_CODES)
    if (yahooData.length > 0) {
      const result = {
        success: true,
        data: {
          indices: yahooData.map(q => ({
            code: q.code,
            name: q.name,
            price: q.price,
            change: q.change,
            changePct: q.changePct,
            source: 'yahoo',
          })),
          source: 'yahoo',
          timestamp: new Date().toISOString(),
        },
        source: 'yahoo',
      }
      apiCache.set(CACHE_KEY, result, CACHE_TTL)
      setCachedMarketOverview(result)
      return NextResponse.json(result)
    }
  } catch (error) {
    console.warn('Yahoo Finance 降级也失败:', error)
  }

  // 降级：本地文件缓存（跨进程重启的持久数据）
  try {
    const cachedOverview = getCachedMarketOverview()
    if (cachedOverview) {
      console.warn('所有实时数据源不可用，使用本地缓存数据')
      apiCache.set(CACHE_KEY, cachedOverview, CACHE_TTL)
      return NextResponse.json({
        ...cachedOverview,
        source: `${cachedOverview.source || 'cached'}-stale`,
      })
    }
  } catch (error) {
    console.warn('本地缓存读取失败:', error)
  }

  // 所有数据源不可用
  return NextResponse.json({
    success: false,
    error: '所有数据源均不可用，请确认 data-service 已启动或网络正常',
    data: null,
    source: 'unavailable',
  })
}
