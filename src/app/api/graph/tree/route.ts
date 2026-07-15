import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// GET /api/graph/tree - 获取图谱树形结构
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rootId = searchParams.get('rootId') || undefined

    const tree = await graphService.getTree(rootId)

    return NextResponse.json({
      success: true,
      data: tree
    })
  } catch (error) {
    console.error('获取图谱树失败:', error)
    return NextResponse.json({
      success: false,
      error: '无法获取图谱树数据',
      data: null,
    })
  }
}
