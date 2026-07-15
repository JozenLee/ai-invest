import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// GET /api/graph/nodes/:id - 获取节点详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const node = await graphService.getNode(id)

    if (!node) {
      return NextResponse.json(
        { success: false, error: '节点不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: node
    })
  } catch (error) {
    console.error('获取节点详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取节点详情失败' },
      { status: 500 }
    )
  }
}

// PUT /api/graph/nodes/:id - 更新节点
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const node = await graphService.updateNode(id, body)

    return NextResponse.json({
      success: true,
      data: node
    })
  } catch (error) {
    console.error('更新节点失败:', error)
    return NextResponse.json(
      { success: false, error: '更新节点失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/graph/nodes/:id - 删除节点
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await graphService.deleteNode(id)

    return NextResponse.json({
      success: true,
      message: '节点已删除'
    })
  } catch (error) {
    console.error('删除节点失败:', error)
    return NextResponse.json(
      { success: false, error: '删除节点失败' },
      { status: 500 }
    )
  }
}
