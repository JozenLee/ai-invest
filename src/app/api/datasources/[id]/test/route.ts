import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/datasources/[id]/test
 * 测试数据源连接
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { config, driverType } = body

    if (!config || !driverType) {
      return NextResponse.json(
        { success: false, error: '缺少config或driverType参数' },
        { status: 400 }
      )
    }

    // 根据驱动类型测试连接
    let testResult: any

    switch (driverType) {
      case 'api':
        testResult = await testAPIDriver(config)
        break

      case 'rss':
        testResult = await testRSSDriver(config)
        break

      case 'crawler':
        testResult = await testCrawlerDriver(config)
        break

      case 'social':
        testResult = await testSocialDriver(config)
        break

      default:
        return NextResponse.json(
          { success: false, error: `不支持的驱动类型: ${driverType}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      data: testResult,
      message: '连接测试成功'
    })

  } catch (error) {
    console.error('测试数据源连接失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '连接测试失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}

/**
 * 测试API驱动
 */
async function testAPIDriver(config: any) {
  const { url, method = 'GET', headers = {}, timeout = 5000 } = config

  if (!url) {
    throw new Error('API驱动需要提供url参数')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method,
      headers,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      latency: 0, // TODO: 计算实际延迟
      message: response.ok ? 'API响应正常' : `API返回错误: ${response.status}`
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`连接超时（${timeout}ms）`)
    }
    throw error
  }
}

/**
 * 测试RSS驱动
 */
async function testRSSDriver(config: any) {
  const { url, timeout = 5000 } = config

  if (!url) {
    throw new Error('RSS驱动需要提供url参数')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`RSS源返回错误: ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('xml') && !contentType.includes('rss')) {
      throw new Error('响应不是有效的RSS/XML格式')
    }

    const text = await response.text()

    return {
      status: response.status,
      ok: true,
      contentType,
      size: text.length,
      hasItems: text.includes('<item>') || text.includes('<entry>'),
      message: 'RSS源可访问且格式正确'
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`连接超时（${timeout}ms）`)
    }
    throw error
  }
}

/**
 * 测试爬虫驱动
 */
async function testCrawlerDriver(config: any) {
  const { url, selector, timeout = 5000 } = config

  if (!url) {
    throw new Error('爬虫驱动需要提供url参数')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`目标网站返回错误: ${response.status}`)
    }

    const html = await response.text()

    return {
      status: response.status,
      ok: true,
      contentType: response.headers.get('content-type'),
      size: html.length,
      hasSelector: selector ? html.includes(selector) : undefined,
      message: '目标网站可访问'
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`连接超时（${timeout}ms）`)
    }
    throw error
  }
}

/**
 * 测试社交媒体驱动
 */
async function testSocialDriver(config: any) {
  const { platform, apiKey, timeout = 5000 } = config

  if (!platform) {
    throw new Error('社交媒体驱动需要提供platform参数')
  }

  // TODO: 实现具体的社交媒体API测试
  // 目前返回模拟结果

  return {
    platform,
    ok: true,
    message: '社交媒体驱动配置正确（模拟测试）'
  }
}
