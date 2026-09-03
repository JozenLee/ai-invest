import { NextResponse } from 'next/server'
import { fetchIndicesFromYahoo } from '@/lib/data-clients/yahoo'
import { apiCache } from '@/lib/cache'
import { getCachedMarketOverview, setCachedMarketOverview } from '@/lib/market-cache'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'market_overview'
// 动态缓存TTL：交易时段30秒，非交易时段2分钟
const CACHE_TTL_TRADING = 30 // 交易中缓存30秒
const CACHE_TTL_CLOSED = 120 // 非交易时段缓存2分钟

function isTradingWindow(): boolean {
  const now = new Date()
  const day = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return day >= 1 && day <= 5 && ((minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900))
}

function isFreshCachedOverview(value: any): boolean {
  if (!isTradingWindow()) return true
  const meta = value?.data?.meta
  const dataDate = String(meta?.dataDate || '').replace(/-/g, '').slice(0, 8)
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return meta?.isRealtime === true && dataDate === today
}

// 主要指数配置（Yahoo Finance 格式）
const INDEX_CODES = ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'sh000300']
const INDEX_NAMES: Record<string, string> = {
  sh000001: '上证指数', '000001': '上证指数',
  sz399001: '深证成指', '399001': '深证成指',
  sz399006: '创业板指', '399006': '创业板指',
  sh000688: '科创50', '000688': '科创50',
  sh000300: '沪深300', '000300': '沪深300',
}

function normalizeIndexNames(result: any): any {
  if (!result?.data?.indices) return result
  return {
    ...result,
    data: {
      ...result.data,
      indices: result.data.indices.map((index: any) => {
        const code = String(index.code || '').trim().toLowerCase()
        return { ...index, name: INDEX_NAMES[code] || index.name || index.code }
      }),
    },
  }
}

// 验证指数数据是否为真实数据（排除测试假数据）
function isValidIndexData(indices: any[]): boolean {
  if (!indices || indices.length === 0) return false
  // 兼容两种字段名：price 和 current
  const prices = indices.map(i => i.current || i.price).filter(p => p > 0)
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

  return normalizeIndexNames({
    ...result,
    data: { ...result.data, indices: filled },
  })
}

export async function GET(request: Request) {
  // Check for force-refresh header
  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('refresh') === 'true'

  // Skip cache if force refresh requested
  if (!forceRefresh) {
    // 检查缓存
    const cached = apiCache.get<any>(CACHE_KEY)
    if (cached && isFreshCachedOverview(cached)) {
      return NextResponse.json(normalizeIndexNames(cached))
    }
  }

  try {
    // 优先：Python 数据服务（多源聚合）
    const response = await fetch(`${DATA_SERVICE_URL}/api/market/overview`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000), // Reduced from 20s to 15s for better UX
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.indices?.length > 0 && isValidIndexData(data.data.indices)) {
        const result = ensureCompleteIndices({
          ...data,
          source: data.data?.source || 'akshare'
        })
        // 动态TTL：交易时段使用短缓存
        const isTrading = data.data?.meta?.isRealtime === true
        const ttl = isTrading ? CACHE_TTL_TRADING : CACHE_TTL_CLOSED
        apiCache.set(CACHE_KEY, result, ttl)
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
          meta: {
            isOpen: false,
            isPreMarket: false,
            isPostMarket: false,
            status: 'closed',
            statusText: '数据源降级（非实时）',
            isRealtime: false,
          },
        },
        source: 'yahoo',
      })
      apiCache.set(CACHE_KEY, result, CACHE_TTL_CLOSED)
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
      const normalizedCachedOverview = normalizeIndexNames(cachedOverview)
      apiCache.set(CACHE_KEY, normalizedCachedOverview, CACHE_TTL_CLOSED)
      return NextResponse.json({
        ...normalizedCachedOverview,
        source: `${normalizedCachedOverview.source || 'cached'}-stale`,
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
