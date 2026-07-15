import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// GET /api/graph/edges - 获取图谱边列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get('sourceId') || undefined
    const targetId = searchParams.get('targetId') || undefined
    const relation = searchParams.get('relation') || undefined

    const edges = await graphService.getEdges({ sourceId, targetId, relation })

    return NextResponse.json({
      success: true,
      data: edges
    })
  } catch (error) {
    console.error('获取图谱边失败:', error)
    return NextResponse.json({
      success: false,
      error: '无法获取图谱边数据',
      data: null,
    })
  }
}

// POST /api/graph/edges - 创建新边
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sourceId, targetId, relation, weight, direction, lag, confidence, description } = body

    if (!sourceId || !targetId || !relation) {
      return NextResponse.json(
        { success: false, error: '源节点、目标节点和关系类型不能为空' },
        { status: 400 }
      )
    }

    const edge = await graphService.createEdge({
      sourceId,
      targetId,
      relation,
      weight: weight || 0.5,
      direction: direction || 'positive',
      lag,
      confidence: confidence || 0.5,
      description,
    })

    return NextResponse.json({
      success: true,
      data: edge
    })
  } catch (error) {
    console.error('创建边失败:', error)
    return NextResponse.json(
      { success: false, error: '创建边失败' },
      { status: 500 }
    )
  }
}
