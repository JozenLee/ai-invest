import { NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'
import { prisma } from '@/lib/db/prisma'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_KEY = 'capital_flow_macro'
const CACHE_TTL = 30 // 秒

export async function GET() {
  console.log('[capital-flow API] 收到请求')

  // 1. 获取用户配置
  const preferences = await prisma.userPreferences.findFirst()
  const showEstimatedData = preferences?.showEstimatedData ?? true
  console.log('[capital-flow API] 用户配置 - showEstimatedData:', showEstimatedData)

  // 检查缓存
  const cached = apiCache.get<any>(CACHE_KEY)
  if (cached) {
    console.log('[capital-flow API] 返回缓存数据')
    return NextResponse.json(cached)
  }

  console.log('[capital-flow API] 缓存未命中，请求 Python 服务')

  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/capital-flow/macro`, {
      signal: AbortSignal.timeout(15000), // Reduced from 20s to 15s for better UX
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

        apiCache.set(CACHE_KEY, data, CACHE_TTL)
        console.log('[capital-flow API] 返回成功数据并缓存')
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
