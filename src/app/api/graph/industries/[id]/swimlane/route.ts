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
 * Transform swimlane data from Python backend format to frontend format
 * Backend: { industry, lanes: { stage_code: { stage, segments } } }
 * Frontend: { industry, stages: [{ ...stage, order, segments }] }
 */
function transformSwimLaneData(data: any): any {
  if (!data || !data.lanes) {
    return data
  }

  // 定义阶段顺序映射
  const stageOrder: Record<string, number> = {
    'upstream': 1,
    'midstream': 2,
    'downstream': 3
  }

  // 将 lanes 字典转换为 stages 数组
  const stages = Object.entries(data.lanes).map(([stageCode, laneData]: [string, any]) => {
    // 展开企业信息：将 topCompanies 转换为完整的 companies 数组，确保字段格式一致
    const segments = laneData.segments.map((segment: any, index: number) => {
      // 转换企业数据格式，确保与预览格式一致
      const companies = (segment.topCompanies || []).map((company: any) => ({
        id: company.id,
        name: company.name,
        ticker: company.ticker,
        exchange: company.exchange,
        country: company.country || 'CN',
        marketPosition: company.marketPosition || company.market_position || 'major',
        keyProducts: company.keyProducts || company.key_products,
        description: company.description,
        nameEn: company.nameEn || company.name_en
      }))

      // 确保正确读取匹配结果（支持camelCase和snake_case）
      const matchedEtfs = segment.matchedEtfs || segment.matched_etfs || []
      const matchedIndices = segment.matchedIndices || segment.matched_indices || []
      const lastMatchedAt = segment.lastMatchedAt || segment.last_matched_at

      return {
        id: segment.id,
        name: segment.name,
        code: segment.code,
        description: segment.description,
        keyCategories: segment.keyCategories || segment.key_categories || [],
        companies,
        // 使用后端返回的order，如果没有则使用数组索引（与数据库查询顺序保持一致）
        order: segment.order !== undefined && segment.order !== null ? segment.order : index,
        // 添加匹配结果
        matchedEtfs,
        matchedIndices,
        lastMatchedAt
      }
    })

    // 按order排序segments，确保顺序正确
    segments.sort((a: any, b: any) => a.order - b.order)

    return {
      id: laneData.stage.id,
      name: laneData.stage.name,
      code: laneData.stage.code,
      description: laneData.stage.description,
      order: stageOrder[stageCode] || 999,
      segments
    }
  })

  // 按 order 排序
  stages.sort((a, b) => a.order - b.order)

  return {
    industry: {
      id: data.industry.id,
      name: data.industry.name,
      code: data.industry.code,
      description: data.industry.description,
      version: '1.0', // 默认版本
      nodeCount: 0,
      edgeCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    stages
  }
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

    // 转换数据格式：从 lanes 字典转换为 stages 数组
    const transformedData = transformSwimLaneData(camelCaseData)

    return NextResponse.json({
      success: true,
      data: transformedData
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
