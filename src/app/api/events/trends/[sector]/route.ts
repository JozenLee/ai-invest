import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector } = await params

  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')

    const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/news/trends/${sector}?days=${days}`,
      { next: { revalidate: 600 }, signal: AbortSignal.timeout(30000) }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data) {
        return NextResponse.json(data)
      }
      return NextResponse.json({
        success: false,
        error: data.error || `无法获取${sector}板块趋势数据`,
        data: null,
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Python数据服务响应异常',
      data: null,
    })
  } catch (error) {
    console.error('获取趋势失败:', error)
    return NextResponse.json({
      success: false,
      error: 'Python数据服务不可用，请确认 data-service 已启动',
      data: null,
    })
  }
}
