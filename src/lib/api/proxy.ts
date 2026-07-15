// API代理工具函数
// 用于将请求转发到Python数据服务

import { NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

interface ProxyOptions {
  path: string
  params?: Record<string, string>
  timeout?: number
  fallback?: () => Promise<any>
}

/**
 * 代理请求到Python数据服务
 */
export async function proxyToDataService(options: ProxyOptions) {
  const { path, params, timeout = 10000, fallback } = options

  // 构建URL
  const url = new URL(path, DATA_SERVICE_URL)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(timeout),
      next: { revalidate: 30 }, // 30秒缓存
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: data.data || data,
      source: 'data-service',
    })
  } catch (error) {
    console.error(`代理请求失败 ${path}:`, error)

    // 如果有降级方案
    if (fallback) {
      try {
        const fallbackData = await fallback()
        return NextResponse.json({
          success: true,
          data: fallbackData,
          source: 'fallback',
        })
      } catch (fallbackError) {
        console.error('降级方案也失败:', fallbackError)
      }
    }

    return NextResponse.json({
      success: false,
      error: '数据服务不可用',
      data: null,
      source: 'unavailable',
    })
  }
}

/**
 * 批量代理请求
 */
export async function proxyBatchToDataService(
  requests: Array<{ path: string; params?: Record<string, string> }>
) {
  const results = await Promise.allSettled(
    requests.map(req => proxyToDataService(req))
  )

  return results.map((result, index) => ({
    path: requests[index].path,
    success: result.status === 'fulfilled',
    data: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null,
  }))
}
