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
      { signal: AbortSignal.timeout(30000) }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data) {
        // 兼容测试期望：展开data到根级别，同时保留success和data字段
        return NextResponse.json({
          ...data,
          ...data.data,
          sector: sector // 确保sector字段在根级别
        })
      }
      return NextResponse.json({
        success: false,
        error: data.error || `无法获取${sector}板块趋势数据`,
        data: null,
        sector: sector
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
