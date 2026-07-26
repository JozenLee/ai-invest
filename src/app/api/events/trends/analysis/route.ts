import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')
    const newsCount = searchParams.get('newsCount') || '50'
    const includeAI = searchParams.get('includeAI') || 'false'

    if (!domain) {
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
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/trends/analysis?domain=${domain}&newsCount=${newsCount}&includeAI=${includeAI}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`数据服务返回错误: ${response.status}`)
    }

    const data = await response.json()

    return NextResponse.json(data)
  } catch (error) {
    console.error('获取趋势分析失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '无法获取趋势分析数据，请确认数据服务已启动',
        data: null,
      },
      { status: 500 }
    )
  }
}
