import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// GET /api/graph/full - 获取完整图谱数据
export async function GET(request: NextRequest) {
  try {
    const graph = await graphService.getFullGraph()

    return NextResponse.json({
      success: true,
      data: graph
    })
  } catch (error) {
    console.error('获取完整图谱失败:', error)
    return NextResponse.json({
      success: false,
      error: '无法获取图谱数据',
      data: null,
    })
  }
}
