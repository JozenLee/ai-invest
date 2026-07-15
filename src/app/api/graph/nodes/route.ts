import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// GET /api/graph/nodes - 获取图谱节点列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || undefined
    const level = searchParams.has('level') ? parseInt(searchParams.get('level')!) : undefined
    const parentId = searchParams.get('parentId') || undefined

    const nodes = await graphService.getNodes({ type, level, parentId })

    return NextResponse.json({
      success: true,
      data: nodes
    })
  } catch (error) {
    console.error('获取图谱节点失败:', error)
    return NextResponse.json({
      success: false,
      error: '无法获取图谱节点数据',
      data: null,
    })
  }
}

// POST /api/graph/nodes - 创建新节点
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, name, description, parentId, level, cyclePos, momentum } = body

    if (!type || !name) {
      return NextResponse.json(
        { success: false, error: '类型和名称不能为空' },
        { status: 400 }
      )
    }

    const node = await graphService.createNode({
      type,
      name,
      description,
      parentId,
      level: level || 0,
      cyclePos,
      momentum,
    })

    return NextResponse.json({
      success: true,
      data: node
    })
  } catch (error) {
    console.error('创建节点失败:', error)
    return NextResponse.json(
      { success: false, error: '创建节点失败' },
      { status: 500 }
    )
  }
}
