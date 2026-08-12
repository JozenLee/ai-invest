import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

/**
 * GET /api/graph/industries/check?name=xxx
 * 检查产业名称是否已存在
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const name = searchParams.get('name')

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少产业名称参数'
        },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/v1/industries/check?name=${encodeURIComponent(name)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!response.ok) {
      throw new Error(`Data service returned ${response.status}`)
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: {
        exists: data.exists,
        industry: data.industry || null
      }
    })

  } catch (error) {
    console.error('[industries check API] 检查产业名称失败:', error)

    return NextResponse.json(
      {
        success: false,
        error: '检查产业名称失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
