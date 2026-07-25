import { NextRequest, NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'
import type { TrendAnalysisResponse } from '@/types/trend'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const CACHE_TTL = 60 * 60 // 60分钟

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')
    const newsCount = parseInt(searchParams.get('newsCount') || '50')

    // 验证必需参数
    if (!domain) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必需参数: domain',
        },
        { status: 400 }
      )
    }

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
    const cacheKey = `trends:analysis:${domain}:${newsCount}`
    const cached = apiCache.get<TrendAnalysisResponse>(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // 调用Python服务
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/trends/analysis?domain=${encodeURIComponent(domain)}&newsCount=${newsCount}`,
      {
        signal: AbortSignal.timeout(30000), // 深度分析需要更长时间（包含AI调用）
      }
    )

    if (!response.ok) {
      throw new Error(`Python服务返回错误: ${response.status}`)
    }

    const data: TrendAnalysisResponse = await response.json()

    if (!data.success) {
      // 优雅降级：返回失败但不抛出500错误
      return NextResponse.json(
        {
          success: false,
          error: data.error || '该领域暂无分析数据',
          data: null,
        },
        { status: 200 } // 使用200状态码，让前端优雅处理
      )
    }

    // 缓存结果
    apiCache.set(cacheKey, data, CACHE_TTL)

    return NextResponse.json(data)
  } catch (error) {
    console.error('获取领域趋势分析失败:', error)

    return NextResponse.json(
      {
        success: false,
        error: '无法获取领域趋势分析，请确认数据服务已启动',
        data: null,
      },
      { status: 500 }
    )
  }
}
