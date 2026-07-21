import { NextResponse } from 'next/server'
import { fetchIndicesFromYahoo } from '@/lib/data-clients/yahoo'
import { apiCache } from '@/lib/cache'
import { getCachedMarketOverview, setCachedMarketOverview } from '@/lib/market-cache'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'market_overview'
const CACHE_TTL = 30 // 秒

// 主要指数配置（Yahoo Finance 格式）
const INDEX_CODES = ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'sh000300']

// 验证指数数据是否为真实数据（排除测试假数据）
function isValidIndexData(indices: any[]): boolean {
  if (!indices || indices.length === 0) return false
  const prices = indices.map(i => i.price).filter(p => p > 0)
  if (prices.length === 0) return false
  // 检测假数据：所有价格都是整百（3000, 10000, 2000, 1000, 4000）
  const allRoundHundred = prices.every(p => p % 100 === 0)
  if (allRoundHundred) {
    console.warn('检测到疑似假数据（价格均为整百），跳过此数据源')
    return false
  }
  return true
}

// 确保结果包含所有 INDEX_CODES 中的指数，缺失的从上一次缓存中补全
function ensureCompleteIndices(result: any): any {
  if (!result?.data?.indices) return result

  const existing = new Map(result.data.indices.map((idx: any) => [idx.code, idx]))
  const filled: any[] = []
  const stale = getCachedMarketOverview()

  for (const code of INDEX_CODES) {
    if (existing.has(code)) {
      filled.push(existing.get(code))
    } else {
      // 尝试从文件缓存补全
      const cachedIdx = stale?.data?.indices?.find((i: any) => i.code === code)
      if (cachedIdx) {
        filled.push({ ...cachedIdx, source: `${cachedIdx.source}-cached` })
      } else {
        filled.push({ code, name: code, price: 0, change: 0, changePct: 0, source: 'unavailable' })
      }
    }
  }

  return {
    ...result,
    data: { ...result.data, indices: filled },
  }
}

export async function GET() {
  // 检查缓存
  const cached = apiCache.get<any>(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    // 优先：Python 数据服务（多源聚合）
    const response = await fetch(`${DATA_SERVICE_URL}/api/market/overview`, {
      signal: AbortSignal.timeout(15000), // Reduced from 20s to 15s for better UX
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.indices?.length > 0 && isValidIndexData(data.data.indices)) {
        const result = ensureCompleteIndices({
          ...data,
          source: data.data?.source || 'akshare'
        })
        apiCache.set(CACHE_KEY, result, CACHE_TTL)
        // 持久化到文件缓存
        setCachedMarketOverview(result)
        return NextResponse.json(result)
      }
    }
  } catch (error) {
    console.warn('Python数据服务不可用，尝试Yahoo Finance降级:', error)
  }

  // 降级：Yahoo Finance（整体15秒超时保护）
  try {
    const yahooData = await Promise.race([
      fetchIndicesFromYahoo(INDEX_CODES),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Yahoo Finance timeout')), 15000)
      ),
    ])
    if (yahooData.length > 0 && isValidIndexData(yahooData)) {
      const result = ensureCompleteIndices({
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
      })
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
    if (cachedOverview && isValidIndexData(cachedOverview?.data?.indices)) {
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
