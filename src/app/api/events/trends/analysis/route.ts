import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')
    const newsCount = searchParams.get('newsCount') || '50'
    const includeAI = searchParams.get('includeAI') || 'false'

    console.log('[趋势分析API] 收到请求:', {
      domain,
      newsCount,
      includeAI,
      url: request.url
    })

    if (!domain) {
      console.error('[趋势分析API] 缺少domain参数')
      return NextResponse.json(
        {
          success: false,
          error: '缺少必需参数: domain',
          data: null,
        },
        { status: 400 }
      )
    }

    // 代理请求到Python数据服务
    const pythonUrl = `${DATA_SERVICE_URL}/api/trends/analysis?domain=${domain}&newsCount=${newsCount}&includeAI=${includeAI}`
    console.log('[趋势分析API] 请求Python服务:', pythonUrl)

    const response = await fetch(pythonUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log('[趋势分析API] Python服务响应:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[趋势分析API] Python服务错误:', errorText)
      throw new Error(`数据服务返回错误: ${response.status}`)
    }

    const data = await response.json()
    console.log('[趋势分析API] 返回数据:', data.success ? '成功' : '失败', data.error || '')

    return NextResponse.json(data)
  } catch (error) {
    console.error('[趋势分析API] 异常:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '无法获取趋势分析数据，请确认数据服务已启动',
        data: null,
      },
      { status: 500 }
    )
  }
}
