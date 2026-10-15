import { NextRequest, NextResponse } from 'next/server'
import { frozenIndustryGraph } from '@/lib/graph/local-industry-fallback'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

/**
 * Helper function to convert snake_case to camelCase
 */
function toCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item))
  } else if (obj !== null && typeof obj === 'object') {
    const record=obj as Record<string,unknown>
    return Object.keys(record).reduce<Record<string,unknown>>((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      acc[camelKey] = toCamelCase(record[key])
      return acc
    }, {})
  }
  return obj
}

/**
 * GET /api/graph/industries/[id]/graph
 * 获取产业完整图谱（嵌套结构）
 *
 * Proxies to: GET /api/v1/industries/{industry_id}/graph
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const response = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${id}/graph`, {
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
    console.error('[industries/[id]/graph API] 获取产业图谱失败:', error)

    const {id}=await params
    const cached=await frozenIndustryGraph(id)
    if(cached)return NextResponse.json({success:true,data:toCamelCase(cached),meta:{degraded:true,source:'frozen-local-cache',reason:error instanceof Error?error.message:'数据服务不可用'}})

    return NextResponse.json(
      {
        success: false,
        error: '获取产业图谱失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
