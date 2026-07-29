import { NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'
import { prisma } from '@/lib/db/prisma'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'capital_flow_enhanced'
// 动态缓存TTL：交易时段30秒，非交易时段2分钟
const CACHE_TTL_TRADING = 30 // 秒
const CACHE_TTL_CLOSED = 120 // 秒

export async function GET(request: Request) {
  console.log('[capital-flow API] 收到请求')

  // Check for force-refresh parameter
  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('refresh') === 'true'

  // 1. 获取用户配置
  const preferences = await prisma.userPreferences.findFirst()
  const showEstimatedData = preferences?.showEstimatedData ?? true
  console.log('[capital-flow API] 用户配置 - showEstimatedData:', showEstimatedData)

  // Skip cache if force refresh requested
  if (!forceRefresh) {
    // 检查缓存
    const cached = apiCache.get<any>(CACHE_KEY)
    if (cached) {
      console.log('[capital-flow API] 返回缓存数据')
      return NextResponse.json(cached)
    }
  }

  console.log('[capital-flow API] 缓存未命中，请求 Python 服务')

  try {
    // 使用增强版资金流向API
    const response = await fetch(`${DATA_SERVICE_URL}/api/capital-flow/advanced/enhanced`, {
      signal: AbortSignal.timeout(15000),
    })

    console.log('[capital-flow API] Python 服务响应:', response.status)

    if (response.ok) {
      const result = await response.json()
      console.log('[capital-flow API] Python 数据:', {
        success: result.success,
        hasData: !!result.data,
      })

      if (result.success && result.data) {
        const data = {
          success: true,
          data: result.data,
          source: result.data?.source || 'akshare',
          dataQuality: result.data?.dataQuality || 'unknown',
          meta: result.data?.meta || null,
        }

        // 3. 根据配置过滤估算数据
        if (!showEstimatedData && data.dataQuality === 'estimated') {
          console.log('[capital-flow API] 估算数据已被用户配置过滤')
          return NextResponse.json({
            success: false,
            error: '真实数据暂时不可用，您已禁用估算数据显示',
            data: null,
            source: 'unavailable',
            meta: data.meta,
          })
        }

        // 动态TTL：根据交易状态调整缓存时间
        const isTrading = data.meta?.isRealtime === true
        const ttl = isTrading ? CACHE_TTL_TRADING : CACHE_TTL_CLOSED
        apiCache.set(CACHE_KEY, data, ttl)
        console.log('[capital-flow API] 返回成功数据并缓存 (TTL:', ttl, '秒)')
        return NextResponse.json(data)
      }
      console.warn('[capital-flow API] Python 返回失败:', result.error)
      return NextResponse.json({
        success: false,
        error: result.error || '无法获取资金流向数据',
        data: null,
        source: 'unavailable',
        meta: result.meta || null,
      })
    }

    console.error('[capital-flow API] Python 服务响应异常:', response.status)
    return NextResponse.json({
      success: false,
      error: 'Python数据服务响应异常',
      data: null,
      source: 'unavailable',
    })
  } catch (error) {
    console.error('[capital-flow API] 请求失败:', error)

    // 降级：返回明确的错误状态（不返回假数据）
    return NextResponse.json({
      success: false,
      error: '数据服务不可用，请确认 data-service 已启动',
      data: null,
      source: 'unavailable',
    })
  }
}
