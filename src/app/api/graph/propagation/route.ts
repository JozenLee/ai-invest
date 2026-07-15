import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// POST /api/graph/propagation - 传导路径分析
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, sourceNodeId, maxDepth } = body

    if (!event) {
      return NextResponse.json(
        { success: false, error: '触发事件不能为空' },
        { status: 400 }
      )
    }

    const result = await graphService.analyzePropagation(
      event,
      sourceNodeId,
      maxDepth || 4
    )

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('传导路径分析失败:', error)
    return NextResponse.json({
      success: false,
      error: '传导路径分析失败',
      data: null,
    })
  }
}
