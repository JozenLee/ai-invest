import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// PUT /api/graph/edges/:id - 更新边
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const edge = await graphService.updateEdge(id, body)

    return NextResponse.json({
      success: true,
      data: edge
    })
  } catch (error) {
    console.error('更新边失败:', error)
    return NextResponse.json(
      { success: false, error: '更新边失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/graph/edges/:id - 删除边
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await graphService.deleteEdge(id)

    return NextResponse.json({
      success: true,
      message: '关系已删除'
    })
  } catch (error) {
    console.error('删除边失败:', error)
    return NextResponse.json(
      { success: false, error: '删除边失败' },
      { status: 500 }
    )
  }
}
