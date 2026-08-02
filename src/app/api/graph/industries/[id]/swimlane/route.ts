import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

/**
 * Helper function to convert snake_case to camelCase
 */
function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item))
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      acc[camelKey] = toCamelCase(obj[key])
      return acc
    }, {} as any)
  }
  return obj
}

/**
 * GET /api/graph/industries/[id]/swimlane
 * 获取产业泳道图数据（扁平化结构）
 *
 * Proxies to: GET /api/v1/industries/{industry_id}/swimlane
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const response = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${id}/swimlane`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: '产业不存在',
            message: 'Industry not found'
          },
          { status: 404 }
        )
      }

      throw new Error(`Data service returned ${response.status}`)
    }

    const data = await response.json()
    const camelCaseData = toCamelCase(data)

    return NextResponse.json({
      success: true,
      data: camelCaseData
    })

  } catch (error) {
    console.error('[industries/[id]/swimlane API] 获取产业泳道图失败:', error)

    return NextResponse.json(
      {
        success: false,
        error: '获取产业泳道图失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
