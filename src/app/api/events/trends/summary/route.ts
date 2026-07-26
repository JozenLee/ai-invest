import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const newsCount = searchParams.get('newsCount') || '50'

    // 代理请求到Python数据服务
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/trends/summary?newsCount=${newsCount}`,
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
    console.error('获取趋势摘要失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '无法获取趋势数据，请确认数据服务已启动',
        data: null,
      },
      { status: 500 }
    )
  }
}
