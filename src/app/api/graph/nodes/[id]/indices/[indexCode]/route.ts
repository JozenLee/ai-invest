// API路由：删除节点的指数绑定
// DELETE /api/graph/nodes/[id]/indices/[indexCode]

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; indexCode: string }> }
) {
  try {
    const { id, indexCode } = await params

    await prisma.graphNodeIndex.delete({
      where: {
        nodeId_indexCode: {
          nodeId: id,
          indexCode,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: '指数绑定已删除',
    })
  } catch (error) {
    console.error('删除指数绑定失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除失败',
      },
      { status: 500 }
    )
  }
}
