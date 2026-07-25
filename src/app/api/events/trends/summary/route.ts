import { NextRequest, NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'
import type { TrendSummaryResponse } from '@/types/trend'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_TTL = 30 * 60 // 30分钟

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const newsCount = parseInt(searchParams.get('newsCount') || '50')

    // 验证参数范围
    if (newsCount < 10 || newsCount > 200) {
      return NextResponse.json(
        {
          success: false,
          error: 'newsCount 必须在 10-200 之间',
        },
        { status: 400 }
      )
    }

    // 检查缓存
    const cacheKey = `trends:summary:${newsCount}`
    const cached = apiCache.get<TrendSummaryResponse>(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // 调用Python服务
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/trends/summary?newsCount=${newsCount}`,
      {
        signal: AbortSignal.timeout(15000),
      }
    )

    if (!response.ok) {
      throw new Error(`Python服务返回错误: ${response.status}`)
    }

    const data: TrendSummaryResponse = await response.json()

    if (!data.success) {
      throw new Error(data.error || '获取趋势摘要失败')
    }

    // 缓存结果
    apiCache.set(cacheKey, data, CACHE_TTL)

    return NextResponse.json(data)
  } catch (error) {
    console.error('获取领域趋势摘要失败:', error)

    return NextResponse.json(
      {
        success: false,
        error: '无法获取领域趋势数据，请确认数据服务已启动',
        data: [],
      },
      { status: 500 }
    )
  }
}
